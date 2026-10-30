import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import type { PostgrestSingleResponse } from '@supabase/supabase-js';
import { cookies, headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  acknowledgeAlertAction,
  createLinkAction,
  deleteLinkAction,
  rotateKeyAction,
} from '../../app/admin/actions.ts';
import { POST } from '../../app/api/v1/reports/route.ts';
import { confirmParams, secretClient, signInTokenHash } from '../../tests/int/admin-session.ts';
import { AlertSchema } from '../alerts/schema.ts';
import type { DailySummary } from '../jobs/summary.ts';
import { API_KEY_PATTERN, hashApiKey } from '../projects/keys.ts';
import { addProject } from '../projects/repo.ts';
import { parseProjectFile } from '../projects/schema.ts';
import { FakeCookieStore } from './cookie-store.test-support.ts';
import { loadAdminPage, loadLatestJob, loadLinkDetail, readAdminPage } from './data.ts';
import { handleConfirm } from './handlers.ts';

vi.mock('next/headers', () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));

// Admin's reads and actions against local Supabase (spec section 15, "Admin" as built; section
// 17, Phase 6 criterion 2): with the owner's real magic-link session each action does its work in
// the database, and with no session each is refused before anything changes. The project, link,
// alerts, visits and heartbeat are this file's own, under a fresh suffix, and are removed after.

const admin = secretClient();
const suffix = randomUUID().slice(0, 8);
const SLUG = `admin-int-${suffix}`;
const OWNER = `owner-${suffix}@testpulse.test`;
const ORIGIN = 'http://127.0.0.1:3000';
const NOW = new Date('2026-10-08T11:00:00Z');
const FINISHED = '2026-10-08T09:30:00.000Z';
// A heartbeat later than any other file writes, so it is the latest while this file runs.
const HEARTBEAT_AT = '2999-01-01T00:00:00.000Z';

let projectId: string;
let firstKey: string;
let reportId: string;
let runId: string;
const alertIds: Record<string, string> = {};
let ownerId: string | undefined;
let session: FakeCookieStore;
const issuedKeys: string[] = [];

