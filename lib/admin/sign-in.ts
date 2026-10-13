import { createClient } from '@supabase/supabase-js';

import { publishableConfig } from '../supabase/public.ts';
import { isAdminEmail } from './allowlist.ts';
import { EMAIL_MAX_LENGTH, isEmailAddress } from './email.ts';

// The sign-in form's server side (spec section 15; decisions of 2026-10-13). Every valid address
// gets the same answer, "If that address can sign in, a link is on its way", so the form cannot
// be used to learn which address is the owner's: only the allowlisted address is sent a link, it is
// decided here before Supabase Auth is asked, and the send runs after the answer has gone, so
// neither the answer, its cookies (there are none) nor its timing differ between the two.

export type SignInState =
  | { readonly status: 'idle' }
  | { readonly status: 'invalid'; readonly email: string }
  | { readonly status: 'sent' };

export interface SignInDeps {
  readonly adminEmail: string | undefined;
  readonly send: (email: string) => Promise<void>;
  // Runs the task once the response has been sent (next/server's `after` in the action).
  readonly later: (task: () => Promise<void>) => void;
}

const SENT: SignInState = { status: 'sent' };

export function requestSignInLink(
  input: FormDataEntryValue | null,
  { adminEmail, send, later }: SignInDeps,
): SignInState {
  const typed = typeof input === 'string' ? input : '';
  const email = typed.trim();
  if (!isEmailAddress(email)) {
    return { status: 'invalid', email: typed.slice(0, EMAIL_MAX_LENGTH) };
  }
  if (isAdminEmail(email, adminEmail)) later(() => send(email));
  return SENT;
}

const LOG_PREFIX = 'testpulse admin: the sign-in link was not sent';

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Asks Supabase Auth to email a one-time sign-in link. The link itself is the project's Magic Link
 * template (supabase/templates/magic-link.html), which points at /admin/auth/confirm with the
 * token's hash. The implicit flow is used because nothing is kept here: a PKCE flow would set a
 * verifier cookie on this answer only for the owner's address. Failures are logged by code alone,
 * never with the address, and are not shown, since showing them would reveal the address.
 */
export async function sendMagicLink(
  email: string,
  env: Env,
  log: (message: string) => void,
): Promise<void> {
  let config: { url: string; key: string };
  try {
    config = publishableConfig(env);
  } catch (error) {
    // publishableConfig names a missing or wrong setting, never a key.
    log(`${LOG_PREFIX} (${error instanceof Error ? error.message : 'not configured'})`);
    return;
  }
  try {
    const client = createClient(config.url, config.key, {
      auth: {
        flowType: 'implicit',
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (error !== null) {
      const code = 'code' in error && typeof error.code === 'string' ? error.code : 'unknown';
      log(`${LOG_PREFIX} (${code}, ${String(error.status ?? 'no status')})`);
    }
  } catch (error) {
    log(`${LOG_PREFIX} (${error instanceof Error ? error.name : 'unknown'})`);
  }
}
