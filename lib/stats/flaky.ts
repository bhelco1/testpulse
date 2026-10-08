import type { StatsResult, StatsRun } from './input.ts';
import { byFinish, countsTowardCiOnlyStats, inWindow } from './rules.ts';

// Spec section 11: "A test with both a passing and a failing result on the same commit_sha
// (across attempts or re-runs) within 30 days. Flake rate = flaky tests / total tests." CI runs
// only (section 17, Phase 4). Backfilled runs hold no results today; they are filtered by
// source anyway, because the rule is about where a result came from, not what happens to exist.
//
// Read as follows, and pinned by the tests:
// - Passing is `passed`; failing is `failed` or `error`; `skipped` is neither.
// - A result is compared only with results for the same test on the same platform (decision
//   2026-09-24). A test passing on one platform and failing on another is what cross-platform
//   parity reports; a deterministic failure on one platform is not a flake.
// - Default-branch runs only, per the opening line of section 11, finished within the 30 UTC
//   days ending on the day of now.
// - "Total tests" is section 11's own stat: distinct tests with a result in the latest
//   default-branch CI run, taken from within the window since results outside it are not read.
//   No such run, or one with no results, gives no flake rate.

export interface FlakyOptions {
  readonly defaultBranch: string;
  readonly now: Date;
}

export interface FlakyTests {
  readonly flakyTestIds: readonly string[];
  readonly totalTests: number;
  readonly flakeRate: number | null;
}

const FLAKY_DAYS = 30;

interface Outcome {
  readonly testId: string;
  readonly commitSha: string;
  readonly platform: string;
  readonly seen: [passing: boolean, failing: boolean];
  readonly resultIds: string[];
}

/** Every passing or failing result the rule reads, per commit, test and platform. */
function outcomes(
  runs: readonly StatsRun[],
  results: readonly StatsResult[],
  options: FlakyOptions,
): { counted: Map<string, StatsRun>; groups: Outcome[] } {
  const counted = new Map(
    runs
      .filter(
        (run) =>
          countsTowardCiOnlyStats(run, options.defaultBranch) &&
          inWindow(run.finishedAt, options.now, FLAKY_DAYS),
      )
      .map((run) => [run.id, run]),
  );
  const groups = new Map<string, Outcome>();
  for (const result of results) {
    const run = counted.get(result.runId);
    if (run === undefined || result.status === 'skipped') continue;
    // Postgres text cannot hold NUL, so no stored SHA, UUID or platform contains it and the
    // joined key is unambiguous.
    const key = `${run.commitSha}\u0000${result.testId}\u0000${result.platform}`;
    const group = groups.get(key) ?? {
      testId: result.testId,
      commitSha: run.commitSha,
      platform: result.platform,
      seen: [false, false],
      resultIds: [],
    };
    if (result.status === 'passed') group.seen[0] = true;
    else group.seen[1] = true;
    group.resultIds.push(result.id);
    groups.set(key, group);
  }
  return { counted, groups: [...groups.values()] };
}

const flipped = (group: Outcome): boolean => group.seen[0] && group.seen[1];

export function flakyTests(
  runs: readonly StatsRun[],
  results: readonly StatsResult[],
  options: FlakyOptions,
): FlakyTests {
  const { counted, groups } = outcomes(runs, results, options);
  const flaky = new Set(groups.filter(flipped).map((group) => group.testId));

  const latest = [...counted.values()].sort(byFinish).at(-1);
  const totalTests =
    latest === undefined
      ? 0
      : new Set(results.filter((r) => r.runId === latest.id).map((r) => r.testId)).size;

  return {
    flakyTestIds: [...flaky].sort(),
    totalTests,
    flakeRate: totalTests === 0 ? null : flaky.size / totalTests,
  };
}

export interface FlakyTest {
  readonly testId: string;
  /** The platforms the test both passed and failed on, for one commit. */
  readonly platforms: readonly string[];
  /**
   * The commits it both passed and failed on, on one platform: "Flipped on {c} commits in 30 days"
   * and the test history's Flaky tile (design v9 item 12).
   */
  readonly commits: number;
}

