import type { RunSource, StatsCoverage, StatsRun } from './input.ts';
import {
  byFinish,
  countsTowardTrends,
  inWindow,
  utcDay,
  utcDays,
  type WindowDays,
} from './rules.ts';

// Spec section 11 trends that read backfilled runs as well as CI runs: pass rate, run count and
// coverage. Each has a point per run; pass rate and run count also have a bucket per UTC day.

export interface TrendOptions {
  readonly defaultBranch: string;
  readonly now: Date;
  readonly days: WindowDays;
}

export interface PassRateRunPoint {
  readonly runId: string;
  readonly finishedAt: Date;
  readonly source: RunSource;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  /** passed / (passed + failed), 0 to 1; null when nothing passed or failed. */
  readonly passRate: number | null;
}

export interface PassRateDayPoint {
  readonly day: string;
  readonly runs: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly passRate: number | null;
}

export interface PassRateTrend {
  readonly runs: readonly PassRateRunPoint[];
  readonly days: readonly PassRateDayPoint[];
}

export interface RunCountDayPoint {
  readonly day: string;
  readonly runs: number;
}

export interface CoveragePoint {
  readonly runId: string;
  readonly finishedAt: Date;
  readonly source: RunSource;
  /** Which stored form the value came from: CI writes counts, backfill a recorded percentage. */
  readonly form: 'counts' | 'pct';
  /** Line coverage, 0 to 100, unrounded. */
  readonly linesPct: number;
}

export interface ModuleCoverageTrend {
  readonly module: string;
  readonly points: readonly CoveragePoint[];
}

/** Default-branch runs in the window that the trend rule admits, oldest first. */
function trendRuns(runs: readonly StatsRun[], options: TrendOptions): StatsRun[] {
  return runs
    .filter(
      (run) =>
        countsTowardTrends(run, options.defaultBranch) &&
        inWindow(run.finishedAt, options.now, options.days),
    )
    .sort(byFinish);
}

// Section 5.2 rolls JUnit errors into failed, so this is section 11's passed / (passed +
// failed + error) with skipped excluded.
export const passRate = (passed: number, failed: number): number | null =>
  passed + failed === 0 ? null : passed / (passed + failed);

export function passRateTrend(runs: readonly StatsRun[], options: TrendOptions): PassRateTrend {
  const included = trendRuns(runs, options);
  const byDay = new Map<string, StatsRun[]>();
  for (const run of included) {
    const day = utcDay(run.finishedAt);
    byDay.set(day, [...(byDay.get(day) ?? []), run]);
  }
  return {
    runs: included.map((run) => ({
      runId: run.id,
      finishedAt: run.finishedAt,
      source: run.source,
      passed: run.passed,
      failed: run.failed,
      skipped: run.skipped,
      passRate: passRate(run.passed, run.failed),
    })),
    // A day's rate pools its counts, so a run of 500 tests outweighs a run of 5, as it would
    // if both had run as one.
    days: utcDays(options.now, options.days).map((day) => {
      const dayRuns = byDay.get(day) ?? [];
      const sum = (pick: (run: StatsRun) => number) =>
        dayRuns.reduce((total, run) => total + pick(run), 0);
      const passed = sum((run) => run.passed);
      const failed = sum((run) => run.failed);
      return {
        day,
        runs: dayRuns.length,
        passed,
        failed,
        skipped: sum((run) => run.skipped),
        passRate: passRate(passed, failed),
      };
    }),
  };
}

export function runCountTrend(
  runs: readonly StatsRun[],
  options: TrendOptions,
): RunCountDayPoint[] {
  const counts = new Map<string, number>();
  for (const run of trendRuns(runs, options)) {
    const day = utcDay(run.finishedAt);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return utcDays(options.now, options.days).map((day) => ({ day, runs: counts.get(day) ?? 0 }));
}

/** Section 11: lines_covered / lines_total when the counts are present, else lines_pct. */
export function linesPct(lines: StatsCoverage['lines']): number | null {
  if (lines.form === 'pct') return lines.pct;
  return lines.total === 0 ? null : (lines.covered / lines.total) * 100;
}

export function coverageTrend(
  runs: readonly StatsRun[],
  coverage: readonly StatsCoverage[],
  options: TrendOptions,
): ModuleCoverageTrend[] {
  const included = trendRuns(runs, options);
  const position = new Map(included.map((run, index) => [run.id, { index, run }]));
  const byModule = new Map<string, Array<{ index: number; point: CoveragePoint }>>();
  for (const row of coverage) {
    const found = position.get(row.runId);
    const value = linesPct(row.lines);
    // A row whose run the trend rule left out, or a module with no lines to cover, has no point.
    if (found === undefined || value === null) continue;
    const { index, run } = found;
    byModule.set(row.module, [
      ...(byModule.get(row.module) ?? []),
      {
        index,
        point: {
          runId: run.id,
          finishedAt: run.finishedAt,
          source: run.source,
          form: row.lines.form,
          linesPct: value,
        },
      },
    ]);
  }
  return [...byModule.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([module, entries]) => ({
      module,
      points: entries.sort((a, b) => a.index - b.index).map((entry) => entry.point),
    }));
}
