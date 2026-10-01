import { describe, expect, it } from 'vitest';

import {
  FLAKY_RATE_RUNS,
  flakyFailures,
  flakyPlatforms,
  flakyResultIds,
  flakyTests,
  type FlakyOptions,
} from './flaky.ts';
import { at, result, run } from './records.test-support.ts';

// Spec section 11: "A test with both a passing and a failing result on the same commit_sha
// (across attempts or re-runs) within 30 days. Flake rate = flaky tests / total tests", where
// total tests is distinct tests in the latest default-branch run, and results are compared on
// one platform at a time. Section 17, Phase 4: flakiness excludes backfilled runs.

const now = at('2026-10-01T12:00:00Z');
const options: FlakyOptions = { defaultBranch: 'main', now };

describe('flakyTests', () => {
  it('finds a test that passed and failed on one commit across attempts', () => {
    const runs = [
      run('a1', '2026-09-20T00:00:00Z', { commitSha: 'c1', runAttempt: 1 }),
      run('a2', '2026-09-20T01:00:00Z', { commitSha: 'c1', runAttempt: 2 }),
    ];
    const results = [
      result('r1', 'a1', 't-flaky', 'failed'),
      result('r2', 'a2', 't-flaky', 'passed'),
      result('r3', 'a1', 't-steady', 'passed'),
      result('r4', 'a2', 't-steady', 'passed'),
    ];
    expect(flakyTests(runs, results, options)).toEqual({
      flakyTestIds: ['t-flaky'],
      totalTests: 2,
      flakeRate: 0.5,
    });
  });

  it('counts an error as a failing result and ignores skipped', () => {
    const runs = [
      run('a1', '2026-09-20T00:00:00Z', { commitSha: 'c1' }),
      run('a2', '2026-09-20T01:00:00Z', { commitSha: 'c1', runAttempt: 2 }),
    ];
    const results = [
      result('r1', 'a1', 't-error', 'error'),
      result('r2', 'a2', 't-error', 'passed'),
      result('r3', 'a1', 't-skip', 'skipped'),
      result('r4', 'a2', 't-skip', 'passed'),
    ];
    expect(flakyTests(runs, results, options).flakyTestIds).toEqual(['t-error']);
  });

  it('does not call a test flaky for passing on one commit and failing on another', () => {
    const runs = [
      run('a', '2026-09-20T00:00:00Z', { commitSha: 'c1' }),
      run('b', '2026-09-21T00:00:00Z', { commitSha: 'c2' }),
    ];
    const results = [result('r1', 'a', 't', 'passed'), result('r2', 'b', 't', 'failed')];
    expect(flakyTests(runs, results, options).flakyTestIds).toEqual([]);
  });

  it('ignores results from backfilled runs, even on a commit CI also ran', () => {
    // Backfilled runs carry no results today; this proves the rule, not the data.
    const runs = [
      run('ci', '2026-09-20T00:00:00Z', { commitSha: 'c1' }),
      run('bf', '2026-09-20T01:00:00Z', { commitSha: 'c1', source: 'backfill' }),
    ];
    const results = [result('r1', 'ci', 't', 'passed'), result('r2', 'bf', 't', 'failed')];
    expect(flakyTests(runs, results, options)).toEqual({
      flakyTestIds: [],
      totalTests: 1,
      flakeRate: 0,
    });
  });

  it('ignores results from other branches', () => {
    const runs = [
      run('main', '2026-09-20T00:00:00Z', { commitSha: 'c1' }),
      run('pr', '2026-09-20T01:00:00Z', { commitSha: 'c1', branch: 'feature/x' }),
    ];
    const results = [result('r1', 'main', 't', 'passed'), result('r2', 'pr', 't', 'failed')];
    expect(flakyTests(runs, results, options).flakyTestIds).toEqual([]);
  });

  it('looks back 30 UTC days, by when each run finished', () => {
    const runs = [
      run('old', '2026-09-01T23:59:59Z', { commitSha: 'c1' }),
      run('edge', '2026-09-02T00:00:00Z', { commitSha: 'c1', runAttempt: 2 }),
      run('edge2', '2026-09-02T00:00:01Z', { commitSha: 'c1', runAttempt: 3 }),
    ];
    expect(
      flakyTests(
        runs,
        [result('r1', 'old', 't-old', 'failed'), result('r2', 'edge', 't-old', 'passed')],
        options,
      ).flakyTestIds,
    ).toEqual([]);
    expect(
      flakyTests(
        runs,
        [result('r1', 'edge', 't-in', 'failed'), result('r2', 'edge2', 't-in', 'passed')],
        options,
      ).flakyTestIds,
    ).toEqual(['t-in']);
  });

  it('ignores runs that finished after now', () => {
    const runs = [
      run('a', '2026-10-01T11:00:00Z', { commitSha: 'c1' }),
      run('later', '2026-10-01T12:00:01Z', { commitSha: 'c1', runAttempt: 2 }),
    ];
    const results = [result('r1', 'a', 't', 'passed'), result('r2', 'later', 't', 'failed')];
    expect(flakyTests(runs, results, options)).toEqual({
      flakyTestIds: [],
      totalTests: 1,
      flakeRate: 0,
    });
  });

  // Decision 2026-09-24 (section 19): a test that passes on one platform and fails on another
  // is a parity finding, not a flake. Ostomate2 runs the same test on the JVM and the iOS
  // simulator, and a deterministic iOS-only failure would otherwise read as flakiness.
  it('does not call a test flaky for passing on one platform and failing on another', () => {
    const runs = [
      run('a1', '2026-09-20T00:00:00Z', { commitSha: 'c1' }),
      run('a2', '2026-09-20T01:00:00Z', { commitSha: 'c1', runAttempt: 2 }),
    ];
    const withinOneRun = [
      result('r1', 'a1', 't', 'passed', 'jvm'),
      result('r2', 'a1', 't', 'failed', 'ios-sim'),
    ];
    expect(flakyTests(runs, withinOneRun, options).flakyTestIds).toEqual([]);
    const acrossAttempts = [
      ...withinOneRun,
      result('r3', 'a2', 't', 'passed', 'jvm'),
      result('r4', 'a2', 't', 'failed', 'ios-sim'),
    ];
    expect(flakyTests(runs, acrossAttempts, options).flakyTestIds).toEqual([]);
  });

  it('finds a test whose result flips on one platform while another platform holds steady', () => {
    const runs = [
      run('a1', '2026-09-20T00:00:00Z', { commitSha: 'c1' }),
      run('a2', '2026-09-20T01:00:00Z', { commitSha: 'c1', runAttempt: 2 }),
    ];
    const results = [
      // Flips on the JVM; fails every time on the iOS simulator.
      result('r1', 'a1', 't-flip', 'failed', 'jvm'),
      result('r2', 'a2', 't-flip', 'passed', 'jvm'),
      result('r3', 'a1', 't-flip', 'failed', 'ios-sim'),
      result('r4', 'a2', 't-flip', 'failed', 'ios-sim'),
      // Steady on each platform, different between them.
      result('r5', 'a1', 't-parity', 'passed', 'jvm'),
      result('r6', 'a2', 't-parity', 'passed', 'jvm'),
      result('r7', 'a1', 't-parity', 'failed', 'ios-sim'),
      result('r8', 'a2', 't-parity', 'failed', 'ios-sim'),
    ];
    // Total tests counts a test on two platforms once (section 11).
    expect(flakyTests(runs, results, options)).toEqual({
      flakyTestIds: ['t-flip'],
      totalTests: 2,
      flakeRate: 0.5,
    });
  });

  it('takes total tests from the latest default-branch CI run', () => {
    const runs = [
      run('older', '2026-09-20T00:00:00Z'),
      run('latest', '2026-09-21T00:00:00Z'),
      run('later-bf', '2026-09-22T00:00:00Z', { source: 'backfill' }),
      run('later-pr', '2026-09-23T00:00:00Z', { branch: 'feature/x' }),
    ];
    const results = [
      result('r1', 'older', 't1', 'passed'),
      result('r2', 'older', 't2', 'passed'),
      result('r3', 'older', 't3', 'passed'),
      result('r4', 'latest', 't1', 'passed'),
      result('r5', 'latest', 't1', 'passed'),
      result('r6', 'latest', 't2', 'passed'),
      result('r7', 'later-bf', 't9', 'passed'),
      result('r8', 'later-pr', 't8', 'passed'),
    ];
    expect(flakyTests(runs, results, options).totalTests).toBe(2);
  });

  it('ignores results whose run was not loaded', () => {
    const runs = [run('a', '2026-09-20T00:00:00Z')];
    const results = [result('r1', 'a', 't', 'passed'), result('r2', 'missing', 't', 'failed')];
    expect(flakyTests(runs, results, options).flakyTestIds).toEqual([]);
  });

  it('has no flake rate when there are no tests', () => {
    expect(flakyTests([], [], options)).toEqual({
      flakyTestIds: [],
      totalTests: 0,
      flakeRate: null,
    });
    expect(
      flakyTests([run('empty', '2026-09-20T00:00:00Z', { status: 'empty' })], [], options),
    ).toEqual({ flakyTestIds: [], totalTests: 0, flakeRate: null });
  });

  it('lists flaky tests in a stable order', () => {
    const runs = [
      run('a1', '2026-09-20T00:00:00Z', { commitSha: 'c1' }),
      run('a2', '2026-09-20T01:00:00Z', { commitSha: 'c1', runAttempt: 2 }),
    ];
    const results = ['t-b', 't-a'].flatMap((testId) => [
      result(`${testId}-1`, 'a1', testId, 'failed'),
      result(`${testId}-2`, 'a2', testId, 'passed'),
    ]);
    expect(flakyTests(runs, results, options).flakyTestIds).toEqual(['t-a', 't-b']);
  });
});

