import { randomUUID } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { createSecretClient } from '../supabase/server.ts';
import {
  clientIpFromHeaders,
  hashClientIp,
  IP_HASH_SALT_MIN_LENGTH,
  IP_HASH_SALT_VAR,
  readIpHashSalt,
} from './ip-hash.ts';
import { cookieSecure, ensureSession, readSessionCookie, sessionCookieHeader } from './session.ts';
import { classifyUserAgent, type UserAgentClass } from './user-agent.ts';

// The beacon's two routes (spec sections 14 and 15): POST /api/visits records a page view and
// answers only an opaque visit id; POST /api/visits/time sets that view's seconds, once, and only
// for a request carrying the same session cookie. Both take only a same-origin request with a
// small JSON body, validated by Zod. The visit is stored with the session, the path, the arrival
// time, the agent's class and an HMAC of the address, and the link the session arrived by, if
// any. A missing or short IP_HASH_SALT, or a request with no client address, stores nothing:
// never an unsalted hash or a raw address. Nothing here logs an address, a cookie, a session
// identifier or the salt. Lint lets only app/api import this module, since it builds the secret
// client.

/** Bytes read from a body before it is refused: a path of 512 characters, escaped, fits. */
export const BODY_LIMIT = 2_048;

/** The longest path stored; the beacon sends only the pathname. */
export const PATH_LIMIT = 512;

/**
 * The most seconds one view is credited with. An hour is far longer than anyone reads one page
 * of a dashboard, and it bounds what a tab left open in front, or a forged update, can add to a
 * project's time on the admin page.
 */
export const SECONDS_CAP = 3_600;

/** Seconds above this are not a view's length but a malformed request, and are refused. */
const SECONDS_MAX = 366 * 24 * 3_600;

// A simple abuse limit on recorded views, counted in rate_limit_buckets as ingestion's limit is
// (and pruned with them a day later). A person clicking through every page makes a few views a
// minute; several people behind one address (an office) share the address's allowance.
export const SESSION_LIMIT_PER_MINUTE = 30;
export const IP_LIMIT_PER_MINUTE = 120;

const SESSION_KEY = 'visit-session:';
const IP_KEY = 'visit-ip:';

export interface VisitRow {
  readonly session_id: string;
  readonly path: string;
  readonly entered_at: string;
  readonly user_agent_class: UserAgentClass;
  readonly ip_hash: string;
  readonly tracked_link_id: string | null;
}

export interface VisitStore {
  /** Counts a hit in the minute and returns the count so far. */
  rateLimitHit(key: string, minute: Date): Promise<number>;
  /** The tracked link the session arrived by, or null. */
  linkForSession(sessionId: string): Promise<string | null>;
  /** Inserts the visit and returns its id. */
  insertVisit(row: VisitRow): Promise<string>;
  /** Sets the seconds of a visit of this session that has none yet; otherwise changes nothing. */
  recordSeconds(visitId: string, sessionId: string, seconds: number): Promise<void>;
}

export interface VisitDeps {
  readonly store: () => VisitStore;
  /** When the request arrived; the wall clock, as ingestion dates a report it receives. */
  readonly receivedAt: () => Date;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly newSessionId: () => string;
  /** Whether the session cookie is marked Secure. */
  readonly secure: boolean;
  /** For a setting that is missing: logged once per key for the life of the server. */
  readonly warn: (key: string, message: string) => void;
  readonly log: (message: string) => void;
}

const LOG_PREFIX = 'testpulse visits:';

const VisitInputSchema = z.strictObject({
  path: z
    .string()
    .max(PATH_LIMIT)
    .regex(/^\/[^?#\s]*$/),
});

const TimeInputSchema = z.strictObject({
  id: z.uuid(),
  seconds: z.int().min(0).max(SECONDS_MAX),
});

/** Logs each key's first message only, so a missing setting is said once, not per request. */
export function onceLogger(log: (message: string) => void): (key: string, message: string) => void {
  const said = new Set<string>();
  return (key, message) => {
    if (said.has(key)) return;
    said.add(key);
    log(message);
  };
}

/**
 * Whether the request came from a page of this site: its Origin, which browsers send with every
 * POST, names the host it was sent to, and Sec-Fetch-Site, where the browser sends it, says
 * same-origin. Another site's page, a form posted from elsewhere and a client sending no Origin
 * are refused.
 */
export function isSameOrigin(headers: Headers): boolean {
  const site = headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin') return false;
  const origin = headers.get('origin');
  const host = headers.get('host');
  if (origin === null || host === null) return false;
  try {
    return new URL(origin).host === host.toLowerCase();
  } catch {
    return false;
  }
}

/** The body as text, or null when it is longer than the limit; stops reading once it is. */
async function readCapped(request: Request, limit: number): Promise<string | null> {
  const declared = request.headers.get('content-length');
  if (declared !== null && Number(declared) > limit) return null;
  if (request.body === null) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; status: number };

async function readInput<T>(request: Request, schema: z.ZodType<T>): Promise<Parsed<T>> {
  if (!isSameOrigin(request.headers)) return { ok: false, status: 403 };
  const text = await readCapped(request, BODY_LIMIT);
  if (text === null) return { ok: false, status: 413 };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, status: 400 };
  }
  const parsed = schema.safeParse(json);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, status: 400 };
}

const noStore = (): Headers => new Headers({ 'cache-control': 'no-store' });
const empty = (status: number, headers: Headers = noStore()): Response =>
  new Response(null, { status, headers });

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const minuteOf = (instant: Date): Date => new Date(Math.floor(instant.getTime() / 60_000) * 60_000);

