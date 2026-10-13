import { randomUUID } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { createSecretClient } from '../supabase/server.ts';
import { cookieSecure, ensureSession, sessionCookieHeader } from '../visits/session.ts';
import { classifyUserAgent } from '../visits/user-agent.ts';
import { TOKEN_PATTERN } from './token.ts';

// /v/<token> (spec sections 14 and 15; decision rows of 2026-10-12), served by
// app/api/v/[token]/route.ts through a rewrite. The visitor gets the session cookie (kept if
// they have one) and a 303 to /, so the token leaves the address bar at once. Only a token of
// the right shape is looked up, and only a known one opened by a browser records the session
// against its link in tracked_sessions; the latest link a session opens wins. Every request gets
// the same answer, whether the token is known, unknown or malformed, the agent a bot or a
// preview, or the database down, so the response tells nobody whether a token exists. The
// request is not itself a visit: the page's beacon records visits. Nothing here logs the token or
// the session. Lint lets only app/api import this module, since it builds the secret client.

export interface ArrivalStore {
  /** The link's id for a token, or null. */
  findLink(token: string): Promise<string | null>;
  /** Records the session against the link, replacing any link it had. */
  attachSession(sessionId: string, linkId: string, at: Date): Promise<void>;
}

export interface ArrivalDeps {
  readonly store: () => ArrivalStore;
  /** When the request arrived; the wall clock, as ingestion dates a report it receives. */
  readonly receivedAt: () => Date;
  readonly newSessionId: () => string;
  readonly secure: boolean;
  readonly log: (message: string) => void;
}

const LOG_PREFIX = 'testpulse tracked link:';

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

export async function handleArrival(
  request: Request,
  token: string,
  deps: ArrivalDeps,
): Promise<Response> {
  const session = ensureSession(request.headers.get('cookie'), deps.newSessionId);
  const headers = new Headers({ location: '/', 'cache-control': 'no-store' });
  if (session.isNew) {
    headers.set('set-cookie', sessionCookieHeader(session.id, { secure: deps.secure }));
  }

  const browser = classifyUserAgent(request.headers.get('user-agent')) === 'browser';
  if (browser && TOKEN_PATTERN.test(token)) {
    try {
      const store = deps.store();
      const link = await store.findLink(token);
      if (link !== null) await store.attachSession(session.id, link, deps.receivedAt());
    } catch (error) {
      // The visitor still lands on the site; the failure is the log's, worded without the token.
      deps.log(`${LOG_PREFIX} ${messageOf(error)}`);
    }
  }
  return new Response(null, { status: 303, headers });
}

const failed = (what: string, error: { code: string; message: string }): Error =>
  new Error(`${what}: ${error.code} ${error.message}`);

const LinkRowSchema = z.object({ id: z.string().min(1) }).nullable();

export function supabaseArrivalStore(client: SupabaseClient): ArrivalStore {
  return {
    async findLink(token) {
      const { data, error } = await client
        .from('tracked_links')
        .select('id')
        .eq('token', token)
        .maybeSingle();
      if (error) throw failed('look up the link', error);
      return LinkRowSchema.parse(data)?.id ?? null;
    },
    async attachSession(sessionId, linkId, at) {
      const { error } = await client
        .from('tracked_sessions')
        .upsert(
          { session_id: sessionId, tracked_link_id: linkId, created_at: at.toISOString() },
          { onConflict: 'session_id' },
        );
      if (error) throw failed('record the session', error);
    },
  };
}

/** What the route runs with: the secret client, the wall clock and the process's settings. */
export function arrivalDeps(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ArrivalDeps {
  return {
    store: () => supabaseArrivalStore(createSecretClient(env)),
    receivedAt: () => new Date(),
    newSessionId: () => randomUUID(),
    secure: cookieSecure(env),
    log: (message) => console.error(message),
  };
}
