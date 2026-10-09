import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createClient, type PostgrestSingleResponse } from '@supabase/supabase-js';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from '../../app/api/cron/daily/route.ts';
import { readIntegrationEnv } from '../../tests/int/env.ts';
import { toOstomate2BackfillRuns } from '../backfill/ostomate2-history.ts';
import { normalizeReport } from '../ingest/normalize.ts';
import { parseJunit } from '../parsers/index.ts';
import { addProject } from '../projects/repo.ts';
import { parseProjectFile } from '../projects/schema.ts';
import { createSecretClient } from '../supabase/server.ts';
import { CRON_SECRET_VAR } from './cron.ts';
import { pruneUntilDone, runDailyJob } from './daily.ts';
import { DailySummarySchema, type PruneBatch, PruneBatchSchema } from './summary.ts';

// Spec sections 5.11, 5.12 and 12, Phase 6: prune_expired and the daily job against local
// Supabase. Reports go through ingest_report as the route sends them (normalizeReport over real
// fixtures), with the receipt time passed in, so each run's finished_at, and so its age, is exact.
//
// The prune and the stale check act on the whole database, and other integration files run at the
// same time, so this file keeps to an era no other file writes in (before 1996; they write from
// 2001) and calls them only at instants in it: nothing of theirs has expired or reported by then.
// Its projects report every 1,000,000 days, so the alert tests' check_stale never finds them
// stale. Each test deletes what it wrote, so the counts one call returns are its own test's.

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const fixture = (path: string): string => readFileSync(`${repoRoot}fixtures/${path}`, 'utf8');

// 3 tests: 1 passed, 1 failed (one result_failures row), 1 skipped.
const ONE_FAILURE = fixture('testpulse/junit/vitest-one-failure.xml');
// 2,168 tests, all passed.
const UNIT = fixture('testpulse/junit/vitest-unit.xml');
// A real report with its test cases taken out, as lib/ingest/ingest.int.test.ts builds its empty
// report: the parser reads it as a report holding no tests.
const EMPTY = ONE_FAILURE.replace(/<testcase[\s\S]*?<\/testcase>\s*|<testcase [^>]*\/>\s*/g, '');

const historyRun = (() => {
  const [first] = toOstomate2BackfillRuns(
    JSON.parse(fixture('ostomate2/history/history.json')),
    'main',
  );
  if (first === undefined) throw new Error('the history fixture has no main run');
  return first;
})();

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const at = (base: string | Date, offsetMs: number): Date =>
  new Date((typeof base === 'string' ? Date.parse(base) : base.getTime()) + offsetMs);
const PERMISSION_DENIED = '42501';

