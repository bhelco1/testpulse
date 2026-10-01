import { describe, expect, it } from 'vitest';

import type { PublicRun } from './input.ts';
import { at, run } from './records.test-support.ts';
import { testHistory, type HistoryResult } from './test-history.ts';

// One test's history (spec section 13, /p/[slug]/tests/[testKey]; design/data-map.md): its
// results grouped by run, oldest first, a strip per platform; flaky cells by section 11's rule;
// and its duration per platform over default-branch CI runs.

const now = at('2026-10-01T15:30:00Z');
const options = { defaultBranch: 'main', now };

const publicRun = (
  id: string,
  finishedAt: string,
  overrides: Partial<PublicRun> = {},
): PublicRun => ({
  ...run(id, finishedAt),
  event: 'push',
  runUrl: null,
  total: 1,
  durationMs: 1_000,
  resultsPrunedAt: null,
  ...overrides,
});

const result = (
  id: string,
  runId: string,
  platform: string,
  status: HistoryResult['status'],
  durationMs = 100,
): HistoryResult => ({
  id,
  runId,
  job: platform === 'jvm' ? 'android' : 'ios',
  module: 'composeApp',
  platform,
  status,
  durationMs,
});

describe('testHistory', () => {
  it('is empty for a test with no results', () => {
    const history = testHistory([], [], options);
    expect(history).toEqual({
      platforms: [],
      runs: [],
      flaky: false,
      flakyPlatforms: [],
      flakyCommits: 0,
      initialRun: null,
      failedRuns: 0,
      failedPlatforms: [],
      mismatch: { runs: 0, latest: null },
      duration: { platforms: [], points: [], medianMs: [] },
    });
  });

  it('groups a single run’s results by platform, in report order, with the run’s title', () => {
    const runs = [publicRun('r1', '2026-09-30T10:00:00Z', { commitSha: 'abc1234' })];
    const history = testHistory(
      runs,
      [result('x2', 'r1', 'ios-sim', 'failed', 630), result('x1', 'r1', 'jvm', 'passed', 410)],
      options,
    );
    expect(history.platforms).toEqual(['jvm', 'ios-sim']);
    expect(history.runs).toEqual([
      {
        id: 'r1',
        title: 'Push to main',
        event: 'push',
        branch: 'main',
        commitSha: 'abc1234',
        runUrl: null,
        finishedAt: at('2026-09-30T10:00:00Z'),
        source: 'ci',
        status: 'passed',
        results: [
          { platform: 'jvm', status: 'passed', durationMs: 410, flaky: false },
          { platform: 'ios-sim', status: 'failed', durationMs: 630, flaky: false },
        ],
      },
    ]);
    // One run: one point, a value per platform, and the cell each came from.
    expect(history.duration).toEqual({
      platforms: ['jvm', 'ios-sim'],
      points: [
        {
          runId: 'r1',
          finishedAt: at('2026-09-30T10:00:00Z'),
          status: 'passed',
          durationsMs: [410, 630],
          cells: [
            { platform: 'jvm', status: 'passed', durationMs: 410, flaky: false },
            { platform: 'ios-sim', status: 'failed', durationMs: 630, flaky: false },
          ],
        },
      ],
      medianMs: [410, 630],
    });
  });

  it('orders runs oldest first across branches, leaves out runs after now, and titles each', () => {
    const runs = [
      publicRun('pr', '2026-09-20T10:00:00Z', { branch: 'fix-today-count', event: 'pull_request' }),
      publicRun('sched', '2026-09-19T10:00:00Z', { event: 'schedule' }),
      publicRun('future', '2026-10-01T15:30:00.001Z'),
    ];
    const history = testHistory(
      runs,
      [
        result('a', 'pr', 'jvm', 'passed'),
        result('b', 'sched', 'jvm', 'passed'),
        result('c', 'future', 'jvm', 'failed'),
      ],
      options,
    );
    expect(history.runs.map((entry) => [entry.id, entry.title])).toEqual([
      ['sched', 'Scheduled run'],
      ['pr', 'Pull request from fix-today-count'],
    ]);
  });

  it('leaves a platform out of a run where the test did not run there (a "not run" cell)', () => {
    const runs = [publicRun('r1', '2026-09-20T10:00:00Z'), publicRun('r2', '2026-09-21T10:00:00Z')];
    const history = testHistory(
      runs,
      [
        result('a', 'r1', 'jvm', 'passed'),
        result('b', 'r1', 'ios-sim', 'passed'),
        result('c', 'r2', 'jvm', 'passed', 300),
      ],
      options,
    );
    expect(history.runs[1]?.results).toEqual([
      { platform: 'jvm', status: 'passed', durationMs: 300, flaky: false },
    ]);
    // The duration trend keeps both series the same length: no ios-sim value for r2.
    expect(history.duration.points.map((point) => point.durationsMs)).toEqual([
      [100, 100],
      [300, null],
    ]);
  });

  it('marks the flaky cells and the test as flaky, per platform (section 11)', () => {
    // Attempts 1 and 2 of one commit: failed then passed on the JVM, failed twice on iOS.
    const runs = [
      publicRun('a1', '2026-09-20T10:00:00Z', { commitSha: 'c1' }),
      publicRun('a2', '2026-09-20T11:00:00Z', { commitSha: 'c1', runAttempt: 2 }),
    ];
    const history = testHistory(
      runs,
      [
        result('x1', 'a1', 'jvm', 'failed'),
        result('x2', 'a1', 'ios-sim', 'failed'),
        result('x3', 'a2', 'jvm', 'passed'),
        result('x4', 'a2', 'ios-sim', 'failed'),
      ],
      options,
    );
    expect(history.flaky).toBe(true);
    expect(history.flakyPlatforms).toEqual(['jvm']);
    expect(
      history.runs.map((entry) => entry.results.map((cell) => [cell.platform, cell.flaky])),
    ).toEqual([
      [
        ['jvm', true],
        ['ios-sim', false],
      ],
      [
        ['jvm', true],
        ['ios-sim', false],
      ],
    ]);
  });

  it('never marks a pull request run flaky, and is not flaky on a flip there', () => {
    const runs = [
      publicRun('main', '2026-09-20T10:00:00Z', { commitSha: 'c1' }),
      publicRun('pr', '2026-09-20T11:00:00Z', { commitSha: 'c1', branch: 'feature/x' }),
    ];
    const history = testHistory(
      runs,
      [result('x1', 'main', 'jvm', 'passed'), result('x2', 'pr', 'jvm', 'failed')],
      options,
    );
    expect(history.flaky).toBe(false);
    expect(history.runs.flatMap((entry) => entry.results.map((cell) => cell.flaky))).toEqual([
      false,
      false,
    ]);
  });

  it('combines repeated results on one platform in one run: failing first, time summed', () => {
    const runs = [publicRun('r1', '2026-09-20T10:00:00Z')];
    const history = testHistory(
      runs,
      [
        result('x1', 'r1', 'node', 'passed', 20),
        result('x2', 'r1', 'node', 'failed', 30),
        result('x3', 'r1', 'node', 'passed', 25),
      ],
      options,
    );
    // 20 + 30 + 25 = 75 ms. A pass and a fail on one commit and platform is section 11's flip,
    // within one run as across attempts.
    expect(history.runs[0]?.results).toEqual([
      { platform: 'node', status: 'failed', durationMs: 75, flaky: true },
    ]);
  });

  // Section 11 and the 2026-09-29 row Bobby confirmed on 2026-09-30: the duration chart covers the
  // last 30 default-branch CI runs, however old, as each project page chart does. A run among them
  // with no value keeps its place as a gap; no older run is pulled in to fill it.
  describe('duration', () => {
    const main = (i: number, finishedAt: string) => publicRun(`m${i}`, finishedAt);

    it('reads every default-branch CI run when there are fewer than 30, without others', () => {
      const runs = [
        publicRun('in', '2026-09-02T00:00:00Z'),
        publicRun('pr', '2026-09-10T00:00:00Z', { branch: 'feature/x' }),
        publicRun('imported', '2026-09-10T12:00:00Z', { source: 'backfill' }),
        publicRun('skipped', '2026-09-11T00:00:00Z'),
        publicRun('last', '2026-09-12T00:00:00Z'),
      ];
      const history = testHistory(
        runs,
        [
          result('b', 'in', 'jvm', 'passed', 60),
          result('c', 'pr', 'jvm', 'passed', 70),
          result('d', 'skipped', 'jvm', 'skipped', 0),
          result('e', 'last', 'jvm', 'failed', 80),
        ],
        options,
      );
      // The pull request and the imported run are not default-branch CI runs. The skipped run
      // keeps its place, with no value: a skipped test took no time worth plotting.
      expect(history.duration.points.map((point) => [point.runId, point.durationsMs])).toEqual([
        ['in', [60]],
        ['skipped', [null]],
        ['last', [80]],
      ]);
      // The timeline keeps every run with a result, the pull request included.
      expect(history.runs.map((entry) => entry.id)).toEqual(['in', 'pr', 'skipped', 'last']);
    });

    it('takes the latest 30 of 32 runs, leaving the two oldest out', () => {
      // m0 on 2026-08-01, then one a day to m31 on 2026-09-01.
      const runs = Array.from({ length: 32 }, (_, i) =>
        main(i, new Date(Date.UTC(2026, 7, 1 + i, 10)).toISOString()),
      );
      const history = testHistory(
        runs,
        runs.map((run, i) => result(`x${i}`, run.id, 'jvm', 'passed', 100 + i)),
        options,
      );
      expect(history.duration.points).toHaveLength(30);
      expect(history.duration.points[0]?.runId).toBe('m2');
      expect(history.duration.points.at(-1)?.runId).toBe('m31');
      // 100 + 2 ms for m2, 100 + 31 ms for m31.
      expect(history.duration.points[0]?.durationsMs).toEqual([102]);
      expect(history.duration.points.at(-1)?.durationsMs).toEqual([131]);
    });

    it('reaches back past 90 days when the last 30 runs do', () => {
      // 2026-05-01 is 153 days before now; it is still one of the last 30 (here, 3) runs.
      const runs = [
        main(0, '2026-05-01T10:00:00Z'),
        main(1, '2026-09-30T10:00:00Z'),
        main(2, '2026-10-01T10:00:00Z'),
      ];
      const history = testHistory(
        runs,
        [
          result('a', 'm0', 'jvm', 'passed', 50),
          result('b', 'm1', 'jvm', 'passed', 60),
          result('c', 'm2', 'jvm', 'passed', 70),
        ],
        options,
      );
      expect(history.duration.points.map((point) => point.durationsMs)).toEqual([[50], [60], [70]]);
    });

    it('keeps a gap where the test did not report on a platform, or at all', () => {
      // m1 is a default-branch CI run the loader read for the window in which this test has no
      // result: a gap on both platforms, not a reason to reach for an older run.
      const runs = [
        main(0, '2026-09-28T10:00:00Z'),
        main(1, '2026-09-29T10:00:00Z'),
        main(2, '2026-09-30T10:00:00Z'),
      ];
      const history = testHistory(
        runs,
        [
          result('a', 'm0', 'jvm', 'passed', 25),
          result('b', 'm0', 'ios-sim', 'passed', 3),
          result('c', 'm2', 'jvm', 'error', 30),
        ],
        options,
      );
      expect(history.duration.platforms).toEqual(['jvm', 'ios-sim']);
      expect(history.duration.points.map((point) => [point.runId, point.durationsMs])).toEqual([
        ['m0', [25, 3]],
        ['m1', [null, null]],
        ['m2', [30, null]],
      ]);
      // The timeline holds only the runs with a result.
      expect(history.runs.map((entry) => entry.id)).toEqual(['m0', 'm2']);
    });

    it('has no points when no default-branch CI run has been read', () => {
      const runs = [publicRun('pr', '2026-09-10T00:00:00Z', { branch: 'feature/x' })];
      const history = testHistory(runs, [result('a', 'pr', 'jvm', 'passed', 70)], options);
      expect(history.duration).toEqual({ platforms: [], points: [], medianMs: [] });
    });

    // The chart says "Skipped" where the platform's result was skipped and "Not run" where it has
    // none (v9 item 18), so each point carries the cell its value came from, or null.
    it('carries each platform’s cell, null where the test has no result there', () => {
      const runs = [main(0, '2026-09-28T10:00:00Z'), main(1, '2026-09-29T10:00:00Z')];
      const history = testHistory(
        runs,
        [result('a', 'm0', 'jvm', 'skipped', 0), result('b', 'm0', 'ios-sim', 'passed', 40)],
        options,
      );
      expect(history.duration.points.map((point) => point.cells)).toEqual([
        [
          { platform: 'jvm', status: 'skipped', durationMs: 0, flaky: false },
          { platform: 'ios-sim', status: 'passed', durationMs: 40, flaky: false },
        ],
        [null, null],
      ]);
      expect(history.duration.points.map((point) => point.durationsMs)).toEqual([
        [null, 40],
        [null, null],
      ]);
    });

    // components.md, Test history page: "Median time: value = median of the first platform (data
    // order) over the last 30 default-branch CI runs", each other platform's beside it.
    it('gives each platform’s median over the runs it has a value in', () => {
      const runs = [0, 1, 2, 3].map((i) => main(i, `2026-09-2${i}T10:00:00Z`));
      const history = testHistory(
        runs,
        [
          result('a', 'm0', 'jvm', 'passed', 40),
          result('b', 'm1', 'jvm', 'passed', 10),
          result('c', 'm2', 'jvm', 'passed', 30),
          result('d', 'm3', 'jvm', 'skipped', 0),
          result('e', 'm0', 'ios-sim', 'passed', 60),
          result('f', 'm1', 'ios-sim', 'passed', 70),
          result('g', 'm3', 'ios-sim', 'skipped', 0),
        ],
        options,
      );
      // jvm: 10, 30, 40 → 30. ios-sim: 60, 70 → 65.
      expect(history.duration.medianMs).toEqual([30, 65]);
    });

    it('has no median for a platform skipped in every run', () => {
      const runs = [main(0, '2026-09-28T10:00:00Z'), main(1, '2026-09-29T10:00:00Z')];
      const history = testHistory(
        runs,
        [
          result('a', 'm0', 'jvm', 'skipped', 0),
          result('b', 'm1', 'jvm', 'skipped', 0),
          result('c', 'm1', 'ios-sim', 'passed', 40),
        ],
        options,
      );
      expect(history.duration.medianMs).toEqual([null, 40]);
    });
  });

  // components.md, Test history page, "Tiles (over the strip's runs: the last 40 CI runs with a
  // result for this test)" (design v8 item 40, v9 item 5).
  describe('the strip and its tiles', () => {
    const daily = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        publicRun(`d${i}`, new Date(Date.UTC(2026, 7, 1 + i, 10)).toISOString(), {
          commitSha: `c${i}`,
        }),
      );

    it('holds the last 40 runs with a result', () => {
      const runs = daily(42);
      const history = testHistory(
        runs,
        runs.map((r, i) => result(`x${i}`, r.id, 'jvm', i === 0 ? 'failed' : 'passed')),
        options,
      );
      expect(history.runs).toHaveLength(40);
      expect(history.runs[0]?.id).toBe('d2');
      // d0's failure is behind the 40, so it is neither counted nor opened on.
      expect(history.failedRuns).toBe(0);
      expect(history.initialRun).toBe(39);
    });

    it('counts the runs it failed or errored in on any platform, and on which platforms', () => {
      const runs = daily(4);
      const history = testHistory(
        runs,
        [
          result('a', 'd0', 'jvm', 'passed'),
          result('b', 'd0', 'ios-sim', 'failed'),
          result('c', 'd1', 'jvm', 'error'),
          result('d', 'd1', 'ios-sim', 'failed'),
          result('e', 'd2', 'jvm', 'passed'),
          result('f', 'd2', 'ios-sim', 'passed'),
          result('g', 'd3', 'jvm', 'skipped'),
        ],
        options,
      );
      expect(history.failedRuns).toBe(2);
      // Report order, as the strips are drawn.
      expect(history.failedPlatforms).toEqual(['jvm', 'ios-sim']);
    });

    // "Runs where it failed or errored on any platform", as the flaky list's "Failed {n} of last
    // {m} runs" counts them on the project page, so one test reads alike on both pages: the
    // failing side of a flip is a run it failed in, though the strip draws its cell as Flaky.
    it('counts the failing side of a flip as a failed run', () => {
      const runs = [
        publicRun('a1', '2026-09-20T10:00:00Z', { commitSha: 'c1' }),
        publicRun('a2', '2026-09-20T11:00:00Z', { commitSha: 'c1', runAttempt: 2 }),
      ];
      const history = testHistory(
        runs,
        [result('x1', 'a1', 'jvm', 'failed'), result('x2', 'a2', 'jvm', 'passed')],
        options,
      );
      expect(history.failedRuns).toBe(1);
      expect(history.failedPlatforms).toEqual(['jvm']);
      expect(history.flakyCommits).toBe(1);
    });

    it('counts the commits it flipped on in 30 days', () => {
      const runs = [
        publicRun('a1', '2026-09-20T10:00:00Z', { commitSha: 'c1' }),
        publicRun('a2', '2026-09-20T11:00:00Z', { commitSha: 'c1', runAttempt: 2 }),
        publicRun('b1', '2026-09-21T10:00:00Z', { commitSha: 'c2' }),
        publicRun('b2', '2026-09-21T11:00:00Z', { commitSha: 'c2', runAttempt: 2 }),
      ];
      const history = testHistory(
        runs,
        [
          result('x1', 'a1', 'jvm', 'failed'),
          result('x2', 'a2', 'jvm', 'passed'),
          result('x3', 'a1', 'ios-sim', 'failed'),
          result('x4', 'a2', 'ios-sim', 'passed'),
          result('x5', 'b1', 'jvm', 'error'),
          result('x6', 'b2', 'jvm', 'passed'),
        ],
        options,
      );
      expect(history.flakyCommits).toBe(2);
    });

    // components.md: "Mismatch headline: shown when any run in the strip has a platform mismatch",
    // a mismatch being statuses that differ across platforms in one run (ResultsTable).
    it('counts the runs whose platforms disagree, and finds the latest', () => {
      const runs = daily(4);
      const history = testHistory(
        runs,
        [
          result('a', 'd0', 'jvm', 'passed'),
          result('b', 'd0', 'ios-sim', 'failed'),
          result('c', 'd1', 'jvm', 'passed'),
          result('d', 'd1', 'ios-sim', 'skipped'),
          result('e', 'd2', 'jvm', 'failed'),
          result('f', 'd2', 'ios-sim', 'failed'),
          // One platform only: nothing to disagree with.
          result('g', 'd3', 'jvm', 'error'),
        ],
        options,
      );
      expect(history.mismatch).toEqual({ runs: 2, latest: 1 });
    });

    it('finds no mismatch on one platform', () => {
      const runs = daily(2);
      const history = testHistory(
        runs,
        [result('a', 'd0', 'jvm', 'passed'), result('b', 'd1', 'jvm', 'failed')],
        options,
      );
      expect(history.mismatch).toEqual({ runs: 0, latest: null });
    });
  });

  // Spec section 19, 2026-09-28 (design v5): Test History opens on the latest run with a failed
  // or error result on any platform, else on the latest run.
  describe('initialRun', () => {
    const runs = [
      publicRun('r1', '2026-09-20T10:00:00Z'),
      publicRun('r2', '2026-09-21T10:00:00Z'),
      publicRun('r3', '2026-09-22T10:00:00Z'),
    ];

    it('is the latest run with a failing result on any platform', () => {
      const history = testHistory(
        runs,
        [
          result('a', 'r1', 'jvm', 'failed'),
          result('b', 'r2', 'jvm', 'passed'),
          result('c', 'r2', 'ios-sim', 'error'),
          result('d', 'r3', 'jvm', 'passed'),
        ],
        options,
      );
      // r2 errored on the simulator, and is later than r1: index 1.
      expect(history.initialRun).toBe(1);
    });

    it('is the latest run when none failed, skipped results not counting as failing', () => {
      const history = testHistory(
        runs,
        [
          result('a', 'r1', 'jvm', 'skipped'),
          result('b', 'r2', 'jvm', 'passed'),
          result('c', 'r3', 'jvm', 'skipped'),
        ],
        options,
      );
      expect(history.initialRun).toBe(2);
    });

    // Design v6 item 7 (components.md StatusTimeline): a flaky cell draws as Flaky, not Failed, so
    // the failing side of a flip does not count as a failing run either.
    it('passes over a failed result that is one side of a flip', () => {
      const flipRuns = [
        publicRun('r1', '2026-09-20T10:00:00Z'),
        publicRun('r2', '2026-09-21T10:00:00Z', { commitSha: 'same' }),
        publicRun('r3', '2026-09-22T10:00:00Z', { commitSha: 'same', runAttempt: 2 }),
      ];
      const history = testHistory(
        flipRuns,
        [
          result('a', 'r1', 'jvm', 'error'),
          result('b', 'r2', 'jvm', 'failed'),
          result('c', 'r3', 'jvm', 'passed'),
        ],
        options,
      );
      expect(history.runs.map((entry) => entry.results[0]?.flaky)).toEqual([false, true, true]);
      expect(history.initialRun).toBe(0);
    });

    it('is the latest run when its only failure is flaky', () => {
      const flipRuns = [
        publicRun('r1', '2026-09-20T10:00:00Z', { commitSha: 'same' }),
        publicRun('r2', '2026-09-21T10:00:00Z', { commitSha: 'same', runAttempt: 2 }),
      ];
      const history = testHistory(
        flipRuns,
        [result('a', 'r1', 'jvm', 'failed'), result('b', 'r2', 'jvm', 'passed')],
        options,
      );
      expect(history.initialRun).toBe(1);
    });
  });
});