function unwrap<T>(result: PostgrestSingleResponse<T>, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.code} ${result.error.message}`);
  return result.data;
}

const serve = (store: FakeCookieStore) => {
  vi.mocked(cookies).mockResolvedValue(store as never);
  vi.mocked(headers).mockResolvedValue(
    new Headers({ origin: ORIGIN, host: '127.0.0.1:3000' }) as never,
  );
};

const SUMMARY: DailySummary = {
  started_at: HEARTBEAT_AT,
  finished_at: HEARTBEAT_AT,
  status: 'ok',
  failed_step: null,
  error: null,
  failed_steps: [],
  heartbeat_written: true,
  projects_checked: 3,
  stale_opened: 0,
  stale_opened_project_ids: [],
  pruned: {
    results: 0,
    result_failures: 0,
    visits: 0,
    tracked_sessions: 0,
    rate_limit_buckets: 12,
    runs_marked_pruned: 0,
  },
  pruned_by_project: [],
  prune_batches: 2,
  prune_complete: true,
};

async function alertRow(id: string) {
  return AlertSchema.parse(
    unwrap(
      await admin
        .from('alerts')
        .select('id, project_id, kind, detail, opened_at, resolved_at, acknowledged_at')
        .eq('id', id)
        .single(),
      'alert',
    ),
  );
}

async function keyHash(): Promise<string> {
  return unwrap(
    await admin.from('projects').select('api_key_hash').eq('id', projectId).single(),
    'key hash',
  ).api_key_hash as string;
}

async function postReport(key: string, ciRunId: string) {
  const form = new FormData();
  form.append(
    'meta',
    JSON.stringify({
      job: 'e2e',
      module: 'e2e',
      platform: 'chromium',
      commit_sha: '2ec580f377e52f0a1ae584661ff09b07821ea1e2',
      branch: 'main',
      event: 'push',
      ci_run_id: ciRunId,
    }),
  );
  form.append(
    'junit',
    new Blob([readFileSync('fixtures/testpulse/junit/playwright-one-failure.xml', 'utf8')]),
    'junit.xml',
  );
  const response = await POST(
    new Request('http://testpulse.local/api/v1/reports', {
      method: 'POST',
      body: form,
      headers: { authorization: `Bearer ${key}` },
    }),
  );
  return response.status;
}

beforeAll(async () => {
  const file = parseProjectFile(
    readFileSync('projects/testpulse.yaml', 'utf8'),
    'projects/testpulse.yaml',
  );
  firstKey = await addProject(admin, { ...file, slug: SLUG, name: `Admin int ${suffix}` });
  issuedKeys.push(firstKey);
  projectId = unwrap(await admin.from('projects').select('id').eq('slug', SLUG).single(), 'project')
    .id as string;

  runId = unwrap(
    await admin
      .from('runs')
      .insert({
        project_id: projectId,
        ci_run_id: `${suffix}-1`,
        commit_sha: '0e2d0b4f00aa11bb22cc33dd44ee55ff66778899',
        branch: 'main',
        event: 'push',
        started_at: '2026-10-08T09:29:00.000Z',
        finished_at: FINISHED,
        status: 'empty',
      })
      .select('id')
      .single(),
    'run',
  ).id as string;
  reportId = unwrap(
    await admin
      .from('reports')
      .insert({
        run_id: runId,
        job: 'ios-e2e',
        module: 'e2e',
        platform: 'ios-sim',
        format: 'junit',
        started_at: '2026-10-08T09:29:00.000Z',
        finished_at: FINISHED,
        received_at: FINISHED,
      })
      .select('id')
      .single(),
    'report',
  ).id as string;

  const alerts = [
    ['stale', { last_report_at: '2026-09-26T09:00:00+00:00', expected_cadence_days: 8 }],
    [
      'count_drop',
      {
        job: 'e2e',
        module: 'e2e',
        platform: 'chromium',
        baseline: 235,
        current: 180,
        baseline_run_id: runId,
        run_id: runId,
      },
    ],
    ['empty_run', { job: 'ios-e2e', module: 'e2e', platform: 'ios-sim', report_id: reportId }],
    ['coverage_below_floor', { module: 'unit', floor: 90, lines_pct: 89.97, report_id: reportId }],
  ] as const;
  for (const [kind, detail] of alerts) {
    alertIds[kind] = unwrap(
      await admin
        .from('alerts')
        .insert({ project_id: projectId, kind, detail, opened_at: '2026-10-08T04:12:00Z' })
        .select('id')
        .single(),
      `alert ${kind}`,
    ).id as string;
  }

  unwrap(
    await admin.from('heartbeats').insert({ created_at: HEARTBEAT_AT, summary: SUMMARY }),
    'heartbeat',
  );

  vi.stubEnv('ADMIN_EMAIL', OWNER);
  session = new FakeCookieStore();
  serve(session);
  await expect(handleConfirm(confirmParams(await signInTokenHash(admin, OWNER)))).resolves.toBe(
    '/admin',
  );
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  ownerId = data.users.find((user) => user.email === OWNER)?.id;
});

beforeEach(() => {
  vi.stubEnv('ADMIN_EMAIL', OWNER);
  serve(session);
  vi.mocked(revalidatePath).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await admin.from('tracked_links').delete().like('company', `%${suffix}%`);
  await admin.from('visits').delete().like('session_id', `${suffix}-%`);
  await admin.from('heartbeats').delete().eq('created_at', HEARTBEAT_AT);
  await admin.from('projects').delete().eq('slug', SLUG);
  await admin.from('rate_limit_buckets').delete().in('api_key_hash', issuedKeys.map(hashApiKey));
  if (ownerId !== undefined) await admin.auth.admin.deleteUser(ownerId);
});

describe('admin’s reads', () => {
  it('reads every open alert, the project’s last report and sync, and the latest job', async () => {
    const page = await loadAdminPage(admin, NOW);

    const mine = page.alerts.filter(({ alert }) => alert.project_id === projectId);
    expect(mine.map(({ alert }) => alert.kind).sort()).toEqual([
      'count_drop',
      'coverage_below_floor',
      'empty_run',
      'stale',
    ]);
    expect(mine.every(({ projectName }) => projectName === `Admin int ${suffix}`)).toBe(true);
    expect(mine.find(({ alert }) => alert.kind === 'empty_run')?.emptyReport).toEqual({
      branch: 'main',
      commitSha: '0e2d0b4f00aa11bb22cc33dd44ee55ff66778899',
    });
    expect(page.lastReports.get(projectId)).toEqual(new Date(FINISHED));
    // A report after now is not the last report yet.
    expect(
      (await loadAdminPage(admin, new Date('2026-10-08T09:00:00Z'))).lastReports.get(projectId),
    ).toBeNull();
    const pair = page.projects.find(({ slug }) => slug === SLUG);
    expect(pair?.row?.id).toBe(projectId);
    expect(pair?.sync).toEqual({ kind: 'no-yaml' });
    // Each deployed file is read and compared, registered or not.
    expect(page.projects.filter(({ file }) => file !== null).map(({ slug }) => slug)).toEqual(
      expect.arrayContaining(['ostomate2', 'routeserve', 'testpulse']),
    );
    expect(page.job).toEqual({ latest: SUMMARY, lastFinished: null });
  });

  it('reads the latest finished run too while the latest has no finish', async () => {
    const STARTED_AT = '2999-01-02T00:00:00.000Z';
    const started: DailySummary = {
      ...SUMMARY,
      started_at: STARTED_AT,
      finished_at: null,
      status: 'failed',
      error: 'The job started and has not finished.',
      projects_checked: null,
      stale_opened: null,
      prune_complete: false,
    };
    unwrap(
      await admin.from('heartbeats').insert({ created_at: STARTED_AT, summary: started }),
      'started heartbeat',
    );
    try {
      expect(await loadLatestJob(admin)).toEqual({ latest: started, lastFinished: SUMMARY });
    } finally {
      await admin.from('heartbeats').delete().eq('created_at', STARTED_AT);
    }
  });

  it('fails the whole load on an alert that does not parse, logging only its id and kind', async () => {
    const bad = unwrap(
      await admin
        .from('alerts')
        .insert({
          project_id: projectId,
          kind: 'stale',
          detail: { written: 'by hand' },
          opened_at: '2026-10-08T05:00:00Z',
        })
        .select('id')
        .single(),
      'bad alert',
    ).id as string;
    const logged: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((line: string) => {
      logged.push(line);
    });
    try {
      await expect(readAdminPage({ ok: true, email: OWNER }, NOW)).resolves.toBeNull();
      expect(logged).toEqual([
        `testpulse admin: couldn’t load: alert ${bad} (stale): its detail does not parse`,
      ]);
    } finally {
      spy.mockRestore();
      await admin.from('alerts').delete().eq('id', bad);
    }
  });

  it('counts a link’s browser visits only, and reads one link’s figures', async () => {
    const created = await createLinkAction({
      company: `Visits ${suffix}`,
      role: 'QA Manager',
      sent_on: '2026-10-01',
    });
    if (created.status !== 'created') throw new Error(created.status);
    const visit = (
      session: string,
      path: string,
      ip: string,
      cls: string,
      seconds: number | null,
      minute: number,
    ) => ({
      tracked_link_id: created.id,
      session_id: `${suffix}-${session}`,
      path,
      entered_at: `2026-10-08T08:0${minute}:00Z`,
      seconds_on_page: seconds,
      user_agent_class: cls,
      ip_hash: ip,
    });
    unwrap(
      await admin
        .from('visits')
        .insert([
          visit('a', '/', 'ip-1', 'browser', 30, 0),
          visit('b', '/p/ostomate2', 'ip-1', 'browser', 45, 1),
          visit('bot', '/', 'ip-2', 'bot', 99, 2),
          visit('pre', '/p/routeserve', 'ip-3', 'preview', null, 3),
        ]),
      'visits',
    );

    const page = await loadAdminPage(admin, NOW);
    expect(page.links.find(({ id }) => id === created.id)?.company).toBe(`Visits ${suffix}`);
    expect(page.linkFigures.get(created.id)).toMatchObject({
      sessions: 2,
      visitors: 1,
      pageViews: 2,
      paths: ['/', '/p/ostomate2'],
    });

    const detail = await loadLinkDetail(admin, created.id);
    expect(detail?.link.id).toBe(created.id);
    expect(detail?.figures).toMatchObject({ sessions: 2, visitors: 1, pageViews: 2 });
    expect(detail?.figures.perProject).toEqual([
      { slug: 'ostomate2', views: 1, seconds: 45, untimedViews: 0 },
    ]);
    expect(detail?.projects.some(({ slug }) => slug === SLUG)).toBe(true);
    expect(await loadLinkDetail(admin, randomUUID())).toBeNull();
    expect(await loadLinkDetail(admin, 'not-a-uuid')).toBeNull();
  });
});

describe('admin’s actions with the owner’s session', () => {
  it('creates a tracked link and answers its copyable address', async () => {
    const result = await createLinkAction({
      company: `Initech ${suffix}`,
      role: 'Head of QA',
      contact: '',
      notes: 'Applied through their careers page.',
      sent_on: '2026-10-08',
      lead_project_slug: SLUG,
    });
    if (result.status !== 'created') throw new Error(`not created: ${result.status}`);
    const row = unwrap(
      await admin
        .from('tracked_links')
        .select('id, token, company, role, contact, notes, sent_at, lead_project_slug')
        .eq('id', result.id)
        .single(),
      'link',
    );
    expect(row).toMatchObject({
      company: `Initech ${suffix}`,
      role: 'Head of QA',
      contact: null,
      notes: 'Applied through their careers page.',
      lead_project_slug: SLUG,
    });
    expect(new Date(row.sent_at as string).toISOString()).toBe('2026-10-08T00:00:00.000Z');
    expect(result.url).toBe(`${ORIGIN}/v/${row.token as string}`);
    expect(revalidatePath).toHaveBeenCalledWith('/admin');
  });

  it('names a blank Company or Role and refuses a lead project that does not exist', async () => {
    expect(await createLinkAction({ company: ' ', role: '' })).toEqual({
      status: 'invalid',
      fields: ['company', 'role'],
    });
    expect(
      await createLinkAction({
        company: `Gone ${suffix}`,
        role: 'r',
        lead_project_slug: `gone-${suffix}`,
      }),
    ).toEqual({ status: 'error' });
    const { data } = await admin
      .from('tracked_links')
      .select('id')
      .like('company', `Gone ${suffix}`);
    expect(data).toEqual([]);
  });

  it('acknowledges a count_drop, and refuses any other kind', async () => {
    expect(await acknowledgeAlertAction(alertIds.stale)).toEqual({ status: 'error' });
    expect((await alertRow(alertIds.stale as string)).resolved_at).toBeNull();

    expect(await acknowledgeAlertAction(alertIds.count_drop)).toEqual({ status: 'acknowledged' });
    const acknowledged = await alertRow(alertIds.count_drop as string);
    expect(acknowledged.acknowledged_at).not.toBeNull();
    expect(acknowledged.resolved_at).toBe(acknowledged.acknowledged_at);
    expect(revalidatePath).toHaveBeenCalledWith('/admin');
    // Already acknowledged: refused, with no message, and the page is refreshed so it leaves it.
    expect(await acknowledgeAlertAction(alertIds.count_drop)).toEqual({ status: 'closed' });
  });

  // v19 item 6: the page says such an alert had already closed.
  it('answers closed-by-itself for a count_drop a report closed, and does not acknowledge it', async () => {
    const closed = unwrap(
      await admin
        .from('alerts')
        .insert({
          project_id: projectId,
          kind: 'count_drop',
          detail: {
            job: 'e2e',
            module: 'e2e',
            platform: 'chromium',
            baseline: 60,
            current: 40,
            baseline_run_id: runId,
            run_id: runId,
          },
          opened_at: '2026-10-08T09:00:00.000Z',
          resolved_at: '2026-10-08T10:00:00.000Z',
        })
        .select('id')
        .single(),
      'closed drop',
    ).id as string;
    vi.mocked(revalidatePath).mockClear();
    expect(await acknowledgeAlertAction(closed)).toEqual({ status: 'closed-by-itself' });
    const row = await alertRow(closed);
    expect(row.acknowledged_at).toBeNull();
    expect(Date.parse(row.resolved_at as string)).toBe(Date.parse('2026-10-08T10:00:00.000Z'));
    expect(revalidatePath).toHaveBeenCalledWith('/admin');
    expect(await acknowledgeAlertAction(randomUUID())).toEqual({ status: 'closed' });
  });

  it('rotates the key: the old key stops working, the new one ingests, and it is never logged', async () => {
    const logged: string[] = [];
    const capture = (...parts: unknown[]) => logged.push(parts.map(String).join(' '));
    const spies = (['log', 'info', 'warn', 'error'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(capture),
    );
    try {
      expect(await postReport(firstKey, `${suffix}-before`)).toBe(201);
      const result = await rotateKeyAction(SLUG);
      if (result.status !== 'rotated') throw new Error(`not rotated: ${result.status}`);
      issuedKeys.push(result.key);
      expect(result.key).toMatch(API_KEY_PATTERN);
      expect(await keyHash()).toBe(hashApiKey(result.key));

      expect(await postReport(firstKey, `${suffix}-old`)).toBe(401);
      expect(await postReport(result.key, `${suffix}-new`)).toBe(201);
      for (const line of logged) expect(line).not.toContain(result.key);
      expect(revalidatePath).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
    expect(await rotateKeyAction(`gone-${suffix}`)).toEqual({ status: 'error' });
  });

  it('deletes a link, keeping its visits unlinked, and goes back to /admin', async () => {
    const created = await createLinkAction({ company: `Delete ${suffix}`, role: 'r' });
    if (created.status !== 'created') throw new Error(created.status);
    unwrap(
      await admin.from('visits').insert({
        tracked_link_id: created.id,
        session_id: `${suffix}-delete`,
        path: '/',
        user_agent_class: 'browser',
        ip_hash: 'ip-9',
      }),
      'visit',
    );

    await expect(deleteLinkAction(created.id)).rejects.toThrow('NEXT_REDIRECT /admin');
    expect(redirect).toHaveBeenCalledWith('/admin');
    const { data: links } = await admin.from('tracked_links').select('id').eq('id', created.id);
    expect(links).toEqual([]);
    const { data: visits } = await admin
      .from('visits')
      .select('tracked_link_id')
      .eq('session_id', `${suffix}-delete`);
    expect(visits).toEqual([{ tracked_link_id: null }]);
    // A link already gone cannot be deleted again.
    expect(await deleteLinkAction(created.id)).toEqual({ status: 'error' });
  });
});

describe('admin’s actions without a session', () => {
  it('refuses each one as the session ended, and changes nothing', async () => {
    const link = await createLinkAction({ company: `Kept ${suffix}`, role: 'r' });
    if (link.status !== 'created') throw new Error(link.status);
    const hash = await keyHash();
    vi.mocked(revalidatePath).mockClear();

    serve(new FakeCookieStore());
    const ended = { status: 'session-ended' };
    expect(await createLinkAction({ company: `Refused ${suffix}`, role: 'r' })).toEqual(ended);
    expect(await acknowledgeAlertAction(alertIds.coverage_below_floor)).toEqual(ended);
    expect(await rotateKeyAction(SLUG)).toEqual(ended);
    expect(await deleteLinkAction(link.id)).toEqual(ended);

    // A session cookie Supabase never issued is no session either.
    serve(new FakeCookieStore({ testpulse_admin_auth: 'base64-e30' }));
    expect(await rotateKeyAction(SLUG)).toEqual(ended);

    const { data: refused } = await admin
      .from('tracked_links')
      .select('id')
      .like('company', `Refused ${suffix}`);
    expect(refused).toEqual([]);
    const { data: kept } = await admin.from('tracked_links').select('id').eq('id', link.id);
    expect(kept).toEqual([{ id: link.id }]);
    expect((await alertRow(alertIds.coverage_below_floor as string)).resolved_at).toBeNull();
    expect(await keyHash()).toBe(hash);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('refuses a session for another address', async () => {
    vi.stubEnv('ADMIN_EMAIL', `someone-else-${suffix}@testpulse.test`);
    expect(await rotateKeyAction(SLUG)).toEqual({ status: 'session-ended' });
  });
});