function unwrap<T>(result: PostgrestSingleResponse<T>, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.code} ${result.error.message}`);
  return result.data;
}

describe('the daily job against Postgres (spec sections 5.12 and 12)', () => {
  const env = readIntegrationEnv();
  const admin = createSecretClient(process.env);
  const anon = createClient(env.url, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const suffix = randomUUID().slice(0, 8);
  const projectFile = parseProjectFile(
    readFileSync(`${repoRoot}projects/testpulse.yaml`, 'utf8'),
    'projects/testpulse.yaml',
  );

  interface Project {
    readonly id: string;
    readonly slug: string;
  }

  const register = async (name: string, retentionDays = 180): Promise<Project> => {
    const slug = `prune-${name}-${suffix}`;
    await addProject(admin, {
      ...projectFile,
      slug,
      retention_days: retentionDays,
      expected_cadence_days: 1_000_000,
    });
    const row = unwrap(
      await admin.from('projects').select('id').eq('slug', slug).single(),
      'select project',
    );
    return { id: row.id as string, slug };
  };

  const removeProjects = async () => {
    unwrap(
      await admin.from('projects').delete().like('slug', `prune-%-${suffix}`),
      'delete projects',
    );
  };

  // A CI run of one report, finished at `finishedAt` (ingest_report dates a report by receipt).
  const ingest = async (
    project: Project,
    ciRunId: string,
    finishedAt: Date,
    file: string = ONE_FAILURE,
  ): Promise<string> => {
    const payload = normalizeReport(
      {
        ci_run_id: ciRunId,
        run_attempt: 1,
        job: 'checks',
        module: 'unit',
        platform: 'node',
        commit_sha: '2ec580f377e52f0a1ae584661ff09b07821ea1e2',
        branch: 'main',
        event: 'push',
      },
      { id: project.id, layer_rules: [{ default: 'unit' }], name_normalization: {} },
      { format: 'junit', report: parseJunit([file]) },
      [],
      finishedAt,
    );
    const result = await admin.rpc('ingest_report', { payload });
    if (result.error) throw new Error(`ingest_report: ${result.error.message}`);
    return (result.data as { run_id: string }).run_id;
  };

  const backfill = async (project: Project, ciRunId: string, finishedAt: Date) => {
    const result = await admin.rpc('backfill_run', {
      payload: {
        project_id: project.id,
        ...historyRun,
        ci_run_id: ciRunId,
        run_url: historyRun.run_url?.replace(/\d+$/, ciRunId) ?? null,
        started_at: finishedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
      },
    });
    if (result.error) throw new Error(`backfill_run: ${result.error.message}`);
  };

  const prune = async (now: Date, batchSize?: number): Promise<PruneBatch> => {
    const args =
      batchSize === undefined
        ? { p_now: now.toISOString() }
        : { p_now: now.toISOString(), p_batch_size: batchSize };
    const result = await admin.rpc('prune_expired', args);
    if (result.error)
      throw new Error(`prune_expired: ${result.error.code} ${result.error.message}`);
    return PruneBatchSchema.parse(result.data);
  };

  interface RunState {
    readonly results: number;
    readonly failures: number;
    readonly prunedAt: string | null;
    readonly total: number;
    readonly reports: number;
  }

  // What is left of a run: its result and failure rows, its mark, and the rows that stay forever.
  const runState = async (runId: string): Promise<RunState> => {
    const run = unwrap(
      await admin.from('runs').select('results_pruned_at, total').eq('id', runId).single(),
      'select run',
    );
    const reports = unwrap(
      await admin.from('reports').select('id').eq('run_id', runId),
      'select reports',
    );
    const reportIds = reports.map((row) => row.id as string);
    const results = unwrap(
      await admin.from('results').select('id').in('report_id', reportIds),
      'select results',
    );
    const failures = unwrap(
      await admin
        .from('result_failures')
        .select('id')
        .in(
          'result_id',
          results.map((row) => row.id as string),
        ),
      'select failures',
    );
    return {
      results: results.length,
      failures: failures.length,
      prunedAt:
        run.results_pruned_at === null
          ? null
          : new Date(run.results_pruned_at as string).toISOString(),
      total: run.total as number,
      reports: reports.length,
    };
  };

  const KEPT = (prunedAt: string | null = null): RunState => ({
    results: 3,
    failures: 1,
    prunedAt,
    total: 3,
    reports: 1,
  });
  const PRUNED = (prunedAt: string): RunState => ({
    results: 0,
    failures: 0,
    prunedAt,
    total: 3,
    reports: 1,
  });
  const NOTHING = {
    results: 0,
    result_failures: 0,
    runs_marked_pruned: 0,
    visits: 0,
    rate_limit_buckets: 0,
    projects: [],
  };

  afterEach(async () => {
    vi.unstubAllEnvs();
    await removeProjects();
  });

  afterAll(async () => {
    await removeProjects();
  });

  describe('results and result_failures', () => {
    const BASE = '1991-01-01T00:00:00.000Z';

    it('removes them for expired runs beyond the latest 5, marks each run once, and touches nothing else', async () => {
      const project = await register('latest-five');
      // Another project's 6 runs are as old, but inside its 1,000-day retention.
      const other = await register('other', 1_000);
      const runs: string[] = [];
      const others: string[] = [];
      for (let day = 0; day < 7; day += 1) {
        runs.push(await ingest(project, `run-${day}`, at(BASE, day * DAY_MS)));
        if (day < 6) others.push(await ingest(other, `other-${day}`, at(BASE, day * DAY_MS)));
      }
      const testsBefore = unwrap(
        await admin.from('tests').select('id').eq('project_id', project.id),
        'select tests',
      ).length;
      // Every run is more than 180 days old; only the two oldest are not among the latest 5.
      const now = at(BASE, 300 * DAY_MS);

      expect(await prune(now)).toEqual({
        results: 6,
        result_failures: 2,
        runs_marked_pruned: 2,
        visits: 0,
        rate_limit_buckets: 0,
        projects: [
          {
            project_id: project.id,
            slug: project.slug,
            results: 6,
            result_failures: 2,
            runs_marked_pruned: 2,
          },
        ],
      });
      const stamp = now.toISOString();
      expect(await Promise.all(runs.map(runState))).toEqual([
        PRUNED(stamp),
        PRUNED(stamp),
        KEPT(),
        KEPT(),
        KEPT(),
        KEPT(),
        KEPT(),
      ]);
      expect(await Promise.all(others.map(runState))).toEqual(others.map(() => KEPT()));
      // Run rows, reports and their totals stay, and so do the tests' identity rows.
      expect(
        unwrap(await admin.from('tests').select('id').eq('project_id', project.id), 'select tests')
          .length,
      ).toBe(testsBefore);

      // Idempotent: nothing more to remove, and the mark does not move, on the same day or later.
      expect(await prune(now)).toEqual(NOTHING);
      expect(await prune(at(now, 30 * DAY_MS))).toEqual(NOTHING);
      expect((await runState(runs[0] ?? '')).prunedAt).toBe(stamp);
      expect((await runState(runs[1] ?? '')).prunedAt).toBe(stamp);

      // A newer run pushes the oldest kept one out of the latest 5; only that one is marked now.
      const later = at(now, 60 * DAY_MS);
      await ingest(project, 'run-7', at(BASE, 7 * DAY_MS));
      expect(await prune(later)).toMatchObject({
        results: 3,
        result_failures: 1,
        runs_marked_pruned: 1,
      });
      expect((await runState(runs[2] ?? '')).prunedAt).toBe(later.toISOString());
      expect((await runState(runs[0] ?? '')).prunedAt).toBe(stamp);
    });

    it('keeps the latest 5 CI runs that executed tests even when all have expired; imported and empty runs do not take their places', async () => {
      const project = await register('kept');
      const runs: string[] = [];
      // The two oldest finish at the same instant; section 11's order puts run-0a first.
      runs.push(await ingest(project, 'run-0a', at(BASE, 0)));
      runs.push(await ingest(project, 'run-0b', at(BASE, 0)));
      for (let day = 1; day < 5; day += 1) {
        runs.push(await ingest(project, `run-${day}`, at(BASE, day * DAY_MS)));
      }
      // Newer than every CI run above, and none holds a result.
      const empty = await ingest(project, 'run-empty', at(BASE, 10 * DAY_MS), EMPTY);
      await backfill(project, '91000001', at(BASE, 11 * DAY_MS));
      await backfill(project, '91000002', at(BASE, 12 * DAY_MS));
      expect(
        unwrap(await admin.from('runs').select('status').eq('id', empty).single(), 'empty'),
      ).toEqual({ status: 'empty' });

      const now = at(BASE, 1_000 * DAY_MS);
      expect(await prune(now)).toMatchObject({
        results: 3,
        result_failures: 1,
        runs_marked_pruned: 1,
      });
      expect(await Promise.all(runs.map(runState))).toEqual([
        PRUNED(now.toISOString()),
        KEPT(),
        KEPT(),
        KEPT(),
        KEPT(),
        KEPT(),
      ]);
      // A run with no results is never marked: nothing of it was removed.
      expect((await runState(empty)).prunedAt).toBeNull();
    });

    it('keeps every run of a project with 5 or fewer, however old', async () => {
      const project = await register('five');
      for (let day = 0; day < 5; day += 1)
        await ingest(project, `run-${day}`, at(BASE, day * DAY_MS));
      expect(await prune(at(BASE, 5_000 * DAY_MS))).toEqual(NOTHING);
    });

    it('expires a run at exactly retention_days × 24 hours after it finished, not 1 ms before', async () => {
      const project = await register('boundary', 10);
      const old = await ingest(project, 'run-old', at(BASE, 0));
      for (let hour = 1; hour <= 5; hour += 1)
        await ingest(project, `run-${hour}`, at(BASE, hour * HOUR_MS));
      const finished = unwrap(
        await admin.from('runs').select('finished_at').eq('id', old).single(),
        'select finished_at',
      );
      expect(new Date(finished.finished_at as string).toISOString()).toBe(BASE);
      const boundary = at(BASE, 10 * DAY_MS);

      expect(await prune(at(boundary, -1))).toEqual(NOTHING);
      expect(await runState(old)).toEqual(KEPT());
      // retention_days 10, not the default 180.
      expect(await prune(boundary)).toMatchObject({
        results: 3,
        result_failures: 1,
        runs_marked_pruned: 1,
      });
      expect(await runState(old)).toEqual(PRUNED(boundary.toISOString()));
    });

    it('never removes more rows than the batch in one call, counting each failure, and marks a run when its first results go', async () => {
      const project = await register('batch');
      const runs: string[] = [];
      for (let day = 0; day < 7; day += 1)
        runs.push(await ingest(project, `run-${day}`, at(BASE, day * DAY_MS)));
      const now = at(BASE, 300 * DAY_MS);
      // Two expired runs: 6 results and 2 failures, 8 rows.
      const batches: PruneBatch[] = [];
      for (;;) {
        const batch = await prune(now, 3);
        batches.push(batch);
        if (batch.results + batch.result_failures === 0) break;
        expect(batch.results + batch.result_failures).toBeLessThanOrEqual(3);
      }
      expect(batches.length).toBeGreaterThanOrEqual(4);
      const sum = (key: 'results' | 'result_failures' | 'runs_marked_pruned') =>
        batches.reduce((total, batch) => total + batch[key], 0);
      expect([sum('results'), sum('result_failures'), sum('runs_marked_pruned')]).toEqual([
        6, 2, 2,
      ]);
      // The first batch reached only the oldest run, and marked it though results were left.
      expect(batches[0]?.runs_marked_pruned).toBe(1);
      expect(await Promise.all(runs.slice(0, 2).map(runState))).toEqual([
        PRUNED(now.toISOString()),
        PRUNED(now.toISOString()),
      ]);
    });

    it('removes at most 5,000 rows per call by default', async () => {
      const project = await register('default-batch');
      // 3 expired runs of 2,168 results each (6,504 rows, no failures), then 5 kept.
      for (let day = 0; day < 3; day += 1)
        await ingest(project, `big-${day}`, at(BASE, day * DAY_MS), UNIT);
      for (let day = 3; day < 8; day += 1)
        await ingest(project, `run-${day}`, at(BASE, day * DAY_MS));
      const now = at(BASE, 300 * DAY_MS);
      expect(await prune(now)).toMatchObject({
        results: 5_000,
        result_failures: 0,
        runs_marked_pruned: 3,
      });
      expect(await prune(now)).toMatchObject({
        results: 1_504,
        result_failures: 0,
        runs_marked_pruned: 0,
      });
      expect(await prune(now)).toEqual(NOTHING);
    }, 60_000);

    it('refuses a missing now and a batch outside 2 to 5,000, removing nothing', async () => {
      const now = at(BASE, 0).toISOString();
      for (const [args, message] of [
        [{ p_now: null }, 'p_now must not be null'],
        [{ p_now: now, p_batch_size: 1 }, 'between 2 and 5000'],
        [{ p_now: now, p_batch_size: 5_001 }, 'between 2 and 5000'],
      ] as const) {
        const result = await admin.rpc('prune_expired', args);
        expect(result.error?.message).toContain(message);
      }
    });
  });

  describe('visits and rate-limit buckets', () => {
    const NOW = new Date('1993-06-15T12:00:00.000Z');
    const KEY_HASH = `prune-test-${suffix}`;

    afterEach(async () => {
      unwrap(await admin.from('visits').delete().like('session_id', `prune-${suffix}-%`), 'visits');
      unwrap(
        await admin.from('rate_limit_buckets').delete().like('api_key_hash', `${KEY_HASH}%`),
        'buckets',
      );
    });

    it('removes visits 365 days after they began and buckets one day after their minute', async () => {
      const visit = (label: string, enteredAt: Date) => ({
        session_id: `prune-${suffix}-${label}`,
        path: '/',
        entered_at: enteredAt.toISOString(),
        user_agent_class: 'browser',
        ip_hash: 'not-a-real-hash',
      });
      unwrap(
        await admin
          .from('visits')
          .insert([
            visit('expired', at(NOW, -365 * DAY_MS)),
            visit('older', at(NOW, -400 * DAY_MS)),
            visit('kept', at(NOW, -365 * DAY_MS + 1)),
          ]),
        'insert visits',
      );
      const bucket = (label: string, minute: Date) => ({
        api_key_hash: `${KEY_HASH}-${label}`,
        minute: minute.toISOString(),
        count: 1,
      });
      unwrap(
        await admin
          .from('rate_limit_buckets')
          .insert([
            bucket('expired', at(NOW, -DAY_MS)),
            bucket('older', at(NOW, -2 * DAY_MS)),
            bucket('kept', at(NOW, -DAY_MS + 60_000)),
          ]),
        'insert buckets',
      );

      // 1 ms before, only the rows already past their window go.
      expect(await prune(at(NOW, -1))).toEqual({ ...NOTHING, visits: 1, rate_limit_buckets: 1 });
      expect(await prune(NOW)).toEqual({ ...NOTHING, visits: 1, rate_limit_buckets: 1 });
      expect(await prune(NOW)).toEqual(NOTHING);

      const visits = unwrap(
        await admin.from('visits').select('session_id').like('session_id', `prune-${suffix}-%`),
        'select visits',
      );
      expect(visits.map((row) => row.session_id)).toEqual([`prune-${suffix}-kept`]);
      const buckets = unwrap(
        await admin
          .from('rate_limit_buckets')
          .select('api_key_hash')
          .like('api_key_hash', `${KEY_HASH}%`),
        'select buckets',
      );
      expect(buckets.map((row) => row.api_key_hash)).toEqual([`${KEY_HASH}-kept`]);
    });

    it('fills a batch with results first, then visits, then buckets', async () => {
      const project = await register('mixed');
      const base = at(NOW, -300 * DAY_MS);
      for (let day = 0; day < 6; day += 1)
        await ingest(project, `run-${day}`, at(base, day * DAY_MS));
      unwrap(
        await admin.from('visits').insert(
          [1, 2, 3].map((n) => ({
            session_id: `prune-${suffix}-${n}`,
            path: '/',
            entered_at: at(NOW, -500 * DAY_MS).toISOString(),
            user_agent_class: 'browser',
            ip_hash: 'not-a-real-hash',
          })),
        ),
        'insert visits',
      );
      unwrap(
        await admin.from('rate_limit_buckets').insert(
          [1, 2].map((n) => ({
            api_key_hash: `${KEY_HASH}-${n}`,
            minute: at(NOW, -3 * DAY_MS).toISOString(),
            count: 1,
          })),
        ),
        'insert buckets',
      );
      // 3 results and 1 failure (4 rows), then 2 of the 3 visits fill a batch of 6.
      expect(await prune(NOW, 6)).toMatchObject({
        results: 3,
        result_failures: 1,
        visits: 2,
        rate_limit_buckets: 0,
      });
      expect(await prune(NOW, 6)).toMatchObject({ results: 0, visits: 1, rate_limit_buckets: 2 });
      expect(await prune(NOW, 6)).toEqual(NOTHING);
    });
  });

  describe('access', () => {
    it('refuses anon', async () => {
      const result = await anon.rpc('prune_expired', { p_now: '1990-01-01T00:00:00.000Z' });
      expect(result.error?.code).toBe(PERMISSION_DENIED);
    });

    it('grants execute to service_role only', () => {
      // The catalog, read through the Supabase CLI as lib/visibility/realtime.int.test.ts does;
      // --local pins it to the local stack.
      const result = spawnSync(
        'supabase',
        [
          'db',
          'query',
          '--local',
          '--agent',
          'no',
          '--output-format',
          'json',
          'select r.rolname as role, has_function_privilege(r.rolname, ' +
            "'public.prune_expired(timestamptz, integer)', 'execute') as allowed " +
            "from pg_roles r where r.rolname in ('anon', 'authenticated', 'service_role') " +
            'order by 1',
        ],
        { cwd: repoRoot, encoding: 'utf8' },
      );
      if (result.status !== 0) {
        throw new Error(`supabase db query exited ${String(result.status)}: ${result.stderr}`);
      }
      expect(JSON.parse(result.stdout)).toEqual([
        { role: 'anon', allowed: false },
        { role: 'authenticated', allowed: false },
        { role: 'service_role', allowed: true },
      ]);
    });

    it('keeps heartbeats closed to anon', async () => {
      const result = await anon.from('heartbeats').select('summary').limit(1);
      expect(result.error?.code).toBe(PERMISSION_DENIED);
    });
  });

  describe('the job through GET /api/cron/daily', () => {
    // Before every other file's data: check_stale finds no project that has reported.
    const NOW = '1985-03-01T04:00:00.000Z';
    const SECRET = `int-test-cron-secret-${suffix}`;

    afterEach(async () => {
      unwrap(await admin.from('heartbeats').delete().eq('created_at', NOW), 'delete heartbeats');
    });

    it('writes the heartbeat with its summary, checks staleness and prunes, at the fixed now', async () => {
      const project = await register('job', 30);
      for (let day = 0; day < 6; day += 1) {
        await ingest(project, `run-${day}`, at('1984-01-01T00:00:00.000Z', day * DAY_MS));
      }
      vi.stubEnv(CRON_SECRET_VAR, SECRET);
      vi.stubEnv('TESTPULSE_FIXED_NOW', NOW);
      vi.spyOn(console, 'info').mockImplementation(() => undefined);

      const response = await GET(
        new Request('http://127.0.0.1:3000/api/cron/daily', {
          headers: { authorization: `Bearer ${SECRET}` },
        }),
      );
      expect(response.status).toBe(200);
      const body = DailySummarySchema.parse(await response.json());
      expect(body).toMatchObject({
        started_at: NOW,
        status: 'ok',
        failed_step: null,
        failed_steps: [],
        heartbeat_written: true,
        stale_opened: 0,
        stale_opened_project_ids: [],
        pruned: {
          results: 3,
          result_failures: 1,
          visits: 0,
          rate_limit_buckets: 0,
          runs_marked_pruned: 1,
        },
        pruned_by_project: [
          {
            project_id: project.id,
            slug: project.slug,
            results: 3,
            result_failures: 1,
            runs_marked_pruned: 1,
          },
        ],
        prune_batches: 2,
        prune_complete: true,
      });
      expect(body.projects_checked).toBeGreaterThanOrEqual(1);

      const rows = unwrap(
        await admin.from('heartbeats').select('created_at, summary').eq('created_at', NOW),
        'select heartbeats',
      );
      expect(rows).toHaveLength(1);
      expect(new Date(rows[0]?.created_at as string).toISOString()).toBe(NOW);
      expect(DailySummarySchema.parse(rows[0]?.summary)).toEqual(body);
    });

    it('writes a heartbeat even when the prune fails, and answers 500', async () => {
      vi.stubEnv(CRON_SECRET_VAR, SECRET);
      vi.stubEnv('TESTPULSE_FIXED_NOW', NOW);
      vi.spyOn(console, 'info').mockImplementation(() => undefined);
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      // A real failure from the real function: a batch it refuses.
      const summary = await runDailyJob(admin, new Date(NOW), {
        batchSize: 1,
        log: { info: () => undefined, error: () => undefined },
      });
      expect(summary).toMatchObject({
        status: 'failed',
        failed_step: 'prune',
        failed_steps: ['prune'],
        heartbeat_written: true,
        stale_opened: 0,
        prune_complete: false,
      });
      expect(summary.error).toContain('between 2 and 5000');
      const rows = unwrap(
        await admin.from('heartbeats').select('summary').eq('created_at', NOW),
        'select heartbeats',
      );
      expect(rows.map((row) => DailySummarySchema.parse(row.summary))).toEqual([summary]);
    });

    it('answers 401 and writes nothing without the secret', async () => {
      vi.stubEnv(CRON_SECRET_VAR, SECRET);
      vi.stubEnv('TESTPULSE_FIXED_NOW', NOW);
      const response = await GET(new Request('http://127.0.0.1:3000/api/cron/daily'));
      expect(response.status).toBe(401);
      expect(
        unwrap(await admin.from('heartbeats').select('id').eq('created_at', NOW), 'select'),
      ).toEqual([]);
    });
  });

  it('prunes in batches until one removes nothing', async () => {
    const project = await register('until-done');
    for (let day = 0; day < 8; day += 1)
      await ingest(project, `run-${day}`, at('1992-01-01T00:00:00.000Z', day * DAY_MS));
    const outcome = await pruneUntilDone(admin, new Date('1993-01-01T00:00:00.000Z'), {
      batchSize: 4,
    });
    // 3 expired runs of 4 rows each, one run per batch, then an empty batch.
    expect(outcome).toMatchObject({ batches: 4, complete: true, error: null });
    expect(outcome.removed).toEqual({
      results: 9,
      result_failures: 3,
      visits: 0,
      rate_limit_buckets: 0,
      runs_marked_pruned: 3,
    });
  });
});
