import { describe, expect, it } from 'vitest';

import type { StatsRun } from './input.ts';
import { at, countsCoverage, pctCoverage, run } from './records.test-support.ts';
import {
  coverageTrend,
  passRateTrend,
  runCountTrend,
  windowPassRate,
  type TrendOptions,
} from './trends.ts';

// Spec section 11 and section 17, Phase 4: "Trend queries include backfilled runs". The per-run
// trends read the last 30 default-branch runs, CI and imported, however old (decision
// 2026-09-29, design v7 item 5); "Pass rate, 30 days" and runs per UTC day keep the 30-day window.

const now = at('2026-10-01T15:30:00Z');
const options: TrendOptions = { defaultBranch: 'main', now };

const runs = [
  run('ci-1', '2026-09-10T08:00:00Z', { passed: 10, failed: 0, skipped: 2 }),
  run('bf-1', '2026-09-11T08:00:00Z', { source: 'backfill', passed: 8, failed: 0 }),
  run('ci-2', '2026-09-11T20:00:00Z', { status: 'failed', passed: 1, failed: 1, skipped: 5 }),
  run('feature', '2026-09-11T21:00:00Z', { branch: 'feature/x', status: 'failed', failed: 9 }),
  run('bf-feature', '2026-09-11T22:00:00Z', { branch: 'feature/x', source: 'backfill' }),
  run('future', '2026-10-01T15:30:01Z'),
];

// n default-branch runs a day apart, the last finishing on 2026-10-01, oldest first.
const daily = (n: number, overrides: (i: number) => Partial<StatsRun> = () => ({})): StatsRun[] =>
  Array.from({ length: n }, (_, i) =>
    run(
      `d${i}`,
      new Date(Date.UTC(2026, 9, 1) - (n - 1 - i) * 86_400_000).toISOString(),
      overrides(i),
    ),
  );

describe('passRateTrend', () => {
  it('has a point per default-branch run, CI and backfilled, oldest first', () => {
    expect(passRateTrend(runs, options).map((point) => [point.runId, point.source])).toEqual([
      ['ci-1', 'ci'],
      ['bf-1', 'backfill'],
      ['ci-2', 'ci'],
    ]);
  });

  it('is passed / (passed + failed), with skipped excluded but carried alongside', () => {
    const [first, , third] = passRateTrend(runs, options);
    expect(first).toEqual({
      runId: 'ci-1',
      finishedAt: at('2026-09-10T08:00:00Z'),
      source: 'ci',
      status: 'passed',
      passed: 10,
      failed: 0,
      skipped: 2,
      passRate: 1,
    });
    expect(third).toMatchObject({
      status: 'failed',
      passed: 1,
      failed: 1,
      skipped: 5,
      passRate: 0.5,
    });
  });

  it('has no rate for a run with nothing passed or failed: all skipped, or empty', () => {
    const trend = passRateTrend(
      [
        run('skipped-only', '2026-09-20T00:00:00Z', { passed: 0, failed: 0, skipped: 3 }),
        run('empty', '2026-09-21T00:00:00Z', { status: 'empty', passed: 0, failed: 0 }),
      ],
      options,
    );
    expect(trend.map((point) => [point.status, point.passRate])).toEqual([
      ['passed', null],
      ['empty', null],
    ]);
  });

  it('is empty for no runs', () => {
    expect(passRateTrend([], options)).toEqual([]);
  });

  it('has the one point of a single run', () => {
    const single = [run('one', '2026-09-20T00:00:00Z', { passed: 3, failed: 1 })];
    expect(passRateTrend(single, options).map((point) => point.passRate)).toEqual([0.75]);
  });

  it('keeps the last 30 runs of more, and every run of fewer', () => {
    const many = passRateTrend(daily(31), options);
    expect(many).toHaveLength(30);
    expect(many[0]?.runId).toBe('d1');
    expect(many.at(-1)?.runId).toBe('d30');
    expect(passRateTrend(daily(29), options)).toHaveLength(29);
  });

  it('reaches runs older than 90 days when they are among the last 30', () => {
    // 2026-10-01 minus 89 days is 2026-07-04, the first day of a 90-day window.
    const old = run('old', '2026-07-03T23:59:59Z', { source: 'backfill' });
    const recent = run('recent', '2026-09-30T00:00:00Z');
    expect(passRateTrend([old, recent], options).map((point) => point.runId)).toEqual([
      'old',
      'recent',
    ]);
  });

  it('does not refill the 30 from older runs when a run among them has no rate', () => {
    const trend = passRateTrend(
      daily(31, (i) => (i === 30 ? { status: 'empty', passed: 0 } : {})),
      options,
    );
    expect(trend).toHaveLength(30);
    expect(trend[0]?.runId).toBe('d1');
    expect(trend.at(-1)).toMatchObject({ runId: 'd30', passRate: null });
  });
});

