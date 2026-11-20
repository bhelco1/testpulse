import { z } from 'zod';

import { now } from '../clock.ts';
import { LayerSchema } from '../ingest/layer-rules.ts';
import { runTestRows, type RunResultInput, type RunTestRow } from '../results/run-results.ts';
import { PUBLIC_RUN_COLUMNS, PublicRunRowSchema, type PublicRun } from '../stats/input.ts';
import { readAll, readByRunIds } from '../stats/load.ts';
import { testOutcomes, type RunTests } from '../stats/test-counts.ts';
import { createPublicClient, type PublicClient } from '../supabase/public.ts';
import { loadFlakyTests } from './aggregates.ts';
import { loadProject, type ProjectDetail } from './project-summary.ts';
import {
  loadRunReports,
  toListedRun,
  type IdentifiedRunReport,
  type ListedRun,
  type RunReport,
} from './run-rows.ts';

// The run page, /p/[slug]/runs/[id] (spec section 13; design/data-map.md, Run detail): the
// run's metadata, its reports by job, module and platform, and one results-table row per test
// with its status on each platform, section 11's platform mismatch and flaky flag, and failure
// text where visibility allows. Read as anon: result_failures returns nothing for a private
// project (section 9), runs_public has already cut its commit to 7 characters and nulled its
// run URL, and nothing here checks visibility itself. Time is read once, here, for the flaky
// window.

export interface RunDetail {
  readonly project: ProjectDetail;
  readonly run: ListedRun & {
    readonly ciRunId: string;
    readonly runAttempt: number;
    readonly resultsPrunedAt: Date | null;
    /**
     * The run's distinct tests (decision 2026-09-29), as the project page's run rows count them;
     * total, passed, failed and skipped beside it are runs_public's executions. Null once the
     * results were pruned, when no per-test rows are left to count.
     */
    readonly tests: RunTests | null;
  };
  readonly reports: readonly RunReport[];
  /** Null once the run's results were pruned (5.12); the run's totals stay. */
  readonly results: readonly RunTestRow[] | null;
}

// runs.id is a UUID (section 5); anything else is not a run, and is not sent to the database.
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Results are asked for by report_id, which results_report_id_idx finds. A filter on an embedded
// report column instead (reports.run_id) made Postgres walk the whole results table in id order
// for each page of 1,000: about 9 s for a 4,000-result run in production (2026-11-20).
const RUN_RESULT_COLUMNS =
  'id, test_id, report_id, status, duration_ms, tests!inner(test_key, module, suite, name, layer)';

const RunResultRowSchema = z.object({
  id: z.string().min(1),
  test_id: z.string().min(1),
  report_id: z.string().min(1),
  status: z.enum(['passed', 'failed', 'error', 'skipped']),
  duration_ms: z.int().min(0),
  tests: z.object({
    test_key: z.string().min(1),
    module: z.string(),
    suite: z.string(),
    name: z.string(),
    layer: LayerSchema,
  }),
});

type RunResultRow = z.output<typeof RunResultRowSchema>;

function resultInput(
  row: RunResultRow,
  reports: ReadonlyMap<string, Pick<RunReport, 'job' | 'platform'>>,
): RunResultInput {
  const report = reports.get(row.report_id);
  if (report === undefined) throw new Error('load the run results returned another run’s result');
  return {
    resultId: row.id,
    testId: row.test_id,
    testKey: row.tests.test_key,
    module: row.tests.module,
    suite: row.tests.suite,
    name: row.tests.name,
    layer: row.tests.layer,
    status: row.status,
    durationMs: row.duration_ms,
    job: report.job,
    platform: report.platform,
  };
}

const FailureRowSchema = z.object({
  result_id: z.string().min(1),
  message: z.string(),
  detail: z.string(),
});

/**
 * The run's per-test rows: its results, failure text where visibility allows, and section 11's
 * flaky flag from the given flaky tests. Never cached (decision 2026-11-17): a large public run's
 * rows are 0.4 to 2 MB, over the cache's budget.
 */
