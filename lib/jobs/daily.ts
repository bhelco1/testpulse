import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { checkStale } from '../alerts/rpc.ts';
import {
  DAILY_STEPS,
  type DailyStep,
  type DailySummary,
  ERROR_MAX,
  NOTHING_PRUNED,
  type PruneBatch,
  PruneBatchSchema,
  type PrunedCounts,
  type PrunedProject,
  UNFINISHED,
} from './summary.ts';

// The daily scheduled function (spec section 12): write the heartbeat, run the stale check, run
// the prune. The caller passes the secret client and now (lib/clock.ts), so every time the job
// writes is that instant; only the prune's time budget reads a stopwatch, never the wall clock.
//
// The heartbeat row is written first, before any other step, so the database is touched and the
// run is recorded even if a later step hangs and the platform stops the function; it is updated
// with the final summary at the end. A step that fails is recorded and the later steps still run.

/** Rows per prune_expired call (spec 5.12: batches of 5,000 rows, to avoid long locks). */
export const PRUNE_BATCH_SIZE = 5_000;

/**
 * No prune batch starts after this much of the run. Vercel Hobby functions may run 300 s
 * (app/api/cron/daily/route.ts sets maxDuration to it); the last 60 s are left for a batch already
 * started and the final heartbeat write. A prune cut short is finished on the next day's run.
 */
export const PRUNE_BUDGET_MS = 240_000;

export interface DailyLog {
  readonly info: (line: string) => void;
  readonly error: (line: string) => void;
}

export interface DailyJobOptions {
  /** Milliseconds since the job started, from a monotonic clock. */
  readonly elapsedMs?: () => number;
  readonly budgetMs?: number;
  readonly batchSize?: number;
  readonly log?: DailyLog;
}

const LOG_PREFIX = 'testpulse daily:';

function stopwatch(): () => number {
  const start = performance.now();
  return () => performance.now() - start;
}

const failed = (what: string, error: { code: string; message: string }): Error =>
  new Error(`${what}: ${error.code} ${error.message}`);

/** The error's message, capped, never empty. Stacks stay out: the summary is shown on a page. */
function errorText(cause: unknown): string {
  const text = (cause instanceof Error ? cause.message : String(cause)).trim() || 'Unknown error';
  return text.length > ERROR_MAX ? `${text.slice(0, ERROR_MAX - 1)}…` : text;
}

/** One prune_expired call: removes at most `batchSize` expired rows and says what it removed. */
async function pruneBatch(
  client: SupabaseClient,
  now: Date,
  batchSize: number,
): Promise<PruneBatch> {
  const { data, error } = await client.rpc('prune_expired', {
    p_now: now.toISOString(),
    p_batch_size: batchSize,
  });
  if (error) throw failed('prune_expired', error);
  const parsed = PruneBatchSchema.safeParse(data);
  if (!parsed.success) throw new Error('prune_expired returned an unexpected result');
  return parsed.data;
}

export interface PruneOutcome {
  readonly removed: PrunedCounts;
  readonly byProject: readonly PrunedProject[];
  readonly batches: number;
  /** A batch removed nothing: every expired row is gone. */
  readonly complete: boolean;
  readonly error: string | null;
}

const removedAny = (batch: PruneBatch): boolean =>
  batch.results + batch.result_failures + batch.visits + batch.rate_limit_buckets > 0;

function addProjects(totals: Map<string, PrunedProject>, projects: readonly PrunedProject[]): void {
  for (const project of projects) {
    const before = totals.get(project.project_id);
    totals.set(project.project_id, {
      ...project,
      results: (before?.results ?? 0) + project.results,
      result_failures: (before?.result_failures ?? 0) + project.result_failures,
      runs_marked_pruned: (before?.runs_marked_pruned ?? 0) + project.runs_marked_pruned,
    });
  }
}

/**
 * Calls prune_expired until a batch removes nothing or the budget is used. Each batch commits on
 * its own, so what committed before a failure is counted in the outcome with the error.
 */
export async function pruneUntilDone(
  client: SupabaseClient,
  now: Date,
  options: DailyJobOptions = {},
): Promise<PruneOutcome> {
  const elapsedMs = options.elapsedMs ?? stopwatch();
  const budgetMs = options.budgetMs ?? PRUNE_BUDGET_MS;
  const batchSize = options.batchSize ?? PRUNE_BATCH_SIZE;
  let removed: PrunedCounts = NOTHING_PRUNED;
  const byProject = new Map<string, PrunedProject>();
  let batches = 0;
  const outcome = (complete: boolean, error: string | null): PruneOutcome => ({
    removed,
    byProject: [...byProject.values()].sort((a, b) =>
      a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0,
    ),
    batches,
    complete,
    error,
  });

  while (elapsedMs() < budgetMs) {
    let batch: PruneBatch;
    try {
      batch = await pruneBatch(client, now, batchSize);
    } catch (error) {
      return outcome(false, errorText(error));
    }
    batches += 1;
    removed = {
      results: removed.results + batch.results,
      result_failures: removed.result_failures + batch.result_failures,
      visits: removed.visits + batch.visits,
      rate_limit_buckets: removed.rate_limit_buckets + batch.rate_limit_buckets,
      runs_marked_pruned: removed.runs_marked_pruned + batch.runs_marked_pruned,
    };
    addProjects(byProject, batch.projects);
    if (!removedAny(batch)) return outcome(true, null);
  }
  return outcome(false, null);
}

