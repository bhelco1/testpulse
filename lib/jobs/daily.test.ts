import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import {
  PRUNE_BATCH_SIZE,
  PRUNE_BUDGET_MS,
  pruneUntilDone,
  runDailyJob,
  type DailyJobOptions,
} from './daily.ts';
import { DailySummarySchema, type PruneBatch, UNFINISHED } from './summary.ts';

// The daily job's orchestration (spec section 12): the steps' order, each step's failure caught
// and recorded while the later steps still run, the summary's shape, and the prune's batches and
// time budget. What the database functions do is proven against Postgres in
// lib/jobs/daily.int.test.ts.

const NOW = new Date('2026-10-08T05:00:00.000Z');
const HEARTBEAT_ID = '0b7e3a52-6c1d-4f0e-9a8b-3c2d1e0f9a8b';
const PROJECT_A = '1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d';
const PROJECT_B = '9f8e7d6c-5b4a-4f3e-9d2c-1b0a9f8e7d6c';

type Call =
  | { kind: 'rpc'; fn: string; args: Record<string, unknown> }
  | { kind: 'from'; table: string; calls: Array<[string, ...unknown[]]> };

interface Answer {
  data?: unknown;
  error?: { code: string; message: string } | null;
  count?: number | null;
}

type Responder = (call: Call, index: number) => Answer;

function fakeClient(respond: Responder) {
  const calls: Call[] = [];
  const settle = (call: Call) => {
    calls.push(call);
    const { data = null, error = null, count = null } = respond(call, calls.length - 1);
    return { data, error, count };
  };
  const chain = (call: Extract<Call, { kind: 'from' }>): unknown =>
    new Proxy(
      {},
      {
        get: (_, property) => {
          if (property === 'then') {
            return (resolve: (value: unknown) => void) => resolve(settle(call));
          }
          return (...args: unknown[]) =>
            chain({ ...call, calls: [...call.calls, [String(property), ...args]] });
        },
      },
    );
  const client = {
    from: (table: string) => chain({ kind: 'from', table, calls: [] }),
    rpc: async (fn: string, args: Record<string, unknown>) => settle({ kind: 'rpc', fn, args }),
  } as unknown as SupabaseClient;
  return { client, calls };
}

const batch = (overrides: Partial<PruneBatch> = {}): PruneBatch => ({
  results: 0,
  result_failures: 0,
  runs_marked_pruned: 0,
  visits: 0,
  rate_limit_buckets: 0,
  projects: [],
  ...overrides,
});

const removedA = batch({
  results: 4_000,
  result_failures: 1_000,
  runs_marked_pruned: 3,
  projects: [
    {
      project_id: PROJECT_A,
      slug: 'ostomate2',
      results: 4_000,
      result_failures: 1_000,
      runs_marked_pruned: 3,
    },
  ],
});
const removedB = batch({
  results: 10,
  result_failures: 0,
  runs_marked_pruned: 1,
  visits: 7,
  rate_limit_buckets: 20,
  projects: [
    {
      project_id: PROJECT_A,
      slug: 'ostomate2',
      results: 6,
      result_failures: 0,
      runs_marked_pruned: 0,
    },
    {
      project_id: PROJECT_B,
      slug: 'routeserve',
      results: 4,
      result_failures: 0,
      runs_marked_pruned: 1,
    },
  ],
});

const fail = (message: string) => ({ error: { code: 'XX000', message } });

interface Script {
  /** Answers to the heartbeat writes, in order; by default the insert and the update succeed. */
  readonly heartbeats?: readonly Answer[];
  readonly projects?: Answer;
  readonly checkStale?: Answer;
  readonly opened?: Answer;
  readonly prune?: readonly Answer[];
}

// Answers each call the job makes from a script; anything unexpected fails the test.
function scripted(script: Script) {
  let pruneCall = 0;
  let heartbeatCall = 0;
  return fakeClient((call) => {
    if (call.kind === 'rpc' && call.fn === 'check_stale') return script.checkStale ?? { data: 0 };
    if (call.kind === 'rpc' && call.fn === 'prune_expired') {
      const answer = script.prune?.[pruneCall] ?? { data: batch() };
      pruneCall += 1;
      return answer;
    }
    if (call.kind === 'from' && call.table === 'heartbeats') {
      const isInsert = call.calls.some(([name]) => name === 'insert');
      const answer =
        script.heartbeats?.[heartbeatCall] ?? (isInsert ? { data: { id: HEARTBEAT_ID } } : {});
      heartbeatCall += 1;
      return answer;
    }
    if (call.kind === 'from' && call.table === 'projects') return script.projects ?? { count: 3 };
    if (call.kind === 'from' && call.table === 'alerts') return script.opened ?? { data: [] };
    throw new Error(`unexpected call ${JSON.stringify(call)}`);
  });
}

