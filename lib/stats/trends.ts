import type { RunSource, StatsCoverage, StatsRun } from './input.ts';
import { countsTowardTrends, inWindow, lastRuns, TREND_RUNS, utcDay, utcDays } from './rules.ts';

// Spec section 11 trends that read backfilled runs as well as CI runs: pass rate, run count and
// coverage. Pass rate and coverage have a point per run over the last 30 default-branch runs,
// however old (decision 2026-09-29, design v7 item 5). "Pass rate, 30 days" and runs per UTC day
// keep the 30-day window.

export interface TrendOptions {
  readonly defaultBranch: string;
  readonly now: Date;
}

const WINDOW_DAYS = 30;

export interface PassRateRunPoint {
  readonly runId: string;
  readonly finishedAt: Date;
  readonly source: RunSource;
  /** For the chart's marks at failed and empty runs. */
  readonly status: StatsRun['status'];
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  /** passed / (passed + failed), 0 to 1; null when nothing passed or failed. */
  readonly passRate: number | null;
}

export interface RunCountDayPoint {
  readonly day: string;
  readonly runs: number;
}

export interface CoveragePoint {
  readonly runId: string;
  readonly finishedAt: Date;
  readonly source: RunSource;
  /** For the chart's marks at failed and empty runs. */
  readonly status: StatsRun['status'];
  /**
   * Which stored form the value came from: CI writes counts, backfill a recorded percentage;
   * null where the run has no value for the module.
   */
  readonly form: 'counts' | 'pct' | null;
  /** Line coverage, 0 to 100, unrounded; null where the run did not report the module. */
  readonly linesPct: number | null;
}

export interface ModuleCoverageTrend {
  readonly module: string;
  readonly points: readonly CoveragePoint[];
}

const admitted = (options: TrendOptions) => (run: StatsRun) =>
  countsTowardTrends(run, options.defaultBranch);

/** The last 30 default-branch runs the trend rule admits, oldest first. */
const trendRuns = (runs: readonly StatsRun[], options: TrendOptions): StatsRun[] =>
  lastRuns(runs, TREND_RUNS, admitted(options), options.now);

/** Default-branch runs the trend rule admits that finished in the 30 days. */
const windowRuns = (runs: readonly StatsRun[], options: TrendOptions): StatsRun[] =>
  runs.filter(
    (run) => admitted(options)(run) && inWindow(run.finishedAt, options.now, WINDOW_DAYS),
  );

// Section 5.2 rolls JUnit errors into failed, so this is section 11's passed / (passed +
// failed + error) with skipped excluded.
export const passRate = (passed: number, failed: number): number | null =>
  passed + failed === 0 ? null : passed / (passed + failed);

export function passRateTrend(
  runs: readonly StatsRun[],
  options: TrendOptions,
): PassRateRunPoint[] {
  return trendRuns(runs, options).map((run) => ({
    runId: run.id,
    finishedAt: run.finishedAt,
    source: run.source,
    status: run.status,
    passed: run.passed,
    failed: run.failed,
    skipped: run.skipped,
    passRate: passRate(run.passed, run.failed),
  }));
}

export function runCountTrend(
  runs: readonly StatsRun[],
  options: TrendOptions,
): RunCountDayPoint[] {
  const counts = new Map<string, number>();
  for (const run of windowRuns(runs, options)) {
    const day = utcDay(run.finishedAt);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return utcDays(options.now, WINDOW_DAYS).map((day) => ({ day, runs: counts.get(day) ?? 0 }));
}

/** Section 11: lines_covered / lines_total when the counts are present, else lines_pct. */
export function linesPct(lines: StatsCoverage['lines']): number | null {
  if (lines.form === 'pct') return lines.pct;
  return lines.total === 0 ? null : (lines.covered / lines.total) * 100;
}

/**
 * Line coverage per module over the last 30 default-branch runs, CI and imported, one point per
 * run for every module that has a value in any of them, in module-key order: each module is its
 * own chart (design v8 item 3). A run that did not report a module is a gap at its place, never
 * refilled from an older run.
 */
export function coverageTrend(
  runs: readonly StatsRun[],
  coverage: readonly StatsCoverage[],
  options: TrendOptions,
): ModuleCoverageTrend[] {
  const included = trendRuns(runs, options);
  const position = new Map(included.map((run, index) => [run.id, index]));
  const byModule = new Map<string, Map<number, StatsCoverage['lines']>>();
  for (const row of coverage) {
    const index = position.get(row.runId);
    // A row whose run is not among the 30, or a module with no lines to cover, has no point.
    if (index === undefined || linesPct(row.lines) === null) continue;
    byModule.set(row.module, (byModule.get(row.module) ?? new Map()).set(index, row.lines));
  }
  return [...byModule.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([module, values]) => ({
      module,
      points: included.map((run, index) => {
        const lines = values.get(index);
        return {
          runId: run.id,
          finishedAt: run.finishedAt,
          source: run.source,
          status: run.status,
          form: lines?.form ?? null,
          linesPct: lines === undefined ? null : linesPct(lines),
        };
      }),
    }));
}

export interface WindowPassRate {
  readonly runs: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly passRate: number | null;
}

/**
 * "Pass rate, 30 days" on the project page: the default-branch runs, CI and imported, that
 * finished in the 30 days, their counts added up so a large run outweighs a small one.
 */
export function windowPassRate(runs: readonly StatsRun[], options: TrendOptions): WindowPassRate {
  const included = windowRuns(runs, options);
  const sum = (pick: (run: StatsRun) => number) =>
    included.reduce((total, run) => total + pick(run), 0);
  const passed = sum((run) => run.passed);
  const failed = sum((run) => run.failed);
  return {
    runs: included.length,
    passed,
    failed,
    skipped: sum((run) => run.skipped),
    passRate: passRate(passed, failed),
  };
}
