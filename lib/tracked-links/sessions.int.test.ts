import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { GET as arrive } from '../../app/api/v/[token]/route.ts';
import { POST as recordTime } from '../../app/api/visits/time/route.ts';
import { POST as recordVisit } from '../../app/api/visits/route.ts';
import { readIntegrationEnv } from '../../tests/int/env.ts';
import { addProject } from '../projects/repo.ts';
import { parseProjectFile } from '../projects/schema.ts';
import { createSecretClient } from '../supabase/server.ts';
import { hashClientIp, IP_HASH_SALT_VAR } from '../visits/ip-hash.ts';
import { SESSION_COOKIE } from '../visits/session.ts';
import { createTrackedLink } from './create.ts';

// Spec sections 5.10, 9, 14 and 15; Phase 6 criteria 3 to 5. Against local Supabase, through the
// real route handlers: /v/<token> records the session against its link, the beacon's visits in
// that session carry the link, and its time update touches only the caller's own visit, once.
// anon can neither read nor write tracked_sessions, and lead_project_for_session answers it a
// slug or null and nothing else. Every row this file writes carries its suffix or its sessions
// and is removed afterwards.

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const PERMISSION_DENIED = '42501';
const INVALID_TEXT = '22P02';
const ORIGIN = 'http://127.0.0.1:3000';
// Not a secret: a value that exists only in this test.
const SALT = 'int-test-ip-hash-salt-not-a-secret-0123456789';
// TEST-NET-2 (RFC 5737): never a real client.
const IP = '198.51.100.23';
const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/141.0.0.0 Safari/537.36';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const sessionOf = (response: Response): string => {
  const match = new RegExp(`^${SESSION_COOKIE}=([^;]+);`).exec(
    response.headers.get('set-cookie') ?? '',
  );
  if (match?.[1] === undefined) throw new Error('no session cookie was set');
  return match[1];
};

