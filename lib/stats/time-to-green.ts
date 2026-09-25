import type { StatsRun } from './input.ts';
import { byFinish, countsTowardCiOnlyStats, windowStart } from './rules.ts';

// Spec section 11: "For each default-branch run that turned failed after a passed run, elapsed
// time until the next passed run. Report median and worst, 90 days." CI runs only (section 17,
// Phase 4): a backfilled run neither starts, ends nor hides an episode.
//
// Read as follows, and pinned by the tests:
// - Runs are ordered by finished_at (ties: started_at, run ID, attempt); elapsed time is from
//   the failing run's finished_at to the passing run's, the two moments the branch was seen to
//   go red and green again. Measuring between starts could go negative for overlapping runs.
// - "After a passed run" is the run immediately before. An empty run (section 5.2) is neither,
//   so passed, empty, failed starts no episode, and an empty run inside an episode does not end it.
// - The 90 days hold the failing run; the passed run before it may be older.
// - A branch still red at now is reported as stillRed and kept out of median and worst, which
//   describe completed recoveries only.
// - With an even count the median is the mean of the middle two.

export interface TimeToGreenOptions {
  readonly defaultBranch: string;
  readonly now: Date;
}

export interface Recovery {
  readonly failedRunId: string;
  readonly failedAt: Date;
  readonly greenRunId: string;
  readonly greenAt: Date;
  readonly elapsedMs: number;
}

export interface StillRed {
  readonly failedRunId: string;
  readonly failedAt: Date;
  readonly elapsedMs: number;
}

export interface TimeToGreen {
  readonly recoveries: readonly Recovery[];
  readonly medianMs: number | null;
  readonly worstMs: number | null;
  readonly stillRed: StillRed | null;
}

const TIME_TO_GREEN_DAYS = 90;

function median(sorted: readonly number[]): number | null {
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  return sorted.length % 2 === 1 ? upper : ((sorted[middle - 1] ?? 0) + upper) / 2;
}

export function timeToGreen(runs: readonly StatsRun[], options: TimeToGreenOptions): TimeToGreen {
  const { defaultBranch, now } = options;
  const since = windowStart(now, TIME_TO_GREEN_DAYS).getTime();
  const ordered = runs
    .filter(
      (run) =>
        countsTowardCiOnlyStats(run, defaultBranch) && run.finishedAt.getTime() <= now.getTime(),
    )
    .sort(byFinish);

  const recoveries: Recovery[] = [];
  let red: StatsRun | null = null;
  let previous: StatsRun | null = null;
  for (const run of ordered) {
    if (red === null && run.status === 'failed' && previous?.status === 'passed') {
      red = run;
    } else if (red !== null && run.status === 'passed') {
      if (red.finishedAt.getTime() >= since) {
        recoveries.push({
          failedRunId: red.id,
          failedAt: red.finishedAt,
          greenRunId: run.id,
          greenAt: run.finishedAt,
          elapsedMs: run.finishedAt.getTime() - red.finishedAt.getTime(),
        });
      }
      red = null;
    }
    previous = run;
  }

  const elapsed = recoveries.map((recovery) => recovery.elapsedMs).sort((a, b) => a - b);
  return {
    recoveries,
    medianMs: median(elapsed),
    worstMs: elapsed.at(-1) ?? null,
    stillRed:
      red === null
        ? null
        : {
            failedRunId: red.id,
            failedAt: red.finishedAt,
            elapsedMs: now.getTime() - red.finishedAt.getTime(),
          },
  };
}
