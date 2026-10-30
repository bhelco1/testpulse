import { z } from 'zod';

import { LayerSchema } from '../ingest/layer-rules.ts';
import type { FlakyFailures, FlakyTest } from '../stats/flaky.ts';
import { readAll } from '../stats/load.ts';
import { windowStart } from '../stats/rules.ts';
import type { TestTally } from '../stats/test-counts.ts';
import type { PublicClient } from '../supabase/public.ts';

// The section 11 answers the pages ask Postgres for (decision 2026-10-29), through the functions
// of supabase/migrations/20261029120000_page_aggregates.sql. Each runs as its caller, so read as
// anon they see what section 9 opens and nothing more. Before them the loaders paged every result
// row of the runs they counted through PostgREST, which for testpulse's 30 days was about 125,000
// rows a page load. Responses are paged like any other read, since PostgREST caps each at 1,000
// rows, and ordered by their keys so the pages never overlap.

const FLAKY_DAYS = 30;

const TallyRowSchema = z
  .object({
    run_id: z.string().min(1),
    layer: LayerSchema,
    status: z.enum(['passed', 'failed', 'error', 'skipped']),
    tests: z.int().min(1),
  })
  .transform((row): TestTally => ({
    runId: row.run_id,
    layer: row.layer,
    status: row.status,
    tests: row.tests,
  }));

/** The given runs' distinct tests by layer and combined status (run_test_tallies). */
export function loadTestTallies(
  client: PublicClient,
  runIds: readonly string[],
): Promise<TestTally[]> {
  if (runIds.length === 0) return Promise.resolve([]);
  return readAll('count the runs’ tests', TallyRowSchema, (from, to) =>
    client
      .rpc('run_test_tallies', { p_run_ids: [...new Set(runIds)] })
      .order('run_id')
      .order('layer')
      .order('status')
      .range(from, to),
  );
}

const ReportCountRowSchema = z.object({
  run_id: z.string().min(1),
  reports: z.int().min(1),
});

/** How many reports each run has, for the run list's empty rows ("0 tests · 3 reports"). */
export async function loadReportCounts(
  client: PublicClient,
  runIds: readonly string[],
): Promise<Map<string, number>> {
  if (runIds.length === 0) return new Map();
  const rows = await readAll('count reports', ReportCountRowSchema, (from, to) =>
    client
      .rpc('run_report_counts', { p_run_ids: [...new Set(runIds)] })
      .order('run_id')
      .range(from, to),
  );
  return new Map(rows.map((row) => [row.run_id, row.reports]));
}

const FlakyRowSchema = z
  .object({
    test_id: z.string().min(1),
    platforms: z.array(z.string().min(1)).min(1),
    commits: z.int().min(1),
  })
  .transform((row): FlakyTest => ({
    testId: row.test_id,
    platforms: row.platforms,
    commits: row.commits,
  }));

const flakyWindow = (at: Date) => ({
  p_since: windowStart(at, FLAKY_DAYS).toISOString(),
  p_until: at.toISOString(),
});

/**
 * Section 11's flaky tests of the project as of `at`, over the 30 days before it, with the
 * platforms and commits each flipped on (flaky_tests; flakyPlatforms in lib/stats/flaky.ts).
 */
export function loadFlakyTests(
  client: PublicClient,
  projectId: string,
  at: Date,
): Promise<FlakyTest[]> {
  return readAll('find the flaky tests', FlakyRowSchema, (from, to) =>
    client
      .rpc('flaky_tests', { p_project_id: projectId, ...flakyWindow(at) })
      .order('test_id')
      .range(from, to),
  );
}

const FlakyFailuresRowSchema = z
  .object({
    test_id: z.string().min(1),
    failed: z.int().min(0),
    runs: z.int().min(0),
  })
  .transform((row): FlakyFailures => ({ testId: row.test_id, failed: row.failed, runs: row.runs }));

/**
 * Each test's "Failed {n} of last {m} runs" as of `at` (flaky_failures; flakyFailures in
 * lib/stats/flaky.ts), in test ID order.
 */
export function loadFlakyFailures(
  client: PublicClient,
  projectId: string,
  at: Date,
  testIds: readonly string[],
): Promise<FlakyFailures[]> {
  if (testIds.length === 0) return Promise.resolve([]);
  return readAll('count the flaky tests’ failures', FlakyFailuresRowSchema, (from, to) =>
    client
      .rpc('flaky_failures', {
        p_project_id: projectId,
        ...flakyWindow(at),
        p_test_ids: [...new Set(testIds)],
      })
      .order('test_id')
      .range(from, to),
  );
}
