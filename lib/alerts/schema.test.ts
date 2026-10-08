import { describe, expect, it } from 'vitest';

import {
  ALERT_KINDS,
  AlertSchema,
  CountDropDetailSchema,
  CoverageBelowFloorDetailSchema,
  EmptyRunDetailSchema,
  StaleDetailSchema,
} from './schema.ts';

// Spec sections 5.9 and 12: the detail each alert kind stores, as ingest_report and check_stale
// write it. The integration tests parse every alert those functions write with these schemas.

const PROJECT_ID = '0b6f6a1e-4c1e-4a55-9d59-3c1f1b1c2d3e';
const ALERT_ID = '5d0c9a8e-2b7f-4f1a-9e3c-7a6b5c4d3e2f';
const RUN_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const BASELINE_RUN_ID = '1f2e3d4c-5b6a-4978-8a6b-5c4d3e2f1a0b';
const REPORT_ID = '7e6d5c4b-3a29-4180-9f8e-7d6c5b4a3928';
// The form PostgREST and to_jsonb give a timestamptz.
const OPENED = '2026-10-08T12:00:00+00:00';

const row = (kind: string, detail: unknown, extra: Record<string, unknown> = {}) => ({
  id: ALERT_ID,
  project_id: PROJECT_ID,
  kind,
  detail,
  opened_at: OPENED,
  resolved_at: null,
  acknowledged_at: null,
  ...extra,
});

const countDrop = {
  job: 'android',
  module: 'shared',
  platform: 'jvm',
  baseline: 10,
  current: 7,
  baseline_run_id: BASELINE_RUN_ID,
  run_id: RUN_ID,
};

describe('alert kinds', () => {
  it('are the four of the alerts table check constraint', () => {
    expect(ALERT_KINDS).toEqual(['stale', 'count_drop', 'empty_run', 'coverage_below_floor']);
  });
});

describe('StaleDetailSchema', () => {
  it('reads the last report time and the cadence', () => {
    expect(
      StaleDetailSchema.parse({
        last_report_at: '2001-02-03T04:05:06.789+00:00',
        expected_cadence_days: 8,
      }),
    ).toEqual({ last_report_at: '2001-02-03T04:05:06.789+00:00', expected_cadence_days: 8 });
  });

  it('refuses a cadence under one day and a time that is not an instant', () => {
    expect(
      StaleDetailSchema.safeParse({ last_report_at: OPENED, expected_cadence_days: 0 }).success,
    ).toBe(false);
    expect(
      StaleDetailSchema.safeParse({ last_report_at: '2001-02-03', expected_cadence_days: 8 })
        .success,
    ).toBe(false);
  });
});

describe('CountDropDetailSchema', () => {
  it('reads the key, both counts and both runs', () => {
    expect(CountDropDetailSchema.parse(countDrop)).toEqual(countDrop);
  });

  it('refuses a baseline of 0, since nothing can fall from it', () => {
    expect(CountDropDetailSchema.safeParse({ ...countDrop, baseline: 0 }).success).toBe(false);
  });

  it('refuses a fractional or negative count', () => {
    expect(CountDropDetailSchema.safeParse({ ...countDrop, current: 6.5 }).success).toBe(false);
    expect(CountDropDetailSchema.safeParse({ ...countDrop, current: -1 }).success).toBe(false);
  });

  it('refuses a key it does not define, so the spec and the database cannot drift apart', () => {
    expect(CountDropDetailSchema.safeParse({ ...countDrop, report_id: REPORT_ID }).success).toBe(
      false,
    );
  });
});

describe('EmptyRunDetailSchema', () => {
  it('reads the key and the stored report', () => {
    const detail = { job: 'ios', module: 'shared', platform: 'ios-sim', report_id: REPORT_ID };
    expect(EmptyRunDetailSchema.parse(detail)).toEqual(detail);
  });
});

describe('CoverageBelowFloorDetailSchema', () => {
  it('reads the module, its floor, the lines percentage and the report', () => {
    const detail = { module: 'shared', floor: 91, lines_pct: 93.27, report_id: REPORT_ID };
    expect(CoverageBelowFloorDetailSchema.parse(detail)).toEqual(detail);
  });

  it('refuses a percentage over 100', () => {
    expect(
      CoverageBelowFloorDetailSchema.safeParse({
        module: 'shared',
        floor: 91,
        lines_pct: 100.01,
        report_id: REPORT_ID,
      }).success,
    ).toBe(false);
  });
});

describe('AlertSchema', () => {
  it('reads an open alert of each kind with the detail its kind defines', () => {
    const stale = AlertSchema.parse(
      row('stale', { last_report_at: OPENED, expected_cadence_days: 8 }),
    );
    expect(stale.kind).toBe('stale');
    expect(AlertSchema.parse(row('count_drop', countDrop)).kind).toBe('count_drop');
    expect(
      AlertSchema.parse(
        row('empty_run', {
          job: 'ios',
          module: 'shared',
          platform: 'ios-sim',
          report_id: REPORT_ID,
        }),
      ).kind,
    ).toBe('empty_run');
    expect(
      AlertSchema.parse(
        row('coverage_below_floor', {
          module: 'shared',
          floor: 91,
          lines_pct: 90,
          report_id: REPORT_ID,
        }),
      ).kind,
    ).toBe('coverage_below_floor');
  });

  it("refuses one kind's detail under another kind", () => {
    expect(AlertSchema.safeParse(row('stale', countDrop)).success).toBe(false);
  });

  it('reads an acknowledged count_drop, resolved at the same instant', () => {
    const acknowledged = AlertSchema.parse(
      row('count_drop', countDrop, { acknowledged_at: OPENED, resolved_at: OPENED }),
    );
    expect(acknowledged).toMatchObject({ acknowledged_at: OPENED, resolved_at: OPENED });
  });

  it('refuses an acknowledgement on any other kind, which resolve only by themselves', () => {
    expect(
      AlertSchema.safeParse(
        row(
          'stale',
          { last_report_at: OPENED, expected_cadence_days: 8 },
          { acknowledged_at: OPENED, resolved_at: OPENED },
        ),
      ).success,
    ).toBe(false);
  });

  it('refuses an acknowledged alert that is still open', () => {
    expect(
      AlertSchema.safeParse(row('count_drop', countDrop, { acknowledged_at: OPENED })).success,
    ).toBe(false);
  });

  it('refuses a kind the table does not hold', () => {
    expect(AlertSchema.safeParse(row('keep_alive', {})).success).toBe(false);
  });
});
