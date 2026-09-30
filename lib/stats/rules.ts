import type { RunSource, StatsRun } from './input.ts';

// Spec section 11: "All trend stats use default-branch runs with source = ci unless stated.
// Backfilled runs contribute to pass-rate, count, and coverage trends only." Those three are
// the stated exceptions; every other stat is CI-only. The rule lives here and nowhere else.

export type RunScope = Pick<StatsRun, 'branch' | 'source'>;

/** The two windows section 11 names. */
export type WindowDays = 30 | 90;

/**
 * The project page's per-run charts cover the last 30 default-branch runs their source rule
 * admits, however old, fewer when there are fewer (decision 2026-09-29, design v7 item 5).
 */
export const TREND_RUNS = 30;

/** Sources the pass-rate, run-count and coverage trends read. */
export const TREND_SOURCES: readonly RunSource[] = ['ci', 'backfill'];

/** Sources every other stat reads, time to green and flakiness among them. */
export const CI_ONLY_SOURCES: readonly RunSource[] = ['ci'];

export function countsTowardTrends(run: RunScope, defaultBranch: string): boolean {
  return run.branch === defaultBranch && TREND_SOURCES.includes(run.source);
}

export function countsTowardCiOnlyStats(run: RunScope, defaultBranch: string): boolean {
  return run.branch === defaultBranch && CI_ONLY_SOURCES.includes(run.source);
}

const DAY_MS = 86_400_000;

const startOfUtcDay = (instant: Date): number => Math.floor(instant.getTime() / DAY_MS) * DAY_MS;

/**
 * A window is the N whole UTC days ending on the day of `now`, cut off at `now` itself. Whole
 * days make daily buckets equal in length, so the first bar of a chart is not a partial day;
 * UTC because the site has viewers in every time zone and no one zone is more right.
 */
export function windowStart(now: Date, days: WindowDays): Date {
  return new Date(startOfUtcDay(now) - (days - 1) * DAY_MS);
}

export function inWindow(instant: Date, now: Date, days: WindowDays): boolean {
  const time = instant.getTime();
  return time >= windowStart(now, days).getTime() && time <= now.getTime();
}

/** The UTC date of an instant, as YYYY-MM-DD. */
export const utcDay = (instant: Date): string => instant.toISOString().slice(0, 10);

/** Every UTC day of the window, oldest first. */
export function utcDays(now: Date, days: WindowDays): string[] {
  const first = windowStart(now, days).getTime();
  return Array.from({ length: days }, (_, index) => utcDay(new Date(first + index * DAY_MS)));
}

/**
 * Orders runs by when their status became known: finished_at, then started_at, then run ID
 * and attempt, so equal timestamps never leave the order to the input.
 */
export function byFinish(a: StatsRun, b: StatsRun): number {
  return (
    a.finishedAt.getTime() - b.finishedAt.getTime() ||
    a.startedAt.getTime() - b.startedAt.getTime() ||
    compareText(a.ciRunId, b.ciRunId) ||
    a.runAttempt - b.runAttempt
  );
}

// Code-unit order rather than localeCompare, so the result does not depend on the server locale.
const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The latest default-branch CI run finished at or before now, or null. "Latest run" on the
 * landing page and project card is always a CI run (design/data-map.md): backfilled history has
 * no per-test rows to count.
 */
export function latestRun<R extends StatsRun>(
  runs: readonly R[],
  defaultBranch: string,
  now: Date,
): R | null {
  let latest: R | null = null;
  for (const run of runs) {
    if (!countsTowardCiOnlyStats(run, defaultBranch)) continue;
    if (run.finishedAt.getTime() > now.getTime()) continue;
    if (latest === null || byFinish(run, latest) > 0) latest = run;
  }
  return latest;
}

/**
 * The last `count` runs that `admits` accepts and that finished at or before now, oldest first by
 * byFinish. No day window: the oldest may be any age. A run kept here that turns out to have no
 * value for a stat keeps its place; older runs are never pulled in to fill it.
 */
export function lastRuns<R extends StatsRun>(
  runs: readonly R[],
  count: number,
  admits: (run: R) => boolean,
  now: Date,
): R[] {
  if (count <= 0) return [];
  return runs
    .filter((run) => admits(run) && run.finishedAt.getTime() <= now.getTime())
    .sort(byFinish)
    .slice(-count);
}
