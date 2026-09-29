import { z } from 'zod';

import { now } from '../clock.ts';
import { LayerSchema } from '../ingest/layer-rules.ts';
import { durationTrend, type DurationPoint } from '../stats/duration.ts';
import { flakyPlatforms, flakyTests } from '../stats/flaky.ts';
import {
  COVERAGE_COLUMNS,
  CoverageRowSchema,
  PUBLIC_RUN_COLUMNS,
  PublicRunRowSchema,
  type PublicRun,
  type StatsResult,
} from '../stats/input.ts';
import { readByRunIds } from '../stats/load.ts';
import {
  countsTowardCiOnlyStats,
  countsTowardTrends,
  inWindow,
  latestRun,
  type WindowDays,
} from '../stats/rules.ts';
import { projectSummary, type ProjectSummary } from '../stats/summary.ts';
import {
  testCountTrend,
  testOutcomesByRun,
  type RunTests,
  type TestCountPoint,
} from '../stats/test-counts.ts';
import {
  coverageTrend,
  passRateTrend,
  runCountTrend,
  windowPassRate,
  type ModuleCoverageTrend,
  type PassRateTrend,
  type RunCountDayPoint,
  type WindowPassRate,
} from '../stats/trends.ts';
import { createPublicClient, type PublicClient } from '../supabase/public.ts';
import { loadProject, loadSummaryInput, type ProjectDetail } from './project-summary.ts';
import {
  loadLatestRunDetail,
  loadReportCounts,
  loadResults,
  toListedRun,
  type LatestRunDetail,
  type ListedRun,
} from './run-rows.ts';

export type { FailingTest } from './run-rows.ts';

// The project page, /p/[slug] (spec section 13): the project's own fields, its latest run with
// the pyramid and coverage against floors, the section 11 trends, time to green and green
// streak, the flaky list, its runs and the reporting-health marker. Read as anon, like the
// landing page (lib/queries/project-summary.ts), so a private project's rows arrive redacted by
// the views and its failure text is never read here at all. Time is read once, here.

export type BranchScope = 'default' | 'all';

export interface ProjectPageOptions {
  /** The run list's filter: the default branch (the default) or every branch. */
  readonly branches?: BranchScope;
  /** How many runs the list shows; the page raises it by 20 for "Load 20 more". */
  readonly runLimit?: number;
}

export interface ProjectTrends {
  readonly passRate: PassRateTrend;
  readonly windowPassRate: WindowPassRate;
  readonly runCount: readonly RunCountDayPoint[];
  readonly coverage: readonly ModuleCoverageTrend[];
  readonly duration: readonly DurationPoint[];
  readonly testCount: readonly TestCountPoint[];
}

export interface FlakyListTest {
  readonly testKey: string;
  readonly module: string;
  readonly suite: string;
  readonly name: string;
  readonly layer: z.output<typeof LayerSchema>;
  readonly platforms: readonly string[];
}

/** A run list row: the run, and its distinct tests unless its results were pruned (5.12). */
export interface ProjectRunItem extends ListedRun {
  readonly tests: RunTests | null;
}

export interface ProjectPage {
  readonly project: ProjectDetail;
  readonly summary: ProjectSummary;
  /** When the project's latest CI run on any branch finished, as section 11 dates a report. */
  readonly lastReportAt: Date | null;
  /** The latest default-branch CI run's reports, failing tests and duration; null before the first. */
  readonly latestRun: LatestRunDetail | null;
  readonly trends: Readonly<Record<WindowDays, ProjectTrends>>;
  readonly flaky: {
    readonly tests: readonly FlakyListTest[];
    readonly totalTests: number;
    readonly flakeRate: number | null;
  };
  readonly runs: {
    readonly branches: BranchScope;
    readonly items: readonly ProjectRunItem[];
    readonly hasMore: boolean;
  };
}

const DEFAULT_RUN_LIMIT = 10;
// One PostgREST response holds at most max_rows (1000) rows, and the list reads one past its
// limit to tell whether more exist.
const MAX_RUN_LIMIT = 999;

/** The run list's length: a whole number from 1 to 999, whatever the URL asked for. */
export function runListLimit(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) return DEFAULT_RUN_LIMIT;
  return Math.min(MAX_RUN_LIMIT, Math.max(1, Math.trunc(requested)));
}
const LONGEST_WINDOW: WindowDays = 90;

const TEST_COLUMNS = 'id, test_key, module, suite, name, layer';

const TestRowSchema = z
  .object({
    id: z.string().min(1),
    test_key: z.string().min(1),
    module: z.string(),
    suite: z.string(),
    name: z.string(),
    layer: LayerSchema,
  })
  .transform((row) => ({
    id: row.id,
    testKey: row.test_key,
    module: row.module,
    suite: row.suite,
    name: row.name,
    layer: row.layer,
  }));

