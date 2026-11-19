import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createClient, type PostgrestSingleResponse } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readIntegrationEnv } from '../../tests/int/env.ts';
import { sql, sqlInBackground } from '../../tests/int/sql.ts';
import { loadOpenAlerts } from '../admin/data.ts';
import { ReportNotProcessedAlertSchema } from '../alerts/schema.ts';
import { parseJunit } from '../parsers/index.ts';
import { addProject } from '../projects/repo.ts';
import { parseProjectFile } from '../projects/schema.ts';
import { createSecretClient } from '../supabase/server.ts';
import { type IngestInput, ingestReport, type IngestResponse } from './ingest.ts';
import { ReportMetaSchema } from './meta.ts';
import { type IngestPayload, type IngestProject, normalizeReport } from './normalize.ts';

// Spec section 6.6 and decision 2026-11-18: a report the route accepts is stored before it is
// processed, so a database too busy to ingest it in time loses nothing. The route answers 202
// for what it could not finish; process_report_inbox, run every minute by pg_cron, finishes it,
// retries what fails, and parks a row after 5 tries with a report_not_processed alert.
//
// The minute's drain is paused for this file, so a row stays as a step left it until the test
// itself calls the drain; the schedule is checked on its own at the end, with the drain active.

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const SHARED_DIR = `${repoRoot}fixtures/ostomate2/junit/jvm/shared`;
const SHARED = readdirSync(SHARED_DIR)
  .filter((name) => name.endsWith('.xml'))
  .sort()
  .map((name) => readFileSync(`${SHARED_DIR}/${name}`, 'utf8'));
const PERMISSION_DENIED = '42501';
const DRAIN_JOB = 'process-report-inbox';

