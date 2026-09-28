import { z } from 'zod';

import { now } from '../clock.ts';
import { LayerSchema } from '../ingest/layer-rules.ts';
import { PUBLIC_RUN_COLUMNS, PublicRunRowSchema } from '../stats/input.ts';
import { readAll, readByRunIds } from '../stats/load.ts';
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

export async function loadTestHistory(
  slug: string,
  testKey: string,
  client: PublicClient = createPublicClient(),
  at: Date = now(),
): Promise<TestHistoryPage | null> {
  const project = await loadProject(client, slug);
  if (project === null || !TEST_KEY.test(testKey)) return null;

  const [test] = await readAll('look up the test', TestRowSchema, () =>
    client
      .from('tests')
      .select('id, test_key, module, suite, name, layer, first_seen_at, last_seen_at')
      .eq('project_id', project.id)
      .eq('test_key', testKey)
      .limit(1),
  );
  if (test === undefined) return null;

  // Every result the test still has (results are kept 180 days, 5.12), on any branch.
  const results = await readAll('load the test results', HistoryResultRowSchema, (from, to) =>
    client
      .from('results')
      .select('id, status, duration_ms, reports!inner(run_id, job, module, platform)')
      .eq('test_id', test.id)
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

  return {
    project,
    test: {
      testKey: test.test_key,
      module: test.module,
      suite: test.suite,
      name: test.name,
      layer: test.layer,
      firstSeenAt: test.first_seen_at,
      lastSeenAt: test.last_seen_at,
    },
    history: testHistory(runs, results, { defaultBranch: project.defaultBranch, now: at }),
  };
}
