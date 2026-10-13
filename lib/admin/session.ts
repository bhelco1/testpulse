import { type CookieMethodsServer, createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

import { publishableConfig } from '../supabase/public.ts';
import { cookieSecure } from '../visits/session.ts';

// The owner's admin session (spec section 15, "Admin" as built). It runs on the publishable key:
// what proves who is asking is the session Supabase Auth issued through the magic link, which the
// guard (lib/admin/guard.ts) checks with Supabase on every request, never the key.

type Env = Readonly<Record<string, string | undefined>>;

// @supabase/ssr stores the session under this name, split into `.0`, `.1`… chunks when it is
// long, and names any PKCE verifier after it with a `-` suffix.
export const ADMIN_AUTH_COOKIE = 'testpulse_admin_auth';
// Every admin page, action and route is under /admin, so the session is never sent anywhere else.
export const ADMIN_COOKIE_PATH = '/admin';
// The address a refused sign-in used, kept just long enough to name it on the refused card after
// its session has been ended (lib/admin/handlers.ts).
export const REFUSED_COOKIE = 'testpulse_admin_refused';
const REFUSED_SECONDS = 5 * 60;

export function adminCookieOptions(env: Env) {
  return {
    name: ADMIN_AUTH_COOKIE,
    path: ADMIN_COOKIE_PATH,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: cookieSecure(env),
  };
}

export function refusedCookieOptions(env: Env) {
  return {
    path: ADMIN_COOKIE_PATH,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: cookieSecure(env),
    maxAge: REFUSED_SECONDS,
  };
}

export function isAdminSessionCookie(name: string): boolean {
  if (name === ADMIN_AUTH_COOKIE) return true;
  if (!name.startsWith(ADMIN_AUTH_COOKIE)) return false;
  const rest = name.slice(ADMIN_AUTH_COOKIE.length);
  return rest.startsWith('-') || /^\.\d+$/.test(rest);
}

/** A client for one request, bound to that request's cookies. Never shared between requests. */
export function createAdminSessionClient(
  cookies: CookieMethodsServer,
  env: Env = process.env,
): SupabaseClient {
  const { url, key } = publishableConfig(env);
  return createServerClient(url, key, { cookieOptions: adminCookieOptions(env), cookies });
}
