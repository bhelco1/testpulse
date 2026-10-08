import type { StatsCoverage, StatsRun } from './input.ts';
import { byFinish, countsTowardTrends } from './rules.ts';
import { linesPct } from './trends.ts';

// Spec section 11: "Coverage: Latest lines % per module, plotted against that module's
// coverage_floors value. Lines % is lines_covered / lines_total when the counts are present,
// else lines_pct." Coverage reads backfilled runs as well as CI runs (section 11, "Which
// runs"), default branch only. Read as follows, and pinned by the tests:
// - Each module comes from the latest run that reported it with a percentage, so a module
//   missing from the latest run keeps its previous value.
// - A count-form row with lines_total 0 has no percentage and is skipped, as in the trend.
// - Below floor is strictly under it; a module with no floor has none and is never below.

export interface LatestCoverageOptions {
  readonly defaultBranch: string;
  readonly floors: Readonly<Record<string, number>>;
}

export interface ModuleCoverage {
  readonly module: string;
  readonly runId: string;
  /** Line coverage, 0 to 100, unrounded. */
  readonly pct: number;
  readonly floor: number | null;
  readonly belowFloor: boolean;
}

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export interface ModuleCoverageWithLines extends ModuleCoverage {
  /** The row's line counts; null for a recorded percentage (imported history). */
  readonly lines: { readonly covered: number; readonly total: number } | null;
}

export function latestCoverage(
  runs: readonly StatsRun[],
  coverage: readonly StatsCoverage[],
  options: LatestCoverageOptions,
): ModuleCoverage[] {
  return latestCoverageWithLines(runs, coverage, options).map(
    ({ module, runId, pct, floor, belowFloor }) => ({ module, runId, pct, floor, belowFloor }),
  );
}

/** latestCoverage, with the line counts of the row each module's percentage was read from. */
export function latestCoverageWithLines(
  runs: readonly StatsRun[],
  coverage: readonly StatsCoverage[],
  options: LatestCoverageOptions,
): ModuleCoverageWithLines[] {
  const counted = new Map(
    runs.filter((run) => countsTowardTrends(run, options.defaultBranch)).map((r) => [r.id, r]),
  );
  const latest = new Map<string, { run: StatsRun; pct: number; row: StatsCoverage }>();
  for (const row of coverage) {
    const run = counted.get(row.runId);
    const pct = linesPct(row.lines);
    if (run === undefined || pct === null) continue;
    const held = latest.get(row.module);
    if (held === undefined || byFinish(run, held.run) > 0) {
      latest.set(row.module, { run, pct, row });
    }
  }
  return [...latest.entries()]
    .sort(([a], [b]) => compareText(a, b))
    .map(([module, { run, pct, row }]) => {
      // Object.hasOwn, so a module named like an Object.prototype key has no floor.
      const floor = Object.hasOwn(options.floors, module) ? (options.floors[module] ?? null) : null;
      const lines =
        row.lines.form === 'counts' ? { covered: row.lines.covered, total: row.lines.total } : null;
      return {
        module,
        runId: run.id,
        pct,
        floor,
        belowFloor: floor !== null && pct < floor,
        lines,
      };
    });
}
