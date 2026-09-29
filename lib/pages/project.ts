import type { StackGroup } from '../../components/StackTagGroup/StackTagGroup';
import type { FeedRun } from '../../components/RunFeedRow/RunFeedRow';
import { formatTrendValue } from '../charts/format';
import { formatCount, qty } from '../copy/count';
import { formatRunDuration, relativeTime, shortDate } from '../copy/time';
import { LAYER_LABEL, layerSegments, type LayerSegment } from '../design/layers';
import type { DeclaredSuite } from '../projects/schema';
import type { BranchScope, ProjectPage, ProjectPageOptions } from '../queries/project';
import type { ListedRun } from '../queries/run-rows';
import { shortSuite } from '../results/short-suite';
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
  readonly healthDetail: string | null;
  /** Public projects only: projects_public nulls it for a private one (section 9). */
  readonly repoUrl: string | null;
  readonly stale: { readonly title: string; readonly body: string } | null;
}

export interface LatestRunView {
  readonly status: 'passed' | 'failed' | 'empty';
  readonly when: string;
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
  readonly layer: string;
  readonly platforms: string;
  readonly href: string;
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
  readonly coverage: readonly { module: string; pct: number; floor: number }[];
  readonly reports: readonly { key: string; total: string }[];
  readonly runs: {
    readonly branches: BranchScope;
    readonly items: readonly FeedRun[];
    /** The list's first page for each branch scope, for the branch filter. */
    readonly branchHrefs: Readonly<Record<BranchScope, string>>;
    /** The same list with 20 more runs; none when every run is shown. */
    readonly loadMoreHref: string | null;
  };
  readonly flaky: readonly FlakyView[];
}

const projectHref = (slug: string) => `/p/${encodeURIComponent(slug)}`;
const runHref = (slug: string, runId: string) => `${projectHref(slug)}/runs/${runId}`;
const testHref = (slug: string, testKey: string) => `${projectHref(slug)}/tests/${testKey}`;
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
        ? `Last report ${relativeTime(lastReportAt, now)}`
        : marker.health === 'stale'
          ? `Expected every ${qty(project.expectedCadenceDays, 'day')}`
          : null,
    repoUrl: project.repoUrl,
    stale:
      marker.health === 'stale' && staleSince !== null
        ? {
            title: `${project.name} hasn’t reported in ${qty(marker.days, 'day')}`,
            body:
              'The weekly scheduled run should have posted by ' +
              `${shortDate(new Date(staleSince.getTime() + project.expectedCadenceDays * DAY_MS))}. ` +
              'Its CI may be failing silently. Everything below is from the last report, ' +
              `${shortDate(staleSince)}.`,
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
  const rate = page.trends[30].windowPassRate.passRate;

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
    when: stale ? shortDate(run.finishedAt) : relativeTime(run.finishedAt, now),
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

function feedRun(run: ListedRun, page: ProjectPage, now: Date): FeedRun {
  const base = {
    id: run.id,
    href: runHref(page.project.slug, run.id),
    project: page.project.name,
    branch: run.branch,
    sha: sha7(run.commitSha),
    when: relativeTime(run.finishedAt, now),
  };
  const title =
    page.project.visibility === 'private'
      ? { visibility: 'private' as const }
      : { visibility: 'public' as const, title: run.title };
  switch (run.status) {
    case 'passed':
      return {
        ...base,
        ...title,
        status: 'passed',
        total: run.total,
        duration: formatRunDuration(run.durationMs),
      };
    case 'failed':
      return {
        ...base,
        ...title,
        status: 'failed',
        failed: run.failed,
        passed: run.passed,
        total: run.total,
      };
    case 'empty':
      return { ...base, ...title, status: 'empty', reports: run.reports };
  }
}

export function projectPageView(page: ProjectPage, now: Date): ProjectPageView {
  const { project, summary } = page;
  const stack = (groups: ProjectPage['project']['devStack']): StackGroup[] =>
    groups.map((group) => ({
      category: group.category,
      items: group.items.map((name) => ({ name })),
    }));
  return {
    title: `${project.name} · testpulse`,
    hero: hero(page, now),
    latestRun: latestRunView(page, now),
    built: stack(project.devStack),
    tested: stack(project.testStack),
    pyramid: {
      layers: layerSegments(summary.layers),
      declared: project.declaredSuites,
      total: summary.totalTests,
    },
    declared: project.declaredSuites,
    coverage: summary.coverage.flatMap(({ module, pct, floor }) =>
      floor === null ? [] : [{ module, pct, floor }],
    ),
    reports: (page.latestRun?.reports ?? []).map((report) => ({
      key: `${report.job}/${report.module}/${report.platform}`,
      total: formatCount(report.total),
    })),
    runs: {
      branches: page.runs.branches,
      items: page.runs.items.map((run) => feedRun(run, page, now)),
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
    flaky: page.flaky.tests.map((test) => ({
      testKey: test.testKey,
      name: test.name,
      suite: test.suite,
      layer: LAYER_LABEL[test.layer],
      platforms: test.platforms.join(', '),
      href: testHref(project.slug, test.testKey),
    })),
  };
}
