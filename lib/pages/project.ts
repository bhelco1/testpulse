import type { StackGroup } from '../../components/StackTagGroup/StackTagGroup';
import type { FeedRun } from '../../components/RunFeedRow/RunFeedRow';
import type { RunsTimelineRun } from '../../components/StatusTimeline/StatusTimeline';
import type { TrendData, TrendMark } from '../../components/TrendChart/TrendChart';
import {
  coverageCaption,
  durationCaption,
  passRateCaption,
  testCountCaption,
  TREND_SCOPE,
} from '../charts/captions';
import { formatTrendValue } from '../charts/format';
import { formatCount, qty } from '../copy/count';
import {
  dateLabel,
  formatRunDuration,
  relativeLabel,
  type TimedText,
  type TimeLabel,
} from '../copy/time';
import { LAYER_LABEL, layerSegments, type LayerSegment } from '../design/layers';
import type { DeclaredSuite } from '../projects/schema';
import { declaredStatusFor } from '../projects/stack-match';
import type { BranchScope, ProjectPage, ProjectPageOptions } from '../queries/project';
import { shortSuite } from '../results/short-suite';
import { runTitle } from '../runs/title';
import { feedRun, runHref } from './feed';
import type { PublicHealth } from '../stats/health';
import type { GreenStreak } from '../stats/streak';
import type { TimeToGreen } from '../stats/time-to-green';

// The project page, /p/[slug], as its components take it (design/pages/Project Page.dc.html,
// design/components.md, design/data-map.md "Project"). Pure: the page passes the loader's result
// and now, so every word and figure here is tested without a database or a clock. Parts the
// design leaves undefined are left out rather than guessed (docs/spec.md section 13, "Held back").

const DAY_MS = 86_400_000;
const DEFAULT_RUN_LIMIT = 10;
const LOAD_MORE = 20;

export interface HeroView {
  readonly name: string;
  readonly private: boolean;
  readonly tagline: string;
  readonly paragraphs: readonly string[];
  readonly health: PublicHealth;
  /** "Last report {relative}" when healthy, "Expected every {n} days" when stale, else none. */
  readonly healthDetail: TimedText | null;
  /** Public projects only: projects_public nulls it for a private one (section 9). */
  readonly repoUrl: string | null;
  readonly stale: { readonly title: string; readonly body: TimedText } | null;
}

export interface LatestRunView {
  readonly status: 'passed' | 'failed' | 'empty';
  readonly when: TimeLabel;
  readonly branch: string;
  readonly sha: string;
  readonly href: string;
  /** Held back (null) for an empty run, which the project page does not draw. */
  readonly figure: string | null;
  readonly figureTone: 'ink' | 'fail';
  readonly line: string | null;
  readonly failing: {
    readonly short: string;
    readonly full: string;
    readonly platform: string;
    readonly href: string;
  } | null;
  /** "Pass rate, 30 days"; none when the 30 days hold nothing passed or failed. */
  readonly passRate30: string | null;
  /** The project's own green streak and time to green, for RecoveryStats (spec section 11). */
  readonly recovery: {
    readonly greenStreak: GreenStreak;
    readonly timeToGreen: TimeToGreen;
  };
}

export interface FlakyView {
  readonly testKey: string;
  readonly name: string;
  readonly suite: string;
  /** "Failed {n} of last {m} runs", or "Flipped on {c} commits in 30 days" when n is 0. */
  readonly rate: string;
  readonly layer: string;
  readonly platforms: string;
  readonly href: string;
}

/** One History chart, as TrendChart takes it. */
export type HistoryChart = { readonly title: string; readonly scope: string } & TrendData;

export interface HistoryView {
  /** Pass rate, tests per run, line coverage per module and run duration. */
  readonly charts: readonly HistoryChart[];
  /** The "Last 40 runs" strip; with no runs, before the first CI run on the default branch. */
  readonly strip: {
    readonly runs: readonly RunsTimelineRun[];
    readonly defaultBranch: string;
    /** Counts of every run the strip holds; none with no runs, which shows "No CI runs yet". */
    readonly note: string | null;
  };
}

