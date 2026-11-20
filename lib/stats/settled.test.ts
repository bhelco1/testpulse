import { describe, expect, it } from 'vitest';

import { at, run } from './records.test-support.ts';
import {
  anySettledByTime,
  latestSettledRun,
  runsThroughLatest,
  SETTLE_AFTER_MS,
  type ReportReceipt,
} from './settled.ts';

// Spec section 11, "Latest run" (decision 2026-11-19): a project's CI sends one run as several
// reports minutes apart, so the latest run the landing page, the project card and the project
// page's latest-run card read is the newest settled default-branch CI run. A run is settled when
// (a) every report key (job, module, platform) of the previous settled run has arrived in it, a
// superset being fine, (b) 45 minutes have passed since its first report was received, or (c)
// the project has no earlier settled run.

const MINUTE = 60_000;
const options = (now: string) => ({ defaultBranch: 'main', now: at(now) });

const receipt = (
  runId: string,
  key: string,
  receivedAt: string,
  platform = 'node',
): ReportReceipt => {
  const [job = key, module = key] = key.split('/');
  return { runId, job, module, platform, receivedAt: at(receivedAt) };
};

// Testament's own run: unit, then integration, then e2e on two Playwright projects.
const fullRun = (runId: string, firstAt: string): ReportReceipt[] => {
  const first = at(firstAt).getTime();
  const after = (minutes: number) => new Date(first + minutes * MINUTE).toISOString();
  return [
    receipt(runId, 'checks/unit', after(0)),
    receipt(runId, 'integration/integration', after(2)),
    receipt(runId, 'e2e/e2e', after(15), 'chromium'),
    receipt(runId, 'e2e/e2e', after(17), 'webkit'),
  ];
};

describe('the settle window', () => {
  it('is 45 minutes', () => {
    expect(SETTLE_AFTER_MS).toBe(45 * MINUTE);
  });
});

