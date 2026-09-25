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

export function flakyTests(
  runs: readonly StatsRun[],
  results: readonly StatsResult[],
  options: FlakyOptions,
): FlakyTests {
  const counted = new Map(
    runs
      .filter(
        (run) =>
          countsTowardCiOnlyStats(run, options.defaultBranch) &&
          inWindow(run.finishedAt, options.now, FLAKY_DAYS),
      )
      .map((run) => [run.id, run]),
  );

  // Per commit, test and platform: the test ID and [seen passing, seen failing].
  const outcomes = new Map<string, { testId: string; seen: [boolean, boolean] }>();
  for (const result of results) {
    const run = counted.get(result.runId);
    if (run === undefined || result.status === 'skipped') continue;
    // Postgres text cannot hold NUL, so no stored SHA, UUID or platform contains it and the
    // joined key is unambiguous.
    const key = `${run.commitSha}\u0000${result.testId}\u0000${result.platform}`;
    const entry = outcomes.get(key) ?? { testId: result.testId, seen: [false, false] };
    if (result.status === 'passed') entry.seen[0] = true;
    else entry.seen[1] = true;
    outcomes.set(key, entry);
  }
  const flaky = new Set<string>();
  for (const { testId, seen } of outcomes.values()) {
    if (seen[0] && seen[1]) flaky.add(testId);
  }

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
