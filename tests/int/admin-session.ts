import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

import { ADMIN_AUTH_COOKIE } from '../../lib/admin/session.ts';
import { readIntegrationEnv } from './env.ts';

// Test-side handling of the admin session against local Supabase Auth: issuing sign-in tokens
// without sending mail, and reading or rewriting the session cookies @supabase/ssr writes
// ("base64-" and base64url JSON, split into `.0`, `.1`… chunks when long). The secret client
// here belongs to the test, never to the code under test.

const PREFIX = 'base64-';
const CHUNK = 3180;

export function secretClient(): SupabaseClient {
  const { url, secretKey } = readIntegrationEnv();
  return createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** A one-time sign-in token's hash for the address, as the emailed link carries it; no mail. */
export async function signInTokenHash(admin: SupabaseClient, email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error !== null) throw new Error(`generateLink failed: ${error.code ?? error.status}`);
  return data.properties.hashed_token;
}

export const confirmParams = (tokenHash: string) =>
  new URLSearchParams({ token_hash: tokenHash, type: 'email' });

interface Cookie {
  readonly name: string;
  readonly value: string;
}

const order = (name: string) => (name === ADMIN_AUTH_COOKIE ? -1 : Number(name.split('.').at(-1)));

/** The session in a set of cookies, or null when they hold none. */
export function sessionIn(cookies: readonly Cookie[]): Session | null {
  const parts = cookies
    .filter(({ name }) => name === ADMIN_AUTH_COOKIE || /^testpulse_admin_auth\.\d+$/.test(name))
    .sort((a, b) => order(a.name) - order(b.name));
  if (parts.length === 0) return null;
  const joined = parts.map(({ value }) => value).join('');
  if (!joined.startsWith(PREFIX)) throw new Error('not a base64 session cookie');
  return JSON.parse(Buffer.from(joined.slice(PREFIX.length), 'base64url').toString('utf8'));
}

/** The cookies @supabase/ssr would write for the session. */
export function cookiesFor(session: unknown): Record<string, string> {
  const value = PREFIX + Buffer.from(JSON.stringify(session)).toString('base64url');
  if (value.length <= CHUNK) return { [ADMIN_AUTH_COOKIE]: value };
  const cookies: Record<string, string> = {};
  for (let index = 0; index * CHUNK < value.length; index += 1) {
    cookies[`${ADMIN_AUTH_COOKIE}.${index}`] = value.slice(index * CHUNK, (index + 1) * CHUNK);
  }
  return cookies;
}