describe('tracked sessions and visit logging (spec section 14)', () => {
  const env = readIntegrationEnv();
  const admin = createSecretClient(process.env);
  const anon = createClient(env.url, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const suffix = randomUUID().slice(0, 8);
  const company = (name: string) => `${name} sessions-${suffix}`;
  const privateSlug = `sessions-private-${suffix}`;
  const sessions = new Set<string>();

  const headers = (session: string | null, extra: Record<string, string> = {}) => ({
    host: '127.0.0.1:3000',
    origin: ORIGIN,
    'sec-fetch-site': 'same-origin',
    'user-agent': CHROME,
    'x-vercel-forwarded-for': IP,
    ...(session === null ? {} : { cookie: `${SESSION_COOKIE}=${session}` }),
    ...extra,
  });

  async function open(token: string, session: string | null, extra: Record<string, string> = {}) {
    const response = await arrive(
      new Request(`${ORIGIN}/api/v/${token}`, { headers: headers(session, extra) }),
      { params: Promise.resolve({ token }) },
    );
    const set = response.headers.get('set-cookie');
    if (set !== null) sessions.add(sessionOf(response));
    return response;
  }

  async function view(path: string, session: string | null, extra: Record<string, string> = {}) {
    const response = await recordVisit(
      new Request(`${ORIGIN}/api/visits`, {
        method: 'POST',
        headers: headers(session, extra),
        body: JSON.stringify({ path }),
      }),
    );
    if (response.headers.get('set-cookie') !== null) sessions.add(sessionOf(response));
    return response;
  }

  const timeFor = (id: string, seconds: number, session: string | null) =>
    recordTime(
      new Request(`${ORIGIN}/api/visits/time`, {
        method: 'POST',
        headers: headers(session),
        body: JSON.stringify({ id, seconds }),
      }),
    );

  async function link(name: string, lead: string | null = privateSlug) {
    const result = await createTrackedLink(
      admin,
      { company: company(name), role: 'Head of Quality', lead_project_slug: lead ?? undefined },
      new Date(),
    );
    if (!result.ok) throw new Error(`not created: ${result.reason}`);
    return result.link;
  }

  const sessionRow = async (session: string) => {
    const { data, error } = await admin
      .from('tracked_sessions')
      .select('session_id, tracked_link_id, created_at')
      .eq('session_id', session)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  };

  const visit = async (id: string) => {
    const { data, error } = await admin.from('visits').select('*').eq('id', id).single();
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  };

  beforeAll(async () => {
    const routeserve = parseProjectFile(
      readFileSync(`${repoRoot}projects/routeserve.yaml`, 'utf8'),
      'projects/routeserve.yaml',
    );
    expect(routeserve.visibility).toBe('private');
    await addProject(admin, { ...routeserve, slug: privateSlug });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    const ids = [...sessions];
    await admin.from('visits').delete().in('session_id', ids);
    await admin
      .from('rate_limit_buckets')
      .delete()
      .in('api_key_hash', [
        ...ids.map((id) => `visit-session:${id}`),
        `visit-ip:${hashClientIp(IP, SALT)}`,
      ]);
    await admin.from('tracked_links').delete().like('company', `% sessions-${suffix}`);
    await admin.from('projects').delete().eq('slug', privateSlug);
  });

  describe('opening a tracked link and viewing pages', () => {
    it('records the session against the link, and the visits in it carry the link', async () => {
      vi.stubEnv(IP_HASH_SALT_VAR, SALT);
      const created = await link('Acme Health');

      const arrived = await open(created.token, null);
      expect(arrived.status).toBe(303);
      expect(arrived.headers.get('location')).toBe('/');
      const session = sessionOf(arrived);
      expect(session).toMatch(UUID);
      expect(await sessionRow(session)).toMatchObject({
        session_id: session,
        tracked_link_id: created.id,
      });

      const first = await view('/', session);
      expect(first.status).toBe(201);
      expect(first.headers.get('set-cookie')).toBeNull();
      const body = (await first.json()) as Record<string, unknown>;
      expect(Object.keys(body)).toEqual(['id']);
      const id = String(body.id);
      expect(id).toMatch(UUID);

      const row = await visit(id);
      expect(row).toMatchObject({
        session_id: session,
        path: '/',
        tracked_link_id: created.id,
        user_agent_class: 'browser',
        ip_hash: hashClientIp(IP, SALT),
        seconds_on_page: null,
      });
      // No raw address anywhere in the stored row.
      expect(JSON.stringify(row)).not.toContain(IP);

      const second = await view('/p/ostomate2', session);
      expect(second.status).toBe(201);
      const secondRow = await visit(String(((await second.json()) as { id: string }).id));
      expect(secondRow).toMatchObject({ tracked_link_id: created.id, path: '/p/ostomate2' });
    });

    it('re-points a session that opens a second link: the latest link wins', async () => {
      vi.stubEnv(IP_HASH_SALT_VAR, SALT);
      const first = await link('Initech');
      const second = await link('Globex', null);
      const session = sessionOf(await open(first.token, null));
      const before = await sessionRow(session);

      const again = await open(second.token, session);
      expect(again.status).toBe(303);
      expect(again.headers.get('set-cookie')).toBeNull();
      const after = await sessionRow(session);
      expect(after).toMatchObject({ session_id: session, tracked_link_id: second.id });
      expect(new Date(String(after?.created_at)).getTime()).toBeGreaterThanOrEqual(
        new Date(String(before?.created_at)).getTime(),
      );
      const { count } = await admin
        .from('tracked_sessions')
        .select('session_id', { count: 'exact', head: true })
        .eq('session_id', session);
      expect(count).toBe(1);
    });

    it('records no session for an unknown or malformed token, or a bot, and answers alike', async () => {
      const created = await link('Umbrella');
      const known = await open(created.token, null);
      const shape = (response: Response) => ({
        status: response.status,
        location: response.headers.get('location'),
        cache: response.headers.get('cache-control'),
        cookie: (response.headers.get('set-cookie') ?? '').replace(/=[^;]+;/, '=<id>;'),
      });

      for (const [token, extra] of [
        ['Zz9Zz9Zz9Zz9', {}],
        ['not-a-token', {}],
        [
          created.token,
          {
            'user-agent':
              'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
          },
        ],
        [
          created.token,
          { 'user-agent': 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)' },
        ],
      ] as const) {
        const response = await open(token, null, extra);
        expect(shape(response)).toEqual(shape(known));
        expect(await sessionRow(sessionOf(response))).toBeNull();
      }
    });

    it('logs a visit that arrived any other way with no link', async () => {
      vi.stubEnv(IP_HASH_SALT_VAR, SALT);
      const response = await view('/privacy', null);
      expect(response.status).toBe(201);
      const session = sessionOf(response);
      const row = await visit(String(((await response.json()) as { id: string }).id));
      expect(row).toMatchObject({ session_id: session, path: '/privacy', tracked_link_id: null });
    });

    it('stores a bot visit under its class', async () => {
      vi.stubEnv(IP_HASH_SALT_VAR, SALT);
      const response = await view('/', null, {
        'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      });
      const row = await visit(String(((await response.json()) as { id: string }).id));
      expect(row).toMatchObject({ user_agent_class: 'bot' });
    });

    it('stores nothing without the salt', async () => {
      vi.stubEnv(IP_HASH_SALT_VAR, '');
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const response = await view('/', null);
      expect(response.status).toBe(204);
      const { count } = await admin
        .from('visits')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', sessionOf(response));
      expect(count).toBe(0);
    });
  });

  describe('the time update', () => {
    it('sets the seconds once, and only for a visit of the caller’s own session', async () => {
      vi.stubEnv(IP_HASH_SALT_VAR, SALT);
      const created = await view('/', null);
      const session = sessionOf(created);
      const id = String(((await created.json()) as { id: string }).id);
      const stranger = sessionOf(await view('/', null));

      expect((await timeFor(id, 30, stranger)).status).toBe(204);
      expect((await timeFor(id, 30, null)).status).toBe(204);
      expect((await visit(id)).seconds_on_page).toBeNull();

      expect((await timeFor(id, 12, session)).status).toBe(204);
      expect((await visit(id)).seconds_on_page).toBe(12);

      await timeFor(id, 99, session);
      expect((await visit(id)).seconds_on_page).toBe(12);
    });

    it('caps the seconds at an hour', async () => {
      vi.stubEnv(IP_HASH_SALT_VAR, SALT);
      const created = await view('/', null);
      const id = String(((await created.json()) as { id: string }).id);
      await timeFor(id, 86_400, sessionOf(created));
      expect((await visit(id)).seconds_on_page).toBe(3_600);
    });
  });

  describe('as anon', () => {
    it('is refused every read and write of tracked_sessions', async () => {
      const created = await link('Hooli');
      const session = sessionOf(await open(created.token, null));

      const read = await anon.from('tracked_sessions').select('*');
      expect(read.error?.code).toBe(PERMISSION_DENIED);
      expect(read.data).toBeNull();
      const insert = await anon
        .from('tracked_sessions')
        .insert({ session_id: randomUUID(), tracked_link_id: created.id });
      expect(insert.error?.code).toBe(PERMISSION_DENIED);
      const update = await anon
        .from('tracked_sessions')
        .update({ tracked_link_id: created.id })
        .eq('session_id', session);
      expect(update.error?.code).toBe(PERMISSION_DENIED);
      const remove = await anon.from('tracked_sessions').delete().eq('session_id', session);
      expect(remove.error?.code).toBe(PERMISSION_DENIED);

      const links = await anon.from('tracked_links').select('id').limit(1);
      expect(links.error?.code).toBe(PERMISSION_DENIED);
      const linkInsert = await anon
        .from('tracked_links')
        .insert({ token: 'AnonAnonAnon', company: company('Anon'), role: 'R' });
      expect(linkInsert.error?.code).toBe(PERMISSION_DENIED);

      // Positive control: the row anon was refused is there, unchanged.
      expect(await sessionRow(session)).toMatchObject({ tracked_link_id: created.id });
    });

    it('gets the lead project’s slug and nothing else from lead_project_for_session', async () => {
      const created = await link('Stark');
      const session = sessionOf(await open(created.token, null));

      const { data, error } = await anon.rpc('lead_project_for_session', {
        p_session_id: session,
      });
      expect(error).toBeNull();
      expect(data).toBe(privateSlug);

      // The raw answer, as the browser's key would get it: one JSON string, no object around it.
      const raw = await fetch(`${env.url}/rest/v1/rpc/lead_project_for_session`, {
        method: 'POST',
        headers: {
          apikey: env.publishableKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ p_session_id: session }),
      });
      expect(raw.status).toBe(200);
      const text = await raw.text();
      expect(text).toBe(JSON.stringify(privateSlug));
      for (const hidden of [created.token, created.id, created.company, created.role]) {
        expect(text).not.toContain(hidden);
      }
    });

    it('gets null for an unknown session and for a link without a lead', async () => {
      const unknown = await anon.rpc('lead_project_for_session', { p_session_id: randomUUID() });
      expect(unknown).toMatchObject({ data: null, error: null });

      const leadless = await link('Wayne', null);
      const session = sessionOf(await open(leadless.token, null));
      expect(await sessionRow(session)).toMatchObject({ tracked_link_id: leadless.id });
      const answer = await anon.rpc('lead_project_for_session', { p_session_id: session });
      expect(answer).toMatchObject({ data: null, error: null });
    });

    it('is refused a session id that is not a UUID', async () => {
      const answer = await anon.rpc('lead_project_for_session', { p_session_id: 'not-a-uuid' });
      expect(answer.error?.code).toBe(INVALID_TEXT);
    });

    it('is a definer function with a fixed search path, executable by anon but not PUBLIC', () => {
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
          'select p.prosecdef as definer, p.proconfig[1] as config, cardinality(p.proconfig) as settings, ' +
            "coalesce(p.proacl::text, '') as acl, " +
            "has_function_privilege('anon', p.oid, 'execute') as anon, " +
            "has_function_privilege('authenticated', p.oid, 'execute') as authenticated, " +
            "has_function_privilege('service_role', p.oid, 'execute') as service_role " +
            'from pg_proc p join pg_namespace n on n.oid = p.pronamespace ' +
            "where n.nspname = 'public' and p.proname = 'lead_project_for_session'",
        ],
        { cwd: repoRoot, encoding: 'utf8' },
      );
      if (result.status !== 0) {
        throw new Error(`supabase db query exited ${String(result.status)}: ${result.stderr}`);
      }
      const [row] = JSON.parse(result.stdout) as Record<string, unknown>[];
      expect(row).toMatchObject({
        definer: true,
        config: 'search_path=""',
        settings: 1,
        anon: true,
        authenticated: true,
        service_role: true,
      });
      // An ACL entry for PUBLIC is written "=X/owner": none may remain.
      expect(String(row?.acl)).not.toMatch(/(^|[{,])=/);
    });
  });

  describe('deleting a link', () => {
    it('deletes its sessions and keeps its visits, unlinked', async () => {
      vi.stubEnv(IP_HASH_SALT_VAR, SALT);
      const created = await link('Cyberdyne');
      const session = sessionOf(await open(created.token, null));
      const id = String(((await (await view('/', session)).json()) as { id: string }).id);

      await admin.from('tracked_links').delete().eq('id', created.id);
      expect(await sessionRow(session)).toBeNull();
      expect(await visit(id)).toMatchObject({ session_id: session, tracked_link_id: null });
      const lead = await anon.rpc('lead_project_for_session', { p_session_id: session });
      expect(lead).toMatchObject({ data: null, error: null });
    });
  });
});
