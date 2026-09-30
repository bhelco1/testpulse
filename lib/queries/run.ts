import { z } from 'zod';

import { now } from '../clock.ts';
import { LayerSchema } from '../ingest/layer-rules.ts';
import { runTestRows, type RunResultInput, type RunTestRow } from '../results/run-results.ts';
import { flakyTests } from '../stats/flaky.ts';
import { PUBLIC_RUN_COLUMNS, PublicRunRowSchema, type PublicRun } from '../stats/input.ts';
import { readAll, readByRunIds } from '../stats/load.ts';
import { windowStart } from '../stats/rules.ts';
import { testOutcomes, type RunTests } from '../stats/test-counts.ts';
import { createPublicClient, type PublicClient } from '../supabase/public.ts';
import { loadProject, type ProjectDetail } from './project-summary.ts';
import {
  loadResults,
  loadRunReports,
  toListedRun,
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

const RUN_RESULT_COLUMNS =
  'id, test_id, status, duration_ms, tests!inner(test_key, module, suite, name, layer), ' +
  'reports!inner(run_id, job, platform)';

const RunResultRowSchema = z
  .object({
    id: z.string().min(1),
    test_id: z.string().min(1),
    status: z.enum(['passed', 'failed', 'error', 'skipped']),
    duration_ms: z.int().min(0),
    tests: z.object({
      test_key: z.string().min(1),
      module: z.string(),
      suite: z.string(),
      name: z.string(),
      layer: LayerSchema,
    }),
    reports: z.object({
      run_id: z.string().min(1),
      job: z.string().min(1),
      platform: z.string().min(1),
    }),
  })
  .transform((row): RunResultInput => ({
    resultId: row.id,
    testId: row.test_id,
    testKey: row.tests.test_key,
    module: row.tests.module,
    suite: row.tests.suite,
    name: row.tests.name,
    layer: row.tests.layer,
    status: row.status,
    durationMs: row.duration_ms,
    job: row.reports.job,
    platform: row.reports.platform,
  }));

const FailureRowSchema = z.object({
  result_id: z.string().min(1),
  message: z.string(),
  detail: z.string(),
});

const FLAKY_DAYS = 30;

/** The test IDs section 11 calls flaky: default-branch CI runs of the 30 days up to now. */
async function loadFlakyTestIds(
  client: PublicClient,
  project: ProjectDetail,
  at: Date,
): Promise<Set<string>> {
  const runs = await readAll('load the flaky window runs', PublicRunRowSchema, (from, to) =>
    client
      .from('runs_public')
      .select(PUBLIC_RUN_COLUMNS)
      .eq('project_id', project.id)
      .eq('branch', project.defaultBranch)
      .eq('source', 'ci')
      .gte('finished_at', windowStart(at, FLAKY_DAYS).toISOString())
      .lte('finished_at', at.toISOString())
      .order('id')
      .range(from, to),
  );
  const results = await loadResults(
    client,
    runs.map((run) => run.id),
  );
  return new Set(
    flakyTests(runs, results, { defaultBranch: project.defaultBranch, now: at }).flakyTestIds,
  );
}

async function loadResultRows(
  client: PublicClient,
  project: ProjectDetail,
  run: PublicRun,
  at: Date,
): Promise<RunTestRow[]> {
  const results = await readAll('load the run results', RunResultRowSchema, (from, to) =>
    client
      .from('results')
      .select(RUN_RESULT_COLUMNS)
      .eq('reports.run_id', run.id)
      .order('id')
      .range(from, to),
  );
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
    await loadFlakyTestIds(client, project, at),
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

export async function loadRunDetail(
  slug: string,
  runId: string,
  client: PublicClient = createPublicClient(),
  at: Date = now(),
): Promise<RunDetail | null> {
  const project = await loadProject(client, slug);
  if (project === null) return null;
  const run = await findRun(client, project, runId);
  if (run === null) return null;

  const reports = await loadRunReports(client, run.id);
  const results =
    run.resultsPrunedAt === null ? await loadResultRows(client, project, run, at) : null;
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