export interface ProjectPageView {
  readonly title: string;
  readonly hero: HeroView;
  readonly latestRun: LatestRunView | null;
  readonly built: readonly StackGroup[];
  readonly tested: readonly StackGroup[];
  readonly pyramid: {
    readonly layers: readonly LayerSegment[];
    readonly declared: readonly DeclaredSuite[];
    readonly total: number;
  };
  readonly declared: readonly DeclaredSuite[];
  readonly coverage: readonly { module: string; pct: number; floor: number | null }[];
  readonly reports: readonly { key: string; total: string }[];
  readonly runs: {
    readonly branches: BranchScope;
    readonly items: readonly FeedRun[];
    /** The list's first page for each branch scope, for the branch filter. */
    readonly branchHrefs: Readonly<Record<BranchScope, string>>;
    /** The same list with 20 more runs; none when every run is shown. */
    readonly loadMoreHref: string | null;
  };
  readonly history: HistoryView;
  readonly flaky: readonly FlakyView[];
}

const projectHref = (slug: string) => `/p/${encodeURIComponent(slug)}`;
export const testHref = (slug: string, testKey: string) => `${projectHref(slug)}/tests/${testKey}`;
const sha7 = (sha: string) => sha.slice(0, 7);

/** The run list's URL: the default branch and 10 runs are the defaults and are left out. */
export function runListHref(
  slug: string,
  list: { readonly branches: BranchScope; readonly limit: number },
): string {
  const params = new URLSearchParams();
  if (list.branches === 'all') params.set('branches', 'all');
  if (list.limit !== DEFAULT_RUN_LIMIT) params.set('runs', String(list.limit));
  const query = params.toString();
  return query === '' ? projectHref(slug) : `${projectHref(slug)}?${query}`;
}

type SearchParams = Readonly<Record<string, string | readonly string[] | undefined>>;

const first = (value: string | readonly string[] | undefined) =>
  typeof value === 'string' ? value : value?.[0];

/** The loader's options from the page's search parameters; anything unrecognised is ignored. */
export function projectPageOptions(
  params: SearchParams,
): Required<Pick<ProjectPageOptions, 'branches'>> & { runLimit: number | undefined } {
  const runs = Number.parseInt(first(params.runs) ?? '', 10);
  return {
    branches: first(params.branches) === 'all' ? 'all' : 'default',
    runLimit: Number.isNaN(runs) ? undefined : runs,
  };
}

// Plain paragraphs separated by blank lines, no Markdown (decision of 2026-09-28).
const paragraphsOf = (description: string): string[] =>
  description
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '');

function hero(page: ProjectPage, now: Date): HeroView {
  const { project, summary, lastReportAt } = page;
  const marker = summary.health.marker;
  const staleSince = marker.health === 'stale' ? lastReportAt : null;
  return {
    name: project.name,
    private: project.visibility === 'private',
    tagline: project.tagline,
    paragraphs: paragraphsOf(project.description),
    health: marker,
    healthDetail:
      marker.health === 'healthy' && lastReportAt !== null
        ? ['Last report ', relativeLabel(lastReportAt, now)]
        : marker.health === 'stale'
          ? [`Expected every ${qty(project.expectedCadenceDays, 'day')}`]
          : null,
    repoUrl: project.repoUrl,
    stale:
      marker.health === 'stale' && staleSince !== null
        ? {
            title: `${project.name} hasn’t reported in ${qty(marker.days, 'day')}`,
            body: [
              'The weekly scheduled run should have posted by ',
              dateLabel(new Date(staleSince.getTime() + project.expectedCadenceDays * DAY_MS), now),
              '. Its CI may be failing silently. Everything below is from the last report, ',
              dateLabel(staleSince, now),
              '.',
            ],
          }
        : null,
  };
}

function latestRunView(page: ProjectPage, now: Date): LatestRunView | null {
  const run = page.summary.latestRun;
  const detail = page.latestRun;
  if (run === null || detail === null) return null;
  const slug = page.project.slug;
  const href = runHref(slug, run.id);
  // Distinct tests, as Total tests and the pyramid count them (lib/stats/summary.ts).
  const tests = {
    total: page.summary.totalTests,
    passed: run.passed,
    failed: run.failed,
    skipped: run.skipped,
  };
  const duration = formatRunDuration(detail.durationMs);
  const stale = page.summary.health.marker.health === 'stale';
  const [firstFailing] = detail.failing;
  const rate = page.windowPassRate.passRate;

  const figure =
    run.status === 'passed'
      ? {
          figure: formatCount(tests.total),
          figureTone: 'ink' as const,
          line:
            `${tests.total === 1 ? 'test' : 'tests'} · ${formatCount(tests.passed)} passed · ` +
            `${formatCount(tests.failed)} failed · ${formatCount(tests.skipped)} skipped · ${duration}`,
        }
      : run.status === 'failed'
        ? {
            figure: formatCount(tests.failed),
            figureTone: 'fail' as const,
            line: `failed · ${formatCount(tests.passed)} of ${formatCount(tests.total)} passed · ${duration}`,
          }
        : { figure: null, figureTone: 'ink' as const, line: null };

  return {
    status: run.status,
    when: stale ? dateLabel(run.finishedAt, now) : relativeLabel(run.finishedAt, now),
    branch: run.branch,
    sha: sha7(run.commitSha),
    href,
    ...figure,
    failing:
      run.status === 'failed' && firstFailing !== undefined
        ? {
            short: `${shortSuite(firstFailing.suite)} › ${firstFailing.name}`,
            full: `${firstFailing.suite} › ${firstFailing.name}`,
            platform: firstFailing.platform,
            href,
          }
        : null,
    passRate30: rate === null ? null : formatTrendValue(rate * 100, 'pct'),
    recovery: {
      greenStreak: page.summary.greenStreak,
      timeToGreen: page.summary.timeToGreen,
    },
  };
}