describe('latestSettledRun', () => {
  const earlier = run('r1', '2026-11-19T09:17:00Z', { startedAt: at('2026-11-19T09:00:00Z') });
  const earlierReports = fullRun('r1', '2026-11-19T09:00:00Z');

  it('is null with no default-branch CI run', () => {
    const runs = [
      run('bf', '2026-11-19T08:00:00Z', { source: 'backfill' }),
      run('pr', '2026-11-19T08:00:00Z', { branch: 'feature/x' }),
    ];
    expect(latestSettledRun(runs, [], options('2026-11-19T12:00:00Z'))).toBeNull();
  });

  it('settles a project’s first run on arrival, with only its first report in', () => {
    const first = run('r1', '2026-11-19T09:00:00Z');
    const settled = latestSettledRun(
      [first],
      [receipt('r1', 'checks/unit', '2026-11-19T09:00:00Z')],
      options('2026-11-19T09:01:00Z'),
    );
    expect(settled?.id).toBe('r1');
  });

  it('keeps the previous settled run while a new run is missing one of its report keys', () => {
    // r2 has unit, integration and chromium e2e in, 16 minutes after its first report.
    const r2 = run('r2', '2026-11-19T10:15:00Z', { startedAt: at('2026-11-19T10:00:00Z') });
    const reports = [...earlierReports, ...fullRun('r2', '2026-11-19T10:00:00Z').slice(0, 3)];
    const settled = latestSettledRun([earlier, r2], reports, options('2026-11-19T10:16:00Z'));
    expect(settled?.id).toBe('r1');
  });

  it('settles the new run once every report key of the previous settled run has arrived', () => {
    const r2 = run('r2', '2026-11-19T10:17:00Z', { startedAt: at('2026-11-19T10:00:00Z') });
    const reports = [...earlierReports, ...fullRun('r2', '2026-11-19T10:00:00Z')];
    const settled = latestSettledRun([earlier, r2], reports, options('2026-11-19T10:17:00Z'));
    expect(settled?.id).toBe('r2');
  });

  it('settles a run with every expected key and a new one: a new suite does not delay it', () => {
    const r2 = run('r2', '2026-11-19T10:18:00Z', { startedAt: at('2026-11-19T10:00:00Z') });
    const reports = [
      ...earlierReports,
      ...fullRun('r2', '2026-11-19T10:00:00Z'),
      receipt('r2', 'e2e/e2e', '2026-11-19T10:18:00Z', 'firefox'),
    ];
    const settled = latestSettledRun([earlier, r2], reports, options('2026-11-19T10:18:00Z'));
    expect(settled?.id).toBe('r2');
  });

  describe('a run whose report never arrives', () => {
    // r2's unit report is lost: integration and e2e arrive, unit never does.
    const r2 = run('r2', '2026-11-19T10:17:00Z', { startedAt: at('2026-11-19T10:00:00Z') });
    const reports = [...earlierReports, ...fullRun('r2', '2026-11-19T10:00:00Z').slice(1)];
    // Its first report is integration's, received at 10:02.
    const firstReceived = at('2026-11-19T10:02:00Z').getTime();
    const instant = (offset: number) => ({
      defaultBranch: 'main',
      now: new Date(firstReceived + offset),
    });

    it('is not settled 1 ms before 45 minutes have passed since its first report', () => {
      expect(latestSettledRun([earlier, r2], reports, instant(SETTLE_AFTER_MS - 1))?.id).toBe('r1');
    });

    it('is settled at exactly 45 minutes', () => {
      expect(latestSettledRun([earlier, r2], reports, instant(SETTLE_AFTER_MS))?.id).toBe('r2');
    });

    it('stays settled after 45 minutes', () => {
      expect(latestSettledRun([earlier, r2], reports, instant(3 * SETTLE_AFTER_MS))?.id).toBe('r2');
    });

    it('counts from its first report’s receipt, not from when the run started', () => {
      // The run started 2 minutes before its first receipt (a report's duration); 45 minutes
      // after the start is still 2 minutes short of settling.
      const started = run('r2', '2026-11-19T10:17:00Z', { startedAt: at('2026-11-19T10:00:00Z') });
      const settled = latestSettledRun(
        [earlier, started],
        reports,
        options('2026-11-19T10:45:00Z'),
      );
      expect(settled?.id).toBe('r1');
    });
  });

  describe('when unsettled runs stack up', () => {
    // r1 settled long ago. r2 and r3 each lost a report and are under 45 minutes old; r4 is
    // complete. Each is measured against r1, the previous settled run, not against r2 or r3.
    const runs = [
      earlier,
      run('r2', '2026-11-19T10:20:00Z', { startedAt: at('2026-11-19T10:05:00Z') }),
      run('r3', '2026-11-19T10:25:00Z', { startedAt: at('2026-11-19T10:10:00Z') }),
      run('r4', '2026-11-19T10:32:00Z', { startedAt: at('2026-11-19T10:15:00Z') }),
    ];
    const now = options('2026-11-19T10:33:00Z');

    it('finds the previous settled run behind them and settles the run that completes it', () => {
      const reports = [
        ...earlierReports,
        ...fullRun('r2', '2026-11-19T10:05:00Z').slice(1),
        ...fullRun('r3', '2026-11-19T10:10:00Z').slice(0, 2),
        ...fullRun('r4', '2026-11-19T10:15:00Z'),
      ];
      expect(latestSettledRun(runs, reports, now)?.id).toBe('r4');
    });

    it('keeps the previous settled run when none of them completes it', () => {
      const reports = [
        ...earlierReports,
        ...fullRun('r2', '2026-11-19T10:05:00Z').slice(1),
        ...fullRun('r3', '2026-11-19T10:10:00Z').slice(0, 2),
        ...fullRun('r4', '2026-11-19T10:15:00Z').slice(0, 3),
      ];
      expect(latestSettledRun(runs, reports, now)?.id).toBe('r1');
    });

    it('measures a later run against a settled one between them, not against the first', () => {
      // r2 has all of r1's keys and a new suite, docs, so it settles. r3 and r4 have all of
      // r1's keys but not docs: measured against r2, neither has settled.
      const reports = [
        ...earlierReports,
        ...fullRun('r2', '2026-11-19T10:05:00Z'),
        receipt('r2', 'docs/docs', '2026-11-19T10:06:00Z'),
        ...fullRun('r3', '2026-11-19T10:10:00Z'),
        ...fullRun('r4', '2026-11-19T10:15:00Z'),
      ];
      expect(latestSettledRun(runs, reports, now)?.id).toBe('r2');
    });

    it('settles a run by time even when the runs before it are unsettled', () => {
      // An hour later r2 and r3 have both settled by time; r4, missing a key of r3, has not.
      const reports = [
        ...earlierReports,
        ...fullRun('r2', '2026-11-19T10:05:00Z').slice(1),
        receipt('r3', 'checks/unit', '2026-11-19T11:00:00Z'),
        receipt('r4', 'integration/integration', '2026-11-19T11:30:00Z'),
      ];
      const later = [
        earlier,
        runs[1] ?? earlier,
        run('r3', '2026-11-19T11:00:00Z', { startedAt: at('2026-11-19T11:00:00Z') }),
        run('r4', '2026-11-19T11:30:00Z', { startedAt: at('2026-11-19T11:30:00Z') }),
      ];
      expect(latestSettledRun(later, reports, options('2026-11-19T11:50:00Z'))?.id).toBe('r3');
    });
  });

  it('reads default-branch CI runs finished by now only', () => {
    const r2 = run('r2', '2026-11-19T10:17:00Z', { startedAt: at('2026-11-19T10:00:00Z') });
    const runs = [
      earlier,
      r2,
      run('pr', '2026-11-19T10:20:00Z', { branch: 'feature/x' }),
      run('bf', '2026-11-19T10:20:00Z', { source: 'backfill' }),
      run('later', '2026-11-19T10:30:00Z'),
    ];
    const reports = [
      ...earlierReports,
      ...fullRun('r2', '2026-11-19T10:00:00Z'),
      receipt('pr', 'checks/unit', '2026-11-19T10:20:00Z'),
      receipt('later', 'checks/unit', '2026-11-19T10:30:00Z'),
    ];
    expect(latestSettledRun(runs, reports, options('2026-11-19T10:25:00Z'))?.id).toBe('r2');
  });
});