function unwrap<T>(result: PostgrestSingleResponse<T>, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.code} ${result.error.message}`);
  return result.data;
}

const drain = () => sql('call public.process_report_inbox()');
const setDrainActive = (active: boolean) =>
  sql(
    `select cron.alter_job(jobid, active := ${String(active)}) from cron.job ` +
      `where jobname = '${DRAIN_JOB}'`,
  );

const meta = (ciRunId: string) =>
  JSON.stringify({
    ci_run_id: ciRunId,
    job: 'android',
    module: 'shared',
    platform: 'jvm',
    commit_sha: '2ec580f377e52f0a1ae584661ff09b07821ea1e2',
    branch: 'main',
    event: 'push',
  });

const form = (ciRunId: string): FormData => {
  const data = new FormData();
  data.append('meta', meta(ciRunId));
  SHARED.forEach((file, index) => data.append('junit', new Blob([file]), `TEST-${index}.xml`));
  return data;
};

function acceptedId(response: IngestResponse): string {
  if (response.status !== 202) throw new Error(`expected 202, got ${String(response.status)}`);
  return response.body.inbox_id;
}

async function until(check: () => Promise<boolean>, what: string, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

describe('report inbox (spec section 6.6, decision 2026-11-18)', () => {
  const env = readIntegrationEnv();
  const admin = createSecretClient(process.env);
  const anon = createClient(env.url, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const suffix = randomUUID().slice(0, 8);
  const slug = `inbox-${suffix}`;
  let key: string;
  let projectId: string;
  let project: IngestProject;

  const input = (ciRunId: string, receivedAt = new Date()): IngestInput => ({
    authorization: `Bearer ${key}`,
    contentLength: null,
    contentEncoding: null,
    formData: async () => form(ciRunId),
    receivedAt,
  });

  const payloadFor = (ciRunId: string, receivedAt: Date): IngestPayload =>
    normalizeReport(
      ReportMetaSchema.parse(JSON.parse(meta(ciRunId))),
      project,
      { format: 'junit', report: parseJunit(SHARED) },
      [],
      receivedAt,
    );

  const inboxRow = async (id: string) =>
    unwrap(
      await admin
        .from('report_inbox')
        .select(
          'project_id, payload, received_at, status, attempts, last_error, processed_at, result',
        )
        .eq('id', id)
        .single(),
      'select inbox row',
    );

  const inboxIdsFor = async (ciRunId: string): Promise<string[]> =>
    unwrap(
      await admin
        .from('report_inbox')
        .select('id')
        .eq('project_id', projectId)
        .eq('payload->run->>ci_run_id', ciRunId),
      'select inbox ids',
    ).map((row) => row.id as string);

  const reportsFor = async (ciRunId: string) => {
    const runs = unwrap(
      await admin.from('runs').select('id').eq('project_id', projectId).eq('ci_run_id', ciRunId),
      'select runs',
    );
    if (runs.length === 0) return [];
    return unwrap(
      await admin
        .from('reports')
        .select('id, total, received_at')
        .in(
          'run_id',
          runs.map((run) => run.id as string),
        ),
      'select reports',
    );
  };

  // Holds the project row from another session, as a busy database would: ingest_report locks
  // it before writing, so a try waits until the hold ends.
  const holdProject = (seconds: number): Promise<void> =>
    sqlInBackground(
      `with held as materialized (select id from public.projects where id = '${projectId}' ` +
        `for update) select pg_sleep(${String(seconds)}) from held`,
    );
  const holding = async () =>
    sql(
      "select pid from pg_stat_activity where wait_event = 'PgSleep' " +
        "and query ilike '%for update%'",
    ).length > 0;
  const waitingTry = () =>
    sql(
      "select pid from pg_stat_activity where wait_event_type = 'Lock' " +
        "and query ilike '%ingest_stored_report%'",
    );
  const endHold = () =>
    sql(
      "select pg_cancel_backend(pid) from pg_stat_activity where query ilike '%pg_sleep(%' " +
        "and query ilike '%for update%' and pid <> pg_backend_pid()",
    );

  beforeAll(async () => {
    setDrainActive(false);
    const file = parseProjectFile(
      readFileSync(`${repoRoot}projects/ostomate2.yaml`, 'utf8'),
      'projects/ostomate2.yaml',
    );
    key = await addProject(admin, { ...file, slug });
    project = unwrap(
      await admin
        .from('projects')
        .select('id, layer_rules, name_normalization')
        .eq('slug', slug)
        .single(),
      'select project',
    ) as IngestProject;
    projectId = project.id;
  });

  afterAll(async () => {
    setDrainActive(true);
    unwrap(await admin.from('projects').delete().eq('slug', slug), 'cleanup project');
  });

  it('stores the report before processing it and answers 201 as before', async () => {
    const receivedAt = new Date('2026-11-18T16:37:00.000Z');

    const response = await ingestReport(admin, input('stored', receivedAt));

    expect(response.status).toBe(201);
    expect(Object.keys(response.body).sort()).toEqual([
      'report_id',
      'run_id',
      'run_status',
      'totals',
    ]);
    const [id] = await inboxIdsFor('stored');
    expect(id).toBeDefined();
    const row = await inboxRow(id as string);
    expect(row).toMatchObject({
      project_id: projectId,
      payload: JSON.parse(JSON.stringify(payloadFor('stored', receivedAt))),
      status: 'processed',
      attempts: 1,
      last_error: null,
    });
    expect(new Date(row.received_at as string).toISOString()).toBe(receivedAt.toISOString());
    expect(row.processed_at).not.toBeNull();
    expect(row.result).toMatchObject({
      report_id: String((response.body as { report_id?: string }).report_id),
    });
    expect(await reportsFor('stored')).toHaveLength(1);
  });

  it('answers 202 with the inbox id when processing does not finish in time, and finishes later', async () => {
    const hold = holdProject(6);
    await until(holding, 'the hold');

    const response = await ingestReport(admin, input('slow'), { processWithinMs: 1_000 });

    expect(response).toEqual({
      status: 202,
      body: { status: 'accepted', inbox_id: expect.any(String) },
    });
    const id = acceptedId(response);
    expect(await inboxIdsFor('slow')).toEqual([id]);
    expect((await inboxRow(id)).status).toBe('pending');
    expect(await reportsFor('slow')).toEqual([]);

    await hold;
    // The try the route gave up on still holds its row and finishes once the hold ends; the
    // drain skips a row another session holds, so the report is ingested exactly once.
    await until(async () => (await inboxRow(id)).status === 'processed', 'the slow try');
    drain();
    expect(await reportsFor('slow')).toHaveLength(1);
    expect(await inboxRow(id)).toMatchObject({ status: 'processed', attempts: 1 });
  });

  it('loses nothing when the database cancels the ingest (57014): 202, then the drain ingests it', async () => {
    const hold = holdProject(20);
    await until(holding, 'the hold');

    const answer = ingestReport(admin, input('cancelled'));
    await until(async () => waitingTry().length > 0, 'the try to wait on the hold');
    sql(
      'select pg_cancel_backend(pid) from pg_stat_activity ' +
        "where wait_event_type = 'Lock' and query ilike '%ingest_stored_report%'",
    );
    const response = await answer;
    endHold();
    await hold;

    expect(response).toEqual({
      status: 202,
      body: { status: 'accepted', inbox_id: expect.any(String) },
    });
    const id = acceptedId(response);
    expect(await inboxRow(id)).toMatchObject({ status: 'pending', attempts: 1 });
    expect(await reportsFor('cancelled')).toEqual([]);

    drain();

    expect(await inboxRow(id)).toMatchObject({ status: 'processed', attempts: 2 });
    expect(await reportsFor('cancelled')).toHaveLength(1);
  });

  it('drains oldest first, each row on its own, so one failing row undoes no other', async () => {
    const older = payloadFor('order', new Date('2026-11-18T10:00:00.000Z'));
    const newer = payloadFor('order', new Date('2026-11-18T10:01:00.000Z'));
    const broken = {
      ...payloadFor('broken-neighbour', new Date('2026-11-18T09:59:00.000Z')),
      report: { ...older.report, total: 1 },
    };
    // Stored newest first, so only the drain's own order can put the older report first.
    const ids = [];
    for (const payload of [newer, broken, older]) {
      ids.push(unwrap(await admin.rpc('store_report', { payload }), 'store_report') as string);
    }

    drain();

    const [newerRow, brokenRow, olderRow] = await Promise.all(ids.map((id) => inboxRow(id)));
    expect(olderRow).toMatchObject({ status: 'processed', attempts: 2 });
    expect(newerRow).toMatchObject({ status: 'processed', attempts: 2 });
    expect(brokenRow).toMatchObject({ status: 'pending', attempts: 2 });
    expect(brokenRow?.last_error).toMatch(/^P0001 ingest_report: payload\.report totals/);
    // The same report key twice in one run: the later receipt replaces the earlier (spec 5.3).
    const reports = await reportsFor('order');
    expect(reports).toHaveLength(1);
    expect(new Date(reports[0]?.received_at as string).toISOString()).toBe(newer.received_at);
  });

  it('parks a row after its fifth failed try and opens one report_not_processed alert', async () => {
    const valid = payloadFor('parked', new Date('2026-11-18T16:38:00.000Z'));
    const payload = { ...valid, report: { ...valid.report, total: 1 } };
    const id = unwrap(await admin.rpc('store_report', { payload }), 'store_report') as string;
    // The route's own try, then four of the drain's.
    expect(unwrap(await admin.rpc('ingest_stored_report', { p_inbox_id: id }), 'try')).toEqual({
      status: 'pending',
    });
    for (const attempts of [2, 3, 4]) {
      drain();
      expect(await inboxRow(id)).toMatchObject({ status: 'pending', attempts });
    }
    drain();
    drain();

    const row = await inboxRow(id);
    expect(row).toMatchObject({ status: 'parked', attempts: 5, processed_at: null, result: null });
    expect(String(row.last_error).length).toBeLessThanOrEqual(300);
    expect(row.last_error).not.toContain(key);
    const alerts = unwrap(
      await admin
        .from('alerts')
        .select('id, project_id, kind, detail, opened_at, resolved_at, acknowledged_at')
        .eq('project_id', projectId)
        .eq('kind', 'report_not_processed'),
      'select alerts',
    );
    expect(alerts).toHaveLength(1);
    const alert = ReportNotProcessedAlertSchema.parse(alerts[0]);
    expect(alert.resolved_at).toBeNull();
    expect(alert.detail).toMatchObject({
      inbox_id: id,
      ci_run_id: 'parked',
      job: 'android',
      module: 'shared',
      platform: 'jvm',
      attempts: 5,
      error: row.last_error,
    });
    expect(new Date(alert.detail.received_at).toISOString()).toBe(payload.received_at);
    expect(await reportsFor('parked')).toEqual([]);
    // Its admin row is not designed yet: the admin page still loads, without it.
    const open = await loadOpenAlerts(admin);
    expect(open.map((entry) => entry.alert.id)).not.toContain(alert.id);
  });

  it('resolves the alert when an operator sets the parked row back to pending and it is processed', async () => {
    const [id] = await inboxIdsFor('parked');
    const fixed = payloadFor('parked', new Date('2026-11-18T16:38:00.000Z'));
    unwrap(
      await admin
        .from('report_inbox')
        .update({ payload: fixed, status: 'pending', attempts: 0 })
        .eq('id', id as string),
      'requeue',
    );

    drain();

    expect(await inboxRow(id as string)).toMatchObject({ status: 'processed', attempts: 1 });
    expect(await reportsFor('parked')).toHaveLength(1);
    const alerts = unwrap(
      await admin
        .from('alerts')
        .select('resolved_at')
        .eq('project_id', projectId)
        .eq('kind', 'report_not_processed'),
      'select alerts',
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.resolved_at).not.toBeNull();
  });

  it('keeps the inbox and its functions from anon', async () => {
    const read = await anon.from('report_inbox').select('*').limit(1);
    expect(read.error?.code).toBe(PERMISSION_DENIED);
    expect(read.data).toBeNull();

    const stored = await anon.rpc('store_report', { payload: payloadFor('anon', new Date()) });
    expect(stored.error?.code).toBe(PERMISSION_DENIED);
    const tried = await anon.rpc('ingest_stored_report', { p_inbox_id: randomUUID() });
    expect(tried.error?.code).toBe(PERMISSION_DENIED);
    const parked = await anon.rpc('park_stored_report', { p_inbox_id: randomUUID() });
    expect(parked.error?.code).toBe(PERMISSION_DENIED);
    expect(await inboxIdsFor('anon')).toEqual([]);
  });
});

describe('the drain schedule (pg_cron)', () => {
  it('calls process_report_inbox every minute, active, as the database owner', () => {
    expect(
      sql(
        'select schedule, command, active, username from cron.job ' +
          `where jobname = '${DRAIN_JOB}'`,
      ),
    ).toEqual([
      {
        schedule: '* * * * *',
        command: 'call public.process_report_inbox()',
        active: true,
        username: 'postgres',
      },
    ]);
  });

  it('gives the drain no caller but the owner', () => {
    expect(
      sql(
        "select has_function_privilege(r, 'public.process_report_inbox()', 'execute') as can " +
          "from unnest(array['anon', 'authenticated', 'service_role']) as r",
      ),
    ).toEqual([{ can: false }, { can: false }, { can: false }]);
  });
});
