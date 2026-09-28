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
      initialRun: null,
      duration: { 30: { platforms: [], points: [] }, 90: { platforms: [], points: [] } },
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
    // One run: one point per window, a value per platform.
    expect(history.duration[30]).toEqual({
      platforms: ['jvm', 'ios-sim'],
      points: [
        {
          runId: 'r1',
          finishedAt: at('2026-09-30T10:00:00Z'),
          status: 'passed',
          durationsMs: [410, 630],
        },
      ],
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
    expect(history.duration[30].points.map((point) => point.durationsMs)).toEqual([
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

  it('trends duration over default-branch CI runs in the window, without skipped results', () => {
    const runs = [
      publicRun('old', '2026-09-01T23:59:59.999Z'),
      publicRun('in', '2026-09-02T00:00:00Z'),
      publicRun('pr', '2026-09-10T00:00:00Z', { branch: 'feature/x' }),
      publicRun('skipped', '2026-09-11T00:00:00Z'),
      publicRun('last', '2026-09-12T00:00:00Z'),
    ];
    const history = testHistory(
      runs,
      [
        result('a', 'old', 'jvm', 'passed', 50),
        result('b', 'in', 'jvm', 'passed', 60),
        result('c', 'pr', 'jvm', 'passed', 70),
        result('d', 'skipped', 'jvm', 'skipped', 0),
        result('e', 'last', 'jvm', 'failed', 80),
      ],
      options,
    );
    // A skipped test took no time worth plotting, so its run has no point; the failed run does.
    expect(history.duration[30].points.map((point) => [point.runId, point.durationsMs])).toEqual([
      ['in', [60]],
      ['last', [80]],
    ]);
    // 90 days reaches the 2026-09-01 run as well.
    expect(history.duration[90].points.map((point) => point.runId)).toEqual(['old', 'in', 'last']);
    // The timeline keeps every run, the pull request and the skipped one included.
    expect(history.runs.map((entry) => entry.id)).toEqual(['old', 'in', 'pr', 'skipped', 'last']);
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
  });
});
