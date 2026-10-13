import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminAccess } from './access.ts';
import { FakeCookieStore } from './cookie-store.test-support.ts';
import { gateFor, getAdminAccess, requireAdmin } from './guard.ts';
import { ADMIN_AUTH_COOKIE, createAdminSessionClient } from './session.ts';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('./session.ts', async (original) => ({
  ...(await original<typeof import('./session.ts')>()),
  createAdminSessionClient: vi.fn(),
}));

// The one guard every admin page, action and route calls first (spec section 15; section 17,
// Phase 6 criterion 2). It reads the session from the request's cookies and has Supabase Auth
// check it on every call; nothing is cached between requests.

const OWNER = 'owner@example.com';
const OWNER_ID = 'owner-id';
const otpToken = [
  Buffer.from('{}').toString('base64url'),
  Buffer.from(JSON.stringify({ sub: OWNER_ID, amr: [{ method: 'otp' }] })).toString('base64url'),
  'sig',
].join('.');

function fakeClient(user: { id: string; email: string } | null, error: Error | null = null) {
  const auth = {
    getUser: vi.fn(async () => ({ data: { user }, error })),
    getSession: vi.fn(async () => ({ data: { session: { access_token: otpToken } }, error: null })),
  };
  vi.mocked(createAdminSessionClient).mockReturnValue({ auth } as never);
  return auth;
}

function serveCookies(store: FakeCookieStore) {
  vi.mocked(cookies).mockResolvedValue(store as never);
  return store;
}

beforeEach(() => {
  vi.stubEnv('ADMIN_EMAIL', OWNER);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(createAdminSessionClient).mockReset();
  vi.mocked(cookies).mockReset();
});

describe('getAdminAccess', () => {
  it('is signed out without building a client when the request has no session cookie', async () => {
    serveCookies(new FakeCookieStore({ testpulse_session: 'x' }));

    await expect(getAdminAccess()).resolves.toEqual({ status: 'signed-out', reason: 'no-session' });
    expect(createAdminSessionClient).not.toHaveBeenCalled();
  });

  it('has Supabase check the session in the request’s cookies, against ADMIN_EMAIL', async () => {
    serveCookies(new FakeCookieStore({ [ADMIN_AUTH_COOKIE]: 'session' }));
    const auth = fakeClient({ id: OWNER_ID, email: OWNER });

    await expect(getAdminAccess()).resolves.toEqual({ status: 'allowed', email: OWNER });
    expect(auth.getUser).toHaveBeenCalledOnce();

    vi.stubEnv('ADMIN_EMAIL', 'someone-else@example.com');
    await expect(getAdminAccess()).resolves.toEqual({ status: 'refused', email: OWNER });
  });

  it('hands the client the request’s cookies, and a page’s refusal to write them is not an error', async () => {
    serveCookies(new FakeCookieStore({ [`${ADMIN_AUTH_COOKIE}.0`]: 'chunk' }, true));
    fakeClient({ id: OWNER_ID, email: OWNER });

    await getAdminAccess();

    const [methods] = vi.mocked(createAdminSessionClient).mock.calls[0] ?? [];
    expect(await methods?.getAll()).toEqual([{ name: `${ADMIN_AUTH_COOKIE}.0`, value: 'chunk' }]);
    expect(() =>
      methods?.setAll?.([{ name: ADMIN_AUTH_COOKIE, value: 'refreshed', options: {} }], {}),
    ).not.toThrow();
  });

  it('writes refreshed cookies where the store allows it (actions and routes)', async () => {
    const store = serveCookies(new FakeCookieStore({ [ADMIN_AUTH_COOKIE]: 'session' }));
    fakeClient({ id: OWNER_ID, email: OWNER });

    await getAdminAccess();
    const [methods] = vi.mocked(createAdminSessionClient).mock.calls[0] ?? [];
    await methods?.setAll?.(
      [{ name: ADMIN_AUTH_COOKIE, value: 'refreshed', options: { path: '/admin' } }],
      {},
    );

    expect(store.writes).toEqual([
      { op: 'set', name: ADMIN_AUTH_COOKIE, value: 'refreshed', options: { path: '/admin' } },
    ]);
  });

  it('reports Supabase as unavailable when the client cannot be built, naming the setting', async () => {
    serveCookies(new FakeCookieStore({ [ADMIN_AUTH_COOKIE]: 'session' }));
    vi.mocked(createAdminSessionClient).mockImplementation(() => {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL.');
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(getAdminAccess()).resolves.toEqual({ status: 'unavailable' });
    expect(error).toHaveBeenCalledExactlyOnceWith(
      'testpulse admin: not configured: Missing NEXT_PUBLIC_SUPABASE_URL.',
    );
    error.mockRestore();
  });

  it('reports Supabase as unavailable when it cannot be reached', async () => {
    serveCookies(new FakeCookieStore({ [ADMIN_AUTH_COOKIE]: 'session' }));
    fakeClient(null, new AuthRetryableFetchError('fetch failed', 0));

    await expect(getAdminAccess()).resolves.toEqual({ status: 'unavailable' });
  });
});

describe('gateFor and requireAdmin', () => {
  it.each<[AdminAccess, ReturnType<typeof gateFor>]>([
    [
      { status: 'allowed', email: OWNER },
      { ok: true, email: OWNER },
    ],
    [
      { status: 'refused', email: 'someone@example.org' },
      { ok: false, status: 401 },
    ],
    [
      { status: 'signed-out', reason: 'no-session' },
      { ok: false, status: 401 },
    ],
    [
      { status: 'signed-out', reason: 'session-ended' },
      { ok: false, status: 401 },
    ],
    [
      { status: 'signed-out', reason: 'not-magic-link' },
      { ok: false, status: 401 },
    ],
    [{ status: 'unavailable' }, { ok: false, status: 503 }],
  ])('lets only the owner through: %o', (access, gate) => {
    expect(gateFor(access)).toEqual(gate);
  });

  it('checks the session afresh on every call', async () => {
    serveCookies(new FakeCookieStore({ [ADMIN_AUTH_COOKIE]: 'session' }));
    const auth = fakeClient({ id: OWNER_ID, email: OWNER });

    await expect(requireAdmin()).resolves.toEqual({ ok: true, email: OWNER });
    await expect(requireAdmin()).resolves.toEqual({ ok: true, email: OWNER });
    expect(auth.getUser).toHaveBeenCalledTimes(2);

    serveCookies(new FakeCookieStore());
    await expect(requireAdmin()).resolves.toEqual({ ok: false, status: 401 });
  });
});
