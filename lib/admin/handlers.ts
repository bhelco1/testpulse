import { cookies } from 'next/headers';
import { after } from 'next/server';

import { ADMIN_EMAIL_VAR } from './allowlist.ts';
import { confirmSignIn } from './confirm.ts';
import { isEmailAddress } from './email.ts';
import { cookieMethods } from './guard.ts';
import {
  ADMIN_COOKIE_PATH,
  createAdminSessionClient,
  isAdminSessionCookie,
  REFUSED_COOKIE,
  refusedCookieOptions,
} from './session.ts';
import { requestSignInLink, sendMagicLink, type SignInState } from './sign-in.ts';
import { adminPath } from './view.ts';

// What app/admin's sign-in and sign-out actions and its confirm route do, bound to the request's
// cookies (spec section 15, "Admin" as built). These three are the only admin entry points that do
// not start with the guard: two run before there is a session to check, and sign-out only ends one
// (lib/admin/guarded.test.ts lists them, each with its reason).

type CookieStore = Awaited<ReturnType<typeof cookies>>;

function notConfigured(error: unknown): void {
  // publishableConfig names a missing or wrong setting, never a key.
  console.error(
    `testpulse admin: not configured: ${error instanceof Error ? error.message : String(error)}`,
  );
}

function deleteCookies(store: CookieStore, which: (name: string) => boolean): void {
  for (const { name } of store.getAll()) {
    if (which(name)) store.delete({ name, path: ADMIN_COOKIE_PATH });
  }
}

export async function handleSignInRequest(formData: FormData): Promise<SignInState> {
  return requestSignInLink(formData.get('email'), {
    adminEmail: process.env[ADMIN_EMAIL_VAR],
    send: (email) => sendMagicLink(email, process.env, console.error),
    later: (task) => after(task),
  });
}

/** Ends this browser's session with Supabase if it can, and deletes the admin cookies regardless. */
export async function handleSignOut(): Promise<void> {
  const store = await cookies();
  if (store.getAll().some(({ name }) => isAdminSessionCookie(name))) {
    try {
      const client = createAdminSessionClient(cookieMethods(store));
      await client.auth.signOut({ scope: 'local' });
    } catch (error) {
      notConfigured(error);
    }
  }
  deleteCookies(store, (name) => isAdminSessionCookie(name) || name === REFUSED_COOKIE);
}

/** Spends the emailed link's token and answers with where to send the browser. */
export async function handleConfirm(params: URLSearchParams): Promise<string> {
  const store = await cookies();
  let client;
  try {
    client = createAdminSessionClient(cookieMethods(store));
  } catch (error) {
    notConfigured(error);
    return adminPath('unavailable');
  }
  const outcome = await confirmSignIn(params, client.auth, process.env[ADMIN_EMAIL_VAR]);
  switch (outcome.kind) {
    case 'allowed':
      deleteCookies(store, (name) => name === REFUSED_COOKIE);
      return adminPath();
    case 'refused':
      deleteCookies(store, isAdminSessionCookie);
      if (isEmailAddress(outcome.email)) {
        store.set(REFUSED_COOKIE, outcome.email, refusedCookieOptions(process.env));
      }
      return adminPath();
    case 'link-expired':
      return adminPath('link-expired');
    case 'unavailable':
      return adminPath('unavailable');
  }
}

export async function readRefusedFlash(): Promise<string | undefined> {
  return (await cookies()).get(REFUSED_COOKIE)?.value;
}
