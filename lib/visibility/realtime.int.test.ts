import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  type PostgrestSingleResponse,
  type RealtimeChannel,
  type RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { POST } from '../../app/api/v1/reports/route.ts';
import { hashApiKey } from '../projects/keys.ts';
import { addProject } from '../projects/repo.ts';
import { parseProjectFile } from '../projects/schema.ts';
import { createPublicClient } from '../supabase/public.ts';
import { createSecretClient } from '../supabase/server.ts';

// Spec section 4 (Realtime) and the 2026-09-21 and 2026-09-28 decisions: only public.reports is
// in the supabase_realtime publication, because every reports column is public. runs,
// result_failures and projects hold hidden data and are never published.

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const playwrightJunit = readFileSync(
  `${repoRoot}fixtures/testpulse/junit/playwright-one-failure.xml`,
  'utf8',
);

const SUBSCRIBE_TIMEOUT_MS = 10_000;
const EVENT_TIMEOUT_MS = 10_000;
// Only runs after the reports events have arrived, so the socket is known to be delivering;
// this is how long the unpublished tables get to prove they send nothing.
const SETTLE_MS = 1_500;

const UNPUBLISHED_TABLES = ['runs', 'result_failures', 'projects'] as const;

type Row = Record<string, unknown>;
type Change = RealtimePostgresChangesPayload<Row>;

function unwrap<T>(result: PostgrestSingleResponse<T>, what: string): T {
  if (result.error) {
    throw new Error(`${what}: ${result.error.code} ${result.error.message}`);
  }
  return result.data;
}

// Reads the catalog through the Supabase CLI, which both local development and the CI
// integration job already have, rather than adding a Postgres driver. --local pins it to the
// local stack; it can never reach the hosted project. The CLI wraps its output in another shape
// when it detects an AI agent, so --agent no keeps it a plain array wherever the test runs.
function publishedTables(): string[] {
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
      "select schemaname || '.' || tablename as name from pg_publication_tables " +
        "where pubname = 'supabase_realtime' order by 1",
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(`supabase db query exited ${String(result.status)}: ${result.stderr}`);
  }
  const parsed: unknown = JSON.parse(result.stdout);
  if (
    !Array.isArray(parsed) ||
    !parsed.every(
      (row: unknown) =>
        typeof row === 'object' && row !== null && 'name' in row && typeof row.name === 'string',
    )
  ) {
    throw new Error(`supabase db query printed an unexpected shape: ${result.stdout}`);
  }
  return parsed.map((row: { name: string }) => row.name);
}

async function waitFor(condition: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out after ${String(timeoutMs)} ms waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

// SUBSCRIBED only means the channel was joined. Realtime answers each postgres_changes binding
// separately with a system message, "ok" once it is listening to Postgres or "error" if it
// refuses the binding, so writes made before that reply could be missed. Resolves with its status.
function listening(channel: RealtimeChannel): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            `${channel.topic} had no postgres_changes reply in ${String(SUBSCRIBE_TIMEOUT_MS)} ms`,
          ),
        ),
      SUBSCRIBE_TIMEOUT_MS,
    );
    channel
      .on('system', {}, (payload: unknown) => {
        if (
          typeof payload === 'object' &&
          payload !== null &&
          'extension' in payload &&
          payload.extension === 'postgres_changes' &&
          'status' in payload
        ) {
          clearTimeout(timer);
          resolve(String(payload.status));
        }
      })
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timer);
          reject(new Error(`${channel.topic} ${status}: ${error?.message ?? 'no detail'}`));
        }
      });
  });
}

describe('Realtime publication (spec section 4 and section 9)', () => {
  it('publishes exactly public.reports', () => {
    expect(publishedTables()).toEqual(['public.reports']);
  });
});

