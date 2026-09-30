import { z } from 'zod';

import { now } from '../clock.ts';
import { LayerSchema } from '../ingest/layer-rules.ts';
import { PUBLIC_RUN_COLUMNS, PublicRunRowSchema } from '../stats/input.ts';
import { readAll, readByRunIds } from '../stats/load.ts';
import { TREND_RUNS } from '../stats/rules.ts';
import { testHistory, type HistoryResult, type TestHistory } from '../stats/test-history.ts';
import { createPublicClient, type PublicClient } from '../supabase/public.ts';
import { loadProject, type ProjectDetail } from './project-summary.ts';

// The test history page, /p/[slug]/tests/[testKey] (spec section 13; design/data-map.md, Test
// history): one test's status timeline, duration trend and flaky status. The URL segment is the
// test's tests.test_key as stored (5.4). Read as anon: failure text is not part of this page and
// is never read, and runs_public has already cut a private project's commits to 7 characters.
// Time is read once, here.

export interface HistoryTest {
  readonly testKey: string;
  readonly module: string;
  readonly suite: string;
  readonly name: string;
  readonly layer: z.output<typeof LayerSchema>;
  readonly firstSeenAt: Date;
  readonly lastSeenAt: Date;
}

export interface TestHistoryPage {
  readonly project: ProjectDetail;
  readonly test: HistoryTest;
  readonly history: TestHistory;
}

// SHA-256 in lowercase hex, as ingestion writes it (lib/ingest/normalize.ts, testKey). Anything
// else names no test and is not sent to the database.
const TEST_KEY = /^[0-9a-f]{64}$/;

const instant = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

const TestRowSchema = z.object({
  id: z.string().min(1),
  test_key: z.string().min(1),
  module: z.string(),
  suite: z.string(),
  name: z.string(),
  layer: LayerSchema,
  first_seen_at: instant,
  last_seen_at: instant,
});

const HistoryResultRowSchema = z
  .object({
    id: z.string().min(1),
    status: z.enum(['passed', 'failed', 'error', 'skipped']),
    duration_ms: z.int().min(0),
    reports: z.object({
      run_id: z.string().min(1),
      job: z.string().min(1),
      module: z.string().min(1),
      platform: z.string().min(1),
    }),
  })
  .transform((row): HistoryResult => ({
    id: row.id,
    runId: row.reports.run_id,
    job: row.reports.job,
    module: row.reports.module,
    platform: row.reports.platform,
    status: row.status,
    durationMs: row.duration_ms,
  }));

/** The project's test with this key, or null; a key that is not one is not looked up. */
export async function findTest(
  client: PublicClient,
  project: ProjectDetail,
  testKey: string,
): Promise<{ readonly id: string; readonly test: HistoryTest } | null> {
  if (!TEST_KEY.test(testKey)) return null;
  const [test] = await readAll('look up the test', TestRowSchema, () =>
    client
      .from('tests')
      .select('id, test_key, module, suite, name, layer, first_seen_at, last_seen_at')
      .eq('project_id', project.id)
      .eq('test_key', testKey)
      .limit(1),
  );
  if (test === undefined) return null;
  return {
    id: test.id,
    test: {
      testKey: test.test_key,
      module: test.module,
      suite: test.suite,
      name: test.name,
      layer: test.layer,
      firstSeenAt: test.first_seen_at,
      lastSeenAt: test.last_seen_at,
    },
  };
}

export async function loadTestHistory(
  slug: string,
  testKey: string,
  client: PublicClient = createPublicClient(),
  at: Date = now(),
): Promise<TestHistoryPage | null> {
  const project = await loadProject(client, slug);
  if (project === null) return null;
  const found = await findTest(client, project, testKey);
  if (found === null) return null;
  const { id: testId, test } = found;

  // Every result the test still has (results are kept 180 days, 5.12), on any branch.
  const results = await readAll('load the test results', HistoryResultRowSchema, (from, to) =>
    client
      .from('results')
      .select('id, status, duration_ms, reports!inner(run_id, job, module, platform)')
      .eq('test_id', testId)
      .order('id')
      .range(from, to),
  );
  const runIds = [...new Set(results.map((result) => result.runId))].sort();
  const runs = await readByRunIds(
    'load the test runs',
    PublicRunRowSchema,
    runIds,
    (ids, from, to) =>
      client
        .from('runs_public')
        .select(PUBLIC_RUN_COLUMNS)
        .in('id', [...ids])
        .eq('project_id', project.id)
        .order('id')
        .range(from, to),
  );

  // The duration chart covers the project's last 30 default-branch CI runs, however old
  // (section 11, "Windows"); one where the test has no result is a gap, so they are read whether
  // or not the test reported in them, in the run list's order.
  const recent =
    results.length === 0
      ? []
      : await readAll('load the latest default-branch runs', PublicRunRowSchema, () =>
          client
            .from('runs_public')
            .select(PUBLIC_RUN_COLUMNS)
            .eq('project_id', project.id)
            .eq('branch', project.defaultBranch)
            .eq('source', 'ci')
            .lte('finished_at', at.toISOString())
            .order('finished_at', { ascending: false })
            .order('started_at', { ascending: false })
            .order('ci_run_id', { ascending: false })
            .order('run_attempt', { ascending: false })
            .limit(TREND_RUNS),
        );
  const read = new Set(runs.map((run) => run.id));
  const allRuns = [...runs, ...recent.filter((run) => !read.has(run.id))];

  return {
    project,
    test,
    history: testHistory(allRuns, results, { defaultBranch: project.defaultBranch, now: at }),
  };
}