const quiet = { info: () => undefined, error: () => undefined };
const options = (overrides: Partial<DailyJobOptions> = {}): DailyJobOptions => ({
  elapsedMs: () => 1_234,
  log: quiet,
  ...overrides,
});

const stepOf = (call: Call): string =>
  call.kind === 'rpc'
    ? call.fn
    : `${call.table}.${call.calls.find(([name]) => ['insert', 'update', 'select'].includes(name))?.[0]}`;

describe('runDailyJob', () => {
  it('writes the heartbeat first, then checks staleness, prunes, and saves the summary on it', async () => {
    const fake = scripted({
      checkStale: { data: 1 },
      opened: { data: [{ project_id: PROJECT_B }] },
      prune: [{ data: removedA }, { data: removedB }, { data: batch() }],
    });
    const summary = await runDailyJob(fake.client, NOW, options());

    expect(fake.calls.map(stepOf)).toEqual([
      'heartbeats.insert',
      'projects.select',
      'check_stale',
      'alerts.select',
      'prune_expired',
      'prune_expired',
      'prune_expired',
      'heartbeats.update',
    ]);
    expect(DailySummarySchema.parse(summary)).toEqual({
      started_at: '2026-10-08T05:00:00.000Z',
      finished_at: '2026-10-08T05:00:01.234Z',
      status: 'ok',
      failed_step: null,
      error: null,
      failed_steps: [],
      heartbeat_written: true,
      projects_checked: 3,
      stale_opened: 1,
      stale_opened_project_ids: [PROJECT_B],
      pruned: {
        results: 4_010,
        result_failures: 1_000,
        visits: 7,
        rate_limit_buckets: 20,
        runs_marked_pruned: 4,
      },
      pruned_by_project: [
        {
          project_id: PROJECT_A,
          slug: 'ostomate2',
          results: 4_006,
          result_failures: 1_000,
          runs_marked_pruned: 3,
        },
        {
          project_id: PROJECT_B,
          slug: 'routeserve',
          results: 4,
          result_failures: 0,
          runs_marked_pruned: 1,
        },
      ],
      prune_batches: 3,
      prune_complete: true,
    });
  });

  it('dates the heartbeat by the given now and writes an unfinished summary before any step', async () => {
    const fake = scripted({});
    await runDailyJob(fake.client, NOW, options());
    const insert = fake.calls[0];
    if (insert?.kind !== 'from') throw new Error('the first call was not the heartbeat');
    const [, row] = insert.calls.find(([name]) => name === 'insert') ?? [];
    const { created_at, summary } = row as { created_at: string; summary: unknown };
    expect(created_at).toBe('2026-10-08T05:00:00.000Z');
    expect(DailySummarySchema.parse(summary)).toMatchObject({
      started_at: '2026-10-08T05:00:00.000Z',
      finished_at: null,
      status: 'failed',
      failed_step: null,
      error: UNFINISHED,
      failed_steps: [],
      heartbeat_written: true,
      stale_opened: null,
      prune_batches: 0,
      prune_complete: false,
    });
  });

  it('updates the heartbeat it wrote, by its id, with the final summary', async () => {
    const fake = scripted({});
    const summary = await runDailyJob(fake.client, NOW, options());
    const update = fake.calls.at(-1);
    if (update?.kind !== 'from') throw new Error('the last call was not the heartbeat');
    expect(update.calls).toContainEqual(['update', { summary }]);
    expect(update.calls).toContainEqual(['eq', 'id', HEARTBEAT_ID]);
  });

  it('reads the stale alerts this check opened by the given now', async () => {
    const fake = scripted({});
    await runDailyJob(fake.client, NOW, options());
    const opened = fake.calls.find((call) => call.kind === 'from' && call.table === 'alerts');
    if (opened?.kind !== 'from') throw new Error('no alerts query');
    expect(opened.calls).toContainEqual(['eq', 'kind', 'stale']);
    expect(opened.calls).toContainEqual(['eq', 'opened_at', '2026-10-08T05:00:00.000Z']);
    const stale = fake.calls.find((call) => call.kind === 'rpc' && call.fn === 'check_stale');
    expect(stale).toEqual({
      kind: 'rpc',
      fn: 'check_stale',
      args: { p_now: '2026-10-08T05:00:00.000Z' },
    });
  });

  it('still checks staleness and prunes when the heartbeat fails, then writes it at the end', async () => {
    const fake = scripted({
      heartbeats: [fail('connection reset'), { data: { id: HEARTBEAT_ID } }],
      prune: [{ data: removedB }],
    });
    const summary = await runDailyJob(fake.client, NOW, options());
    expect(fake.calls.map(stepOf)).toEqual([
      'heartbeats.insert',
      'projects.select',
      'check_stale',
      'alerts.select',
      'prune_expired',
      'prune_expired',
      'heartbeats.insert',
    ]);
    expect(DailySummarySchema.parse(summary)).toMatchObject({
      status: 'failed',
      failed_step: 'heartbeat',
      error: 'heartbeats insert: XX000 connection reset',
      failed_steps: ['heartbeat'],
      heartbeat_written: true,
      stale_opened: 0,
      prune_complete: true,
    });
    expect(summary.pruned.results).toBe(10);
    const final = fake.calls.at(-1);
    if (final?.kind !== 'from') throw new Error('no final heartbeat');
    expect(final.calls).toContainEqual(['insert', { created_at: NOW.toISOString(), summary }]);
  });

  it('records a heartbeat that could not be written at all, and still runs every step', async () => {
    const paused = fail('database is paused');
    const fake = scripted({ heartbeats: [paused, paused] });
    const summary = await runDailyJob(fake.client, NOW, options());
    expect(fake.calls.map(stepOf)).toContain('check_stale');
    expect(fake.calls.map(stepOf)).toContain('prune_expired');
    expect(DailySummarySchema.parse(summary)).toMatchObject({
      status: 'failed',
      failed_step: 'heartbeat',
      failed_steps: ['heartbeat'],
      heartbeat_written: false,
      error: 'heartbeats insert: XX000 database is paused',
    });
  });

  it('records a failed stale check and still prunes', async () => {
    const fake = scripted({
      checkStale: fail('check_stale exploded'),
      prune: [{ data: removedA }, { data: batch() }],
    });
    const summary = await runDailyJob(fake.client, NOW, options());
    expect(fake.calls.map(stepOf)).toEqual([
      'heartbeats.insert',
      'projects.select',
      'check_stale',
      'prune_expired',
      'prune_expired',
      'heartbeats.update',
    ]);
    expect(DailySummarySchema.parse(summary)).toMatchObject({
      status: 'failed',
      failed_step: 'stale_check',
      error: 'check_stale: XX000 check_stale exploded',
      failed_steps: ['stale_check'],
      heartbeat_written: true,
      projects_checked: null,
      stale_opened: null,
      stale_opened_project_ids: [],
      prune_complete: true,
    });
    expect(summary.pruned.results).toBe(4_000);
  });

  it('counts the projects before the check, and fails the step if it cannot', async () => {
    const fake = scripted({ projects: fail('no projects table') });
    const summary = await runDailyJob(fake.client, NOW, options());
    expect(fake.calls.map(stepOf)).not.toContain('check_stale');
    expect(summary).toMatchObject({
      failed_step: 'stale_check',
      error: 'count projects: XX000 no projects table',
      projects_checked: null,
    });
  });

  it('keeps the rows of batches that committed when a later batch fails', async () => {
    const fake = scripted({
      prune: [{ data: removedA }, fail('canceling statement due to lock timeout')],
    });
    const summary = await runDailyJob(fake.client, NOW, options());
    expect(DailySummarySchema.parse(summary)).toMatchObject({
      status: 'failed',
      failed_step: 'prune',
      error: 'prune_expired: XX000 canceling statement due to lock timeout',
      failed_steps: ['prune'],
      stale_opened: 0,
      prune_batches: 1,
      prune_complete: false,
    });
    expect(summary.pruned).toEqual({
      results: 4_000,
      result_failures: 1_000,
      visits: 0,
      rate_limit_buckets: 0,
      runs_marked_pruned: 3,
    });
    expect(summary.pruned_by_project).toEqual(removedA.projects);
  });

  it('names every failed step, the first in step order as failed_step', async () => {
    const fake = scripted({
      checkStale: fail('stale broke'),
      prune: [fail('prune broke')],
      heartbeats: [{ data: { id: HEARTBEAT_ID } }, fail('update broke')],
    });
    const summary = await runDailyJob(fake.client, NOW, options());
    expect(summary).toMatchObject({
      status: 'failed',
      failed_step: 'heartbeat',
      failed_steps: ['heartbeat', 'stale_check', 'prune'],
      error: 'heartbeats update: XX000 update broke',
      // The row from the start exists; only its final summary was lost.
      heartbeat_written: true,
    });
  });

  it('refuses a prune answer that is not the expected shape', async () => {
    const fake = scripted({ prune: [{ data: { results: 'many' } }] });
    const summary = await runDailyJob(fake.client, NOW, options());
    expect(summary).toMatchObject({
      failed_step: 'prune',
      error: 'prune_expired returned an unexpected result',
    });
  });

  it('caps a long error and never stores an empty one', async () => {
    const fake = scripted({ checkStale: fail('x'.repeat(5_000)) });
    const summary = await runDailyJob(fake.client, NOW, options());
    expect(summary.error).toHaveLength(300);
    expect(summary.error?.endsWith('…')).toBe(true);
    expect(DailySummarySchema.safeParse(summary).success).toBe(true);
  });

  it('logs the rows removed per project, and each failure', async () => {
    const info: string[] = [];
    const errors: string[] = [];
    const fake = scripted({
      checkStale: fail('stale broke'),
      prune: [{ data: removedB }, { data: batch() }],
    });
    await runDailyJob(
      fake.client,
      NOW,
      options({ log: { info: (l) => info.push(l), error: (l) => errors.push(l) } }),
    );
    expect(info).toEqual([
      'testpulse daily: pruned ostomate2: 6 results, 0 result_failures, 0 runs marked pruned',
      'testpulse daily: pruned routeserve: 4 results, 0 result_failures, 1 runs marked pruned',
      'testpulse daily: pruned 10 results, 0 result_failures, 7 visits, 20 rate_limit_buckets, 1 runs marked pruned in 2 batches',
    ]);
    expect(errors).toEqual(['testpulse daily: stale_check failed: check_stale: XX000 stale broke']);
  });
});