type RunStatus = ProjectPage['recentRuns'][number]['status'];

interface ChartRun {
  readonly runId: string;
  readonly finishedAt: Date;
  // Imported history has no run page (design v9 item 2); a chart of CI runs only omits it.
  readonly source?: 'ci' | 'backfill';
}

// Each chart's table (design v9 items 1 and 2): when each run finished, its run page or none for
// imported history, and the year a When in another year is told apart from.
const chartTable = (slug: string, points: readonly ChartRun[], now: Date) => ({
  whens: points.map((point) => point.finishedAt.toISOString()),
  hrefs: points.map((point) => (point.source === 'backfill' ? null : runHref(slug, point.runId))),
  nowYear: now.getUTCFullYear(),
});

// Design components.md TrendChart, "Marks": an 8 px square at each failed or empty run.
const marksOf = (points: readonly { readonly status: RunStatus }[]): TrendMark[] =>
  points.flatMap((point, index): TrendMark[] =>
    point.status === 'failed'
      ? [{ index, status: 'fail' }]
      : point.status === 'empty'
        ? [{ index, status: 'empty' }]
        : [],
  );

// Each chart covers the last 30 default-branch runs its source rule admits (section 11). A run
// with no value is a gap in the line, and each caption counts only the runs with a value (design
// v8 item 34).
function history(page: ProjectPage, now: Date): HistoryView {
  const { passRate, testCount, coverage, duration } = page.trends;
  const rates = passRate.map((point) => (point.passRate === null ? null : point.passRate * 100));
  const counts = testCount.map((point) => point.totalTests);
  const seconds = duration.map((point) => point.durationMs / 1000);
  const failedRuns = passRate.filter((point) => point.status === 'failed').length;
  const slug = page.project.slug;
  const runs = page.recentRuns;
  return {
    charts: [
      {
        title: 'Pass rate',
        scope: TREND_SCOPE.passRate,
        series: [{ name: 'Pass rate', values: rates }],
        marks: marksOf(passRate),
        format: 'pct',
        unit: 'run',
        // A latest run with tests but no rate had every test skipped (v9 item 11); an empty
        // one had none.
        caption: passRateCaption(rates, failedRuns, {
          latestAllSkipped: passRate.at(-1)?.status !== 'empty',
        }),
        ...chartTable(slug, passRate, now),
      },
      {
        title: 'Tests per run',
        scope: TREND_SCOPE.testCount,
        series: [{ name: 'Tests', values: counts }],
        marks: marksOf(testCount),
        format: 'int',
        unit: 'run',
        caption: testCountCaption(counts),
        ...chartTable(slug, testCount, now),
      },
      ...coverage.map((trend): HistoryChart => coverageChart(page, trend, now)),
      {
        title: 'Run duration',
        scope: TREND_SCOPE.duration,
        series: [{ name: 'Duration', values: seconds }],
        marks: marksOf(duration),
        format: 'dur',
        unit: 'run',
        caption: durationCaption([seconds], 'dur'),
        ...chartTable(slug, duration, now),
      },
    ],
    strip: {
      runs: runs.map((run) => ({
        title: runTitle(run.event, run.branch),
        branch: run.branch,
        sha: run.commitSha,
        when: relativeLabel(run.finishedAt, now),
        href: runHref(slug, run.id),
        status: run.status,
      })),
      defaultBranch: page.project.defaultBranch,
      note: stripNote(runs),
    },
  };
}