export async function loadRunResults(
  client: PublicClient,
  reports: readonly IdentifiedRunReport[],
  flakyTestIds: readonly string[],
): Promise<RunTestRow[]> {
  const byId = new Map(reports.map((report) => [report.id, report]));
  const rows = await readByRunIds(
    'load the run results',
    RunResultRowSchema,
    [...byId.keys()],
    (ids, from, to) =>
      client
        .from('results')
        .select(RUN_RESULT_COLUMNS)
        .in('report_id', [...ids])
        .order('id')
        .range(from, to),
  );
  const results = rows.map((row) => resultInput(row, byId));
  const failingIds = results
    .filter((result) => result.status === 'failed' || result.status === 'error')
    .map((result) => result.resultId);
  // Asked for regardless of visibility: row-level security is what hides a private project's
  // failures (section 9), and a check here would only hide a policy that stopped working.
  const failures = await readByRunIds(
    'load failure detail',
    FailureRowSchema,
    failingIds,
    (ids, from, to) =>
      client
        .from('result_failures')
        .select('result_id, message, detail')
        .in('result_id', [...ids])
        .order('result_id')
        .range(from, to),
  );
  return runTestRows(
    results,
    new Map(failures.map((row) => [row.result_id, { message: row.message, detail: row.detail }])),
    new Set(flakyTestIds),
  );
}

// Each row is one test with its status already combined across platforms, as testOutcomes
// combines them for the project page's rows.
function distinctTests(rows: readonly RunTestRow[]): RunTests {
  const outcomes = testOutcomes(rows.map((row) => ({ testId: row.testId, status: row.status })));
  return { total: rows.length, ...outcomes };
}

/** The project's run with this ID, or null; an ID that is not a UUID is not looked up. */
export async function findRun(
  client: PublicClient,
  project: ProjectDetail,
  runId: string,
): Promise<PublicRun | null> {
  if (!RUN_ID.test(runId)) return null;
  const [run = null] = await readAll('look up the run', PublicRunRowSchema, () =>
    client
      .from('runs_public')
      .select(PUBLIC_RUN_COLUMNS)
      .eq('id', runId)
      .eq('project_id', project.id)
      .limit(1),
  );
  return run;
}

/** Everything the run page reads but its per-test rows: what may be cached (decision 2026-11-17). */
export interface RunShell {
  readonly project: ProjectDetail;
  readonly run: PublicRun;
  readonly reports: readonly IdentifiedRunReport[];
  /**
   * Section 11's flaky tests of the project as of now, over the 30 days before it (flaky_tests);
   * null once the run's results were pruned, when there are no rows to flag.
   */
  readonly flakyTestIds: readonly string[] | null;
}

export async function loadRunShell(
  slug: string,
  runId: string,
  client: PublicClient = createPublicClient(),
  at: Date = now(),
): Promise<RunShell | null> {
  const project = await loadProject(client, slug);
  if (project === null) return null;
  const run = await findRun(client, project, runId);
  if (run === null) return null;
  const [reports, flaky] = await Promise.all([
    loadRunReports(client, run.id),
    run.resultsPrunedAt === null ? loadFlakyTests(client, project.id, at) : null,
  ]);
  return { project, run, reports, flakyTestIds: flaky?.map((test) => test.testId) ?? null };
}

/** The run page from its shell and, unless its results were pruned, its per-test rows. */
export function runDetailOf(shell: RunShell, results: readonly RunTestRow[] | null): RunDetail {
  const { project, run, reports } = shell;
  return {
    project,
    run: {
      ...toListedRun(run, reports.length),
      ciRunId: run.ciRunId,
      runAttempt: run.runAttempt,
      resultsPrunedAt: run.resultsPrunedAt,
      tests: results === null ? null : distinctTests(results),
    },
    reports,
    results,
  };
}

export async function loadRunDetail(
  slug: string,
  runId: string,
  client: PublicClient = createPublicClient(),
  at: Date = now(),
): Promise<RunDetail | null> {
  const shell = await loadRunShell(slug, runId, client, at);
  if (shell === null) return null;
  const results =
    shell.flakyTestIds === null
      ? null
      : await loadRunResults(client, shell.reports, shell.flakyTestIds);
  return runDetailOf(shell, results);
}