describe('pruneUntilDone', () => {
  it('passes the given now and a batch of 5,000', async () => {
    expect(PRUNE_BATCH_SIZE).toBe(5_000);
    const fake = scripted({});
    await pruneUntilDone(fake.client, NOW, options());
    expect(fake.calls).toEqual([
      { kind: 'rpc', fn: 'prune_expired', args: { p_now: NOW.toISOString(), p_batch_size: 5_000 } },
    ]);
  });

  it('stops when a batch removes nothing, even if it marked no runs', async () => {
    const fake = scripted({ prune: [{ data: removedA }, { data: removedA }, { data: batch() }] });
    const outcome = await pruneUntilDone(fake.client, NOW, options());
    expect(outcome).toMatchObject({ batches: 3, complete: true, error: null });
    expect(outcome.removed.results).toBe(8_000);
  });

  it('starts no batch once the budget is used, and says the prune is not complete', async () => {
    // Each batch takes 100 s by the stopwatch; the budget is 240 s.
    expect(PRUNE_BUDGET_MS).toBe(240_000);
    let elapsed = 0;
    const fake = scripted({ prune: Array.from({ length: 10 }, () => ({ data: removedA })) });
    const outcome = await pruneUntilDone(
      fake.client,
      NOW,
      options({
        elapsedMs: () => {
          const now = elapsed;
          elapsed += 100_000;
          return now;
        },
      }),
    );
    // Checked at 0, 100 and 200 s (run), then at 300 s (stop).
    expect(outcome).toMatchObject({ batches: 3, complete: false, error: null });
    expect(outcome.removed.results).toBe(12_000);
  });

  it('starts nothing when the budget was used before the prune began', async () => {
    const fake = scripted({});
    const outcome = await pruneUntilDone(
      fake.client,
      NOW,
      options({ elapsedMs: () => PRUNE_BUDGET_MS }),
    );
    expect(fake.calls).toEqual([]);
    expect(outcome).toMatchObject({ batches: 0, complete: false, error: null });
  });

  it('takes a smaller batch and budget when given', async () => {
    const fake = scripted({});
    await pruneUntilDone(fake.client, NOW, options({ batchSize: 50, budgetMs: 1_235 }));
    expect(fake.calls).toEqual([
      { kind: 'rpc', fn: 'prune_expired', args: { p_now: NOW.toISOString(), p_batch_size: 50 } },
    ]);
  });
});