describe('Realtime as the browser sees it, with the publishable key', () => {
  const admin = createSecretClient(process.env);
  const browser = createPublicClient();

  const suffix = randomUUID().slice(0, 8);
  const publicSlug = `realtime-public-${suffix}`;
  const privateSlug = `realtime-private-${suffix}`;
  // Keys live only in these variables and never appear in an assertion message.
  let publicKey: string;
  let privateKey: string;

  const reportEvents: Change[] = [];
  const otherEvents: Change[] = [];
  const channels: RealtimeChannel[] = [];
  let statuses: string[] = [];

  const post = async (key: string, ciRunId: string): Promise<string> => {
    const body = new FormData();
    body.append(
      'meta',
      JSON.stringify({
        ci_run_id: ciRunId,
        job: 'e2e',
        module: 'testpulse',
        platform: 'chromium',
        commit_sha: '2ec580f377e52f0a1ae584661ff09b07821ea1e2',
        branch: 'main',
        event: 'push',
        run_url: 'https://github.com/bhelco1/testpulse/actions/runs/1',
      }),
    );
    body.append('junit', new Blob([playwrightJunit]), 'playwright-one-failure.xml');
    const response = await POST(
      new Request('http://testpulse.local/api/v1/reports', {
        method: 'POST',
        body,
        headers: { authorization: `Bearer ${key}` },
      }),
    );
    const json = (await response.json()) as Record<string, unknown>;
    expect(response.status, JSON.stringify(json)).toBe(201);
    expect(json).toMatchObject({ run_status: 'failed', totals: { failed: 1 } });
    return String(json.report_id);
  };

  beforeAll(async () => {
    // The ingest tests' pairing: Ostomate2 is public and routeserve private in their own files.
    const ostomate2 = parseProjectFile(
      readFileSync(`${repoRoot}projects/ostomate2.yaml`, 'utf8'),
      'projects/ostomate2.yaml',
    );
    const routeserve = parseProjectFile(
      readFileSync(`${repoRoot}projects/routeserve.yaml`, 'utf8'),
      'projects/routeserve.yaml',
    );
    expect([ostomate2.visibility, routeserve.visibility]).toEqual(['public', 'private']);
    publicKey = await addProject(admin, { ...ostomate2, slug: publicSlug });
    privateKey = await addProject(admin, { ...routeserve, slug: privateSlug });

    const reports = browser
      .channel(`realtime-reports-${suffix}`)
      .on<Row>(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reports' },
        (payload) => reportEvents.push(payload),
      );
    channels.push(reports);
    for (const table of UNPUBLISHED_TABLES) {
      channels.push(
        browser
          .channel(`realtime-${table}-${suffix}`)
          .on<Row>('postgres_changes', { event: '*', schema: 'public', table }, (payload) =>
            otherEvents.push(payload),
          ),
      );
    }
    // Every binding has been answered before anything is written, so none can miss an event.
    statuses = await Promise.all(channels.map(listening));
  });

  afterAll(async () => {
    await browser.removeAllChannels();
    unwrap(
      await admin.from('projects').delete().like('slug', `realtime-%-${suffix}`),
      'cleanup projects',
    );
    const keys = [publicKey, privateKey].filter((key) => key !== undefined).map(hashApiKey);
    unwrap(
      await admin.from('rate_limit_buckets').delete().in('api_key_hash', keys),
      'cleanup rate_limit_buckets',
    );
  });

  it('delivers the reports insert for public and private projects, and nothing else', async () => {
    // Realtime refuses a binding on a table outside the publication, so the browser cannot even
    // start listening to the others; the event check below still holds if that ever changes.
    expect(
      Object.fromEntries(['reports', ...UNPUBLISHED_TABLES].map((t, i) => [t, statuses[i]])),
      'postgres_changes reply per table',
    ).toEqual({ reports: 'ok', runs: 'error', result_failures: 'error', projects: 'error' });

    const publicReportId = await post(publicKey, `${suffix}-public`);
    const privateReportId = await post(privateKey, `${suffix}-private`);
    // Other integration files ingest in parallel, so only this test's reports are looked at.
    const ours = () =>
      reportEvents.filter((event) =>
        [publicReportId, privateReportId].includes(String((event.new as Row).id)),
      );

    await waitFor(
      () => ours().length === 2,
      EVENT_TIMEOUT_MS,
      'the anon client to receive both reports INSERT events',
    );
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

    const stored = unwrap(
      await admin
        .from('reports')
        .select('id, run_id, job, module, platform, format, total, passed, failed, skipped')
        .in('id', [publicReportId, privateReportId]),
      'select reports',
    );
    expect(stored).toHaveLength(2);
    for (const row of stored) {
      const event = ours().find((candidate) => (candidate.new as Row).id === row.id);
      expect(event).toMatchObject({
        schema: 'public',
        table: 'reports',
        eventType: 'INSERT',
        new: { ...row, job: 'e2e', module: 'testpulse', platform: 'chromium', failed: 1 },
      });
    }
    expect(ours()).toHaveLength(2);
    expect(
      otherEvents.map((event) => `${event.table} ${event.eventType}`),
      'unpublished tables must send the anon client nothing',
    ).toEqual([]);
  });
});