export async function handleVisit(request: Request, deps: VisitDeps): Promise<Response> {
  const input = await readInput(request, VisitInputSchema);
  if (!input.ok) return empty(input.status);

  const session = ensureSession(request.headers.get('cookie'), deps.newSessionId);
  const headers = noStore();
  if (session.isNew) {
    headers.set('set-cookie', sessionCookieHeader(session.id, { secure: deps.secure }));
  }

  let salt: string;
  try {
    salt = readIpHashSalt(deps.env);
  } catch {
    deps.warn(
      'salt',
      `${LOG_PREFIX} ${IP_HASH_SALT_VAR} is missing or shorter than ` +
        `${String(IP_HASH_SALT_MIN_LENGTH)} characters, so no visit is stored`,
    );
    return empty(204, headers);
  }
  const ip = clientIpFromHeaders(request.headers);
  if (ip === null) {
    deps.warn('address', `${LOG_PREFIX} a request had no client address, so no visit is stored`);
    return empty(204, headers);
  }
  const ipHash = hashClientIp(ip, salt);

  let store: VisitStore;
  try {
    store = deps.store();
  } catch (error) {
    // createSecretClient names a missing setting, never its value.
    deps.warn('store', `${LOG_PREFIX} not configured, so no visit is stored: ${messageOf(error)}`);
    return empty(204, headers);
  }

  try {
    const receivedAt = deps.receivedAt();
    const minute = minuteOf(receivedAt);
    const sessionHits = await store.rateLimitHit(`${SESSION_KEY}${session.id}`, minute);
    const ipHits = await store.rateLimitHit(`${IP_KEY}${ipHash}`, minute);
    // Over the limit is answered as nothing stored, the same as any other view not recorded.
    if (sessionHits > SESSION_LIMIT_PER_MINUTE || ipHits > IP_LIMIT_PER_MINUTE) {
      return empty(204, headers);
    }
    // A session made by this request cannot have arrived by a link.
    const link = session.isNew ? null : await store.linkForSession(session.id);
    const id = await store.insertVisit({
      session_id: session.id,
      path: input.value.path,
      entered_at: receivedAt.toISOString(),
      user_agent_class: classifyUserAgent(request.headers.get('user-agent')),
      ip_hash: ipHash,
      tracked_link_id: link,
    });
    return Response.json({ id }, { status: 201, headers });
  } catch (error) {
    // The store's errors carry a step, a database code and its message, never a row's values.
    deps.log(`${LOG_PREFIX} ${messageOf(error)}`);
    return empty(500, headers);
  }
}

export async function handleVisitTime(request: Request, deps: VisitDeps): Promise<Response> {
  const input = await readInput(request, TimeInputSchema);
  if (!input.ok) return empty(input.status);
  // Without the session there is no visit of the caller's to update; no cookie is set here.
  const session = readSessionCookie(request.headers.get('cookie'));
  if (session === null) return empty(204);
  let store: VisitStore;
  try {
    store = deps.store();
  } catch (error) {
    deps.warn('store', `${LOG_PREFIX} not configured, so no visit is stored: ${messageOf(error)}`);
    return empty(204);
  }
  try {
    await store.recordSeconds(input.value.id, session, Math.min(input.value.seconds, SECONDS_CAP));
  } catch (error) {
    deps.log(`${LOG_PREFIX} ${messageOf(error)}`);
    return empty(500);
  }
  return empty(204);
}

const failed = (what: string, error: { code: string; message: string }): Error =>
  new Error(`${what}: ${error.code} ${error.message}`);

const IdRowSchema = z.object({ id: z.string().min(1) });
const LinkRowSchema = z.object({ tracked_link_id: z.string().min(1) }).nullable();

export function supabaseVisitStore(client: SupabaseClient): VisitStore {
  return {
    async rateLimitHit(key, minute) {
      const { data, error } = await client.rpc('rate_limit_hit', {
        p_api_key_hash: key,
        p_minute: minute.toISOString(),
      });
      if (error) throw failed('rate_limit_hit', error);
      return Number(data);
    },
    async linkForSession(sessionId) {
      const { data, error } = await client
        .from('tracked_sessions')
        .select('tracked_link_id')
        .eq('session_id', sessionId)
        .maybeSingle();
      if (error) throw failed('read the session’s link', error);
      return LinkRowSchema.parse(data)?.tracked_link_id ?? null;
    },
    async insertVisit(row) {
      const { data, error } = await client.from('visits').insert(row).select('id').single();
      if (error) throw failed('insert the visit', error);
      return IdRowSchema.parse(data).id;
    },
    async recordSeconds(visitId, sessionId, seconds) {
      const { error } = await client
        .from('visits')
        .update({ seconds_on_page: seconds })
        .eq('id', visitId)
        .eq('session_id', sessionId)
        .is('seconds_on_page', null);
      if (error) throw failed('record the time', error);
    },
  };
}

const warnOnce = onceLogger((message) => console.error(message));

/** What the routes run with: the secret client, the wall clock and the process's settings. */
export function visitDeps(
  env: Readonly<Record<string, string | undefined>> = process.env,
): VisitDeps {
  return {
    store: () => supabaseVisitStore(createSecretClient(env)),
    receivedAt: () => new Date(),
    env,
    newSessionId: () => randomUUID(),
    secure: cookieSecure(env),
    warn: warnOnce,
    log: (message) => console.error(message),
  };
}
