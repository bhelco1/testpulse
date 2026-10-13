import type { CookieMethodsServer } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { type AdminAccess, readAdminAccess } from './access.ts';
import { ADMIN_EMAIL_VAR } from './allowlist.ts';
import { createAdminSessionClient, isAdminSessionCookie } from './session.ts';

// The admin guard (spec section 15: "checked server-side on every admin route and action";
// section 17, Phase 6 criterion 2). Every admin page calls getAdminAccess, and every admin action
// and route handler calls requireAdmin, as its first statement; lib/admin/guarded.test.ts holds
// every file under app/admin to that. Each call asks Supabase Auth afresh: nothing is cached.

export type AdminGate =
  | { readonly ok: true; readonly email: string }
  // 401: not the owner's magic-link session (none, ended, refused); 503: Supabase did not answer.
  | { readonly ok: false; readonly status: 401 | 503 };

/** The guard's yes: what admin's reads and writes ask for (lib/admin/data.ts). */
export type AccessGranted = Extract<AdminGate, { readonly ok: true }>;

type CookieStore = Awaited<ReturnType<typeof cookies>>;

/** The client's view of the request's cookies, writing back where the store allows it. */
export function cookieMethods(store: CookieStore): CookieMethodsServer {
  return {
    getAll: () => store.getAll(),
    setAll: (list) => {
      try {
        for (const { name, value, options } of list) store.set(name, value, options);
      } catch {
        // A Server Component cannot set cookies. proxy.ts has already refreshed the session for
        // the request, so a page only reads it.
      }
    },
  };
}

export async function getAdminAccess(): Promise<AdminAccess> {
  const store = await cookies();
  const hasSessionCookie = store.getAll().some(({ name }) => isAdminSessionCookie(name));
  if (!hasSessionCookie) return { status: 'signed-out', reason: 'no-session' };
  let client;
  try {
    client = createAdminSessionClient(cookieMethods(store));
  } catch (error) {
    // publishableConfig names a missing or wrong setting, never a key.
    console.error(
      `testpulse admin: not configured: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { status: 'unavailable' };
  }
  return readAdminAccess(client.auth, {
    hasSessionCookie,
    adminEmail: process.env[ADMIN_EMAIL_VAR],
  });
}

export function gateFor(access: AdminAccess): AdminGate {
  if (access.status === 'allowed') return { ok: true, email: access.email };
  return { ok: false, status: access.status === 'unavailable' ? 503 : 401 };
}

/** For admin server actions and route handlers: anything but the owner gets a refusal. */
export async function requireAdmin(): Promise<AdminGate> {
  return gateFor(await getAdminAccess());
}
