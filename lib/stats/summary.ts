import type { Layer } from '../ingest/layer-rules.ts';
import type { DeclaredSuite, Visibility } from '../projects/schema.ts';
import { latestCoverage, type ModuleCoverage } from './coverage.ts';
import { projectHealth, type ProjectHealth } from './health.ts';
import type { StatsCoverage, StatsRun } from './input.ts';
import { countsTowardCiOnlyStats, inWindow, latestRun } from './rules.ts';
import { greenStreak, type GreenStreak } from './streak.ts';
import { testCounts, type TestLayerRow } from './test-counts.ts';
import { timeToGreen, type TimeToGreen } from './time-to-green.ts';
import { passRate } from './trends.ts';

// Spec section 11 headline tiles and the section 13 project card, for the landing page. Each
// project's numbers come from its own runs; the headline combines only the ones that describe
// the whole portfolio. Read as follows, and pinned by the tests:
// - "Latest run" is the latest default-branch CI run (design/data-map.md).
// - Overall pass rate adds up the latest runs' counts, passed / (passed + failed), as a day's
//   pass rate does (section 11): a run of 1,000 tests outweighs a run of 3. A run that passed
//   and failed nothing (empty, or all skipped) adds nothing and has no rate of its own.
// - Time to green and green streaks stay on each project's card and are never combined: each
//   project is standalone, and one left red on purpose would skew a portfolio-wide number.
// - Projects reporting counts projects that have reported and are not stale.
// - Declared suites travel with the project and are never in a total or a layer (5.8).

export interface SummaryProject {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly tagline: string;
  readonly visibility: Visibility;
  readonly defaultBranch: string;
  readonly declaredSuites: readonly DeclaredSuite[];
  readonly coverageFloors: Readonly<Record<string, number>>;
  readonly expectedCadenceDays: number;
}

export interface ProjectSummaryInput {
  readonly project: SummaryProject;
  readonly runs: readonly StatsRun[];
  readonly lastReportAt: Date | null;
  readonly latestRunTests: readonly TestLayerRow[];
  readonly coverage: readonly StatsCoverage[];
}

export interface LatestRunSummary {
  readonly id: string;
  readonly status: StatsRun['status'];
  readonly finishedAt: Date;
  readonly branch: string;
  readonly commitSha: string;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly passRate: number | null;
}

export interface ProjectSummary {
  readonly project: SummaryProject;
  readonly latestRun: LatestRunSummary | null;
  readonly totalTests: number;
  readonly layers: Partial<Record<Layer, number>>;
  readonly coverage: readonly ModuleCoverage[];
  readonly greenStreak: GreenStreak;
  readonly runsInLast30Days: number;
  readonly timeToGreen: TimeToGreen;
  readonly health: ProjectHealth;
}

export interface LandingHeadline {
  readonly totalTests: number;
  readonly passRate: {
    readonly passed: number;
    readonly failed: number;
    readonly skipped: number;
    readonly rate: number | null;
    readonly counted: readonly string[];
  };
  readonly emptyLatestRuns: readonly string[];
  readonly projectsReporting: {
    readonly reporting: number;
    readonly registered: number;
    readonly silent: readonly { readonly slug: string; readonly days: number }[];
    readonly notReporting: readonly string[];
  };
  readonly runsInLast30Days: {
    readonly total: number;
    readonly byProject: readonly { readonly slug: string; readonly runs: number }[];
  };
}

export function runsInLast30Days(
  runs: readonly StatsRun[],
  options: { readonly defaultBranch: string; readonly now: Date },
): number {
  return runs.filter(
    (run) =>
      countsTowardCiOnlyStats(run, options.defaultBranch) &&
      inWindow(run.finishedAt, options.now, 30),
  ).length;
}

export function projectSummary(input: ProjectSummaryInput, now: Date): ProjectSummary {
  const { project, runs } = input;
  const options = { defaultBranch: project.defaultBranch, now };
  const latest = latestRun(runs, project.defaultBranch, now);
  const { totalTests, layers } =
    latest === null ? { totalTests: 0, layers: {} } : testCounts(input.latestRunTests);
  const coverage = latestCoverage(runs, input.coverage, {
    defaultBranch: project.defaultBranch,
    floors: project.coverageFloors,
  });
  return {
    project,
    latestRun:
      latest === null
        ? null
        : {
            id: latest.id,
            status: latest.status,
            finishedAt: latest.finishedAt,
            branch: latest.branch,
            commitSha: latest.commitSha,
            passed: latest.passed,
            failed: latest.failed,
            skipped: latest.skipped,
            passRate: passRate(latest.passed, latest.failed),
          },
    totalTests,
    layers,
    coverage,
    greenStreak: greenStreak(runs, options),
    runsInLast30Days: runsInLast30Days(runs, options),
    timeToGreen: timeToGreen(runs, options),
    health: projectHealth({
      lastReportAt: input.lastReportAt,
      expectedCadenceDays: project.expectedCadenceDays,
      latestRun: latest,
      coverage,
      now,
    }),
  };
}

export function landingHeadline(summaries: readonly ProjectSummary[]): LandingHeadline {
  const sum = (pick: (summary: ProjectSummary) => number) =>
    summaries.reduce((total, summary) => total + pick(summary), 0);
  const withRun = summaries.flatMap((summary) =>
    summary.latestRun === null ? [] : [{ slug: summary.project.slug, run: summary.latestRun }],
  );
  const passed = withRun.reduce((total, { run }) => total + run.passed, 0);
  const failed = withRun.reduce((total, { run }) => total + run.failed, 0);
  const reported = summaries.filter((summary) => summary.health.daysSinceLastReport !== null);
  const silent = reported.flatMap((summary) =>
    summary.health.problems.includes('stale')
      ? [{ slug: summary.project.slug, days: summary.health.daysSinceLastReport ?? 0 }]
      : [],
  );
  return {
    totalTests: sum((summary) => summary.totalTests),
    passRate: {
      passed,
      failed,
      skipped: withRun.reduce((total, { run }) => total + run.skipped, 0),
      rate: passRate(passed, failed),
      counted: withRun.filter(({ run }) => run.passed + run.failed > 0).map(({ slug }) => slug),
    },
    emptyLatestRuns: withRun.filter(({ run }) => run.status === 'empty').map(({ slug }) => slug),
    projectsReporting: {
      reporting: reported.length - silent.length,
      registered: summaries.length,
      silent,
      notReporting: summaries
        .filter((summary) => summary.health.daysSinceLastReport === null)
        .map((summary) => summary.project.slug),
    },
    runsInLast30Days: {
      total: sum((summary) => summary.runsInLast30Days),
      byProject: summaries.map((summary) => ({
        slug: summary.project.slug,
        runs: summary.runsInLast30Days,
      })),
    },
  };
}