// The same rule, read out per platform for the project page's flaky list and per result for the
// test history's flaky cells (design/data-map.md).
describe('flakyPlatforms and flakyResultIds', () => {
  const runs = [
    run('a1', '2026-09-20T00:00:00Z', { commitSha: 'c1' }),
    run('a2', '2026-09-20T01:00:00Z', { commitSha: 'c1', runAttempt: 2 }),
    run('b1', '2026-09-21T00:00:00Z', { commitSha: 'c2' }),
    run('pr', '2026-09-21T01:00:00Z', { commitSha: 'c2', branch: 'feature/x' }),
  ];
  const results = [
    // Flips on c1 on both platforms.
    result('x1', 'a1', 't-both', 'failed', 'jvm'),
    result('x2', 'a2', 't-both', 'passed', 'jvm'),
    result('x3', 'a1', 't-both', 'error', 'ios-sim'),
    result('x4', 'a2', 't-both', 'passed', 'ios-sim'),
    // Steady on c2, the commit after.
    result('x5', 'b1', 't-both', 'passed', 'jvm'),
    // Flips on c1 on the JVM only; skipped on the simulator, which is neither.
    result('y1', 'a1', 't-jvm', 'passed', 'jvm'),
    result('y2', 'a2', 't-jvm', 'failed', 'jvm'),
    result('y3', 'a1', 't-jvm', 'skipped', 'ios-sim'),
    result('y4', 'a2', 't-jvm', 'passed', 'ios-sim'),
    // A pull request run on c2 does not count, so t-pr is steady.
    result('z1', 'b1', 't-pr', 'passed', 'jvm'),
    result('z2', 'pr', 't-pr', 'failed', 'jvm'),
  ];

  it('lists each flaky test with the platforms it flipped on, in a stable order', () => {
    expect(flakyPlatforms(runs, results, options)).toEqual([
      { testId: 't-both', platforms: ['ios-sim', 'jvm'], commits: 1 },
      { testId: 't-jvm', platforms: ['jvm'], commits: 1 },
    ]);
  });

  // components.md: "Flipped on {c} commits in 30 days", c = commits with both a pass and a fail on
  // one platform (design v9 item 12), and the Test History Flaky tile's value.
  it('counts the commits a test flipped on, once each however many platforms flipped', () => {
    const more = [
      ...runs,
      run('b2', '2026-09-21T02:00:00Z', { commitSha: 'c2', runAttempt: 2 }),
      run('old1', '2026-08-01T00:00:00Z', { commitSha: 'c0' }),
      run('old2', '2026-08-01T01:00:00Z', { commitSha: 'c0', runAttempt: 2 }),
    ];
    const flips = [
      ...results,
      // t-both flips on c2 as well, now on the JVM only.
      result('x6', 'b2', 't-both', 'failed', 'jvm'),
      // An old flip, outside the 30 days, does not count.
      result('x7', 'old1', 't-both', 'failed', 'jvm'),
      result('x8', 'old2', 't-both', 'passed', 'jvm'),
    ];
    expect(flakyPlatforms(more, flips, options)).toEqual([
      { testId: 't-both', platforms: ['ios-sim', 'jvm'], commits: 2 },
      { testId: 't-jvm', platforms: ['jvm'], commits: 1 },
    ]);
  });

  it('agrees with flakyTests on which tests are flaky', () => {
    expect(flakyPlatforms(runs, results, options).map((flaky) => flaky.testId)).toEqual(
      flakyTests(runs, results, options).flakyTestIds,
    );
  });

  it('marks the passing and failing results of each flipping commit and platform, and no others', () => {
    // x5 is on c2, where t-both only passed; y3 is skipped; y4 only passed on the simulator.
    expect([...flakyResultIds(runs, results, options)].sort()).toEqual([
      'x1',
      'x2',
      'x3',
      'x4',
      'y1',
      'y2',
    ]);
  });

  it('marks nothing with no runs or no results', () => {
    expect(flakyPlatforms([], [], options)).toEqual([]);
    expect(flakyResultIds(runs, [], options).size).toBe(0);
  });
});