describe('windowPassRate', () => {
  it('pools every counted run of the 30 days, as a day does', () => {
    // ci-1 10/0, bf-1 8/0, ci-2 1/1: (10 + 8 + 1) / (10 + 8 + 1 + 0 + 0 + 1) = 19 / 20.
    // Skipped 2 + 0 + 5 = 7. The feature-branch and future runs are left out.
    expect(windowPassRate(runs, options)).toEqual({
      runs: 3,
      passed: 19,
      failed: 1,
      skipped: 7,
      passRate: 0.95,
    });
  });

  it('stays a 30-day window: a run before it is left out, even among the last 30 runs', () => {
    // 2026-10-01 minus 29 days is 2026-09-02.
    const edge = [
      run('before', '2026-09-01T23:59:59.999Z', { passed: 0, failed: 5 }),
      run('first-instant', '2026-09-02T00:00:00.000Z', { passed: 4, failed: 0 }),
    ];
    expect(windowPassRate(edge, options)).toMatchObject({ runs: 1, passed: 4, passRate: 1 });
  });

  it('has no rate for no runs, or for runs that passed and failed nothing', () => {
    expect(windowPassRate([], options)).toEqual({
      runs: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      passRate: null,
    });
    const skippedOnly = [run('s', '2026-09-20T00:00:00Z', { passed: 0, failed: 0, skipped: 3 })];
    expect(windowPassRate(skippedOnly, options)).toMatchObject({
      runs: 1,
      skipped: 3,
      passRate: null,
    });
  });

  it('is the one run’s rate for a single run', () => {
    const single = [run('one', '2026-09-20T00:00:00Z', { passed: 3, failed: 1 })];
    // 3 / (3 + 1).
    expect(windowPassRate(single, options).passRate).toBe(0.75);
  });
});

describe('runCountTrend', () => {
  it('counts default-branch runs per UTC day of the 30 days, CI and backfilled', () => {
    const counts = runCountTrend(runs, options);
    expect(counts).toHaveLength(30);
    expect(counts[0]).toEqual({ day: '2026-09-02', runs: 0 });
    expect(counts.at(-1)?.day).toBe('2026-10-01');
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

  it('leaves out a run before the 30 days', () => {
    expect(
      runCountTrend([run('old', '2026-09-01T23:59:59Z')], options).every((day) => day.runs === 0),
    ).toBe(true);
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
    countsCoverage('c7', 'future', 'shared', 1, 100),
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

  it('reads the last 30 runs: a module a run among them did not report has no point there', () => {
    // 31 runs; the oldest (d0) falls outside the 30 and d10 reported no coverage.
    const many = daily(31);
    const rows = many
      .filter((r) => r.id !== 'd10')
      .map((r, i) => pctCoverage(`c${i}`, r.id, 'shared', 90));
    const [shared] = coverageTrend(many, rows, options);
    expect(shared?.points).toHaveLength(29);
    expect(shared?.points[0]?.runId).toBe('d1');
    expect(shared?.points.map((point) => point.runId)).not.toContain('d10');
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
