import { describe, expect, it } from 'vitest';

import { at, countsCoverage, pctCoverage, run } from './records.test-support.ts';
import {
  coverageTrend,
  passRateTrend,
  runCountTrend,
  windowPassRate,
  type TrendOptions,
} from './trends.ts';

// Spec section 11 and section 17, Phase 4: "Trend queries include backfilled runs".

const now = at('2026-10-01T15:30:00Z');
const options: TrendOptions = { defaultBranch: 'main', now, days: 30 };

const runs = [
  run('ci-1', '2026-09-10T08:00:00Z', { passed: 10, failed: 0, skipped: 2 }),
  run('bf-1', '2026-09-11T08:00:00Z', { source: 'backfill', passed: 8, failed: 0 }),
  run('ci-2', '2026-09-11T20:00:00Z', { status: 'failed', passed: 1, failed: 1, skipped: 5 }),
  run('feature', '2026-09-11T21:00:00Z', { branch: 'feature/x', status: 'failed', failed: 9 }),
  run('bf-feature', '2026-09-11T22:00:00Z', { branch: 'feature/x', source: 'backfill' }),
  run('too-old', '2026-09-01T23:59:59Z'),
  run('future', '2026-10-01T15:30:01Z'),
];

describe('passRateTrend', () => {
  it('has a point per default-branch run in the window, CI and backfilled, oldest first', () => {
    const trend = passRateTrend(runs, options);
    expect(trend.runs.map((point) => [point.runId, point.source])).toEqual([
      ['ci-1', 'ci'],
      ['bf-1', 'backfill'],
      ['ci-2', 'ci'],
    ]);
  });

  it('is passed / (passed + failed), with skipped excluded but carried alongside', () => {
    const [first, , third] = passRateTrend(runs, options).runs;
    expect(first).toMatchObject({ passed: 10, failed: 0, skipped: 2, passRate: 1 });
    expect(third).toMatchObject({ passed: 1, failed: 1, skipped: 5, passRate: 0.5 });
  });

  it('has no rate for a run with nothing passed or failed', () => {
    const trend = passRateTrend(
      [
        run('skipped-only', '2026-09-20T00:00:00Z', { passed: 0, failed: 0, skipped: 3 }),
        run('empty', '2026-09-21T00:00:00Z', { status: 'empty', passed: 0, failed: 0 }),
      ],
      options,
    );
    expect(trend.runs.map((point) => point.passRate)).toEqual([null, null]);
  });

  it('pools a day by counts rather than averaging its runs', () => {
    const day = passRateTrend(runs, options).days.find((point) => point.day === '2026-09-11');
    // (8 + 1) / (8 + 1 + 1), not the mean of 1 and 0.5.
    expect(day).toEqual({
      day: '2026-09-11',
      runs: 2,
      passed: 9,
      failed: 1,
      skipped: 5,
      passRate: 0.9,
    });
  });

  it('has one bucket per UTC day of the window, empty days included with no rate', () => {
    const { days } = passRateTrend(runs, options);
    expect(days).toHaveLength(30);
    expect(days[0]).toEqual({
      day: '2026-09-02',
      runs: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      passRate: null,
    });
    expect(days.at(-1)?.day).toBe('2026-10-01');
  });

  it('reaches back 90 days when asked', () => {
    const old = run('old', '2026-07-04T00:00:00Z', { source: 'backfill' });
    expect(passRateTrend([old], { ...options, days: 30 }).runs).toEqual([]);
    expect(passRateTrend([old], { ...options, days: 90 }).runs).toHaveLength(1);
  });

  it('is empty for no runs', () => {
    const trend = passRateTrend([], options);
    expect(trend.runs).toEqual([]);
    expect(trend.days.every((day) => day.runs === 0 && day.passRate === null)).toBe(true);
  });
});

