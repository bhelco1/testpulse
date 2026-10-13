import {
  type AuthError,
  isAuthRetryableFetchError,
  type SupabaseClient,
} from '@supabase/supabase-js';

import { isAdminEmail } from './allowlist.ts';

// Who is asking for admin (spec section 15; section 17, Phase 6 criterion 2). The session comes
// from the request's cookies, but nothing in them is trusted: getUser sends the access token to
// Supabase Auth, which answers only for a session it issued and has not ended. Every admin page,
// action and route reaches this through lib/admin/guard.ts before doing anything else.

export type SessionAuth = Pick<SupabaseClient['auth'], 'getUser' | 'getSession'>;

export type AdminAccess =
  | { readonly status: 'allowed'; readonly email: string }
  | { readonly status: 'refused'; readonly email: string }
  | {
      readonly status: 'signed-out';
      // no-session: no session cookie at all. session-ended: a cookie Supabase no longer
      // accepts (expired, revoked, signed out elsewhere, or forged). not-magic-link: the owner's
      // address, signed in some other way than the emailed link.
      readonly reason: 'no-session' | 'session-ended' | 'not-magic-link';
    }
  | { readonly status: 'unavailable' };

export interface AccessOptions {
  readonly hasSessionCookie: boolean;
  readonly adminEmail: string | undefined;
}

const NO_SESSION: AdminAccess = { status: 'signed-out', reason: 'no-session' };
const SESSION_ENDED: AdminAccess = { status: 'signed-out', reason: 'session-ended' };
const NOT_MAGIC_LINK: AdminAccess = { status: 'signed-out', reason: 'not-magic-link' };
const UNAVAILABLE: AdminAccess = { status: 'unavailable' };

/** Supabase could not answer, as opposed to answering no. */
export function isUnavailable(error: AuthError): boolean {
  return isAuthRetryableFetchError(error) || (error.status ?? 0) >= 500;
}

function claimsOf(token: string): Record<string, unknown> | null {
  const [, payload, ...rest] = token.split('.');
  if (payload === undefined || rest.length !== 1) return null;
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof claims === 'object' && claims !== null
      ? (claims as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Whether the session was signed in by an emailed one-time link: Supabase records that as the
 * `otp` method in the access token's `amr` claim, where a password reads `password`. Read only
 * after getUser has had Supabase accept this same token, and only for the user it named.
 */
function signedInByEmailLink(token: string, userId: string): boolean {
  const claims = claimsOf(token);
  if (claims === null || claims.sub !== userId || !Array.isArray(claims.amr)) return false;
  return claims.amr.some(
    (entry: unknown) =>
      typeof entry === 'object' && entry !== null && 'method' in entry && entry.method === 'otp',
  );
}

export async function readAdminAccess(
  auth: SessionAuth,
  { hasSessionCookie, adminEmail }: AccessOptions,
): Promise<AdminAccess> {
  // Without a cookie there is nothing to check, so no request is made on Supabase's behalf.
  if (!hasSessionCookie) return NO_SESSION;
  try {
    const { data, error } = await auth.getUser();
    if (error !== null) return isUnavailable(error) ? UNAVAILABLE : SESSION_ENDED;
    // The types promise a user with every answer that is not an error; a session that names
    // none, or a user without an address, is not one admin can name or allow.
    const user: typeof data.user | null = data.user;
    if (user === null || user.email === undefined || user.email === '') return SESSION_ENDED;
    if (!isAdminEmail(user.email, adminEmail)) return { status: 'refused', email: user.email };

    const { data: current } = await auth.getSession();
    const token = current.session?.access_token;
    if (token === undefined || !signedInByEmailLink(token, user.id)) return NOT_MAGIC_LINK;
    return { status: 'allowed', email: user.email };
  } catch {
    // The client throws only when it cannot reach Supabase or read its answer.
    return UNAVAILABLE;
  }
}
