import type { PublicRun, StatsRun } from './input.ts';
import { byFinish, countsTowardCiOnlyStats, inWindow } from './rules.ts';
import type { TrendOptions } from './trends.ts';

// Spec section 11: "Suite duration: Sum of report durations per run, trended over CI runs only,
// since backfilled runs have duration_ms 0." Ingestion already stores that sum as
// runs.duration_ms (5.2), so the trend reads it as stored. Read as follows, and pinned by the
// tests:
// - Default-branch CI runs only, by section 11's opening line and the CI-only rule in rules.ts;
//   a pull request run is not the suite as it stands on the default branch.
// - A point per run in the window, oldest first by byFinish. Every run has a duration, so an
//   empty, failed or all-skipped run has a point too, and carries its status for the chart's
//   marks.

export type DurationRun = StatsRun & Pick<PublicRun, 'durationMs'>;

export interface DurationPoint {
  readonly runId: string;
  readonly finishedAt: Date;
  readonly status: StatsRun['status'];
  readonly durationMs: number;
}

export function durationTrend(
  runs: readonly DurationRun[],
  options: TrendOptions,
): DurationPoint[] {
  return runs
    .filter(
      (run) =>
        countsTowardCiOnlyStats(run, options.defaultBranch) &&
        inWindow(run.finishedAt, options.now, options.days),
    )
    .sort(byFinish)
    .map((run) => ({
      runId: run.id,
      finishedAt: run.finishedAt,
      status: run.status,
      durationMs: run.durationMs,
    }));
}
