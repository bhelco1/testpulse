import type { ModuleCoverage } from './coverage.ts';
import type { StatsRun } from './input.ts';

// Spec section 11, "Health on public pages": derived from public data, never from alerts
// (decision 2026-09-28). Stale when the days since the project's last report exceed its
// expected_cadence_days; empty when the latest default-branch run is empty; below floor when a
// module's latest coverage is under its floor. Read as follows, and pinned by the tests:
// - Days are whole 24-hour periods since the last report, as "No report in {n} days" reads,
//   not UTC calendar days.
// - A failed latest run is a run status, not a health problem.
// - Every problem is listed; the one marker shows the first in stale, empty, below-floor order,
//   the order design/data-map.md lists them in.

export type HealthProblem = 'stale' | 'empty' | 'below_floor';

/** The shape the HealthMarker component takes. */
export type PublicHealth =
  | { readonly health: 'stale'; readonly days: number }
  | { readonly health: 'healthy' | 'empty' | 'below_floor' | 'not_reporting' };

export interface HealthInput {
  readonly lastReportAt: Date | null;
  readonly expectedCadenceDays: number;
  readonly latestRun: Pick<StatsRun, 'status'> | null;
  readonly coverage: readonly Pick<ModuleCoverage, 'belowFloor'>[];
  readonly now: Date;
}

export interface ProjectHealth {
  readonly daysSinceLastReport: number | null;
  readonly problems: readonly HealthProblem[];
  readonly marker: PublicHealth;
}

const DAY_MS = 86_400_000;

export function daysSince(instant: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - instant.getTime()) / DAY_MS));
}

export function projectHealth(input: HealthInput): ProjectHealth {
  if (input.lastReportAt === null) {
    return { daysSinceLastReport: null, problems: [], marker: { health: 'not_reporting' } };
  }
  const days = daysSince(input.lastReportAt, input.now);
  const problems: HealthProblem[] = [];
  if (days > input.expectedCadenceDays) problems.push('stale');
  if (input.latestRun?.status === 'empty') problems.push('empty');
  if (input.coverage.some((module) => module.belowFloor)) problems.push('below_floor');
  const [first] = problems;
  const marker: PublicHealth =
    first === undefined
      ? { health: 'healthy' }
      : first === 'stale'
        ? { health: 'stale', days }
        : { health: first };
  return { daysSinceLastReport: days, problems, marker };
}