async function loadRunList(
  client: PublicClient,
  project: ProjectDetail,
  branches: BranchScope,
  limit: number,
  at: Date,
  read: { readonly runIds: ReadonlySet<string>; readonly results: readonly StatsResult[] },
): Promise<ProjectPage['runs']> {
  // The run list shows what CI reported: imported history is not a report (section 11,
  // "Which runs"). Newest first in byFinish order, one row past the limit to tell if more exist.
  const scoped = client
    .from('runs_public')
    .select(PUBLIC_RUN_COLUMNS)
    .eq('project_id', project.id)
    .eq('source', 'ci');
  const filtered = branches === 'default' ? scoped.eq('branch', project.defaultBranch) : scoped;
  const { data, error } = await filtered
    .lte('finished_at', at.toISOString())
    .order('finished_at', { ascending: false })
    .order('started_at', { ascending: false })
    .order('ci_run_id', { ascending: false })
    .order('run_attempt', { ascending: false })
    .range(0, limit);
  if (error) throw new Error(`load the run list: ${error.code} ${error.message}`);
  const parsed = z.array(PublicRunRowSchema).safeParse(data);
  if (!parsed.success) throw new Error('load the run list returned an unexpected row');
  const rows = parsed.data;
  const shown = rows.slice(0, limit);
  const counts = await loadReportCounts(
    client,
    shown.map((run) => run.id),
  );
  // Each row counts distinct tests (decision 2026-09-29), from the results the page has already
  // read where it can. A pruned run has no per-test rows left to count.
  const counted = shown.filter((run) => run.resultsPrunedAt === null).map((run) => run.id);
  const unread = counted.filter((id) => !read.runIds.has(id));
  const results =
    unread.length === 0 ? read.results : [...read.results, ...(await loadResults(client, unread))];
  const tests = testOutcomesByRun(counted, results);
  return {
    branches,
    items: shown.map((run) => ({
      ...toListedRun(run, counts.get(run.id) ?? 0),
      tests: tests.get(run.id) ?? null,
    })),
    hasMore: rows.length > limit,
  };
}

export async function loadProjectPage(
  slug: string,
  options: ProjectPageOptions = {},
  client: PublicClient = createPublicClient(),
  at: Date = now(),
): Promise<ProjectPage | null> {
  const project = await loadProject(client, slug);
  if (project === null) return null;
  const branches = options.branches ?? 'default';
  const runLimit = runListLimit(options.runLimit);

  const input = await loadSummaryInput(client, project, at);
  const summary = projectSummary(input, at);
  const { runs } = input;
  const inLongest = (run: PublicRun) => inWindow(run.finishedAt, at, LONGEST_WINDOW);

  const coverage = await readByRunIds(
    'load coverage',
    CoverageRowSchema,
    runs
      .filter((run) => countsTowardTrends(run, project.defaultBranch) && inLongest(run))
      .map((run) => run.id),
    (ids, from, to) =>
      client
        .from('coverage')
        .select(COVERAGE_COLUMNS)
        .in('reports.run_id', [...ids])
        .order('id')
        .range(from, to),
  );

  // Test count per run and flakiness both read CI results; 90 days is the longer window.
  const resultRunIds = runs
    .filter((run) => countsTowardCiOnlyStats(run, project.defaultBranch) && inLongest(run))
    .map((run) => run.id);
  const results = await loadResults(client, resultRunIds);

  const stats = { defaultBranch: project.defaultBranch, now: at };
  const trends = (days: WindowDays): ProjectTrends => {
    const options = { ...stats, days };
    const passRate = passRateTrend(runs, options);
    return {
      passRate,
      windowPassRate: windowPassRate(passRate),
      runCount: runCountTrend(runs, options),
      coverage: coverageTrend(runs, coverage, options),
      duration: durationTrend(runs, options),
      testCount: testCountTrend(runs, results, options),
    };
  };

  const flaky = flakyTests(runs, results, stats);
  const flakyByTest = flakyPlatforms(runs, results, stats);
  const tests = await readByRunIds(
    'load the flaky tests',
    TestRowSchema,
    flakyByTest.map((test) => test.testId),
    (ids, from, to) =>
      client
        .from('tests')
        .select(TEST_COLUMNS)
        .in('id', [...ids])
        .order('id')
        .range(from, to),
  );
  const testById = new Map(tests.map((test) => [test.id, test]));

  const latest = latestRun(runs, project.defaultBranch, at);
  return {
    project,
    summary,
    lastReportAt: input.lastReportAt,
    latestRun: latest === null ? null : await loadLatestRunDetail(client, latest),
    trends: { 30: trends(30), 90: trends(90) },
    flaky: {
      tests: flakyByTest.flatMap(({ testId, platforms }) => {
        const test = testById.get(testId);
        return test === undefined
          ? []
          : [
              {
                testKey: test.testKey,
                module: test.module,
                suite: test.suite,
                name: test.name,
                layer: test.layer,
                platforms,
              },
            ];
      }),
      totalTests: flaky.totalTests,
      flakeRate: flaky.flakeRate,
    },
    runs: await loadRunList(client, project, branches, runLimit, at, {
      runIds: new Set(resultRunIds),
      results,
    }),
  };
}
