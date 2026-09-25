import { describe, expect, it } from 'vitest';

import { flakyTests, type FlakyOptions } from './flaky.ts';
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