// "Line coverage, {module}" against the module's own floor (design v8 item 3), over the last 30
// runs, CI and imported. A module with no floor is drawn without one (v8 item 15).
function coverageChart(
  page: ProjectPage,
  trend: ProjectPage['trends']['coverage'][number],
  now: Date,
): HistoryChart {
  const { module, points } = trend;
  const floors = page.project.coverageFloors;
  // Object.hasOwn, so a module named like an Object.prototype key has no floor.
  const floor = Object.hasOwn(floors, module) ? (floors[module] ?? null) : null;
  const values = points.map((point) => point.linesPct);
  return {
    title: `Line coverage, ${module}`,
    scope: TREND_SCOPE.coverage,
    series: [{ name: module, values }],
    ...(floor === null ? {} : { floor }),
    marks: marksOf(points),
    format: 'pct',
    unit: 'run',
    caption: coverageCaption(values, floor, { latestEmpty: points.at(-1)?.status === 'empty' }),
    ...chartTable(page.project.slug, points, now),
  };
}

// The "Last 40 runs" note over every run the server read, not the cells that fit (owner
// decision 2026-09-30): "1 run, {status}." (v9 item 15), "All {n} passed.", else each status's
// count, zero counts left out (components.md StatusTimeline, "Runs strip note"). With no runs
// the strip reads "No CI runs yet" and the note is hidden.
function stripNote(runs: ProjectPage['recentRuns']): string | null {
  const [only] = runs;
  if (runs.length === 0) return null;
  if (runs.length === 1 && only !== undefined) return `1 run, ${only.status}.`;
  const count = (status: RunStatus) => runs.filter((run) => run.status === status).length;
  if (count('passed') === runs.length) return `All ${runs.length} passed.`;
  const parts = (['passed', 'failed', 'empty'] as const)
    .filter((status) => count(status) > 0)
    .map((status) => `${count(status)} ${status}`);
  return `${parts.join(', ')}.`;
}

/** The page's title, which its head reads without the rest of the page (lib/queries/heads). */
export const projectPageTitle = (project: { readonly name: string }) =>
  `${project.name} · testpulse`;

export function projectPageView(page: ProjectPage, now: Date): ProjectPageView {
  const { project, summary } = page;
  const stack = (groups: ProjectPage['project']['devStack']): StackGroup[] =>
    groups.map((group) => ({
      category: group.category,
      items: group.items.map((name) => ({ name })),
    }));
  // A test tool standing for a declared suite says the suite does not report yet (v7 item 8).
  const tested = (groups: ProjectPage['project']['testStack']): StackGroup[] =>
    groups.map((group) => ({
      category: group.category,
      items: group.items.map((name) => {
        const declaredStatus = declaredStatusFor(name, project.declaredSuites);
        return declaredStatus === undefined ? { name } : { name, declaredStatus };
      }),
    }));
  return {
    title: projectPageTitle(project),
    hero: hero(page, now),
    latestRun: latestRunView(page, now),
    built: stack(project.devStack),
    tested: tested(project.testStack),
    pyramid: {
      layers: layerSegments(summary.layers),
      declared: project.declaredSuites,
      total: summary.totalTests,
    },
    declared: project.declaredSuites,
    coverage: summary.coverage.map(({ module, pct, floor }) => ({ module, pct, floor })),
    reports: (page.latestRun?.reports ?? []).map((report) => ({
      key: `${report.job}/${report.module}/${report.platform}`,
      total: formatCount(report.total),
    })),
    runs: {
      branches: page.runs.branches,
      items: page.runs.items.map((run) => feedRun(run, project, now)),
      branchHrefs: {
        default: runListHref(project.slug, { branches: 'default', limit: DEFAULT_RUN_LIMIT }),
        all: runListHref(project.slug, { branches: 'all', limit: DEFAULT_RUN_LIMIT }),
      },
      loadMoreHref: page.runs.hasMore
        ? runListHref(project.slug, {
            branches: page.runs.branches,
            limit: page.runs.items.length + LOAD_MORE,
          })
        : null,
    },
    history: history(page, now),
    flaky: page.flaky.tests.map((test) => ({
      testKey: test.testKey,
      name: test.name,
      suite: test.suite,
      // A test flaky in the 30 days whose failures are behind its last runs, or within one run's
      // retries, says how many commits it flipped on instead (design v9 item 12).
      rate:
        test.failures.failed === 0
          ? `Flipped on ${qty(test.commits, 'commit')} in 30 days`
          : `Failed ${test.failures.failed} of last ${qty(test.failures.runs, 'run')}`,
      layer: LAYER_LABEL[test.layer],
      platforms: test.platforms.join(', '),
      href: testHref(project.slug, test.testKey),
    })),
  };
}
