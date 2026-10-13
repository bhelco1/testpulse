import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  type AuthError,
} from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { readAdminAccess, type SessionAuth } from './access.ts';

// Spec section 15 and section 17, Phase 6 criterion 2: admin requires magic-link sign-in from the
// allowlisted address; any other address is refused; the session is checked with Supabase Auth
// (getUser), never by trusting a decoded cookie.

const OWNER = 'owner@example.com';
const OWNER_ID = '7d0f8a8e-0000-4000-8000-000000000001';

const base64url = (value: string) => Buffer.from(value).toString('base64url');
// Unsigned: getUser is what Supabase checks; the token is only read for its sign-in method.
const accessToken = (claims: Record<string, unknown>) =>
  [base64url('{"alg":"HS256"}'), base64url(JSON.stringify(claims)), 'unit-test-signature'].join(
    '.',
  );
const OTP_TOKEN = accessToken({ sub: OWNER_ID, amr: [{ method: 'otp', timestamp: 1 }] });

interface Fake {
  user?: { id: string; email?: string } | null;
  error?: AuthError | null;
  token?: string | null;
  throws?: unknown;
}

function fakeAuth({ user = null, error = null, token = OTP_TOKEN, throws }: Fake): SessionAuth {
  return {
    getUser: vi.fn(async () => {
      if (throws !== undefined) throw throws;
      return (
        error === null ? { data: { user }, error: null } : { data: { user: null }, error }
      ) as Awaited<ReturnType<SessionAuth['getUser']>>;
    }),
    getSession: vi.fn(
      async () =>
        ({
          data: { session: token === null ? null : { access_token: token } },
          error: null,
        }) as Awaited<ReturnType<SessionAuth['getSession']>>,
    ),
  };
}

const owner = { id: OWNER_ID, email: OWNER };
const signedIn = { hasSessionCookie: true, adminEmail: OWNER };

describe('readAdminAccess', () => {
  it('allows the owner signed in by magic link', async () => {
    await expect(readAdminAccess(fakeAuth({ user: owner }), signedIn)).resolves.toEqual({
      status: 'allowed',
      email: OWNER,
    });
  });

  it('asks Supabase Auth for the user rather than reading the cookie', async () => {
    const auth = fakeAuth({ user: owner });
    await readAdminAccess(auth, signedIn);
    expect(auth.getUser).toHaveBeenCalledTimes(1);
    expect(auth.getUser).toHaveBeenCalledWith();
  });

  it('allows the owner whatever the case or spacing of either address', async () => {
    const auth = fakeAuth({ user: { id: OWNER_ID, email: 'Owner@Example.com' } });
    await expect(
      readAdminAccess(auth, { hasSessionCookie: true, adminEmail: '  OWNER@example.COM ' }),
    ).resolves.toEqual({ status: 'allowed', email: 'Owner@Example.com' });
  });

  it('refuses another address, naming it', async () => {
    const other = { id: OWNER_ID, email: 'someone@example.org' };
    await expect(readAdminAccess(fakeAuth({ user: other }), signedIn)).resolves.toEqual({
      status: 'refused',
      email: 'someone@example.org',
    });
  });

  it.each([
    ['missing', undefined],
    ['blank', '  '],
  ])('refuses the owner too when ADMIN_EMAIL is %s', async (_label, adminEmail) => {
    await expect(
      readAdminAccess(fakeAuth({ user: owner }), { hasSessionCookie: true, adminEmail }),
    ).resolves.toEqual({ status: 'refused', email: OWNER });
  });

  it('is signed out, without asking Supabase, when the request has no session cookie', async () => {
    const auth = fakeAuth({ user: owner });
    await expect(
      readAdminAccess(auth, { hasSessionCookie: false, adminEmail: OWNER }),
    ).resolves.toEqual({ status: 'signed-out', reason: 'no-session' });
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it.each([
    ['expired or revoked', new AuthApiError('Session not found', 403, 'session_not_found')],
    ['forged', new AuthApiError('invalid JWT', 403, 'bad_jwt')],
    [
      'a refresh token already used',
      new AuthApiError('Invalid Refresh Token', 400, 'refresh_token_not_found'),
    ],
    ['unreadable', new AuthSessionMissingError()],
  ])('treats a session that is %s as ended', async (_label, error) => {
    await expect(readAdminAccess(fakeAuth({ error }), signedIn)).resolves.toEqual({
      status: 'signed-out',
      reason: 'session-ended',
    });
  });

  it('treats a session with no user, or a user with no address, as ended', async () => {
    await expect(readAdminAccess(fakeAuth({ user: null }), signedIn)).resolves.toEqual({
      status: 'signed-out',
      reason: 'session-ended',
    });
    await expect(readAdminAccess(fakeAuth({ user: { id: OWNER_ID } }), signedIn)).resolves.toEqual({
      status: 'signed-out',
      reason: 'session-ended',
    });
  });

  it.each([
    ['a password', accessToken({ sub: OWNER_ID, amr: [{ method: 'password', timestamp: 1 }] })],
    ['no sign-in method', accessToken({ sub: OWNER_ID })],
    ['another user’s magic link', accessToken({ sub: 'someone-else', amr: [{ method: 'otp' }] })],
    ['a token that is not a JWT', 'not-a-jwt'],
    ['a payload that is not JSON', `a.${base64url('{')}.b`],
  ])('does not let the owner in on a session from %s', async (_label, token) => {
    await expect(readAdminAccess(fakeAuth({ user: owner, token }), signedIn)).resolves.toEqual({
      status: 'signed-out',
      reason: 'not-magic-link',
    });
  });

  it('does not let the owner in when the session holds no token', async () => {
    await expect(
      readAdminAccess(fakeAuth({ user: owner, token: null }), signedIn),
    ).resolves.toEqual({ status: 'signed-out', reason: 'not-magic-link' });
  });

  it.each([
    ['a network failure', new AuthRetryableFetchError('fetch failed', 0)],
    ['a gateway error', new AuthRetryableFetchError('Bad Gateway', 502)],
    ['a server error', new AuthApiError('Internal error', 500, 'unexpected_failure')],
  ])('reports Supabase as unavailable on %s, letting no one in', async (_label, error) => {
    await expect(readAdminAccess(fakeAuth({ error }), signedIn)).resolves.toEqual({
      status: 'unavailable',
    });
  });

  it('reports Supabase as unavailable when the client throws', async () => {
    await expect(
      readAdminAccess(fakeAuth({ throws: new TypeError('fetch failed') }), signedIn),
    ).resolves.toEqual({ status: 'unavailable' });
  });
});
