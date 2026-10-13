import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { type ConfirmAuth, confirmSignIn } from './confirm.ts';

// The magic link's landing (spec section 15; section 17, Phase 6 criterion 2): the emailed link
// opens /admin/auth/confirm with the token's hash; the token is spent with Supabase Auth, and the
// address of the session it makes is checked again here, so a link for any other address ends its
// session at once.

const OWNER = 'owner@example.com';
const HASH = 'a'.repeat(56);

function fakeAuth(
  answer: () => Promise<{ data: unknown; error: Error | null }>,
  signOut: () => Promise<{ error: Error | null }> = async () => ({ error: null }),
) {
  const auth = { verifyOtp: vi.fn(answer), signOut: vi.fn(signOut) };
  return auth as typeof auth & ConfirmAuth;
}

const session = (email: string | undefined) => async () => ({
  data: { user: { id: 'u', email }, session: { access_token: 't' } },
  error: null,
});
const params = (query: string) => new URLSearchParams(query);
const link = params(`token_hash=${HASH}&type=email`);

describe('confirmSignIn', () => {
  it('spends the owner’s token and signs in', async () => {
    const auth = fakeAuth(session(OWNER));

    await expect(confirmSignIn(link, auth, OWNER)).resolves.toEqual({ kind: 'allowed' });
    expect(auth.verifyOtp).toHaveBeenCalledExactlyOnceWith({ token_hash: HASH, type: 'email' });
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('checks the address case-insensitively, as the guard does', async () => {
    const auth = fakeAuth(session('OWNER@example.com'));
    await expect(confirmSignIn(link, auth, ' owner@EXAMPLE.com ')).resolves.toEqual({
      kind: 'allowed',
    });
  });

  it('ends every session of another address at once and refuses it, naming it', async () => {
    const auth = fakeAuth(session('someone@example.org'));

    await expect(confirmSignIn(link, auth, OWNER)).resolves.toEqual({
      kind: 'refused',
      email: 'someone@example.org',
    });
    expect(auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'global' });
  });

  it.each([
    ['missing', undefined],
    ['blank', ''],
  ])('refuses the owner too when ADMIN_EMAIL is %s', async (_label, adminEmail) => {
    const auth = fakeAuth(session(OWNER));
    await expect(confirmSignIn(link, auth, adminEmail)).resolves.toEqual({
      kind: 'refused',
      email: OWNER,
    });
    expect(auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'global' });
  });

  it('still refuses when ending the session fails; the caller clears its cookies', async () => {
    const auth = fakeAuth(session('someone@example.org'), async () => {
      throw new TypeError('fetch failed');
    });
    await expect(confirmSignIn(link, auth, OWNER)).resolves.toEqual({
      kind: 'refused',
      email: 'someone@example.org',
    });
  });

  it('refuses a session with no address without naming one', async () => {
    const auth = fakeAuth(session(undefined));
    await expect(confirmSignIn(link, auth, OWNER)).resolves.toEqual({
      kind: 'refused',
      email: '',
    });
    expect(auth.signOut).toHaveBeenCalledOnce();
  });

  it('says the link expired or was used when Supabase refuses the token', async () => {
    const auth = fakeAuth(async () => ({
      data: { user: null, session: null },
      error: new AuthApiError('Email link is invalid or has expired', 403, 'otp_expired'),
    }));
    await expect(confirmSignIn(link, auth, OWNER)).resolves.toEqual({ kind: 'link-expired' });
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('says the link expired when Supabase answers with no session', async () => {
    const auth = fakeAuth(async () => ({ data: { user: null, session: null }, error: null }));
    await expect(confirmSignIn(link, auth, OWNER)).resolves.toEqual({ kind: 'link-expired' });
  });

  it.each([
    ['no token', 'type=email'],
    ['an empty token', 'token_hash=&type=email'],
    ['a token with other characters', 'token_hash=abc%20def%3Cscript%3E&type=email'],
    ['a token longer than any Supabase issues', `token_hash=${'a'.repeat(129)}&type=email`],
    ['no type', `token_hash=${HASH}`],
    ['the recovery type', `token_hash=${HASH}&type=recovery`],
    ['the invite type', `token_hash=${HASH}&type=invite`],
    ['the email change type', `token_hash=${HASH}&type=email_change`],
  ])('treats a link with %s as expired without asking Supabase', async (_label, query) => {
    const auth = fakeAuth(session(OWNER));
    await expect(confirmSignIn(params(query), auth, OWNER)).resolves.toEqual({
      kind: 'link-expired',
    });
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it.each([
    ['a network failure', new AuthRetryableFetchError('fetch failed', 0)],
    ['a server error', new AuthApiError('Internal error', 500, 'unexpected_failure')],
  ])(
    'reports Supabase as unavailable on %s, leaving the token for another try',
    async (_l, error) => {
      const auth = fakeAuth(async () => ({ data: { user: null, session: null }, error }));
      await expect(confirmSignIn(link, auth, OWNER)).resolves.toEqual({ kind: 'unavailable' });
    },
  );

  it('reports Supabase as unavailable when the client throws', async () => {
    const auth = fakeAuth(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(confirmSignIn(link, auth, OWNER)).resolves.toEqual({ kind: 'unavailable' });
  });
});
