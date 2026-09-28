import type { StatsRun } from './input.ts';
import { byFinish, countsTowardCiOnlyStats } from './rules.ts';

// Spec section 11: "Green streak: Consecutive passed default-branch runs, current and longest."
// CI runs only, as every stat outside the three backfill-fed trends. Read as follows, and
// pinned by the tests:
// - Each attempt is a run of its own, ordered by byFinish, so a failed attempt followed by a
//   passing re-run ends green.
// - An empty run is not passed (section 5.2: never shown as green), so it breaks a streak.
// - Longest is over every run given, not a window: the spec sets none.

export interface StreakOptions {
  readonly defaultBranch: string;
  readonly now: Date;
}

export interface GreenStreak {
  readonly current: number;
  readonly longest: number;
}

export function greenStreak(runs: readonly StatsRun[], options: StreakOptions): GreenStreak {
  const ordered = runs
    .filter(
      (run) =>
        countsTowardCiOnlyStats(run, options.defaultBranch) &&
        run.finishedAt.getTime() <= options.now.getTime(),
    )
    .sort(byFinish);
  let current = 0;
  let longest = 0;
  for (const run of ordered) {
    current = run.status === 'passed' ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return { current, longest };
}