// Design v7 item 6 (components.md StatusTimeline, data-map.md "Flaky list"): "Failed {n} of last
// {m} runs", where m is the last 40 default-branch CI runs in which the test has a result and n
// those in which it failed or errored on any platform.
describe('flakyFailures', () => {
  // n CI runs on main an hour apart, oldest first, ending before now.
  const hourly = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      run(`h${i}`, new Date(Date.UTC(2026, 8, 1) + i * 3_600_000).toISOString()),
    );

  it('reads the last 40 runs', () => {
    expect(FLAKY_RATE_RUNS).toBe(40);
  });

  it('has nothing to count with no runs or no results', () => {
    expect(flakyFailures([], [], ['t'], options)).toEqual([{ testId: 't', failed: 0, runs: 0 }]);
    expect(flakyFailures(hourly(3), [], ['t'], options)).toEqual([
      { testId: 't', failed: 0, runs: 0 },
    ]);
  });

  it('counts a single run', () => {
    const runs = hourly(1);
    expect(flakyFailures(runs, [result('r', 'h0', 't', 'failed')], ['t'], options)).toEqual([
      { testId: 't', failed: 1, runs: 1 },
    ]);
  });

  it('counts a run once when the test failed or errored on any of its platforms', () => {
    const runs = hourly(3);
    const results = [
      // h0: failed on ios-sim, passed on jvm; h1: errored on jvm; h2: passed on both.
      result('a', 'h0', 't', 'passed', 'jvm'),
      result('b', 'h0', 't', 'failed', 'ios-sim'),
      result('c', 'h1', 't', 'error', 'jvm'),
      result('d', 'h2', 't', 'passed', 'jvm'),
      result('e', 'h2', 't', 'passed', 'ios-sim'),
    ];
    expect(flakyFailures(runs, results, ['t'], options)).toEqual([
      { testId: 't', failed: 2, runs: 3 },
    ]);
  });

  it('counts a run where the test was only skipped as a run, not a failure', () => {
    const runs = hourly(2);
    const results = [result('a', 'h0', 't', 'skipped'), result('b', 'h1', 't', 'failed')];
    expect(flakyFailures(runs, results, ['t'], options)).toEqual([
      { testId: 't', failed: 1, runs: 2 },
    ]);
  });

  it('takes the last 40 runs with a result for the test, passing over runs without one', () => {
    // 45 runs. The test failed in h0 and h1, which fall outside its last 40, and has no result in
    // h44; its last 40 are h4 to h43, of which it failed in h4.
    const runs = hourly(45);
    const results = runs
      .filter((r) => r.id !== 'h44')
      .map((r, i) =>
        result(`x${i}`, r.id, 't', ['h0', 'h1', 'h4'].includes(r.id) ? 'failed' : 'passed'),
      );
    expect(flakyFailures(runs, results, ['t'], options)).toEqual([
      { testId: 't', failed: 1, runs: 40 },
    ]);
  });

  it('counts fewer than 40 when the test has results in fewer runs', () => {
    const runs = hourly(12);
    const results = [result('a', 'h3', 't', 'passed'), result('b', 'h7', 't', 'error')];
    expect(flakyFailures(runs, results, ['t'], options)).toEqual([
      { testId: 't', failed: 1, runs: 2 },
    ]);
  });

  it('reads default-branch CI runs finished by now, however old', () => {
    const runs = [
      run('old', '2025-01-01T00:00:00Z'),
      run('bf', '2026-09-20T00:00:00Z', { source: 'backfill' }),
      run('pr', '2026-09-21T00:00:00Z', { branch: 'feature/x' }),
      run('future', '2026-10-01T12:00:00.001Z'),
    ];
    const results = ['old', 'bf', 'pr', 'future'].map((id) => result(`r-${id}`, id, 't', 'failed'));
    expect(flakyFailures(runs, results, ['t'], options)).toEqual([
      { testId: 't', failed: 1, runs: 1 },
    ]);
  });

  it('counts no failures when every failing run is older than the last 40', () => {
    // A test flaky in the 30 days can read 0: its flip in h0 is behind 40 later passing runs.
    const runs = hourly(41);
    const results = runs.map((r, i) => result(`x${i}`, r.id, 't', i === 0 ? 'failed' : 'passed'));
    expect(flakyFailures(runs, results, ['t'], options)).toEqual([
      { testId: 't', failed: 0, runs: 40 },
    ]);
  });

  it('answers each test asked for, in the order asked', () => {
    const runs = hourly(2);
    const results = [
      result('a', 'h0', 't2', 'failed'),
      result('b', 'h1', 't1', 'passed'),
      result('c', 'h1', 't3', 'failed'),
    ];
    expect(flakyFailures(runs, results, ['t2', 't1'], options)).toEqual([
      { testId: 't2', failed: 1, runs: 1 },
      { testId: 't1', failed: 0, runs: 1 },
    ]);
  });
});
