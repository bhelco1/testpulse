import { describe, expect, it } from 'vitest';

import { durationTrend, type DurationRun } from './duration.ts';
import type { TrendOptions } from './trends.ts';
import { at, run } from './records.test-support.ts';

// Spec section 11: "Suite duration: Sum of report durations per run, trended over CI runs only,
// since backfilled runs have duration_ms 0." runs.duration_ms is that sum, rolled up at
// ingestion (5.2), so the trend reads it as stored. Default branch only, per section 11's
// opening line.

const now = at('2026-10-01T15:30:00Z');
const options: TrendOptions = { defaultBranch: 'main', now, days: 30 };

const timed = (
  id: string,
  finishedAt: string,
  durationMs: number,
  overrides: Partial<DurationRun> = {},
): DurationRun => ({ ...run(id, finishedAt), durationMs, ...overrides });

describe('durationTrend', () => {
  it('has no points with no runs', () => {
    expect(durationTrend([], options)).toEqual([]);
  });

  it('has one point for a single run, its stored duration', () => {
    // Three reports of 12,000 + 9,500 + 4,250 ms roll up to 25,750 ms on the run.
    expect(durationTrend([timed('only', '2026-09-30T10:00:00Z', 25_750)], options)).toEqual([
      {
        runId: 'only',
        finishedAt: at('2026-09-30T10:00:00Z'),
        status: 'passed',
        durationMs: 25_750,
      },
    ]);
  });

  it('keeps default-branch CI runs in the window, oldest first, and nothing else', () => {
    const runs = [
      timed('later', '2026-09-20T09:00:00Z', 30_000),
      timed('earlier', '2026-09-10T09:00:00Z', 28_000),
      // Imported history records no durations: 0 would read as an instant suite.
      timed('backfill', '2026-09-15T09:00:00Z', 0, { source: 'backfill' }),
      timed('pull-request', '2026-09-16T09:00:00Z', 31_000, { branch: 'feature/x' }),
      // 2026-10-01 minus 29 days is 2026-09-02, the window's first day.
      timed('too-old', '2026-09-01T23:59:59.999Z', 27_000),
      timed('future', '2026-10-01T15:30:00.001Z', 29_000),
    ];
    expect(durationTrend(runs, options).map((point) => point.runId)).toEqual(['earlier', 'later']);
  });

  it('opens the window at UTC midnight 29 days before today', () => {
    const runs = [
      timed('first-instant', '2026-09-02T00:00:00.000Z', 1_000),
      timed('one-ms-before', '2026-09-01T23:59:59.999Z', 2_000),
    ];
    expect(durationTrend(runs, options).map((point) => point.runId)).toEqual(['first-instant']);
  });

  it('keeps a run whose tests were all skipped or that ran none, with its status', () => {
    const runs = [
      timed('all-skipped', '2026-09-20T09:00:00Z', 1_200, { passed: 0, skipped: 4 }),
      timed('empty', '2026-09-21T09:00:00Z', 300, { status: 'empty', passed: 0 }),
      timed('failed', '2026-09-22T09:00:00Z', 26_000, { status: 'failed', failed: 1 }),
    ];
    expect(
      durationTrend(runs, options).map(({ runId, status, durationMs }) => [
        runId,
        status,
        durationMs,
      ]),
    ).toEqual([
      ['all-skipped', 'passed', 1_200],
      ['empty', 'empty', 300],
      ['failed', 'failed', 26_000],
    ]);
  });

  it('orders equal finish times by attempt, so a re-run comes after the attempt it repeats', () => {
    const runs = [
      timed('attempt-2', '2026-09-20T09:00:00Z', 20_000, { ciRunId: 'r', runAttempt: 2 }),
      timed('attempt-1', '2026-09-20T09:00:00Z', 21_000, { ciRunId: 'r', runAttempt: 1 }),
    ];
    expect(durationTrend(runs, options).map((point) => point.runId)).toEqual([
      'attempt-1',
      'attempt-2',
    ]);
  });

  it('reads 90 days when asked', () => {
    // 2026-10-01 minus 89 days is 2026-07-04.
    const runs = [
      timed('in-90', '2026-07-04T00:00:00Z', 5_000),
      timed('before-90', '2026-07-03T23:59:59.999Z', 6_000),
    ];
    expect(durationTrend(runs, { ...options, days: 90 }).map((point) => point.runId)).toEqual([
      'in-90',
    ]);
  });
});