interface StaleOutcome {
  readonly projectsChecked: number;
  readonly opened: number;
  readonly openedProjectIds: readonly string[];
}

const OpenedSchema = z.array(z.object({ project_id: z.uuid() }));

async function staleCheck(client: SupabaseClient, now: Date): Promise<StaleOutcome> {
  const projects = await client.from('projects').select('id', { count: 'exact', head: true });
  if (projects.error) throw failed('count projects', projects.error);
  const projectsChecked = z.int().min(0).parse(projects.count);
  const opened = await checkStale(client, now);
  // check_stale dates what it opens by p_now, so these are the alerts this check opened.
  const rows = await client
    .from('alerts')
    .select('project_id')
    .eq('kind', 'stale')
    .eq('opened_at', now.toISOString())
    .order('project_id');
  if (rows.error) throw failed('read opened stale alerts', rows.error);
  const openedProjectIds = OpenedSchema.parse(rows.data).map((row) => row.project_id);
  return { projectsChecked, opened, openedProjectIds };
}

function unfinishedSummary(now: Date): DailySummary {
  return {
    started_at: now.toISOString(),
    finished_at: null,
    status: 'failed',
    failed_step: null,
    error: UNFINISHED,
    failed_steps: [],
    heartbeat_written: true,
    projects_checked: null,
    stale_opened: null,
    stale_opened_project_ids: [],
    pruned: NOTHING_PRUNED,
    pruned_by_project: [],
    prune_batches: 0,
    prune_complete: false,
  };
}

async function insertHeartbeat(
  client: SupabaseClient,
  now: Date,
  summary: DailySummary,
): Promise<string> {
  const { data, error } = await client
    .from('heartbeats')
    .insert({ created_at: now.toISOString(), summary })
    .select('id')
    .single();
  if (error) throw failed('heartbeats insert', error);
  return z.object({ id: z.uuid() }).parse(data).id;
}

async function updateHeartbeat(
  client: SupabaseClient,
  id: string,
  summary: DailySummary,
): Promise<void> {
  const { error } = await client.from('heartbeats').update({ summary }).eq('id', id);
  if (error) throw failed('heartbeats update', error);
}

/** Runs the three steps and returns what they did; never throws. */
export async function runDailyJob(
  client: SupabaseClient,
  now: Date,
  options: DailyJobOptions = {},
): Promise<DailySummary> {
  const elapsedMs = options.elapsedMs ?? stopwatch();
  const log = options.log ?? { info: console.info, error: console.error };
  const errors = new Map<DailyStep, string>();
  const fail = (step: DailyStep, cause: unknown) => {
    const text = errorText(cause);
    // A step that already failed keeps its first error.
    if (!errors.has(step)) errors.set(step, text);
    log.error(`${LOG_PREFIX} ${step} failed: ${text}`);
  };

  // 1. Heartbeat.
  let heartbeatId: string | null = null;
  try {
    heartbeatId = await insertHeartbeat(client, now, unfinishedSummary(now));
  } catch (error) {
    fail('heartbeat', error);
  }

  // 2. Stale check.
  let stale: StaleOutcome | null = null;
  try {
    stale = await staleCheck(client, now);
  } catch (error) {
    fail('stale_check', error);
  }

  // 3. Prune.
  const prune = await pruneUntilDone(client, now, { ...options, elapsedMs });
  if (prune.error !== null) fail('prune', prune.error);
  for (const project of prune.byProject) {
    log.info(
      `${LOG_PREFIX} pruned ${project.slug}: ${project.results} results, ` +
        `${project.result_failures} result_failures, ${project.runs_marked_pruned} runs marked pruned`,
    );
  }
  const { removed } = prune;
  log.info(
    `${LOG_PREFIX} pruned ${removed.results} results, ${removed.result_failures} result_failures, ` +
      `${removed.visits} visits, ${removed.rate_limit_buckets} rate_limit_buckets, ` +
      `${removed.runs_marked_pruned} runs marked pruned in ${prune.batches} batches`,
  );

  const summarize = (written: boolean): DailySummary => {
    const failedSteps = DAILY_STEPS.filter((step) => errors.has(step));
    const first = failedSteps[0] ?? null;
    return {
      started_at: now.toISOString(),
      finished_at: new Date(now.getTime() + Math.round(elapsedMs())).toISOString(),
      status: first === null ? 'ok' : 'failed',
      failed_step: first,
      error: first === null ? null : (errors.get(first) ?? null),
      failed_steps: failedSteps,
      heartbeat_written: written,
      projects_checked: stale?.projectsChecked ?? null,
      stale_opened: stale?.opened ?? null,
      stale_opened_project_ids: [...(stale?.openedProjectIds ?? [])],
      pruned: removed,
      pruned_by_project: [...prune.byProject],
      prune_batches: prune.batches,
      prune_complete: prune.complete,
    };
  };

  // 4. The summary, on the heartbeat written in step 1, or as the heartbeat if that failed.
  if (heartbeatId !== null) {
    const summary = summarize(true);
    try {
      await updateHeartbeat(client, heartbeatId, summary);
      return summary;
    } catch (error) {
      // The row from step 1 stands, marked unfinished; only this summary was lost.
      fail('heartbeat', error);
      return summarize(true);
    }
  }
  const summary = summarize(true);
  try {
    await insertHeartbeat(client, now, summary);
    return summary;
  } catch (error) {
    fail('heartbeat', error);
    return summarize(false);
  }
}
