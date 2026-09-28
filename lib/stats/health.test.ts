import { describe, expect, it } from 'vitest';

import { daysSince, projectHealth, type HealthInput } from './health.ts';
import { at } from './records.test-support.ts';

// Spec section 11, "Health on public pages": derived from public data, never from alerts. Stale
// when the days since the project's last report exceed its expected_cadence_days; empty when
// the latest default-branch run is empty; below floor when a module's latest coverage is under
// its coverage_floors value.

const now = at('2026-10-05T12:00:00Z');

const input = (overrides: Partial<HealthInput> = {}): HealthInput => ({
  lastReportAt: at('2026-10-05T09:26:17.747Z'),
  expectedCadenceDays: 8,
  latestRun: { status: 'passed' },
  coverage: [{ belowFloor: false }],
  now,
  ...overrides,
});

describe('daysSince', () => {
  it('counts whole elapsed days', () => {
    // 12:00 minus 09:26:17.747 the same day: under a day, 0.
    expect(daysSince(at('2026-10-05T09:26:17.747Z'), now)).toBe(0);
    // 2026-09-22T04:37:00.242Z to 2026-10-05T12:00Z: 13 days 7 h 22 min 59.758 s, 13.
    expect(daysSince(at('2026-09-22T04:37:00.242Z'), now)).toBe(13);
  });

  it('turns over at exactly 24 hours, not at UTC midnight', () => {
    expect(daysSince(at('2026-10-04T12:00:00.001Z'), now)).toBe(0);
    expect(daysSince(at('2026-10-04T12:00:00Z'), now)).toBe(1);
    // Yesterday 23:59 UTC is a different UTC day but not a day ago.
    expect(daysSince(at('2026-10-04T23:59:00Z'), now)).toBe(0);
  });

  it('is 0, not negative, for a report stamped after now', () => {
    expect(daysSince(at('2026-10-05T12:00:00.001Z'), now)).toBe(0);
  });
});

describe('projectHealth', () => {
  it('is not reporting, with no days, before any report', () => {
    expect(projectHealth(input({ lastReportAt: null, latestRun: null, coverage: [] }))).toEqual({
      daysSinceLastReport: null,
      problems: [],
      marker: { health: 'not_reporting' },
    });
  });

  it('is healthy with a recent report, a non-empty run and coverage at or above floor', () => {
    expect(projectHealth(input())).toEqual({
      daysSinceLastReport: 0,
      problems: [],
      marker: { health: 'healthy' },
    });
  });

  it('is stale only when the days exceed the cadence', () => {
    // 8 days 23 h 59 min ago is 8 whole days: equal to the cadence, not over it.
    expect(projectHealth(input({ lastReportAt: at('2026-09-26T12:01:00Z') }))).toMatchObject({
      daysSinceLastReport: 8,
      problems: [],
      marker: { health: 'healthy' },
    });
    // Exactly 9 days ago: 9 > 8.
    expect(projectHealth(input({ lastReportAt: at('2026-09-26T12:00:00Z') }))).toEqual({
      daysSinceLastReport: 9,
      problems: ['stale'],
      marker: { health: 'stale', days: 9 },
    });
  });

  it('is empty when the latest default-branch run is empty', () => {
    expect(projectHealth(input({ latestRun: { status: 'empty' } }))).toMatchObject({
      problems: ['empty'],
      marker: { health: 'empty' },
    });
  });

  it('is not unhealthy because the latest run failed: a red build is a status, not health', () => {
    expect(projectHealth(input({ latestRun: { status: 'failed' } })).marker).toEqual({
      health: 'healthy',
    });
  });

  it('is below floor when any module is under its floor', () => {
    const coverage = [{ belowFloor: false }, { belowFloor: true }];
    expect(projectHealth(input({ coverage }))).toMatchObject({
      problems: ['below_floor'],
      marker: { health: 'below_floor' },
    });
  });

  it('lists every problem, and marks the first in stale, empty, below-floor order', () => {
    const all = projectHealth(
      input({
        lastReportAt: at('2026-09-22T04:37:00.242Z'),
        latestRun: { status: 'empty' },
        coverage: [{ belowFloor: true }],
      }),
    );
    expect(all).toEqual({
      daysSinceLastReport: 13,
      problems: ['stale', 'empty', 'below_floor'],
      marker: { health: 'stale', days: 13 },
    });
    expect(
      projectHealth(input({ latestRun: { status: 'empty' }, coverage: [{ belowFloor: true }] }))
        .marker,
    ).toEqual({ health: 'empty' });
  });

  it('reports on a branch other than the default without a latest default-branch run', () => {
    // A pull request run counts as a report, so the project is not stale, but there is no
    // default-branch run to be empty.
    expect(projectHealth(input({ latestRun: null, coverage: [] }))).toEqual({
      daysSinceLastReport: 0,
      problems: [],
      marker: { health: 'healthy' },
    });
  });
});