describe('anySettledByTime', () => {
  it('tells whether any run’s first report was received 45 minutes or more before now', () => {
    const reports = [
      receipt('r1', 'checks/unit', '2026-11-19T10:00:00Z'),
      receipt('r1', 'e2e/e2e', '2026-11-19T10:20:00Z'),
    ];
    expect(anySettledByTime(reports, at('2026-11-19T10:44:59.999Z'))).toBe(false);
    expect(anySettledByTime(reports, at('2026-11-19T10:45:00Z'))).toBe(true);
    expect(anySettledByTime([], at('2026-11-19T10:45:00Z'))).toBe(false);
  });
});

describe('runsThroughLatest', () => {
  const runs = [
    run('r1', '2026-11-19T09:00:00Z'),
    run('bf', '2026-11-19T10:10:00Z', { source: 'backfill' }),
    run('pr', '2026-11-19T10:10:00Z', { branch: 'feature/x' }),
    run('r2', '2026-11-19T10:00:00Z'),
    run('r3', '2026-11-19T10:20:00Z', { status: 'failed' }),
  ];

  it('leaves out the default-branch CI runs newer than the latest settled run', () => {
    expect(runsThroughLatest(runs, runs[0] ?? null, 'main').map((r) => r.id)).toEqual([
      'r1',
      'bf',
      'pr',
    ]);
  });

  it('keeps every run when the latest settled run is the newest', () => {
    expect(runsThroughLatest(runs, runs[4] ?? null, 'main')).toEqual(runs);
  });

  it('keeps every run with no settled run', () => {
    expect(runsThroughLatest(runs, null, 'main')).toEqual(runs);
  });
});