describe('runCountTrend', () => {
  it('counts default-branch runs per UTC day, CI and backfilled', () => {
    const counts = runCountTrend(runs, options);
    expect(counts).toHaveLength(30);
    expect(counts.filter((day) => day.runs > 0)).toEqual([
      { day: '2026-09-10', runs: 1 },
      { day: '2026-09-11', runs: 2 },
    ]);
  });

  it('counts empty and failed runs too: a run is a run', () => {
    const counts = runCountTrend(
      [
        run('a', '2026-09-20T01:00:00Z', { status: 'empty', passed: 0 }),
        run('b', '2026-09-20T02:00:00Z', { status: 'failed', failed: 1 }),
      ],
      options,
    );
    expect(counts.find((day) => day.day === '2026-09-20')).toEqual({ day: '2026-09-20', runs: 2 });
  });

  it('is all zeros for no runs', () => {
    expect(runCountTrend([], options).every((day) => day.runs === 0)).toBe(true);
  });
});

describe('coverageTrend', () => {
  const coverage = [
    countsCoverage('c1', 'ci-1', 'shared', 457, 490),
    pctCoverage('c2', 'bf-1', 'shared', 93.2),
    pctCoverage('c3', 'bf-1', 'composeApp', 93.6),
    countsCoverage('c4', 'ci-2', 'composeApp', 50, 200),
    countsCoverage('c5', 'feature', 'shared', 1, 100),
    pctCoverage('c6', 'bf-feature', 'shared', 1),
    countsCoverage('c7', 'too-old', 'shared', 1, 100),
    countsCoverage('c8', 'not-loaded', 'shared', 1, 100),
  ];

  it('plots each module over default-branch runs, from counts for CI and the recorded % for backfill', () => {
    expect(coverageTrend(runs, coverage, options)).toEqual([
      {
        module: 'composeApp',
        points: [
          {
            runId: 'bf-1',
            finishedAt: at('2026-09-11T08:00:00Z'),
            source: 'backfill',
            form: 'pct',
            linesPct: 93.6,
          },
          {
            runId: 'ci-2',
            finishedAt: at('2026-09-11T20:00:00Z'),
            source: 'ci',
            form: 'counts',
            linesPct: 25,
          },
        ],
      },
      {
        module: 'shared',
        points: [
          {
            runId: 'ci-1',
            finishedAt: at('2026-09-10T08:00:00Z'),
            source: 'ci',
            form: 'counts',
            linesPct: (457 / 490) * 100,
          },
          {
            runId: 'bf-1',
            finishedAt: at('2026-09-11T08:00:00Z'),
            source: 'backfill',
            form: 'pct',
            linesPct: 93.2,
          },
        ],
      },
    ]);
  });

  it('leaves out a counted row with no lines, which has no percentage', () => {
    const trend = coverageTrend(runs, [countsCoverage('z', 'ci-1', 'empty', 0, 0)], options);
    expect(trend).toEqual([]);
  });

  it('is empty for no coverage', () => {
    expect(coverageTrend(runs, [], options)).toEqual([]);
    expect(coverageTrend([], coverage, options)).toEqual([]);
  });
});

describe('windowPassRate', () => {
  it('pools every counted run of the window, as a day does', () => {
    // ci-1 10/0, bf-1 8/0, ci-2 1/1: (10 + 8 + 1) / (10 + 8 + 1 + 0 + 0 + 1) = 19 / 20.
    // Skipped 2 + 0 + 5 = 7. The feature-branch, too-old and future runs are left out.
    expect(windowPassRate(passRateTrend(runs, options))).toEqual({
      runs: 3,
      passed: 19,
      failed: 1,
      skipped: 7,
      passRate: 0.95,
    });
  });

  it('has no rate for no runs, or for runs that passed and failed nothing', () => {
    expect(windowPassRate(passRateTrend([], options))).toEqual({
      runs: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      passRate: null,
    });
    const skippedOnly = [run('s', '2026-09-20T00:00:00Z', { passed: 0, failed: 0, skipped: 3 })];
    expect(windowPassRate(passRateTrend(skippedOnly, options))).toMatchObject({
      runs: 1,
      skipped: 3,
      passRate: null,
    });
  });

  it('is the one run’s rate for a single run', () => {
    const single = [run('one', '2026-09-20T00:00:00Z', { passed: 3, failed: 1 })];
    // 3 / (3 + 1).
    expect(windowPassRate(passRateTrend(single, options)).passRate).toBe(0.75);
  });
});