/** The flaky tests with the platforms and commits each flipped on, for the flaky list. */
export function flakyPlatforms(
  runs: readonly StatsRun[],
  results: readonly StatsResult[],
  options: FlakyOptions,
): FlakyTest[] {
  const flipsOf = new Map<string, { platforms: Set<string>; commits: Set<string> }>();
  for (const group of outcomes(runs, results, options).groups.filter(flipped)) {
    const flips = flipsOf.get(group.testId) ?? { platforms: new Set(), commits: new Set() };
    flips.platforms.add(group.platform);
    flips.commits.add(group.commitSha);
    flipsOf.set(group.testId, flips);
  }
  return [...flipsOf.entries()]
    .sort(([a], [b]) => compareText(a, b))
    .map(([testId, { platforms, commits }]) => ({
      testId,
      platforms: [...platforms].sort(compareText),
      commits: commits.size,
    }));
}

// Design v7 item 6 (components.md StatusTimeline, data-map.md "Flaky list"): the flaky list's
// "Failed {n} of last {m} runs". m is the last 40 default-branch CI runs in which the test has a
// result, of any status and on any platform, fewer when it has fewer; n is those the Test History
// strip draws Failed: a failed or errored result on a platform where none of the run's results
// is one side of a flip. A flaky run is Flaky, never Failed (design v10 item 18, decision
// 2026-10-07). Unlike the flip itself, m has no day window, so a test flaky in the 30 days can
// count no failures when its failing runs are behind 40 later ones, and a flip older than 30 days
// is not one, so its failing side counts.

export const FLAKY_RATE_RUNS = 40;

export interface FlakyFailures {
  readonly testId: string;
  /** n: runs among them with a failed or errored platform that is not one side of a flip. */
  readonly failed: number;
  /** m: the test's last runs with a result, at most 40. */
  readonly runs: number;
}

export function flakyFailures(
  runs: readonly StatsRun[],
  results: readonly StatsResult[],
  testIds: readonly string[],
  options: FlakyOptions,
): FlakyFailures[] {
  const counted = new Map(
    runs
      .filter(
        (run) =>
          countsTowardCiOnlyStats(run, options.defaultBranch) &&
          run.finishedAt.getTime() <= options.now.getTime(),
      )
      .map((run) => [run.id, run]),
  );
  const flipSides = flakyResultIds(runs, results, options);
  // Per test and run, each platform's cell as the strip draws it: failing, and whether flaky.
  const cellsIn = new Map<string, Map<string, Map<string, { failing: boolean; flaky: boolean }>>>(
    testIds.map((id) => [id, new Map()]),
  );
  for (const result of results) {
    const byRun = cellsIn.get(result.testId);
    if (byRun === undefined || !counted.has(result.runId)) continue;
    const byPlatform = byRun.get(result.runId) ?? new Map();
    const cell = byPlatform.get(result.platform) ?? { failing: false, flaky: false };
    cell.failing ||= result.status === 'failed' || result.status === 'error';
    cell.flaky ||= flipSides.has(result.id);
    byPlatform.set(result.platform, cell);
    byRun.set(result.runId, byPlatform);
  }
  const failedIn = new Map(
    [...cellsIn].map(([testId, byRun]) => [
      testId,
      new Map(
        [...byRun].map(([runId, byPlatform]) => [
          runId,
          [...byPlatform.values()].some((cell) => cell.failing && !cell.flaky),
        ]),
      ),
    ]),
  );
  return testIds.map((testId) => {
    const byRun = failedIn.get(testId) ?? new Map<string, boolean>();
    const last = [...byRun.keys()]
      .flatMap((runId) => counted.get(runId) ?? [])
      .sort(byFinish)
      .slice(-FLAKY_RATE_RUNS);
    return {
      testId,
      failed: last.filter((run) => byRun.get(run.id) === true).length,
      runs: last.length,
    };
  });
}

/**
 * The results that make a test flaky: both sides of every commit and platform it flipped on.
 * These are the test history's flaky cells (design/data-map.md).
 */
export function flakyResultIds(
  runs: readonly StatsRun[],
  results: readonly StatsResult[],
  options: FlakyOptions,
): Set<string> {
  return new Set(
    outcomes(runs, results, options)
      .groups.filter(flipped)
      .flatMap((group) => group.resultIds),
  );
}

// Code-unit order rather than localeCompare, so the result does not depend on the server locale.
const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
