import type { SupabaseClient } from '@supabase/supabase-js';

import { isUnavailable } from './access.ts';
import { isAdminEmail } from './allowlist.ts';

// Where the emailed link lands (spec section 15; section 17, Phase 6 criterion 2). The Magic Link
// template sends /admin/auth/confirm?token_hash=…&type=email; the token is spent with Supabase
// Auth, which sets the session cookies, and the address is checked again before anything else: a
// session for any other address is ended everywhere at once.

export type ConfirmAuth = Pick<SupabaseClient['auth'], 'verifyOtp' | 'signOut'>;

export type ConfirmOutcome =
  | { readonly kind: 'allowed' }
  | { readonly kind: 'refused'; readonly email: string }
  | { readonly kind: 'link-expired' }
  | { readonly kind: 'unavailable' };

// Supabase's token hashes are hex today; the shape is checked loosely and capped, so a value
// that could never be one is not sent to Supabase at all.
const TOKEN_HASH = /^[A-Za-z0-9_-]{1,128}$/;

const EXPIRED: ConfirmOutcome = { kind: 'link-expired' };
const UNAVAILABLE: ConfirmOutcome = { kind: 'unavailable' };

export async function confirmSignIn(
  params: URLSearchParams,
  auth: ConfirmAuth,
  adminEmail: string | undefined,
): Promise<ConfirmOutcome> {
  const tokenHash = params.get('token_hash');
  // Only the type the template sends: a recovery, invite or email-change token is not a sign-in.
  if (params.get('type') !== 'email' || tokenHash === null || !TOKEN_HASH.test(tokenHash)) {
    return EXPIRED;
  }

  let email: string;
  try {
    const { data, error } = await auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
    if (error !== null) return isUnavailable(error) ? UNAVAILABLE : EXPIRED;
    if (data.session === null) return EXPIRED;
    email = data.user?.email ?? '';
  } catch {
    return UNAVAILABLE;
  }

  if (isAdminEmail(email, adminEmail)) return { kind: 'allowed' };
  try {
    // Every session of that user, not only this one: none of them may open admin.
    await auth.signOut({ scope: 'global' });
  } catch {
    // The caller deletes the session cookies whatever happened here.
  }
  return { kind: 'refused', email };
}
