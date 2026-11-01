import { z } from 'zod';

import { runTitle } from '../runs/title.ts';
import type { PublicRun } from '../stats/input.ts';
import { readAll } from '../stats/load.ts';
import type { PublicClient } from '../supabase/public.ts';

// Rows the project, run and test pages share: a run as a list row, a run's reports (spec
// section 5.3), which anon may read in full, and a run's failing tests. Counts over several runs
// come from the database (lib/queries/aggregates.ts), never from their result rows.

export interface ListedRun {
  readonly id: string;
  readonly title: string;
  readonly event: string;
  readonly branch: string;
  readonly commitSha: string;
  readonly runUrl: string | null;
  readonly startedAt: Date;
  readonly finishedAt: Date;
  readonly source: PublicRun['source'];
  readonly status: PublicRun['status'];
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly durationMs: number;
  readonly reports: number;
}

export const toListedRun = (run: PublicRun, reports: number): ListedRun => ({
  id: run.id,
  title: runTitle(run.event, run.branch),
  event: run.event,
  branch: run.branch,
  commitSha: run.commitSha,
  runUrl: run.runUrl,
  startedAt: run.startedAt,
  finishedAt: run.finishedAt,
  source: run.source,
  status: run.status,
  total: run.total,
  passed: run.passed,
  failed: run.failed,
  skipped: run.skipped,
  durationMs: run.durationMs,
  reports,
});

export const REPORT_COLUMNS =
  'job, module, platform, format, total, passed, failed, skipped, duration_ms, ' +
  'started_at, finished_at, received_at';

const count = z.int().min(0);
const instant = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

export const ReportRowSchema = z
  .object({
    job: z.string().min(1),
    module: z.string().min(1),
    platform: z.string().min(1),
    format: z.string().min(1),
    total: count,
    passed: count,
    failed: count,
    skipped: count,
    duration_ms: count,
    started_at: instant,
    finished_at: instant,
    received_at: instant,
  })
  .transform((row) => ({
    job: row.job,
    module: row.module,
    platform: row.platform,
    format: row.format,
    total: row.total,
    passed: row.passed,
    failed: row.failed,
    skipped: row.skipped,
    durationMs: row.duration_ms,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    receivedAt: row.received_at,
  }));

export type RunReport = z.output<typeof ReportRowSchema>;

/** A run's reports in job, module, platform order, the order the unique key reads in (5.3). */
export function loadRunReports(client: PublicClient, runId: string): Promise<RunReport[]> {
  return readAll('load the run reports', ReportRowSchema, (from, to) =>
    client
      .from('reports')
      .select(REPORT_COLUMNS)
      .eq('run_id', runId)
      .order('job')
      .order('module')
      .order('platform')
      .range(from, to),
  );
}

export interface FailingTest {
  readonly testKey: string;
  readonly suite: string;
  readonly name: string;
  readonly platform: string;
  readonly status: 'failed' | 'error';
}

const FailingRowSchema = z
  .object({
    id: z.string().min(1),
    status: z.enum(['failed', 'error']),
    tests: z.object({ test_key: z.string().min(1), suite: z.string(), name: z.string() }),
    reports: z.object({ run_id: z.string().min(1), platform: z.string().min(1) }),
  })
  .transform((row): FailingTest => ({
    testKey: row.tests.test_key,
    suite: row.tests.suite,
    name: row.tests.name,
    platform: row.reports.platform,
    status: row.status,
  }));

const collator = new Intl.Collator('en');

export async function loadFailing(client: PublicClient, runId: string): Promise<FailingTest[]> {
  const rows = await readAll('load the failing tests', FailingRowSchema, (from, to) =>
    client
      .from('results')
      .select('id, status, tests!inner(test_key, suite, name), reports!inner(run_id, platform)')
      .eq('reports.run_id', runId)
      .in('status', ['failed', 'error'])
      .order('id')
      .range(from, to),
  );
  return rows.sort(
    (a, b) =>
      collator.compare(a.suite, b.suite) ||
      collator.compare(a.name, b.name) ||
      collator.compare(a.platform, b.platform),
  );
}

/** What the landing card and the project page's latest-run card show of the latest run. */
export interface LatestRunDetail {
  readonly reports: readonly RunReport[];
  /** Failed and errored results, by suite, name and platform. */
  readonly failing: readonly FailingTest[];
  readonly durationMs: number;
}

export async function loadLatestRunDetail(
  client: PublicClient,
  run: Pick<PublicRun, 'id' | 'durationMs'>,
): Promise<LatestRunDetail> {
  const [reports, failing] = await Promise.all([
    loadRunReports(client, run.id),
    loadFailing(client, run.id),
  ]);
  return { reports, failing, durationMs: run.durationMs };
}
