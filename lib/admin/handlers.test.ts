import { AuthApiError } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { after } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeCookieStore } from './cookie-store.test-support.ts';
import { handleConfirm, handleSignInRequest, handleSignOut, readRefusedFlash } from './handlers.ts';
import {
  ADMIN_AUTH_COOKIE,
  createAdminSessionClient,
  REFUSED_COOKIE,
  refusedCookieOptions,
} from './session.ts';
import { sendMagicLink } from './sign-in.ts';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('./session.ts', async (original) => ({
  ...(await original<typeof import('./session.ts')>()),
  createAdminSessionClient: vi.fn(),
}));
vi.mock('./sign-in.ts', async (original) => ({
  ...(await original<typeof import('./sign-in.ts')>()),
  sendMagicLink: vi.fn(async () => undefined),
}));

const OWNER = 'owner@example.com';
const HASH = 'b'.repeat(56);

function serveCookies(store: FakeCookieStore) {
  vi.mocked(cookies).mockResolvedValue(store as never);
  return store;
}

function fakeAuth(overrides: Record<string, unknown> = {}) {
  const auth = {
    signOut: vi.fn(async () => ({ error: null })),
    verifyOtp: vi.fn(async () => ({
      data: { user: { id: 'u', email: OWNER }, session: { access_token: 't' } },
      error: null,
    })),
    ...overrides,
  };
  vi.mocked(createAdminSessionClient).mockReturnValue({ auth } as never);
  return auth;
}

const form = (email: string) => {
  const data = new FormData();
  data.set('email', email);
  return data;
};

beforeEach(() => {
  vi.stubEnv('ADMIN_EMAIL', OWNER);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(createAdminSessionClient).mockReset();
  vi.mocked(cookies).mockReset();
  vi.mocked(after).mockReset();
  vi.mocked(sendMagicLink).mockClear();
});

describe('handleSignInRequest', () => {
  it('schedules the owner’s link for after the answer, with the neutral answer', async () => {
    expect(await handleSignInRequest(form(OWNER))).toEqual({ status: 'sent' });
    expect(sendMagicLink).not.toHaveBeenCalled();
    expect(after).toHaveBeenCalledOnce();

    const task = vi.mocked(after).mock.calls[0]?.[0] as () => Promise<void>;
    await task();
    expect(sendMagicLink).toHaveBeenCalledExactlyOnceWith(OWNER, process.env, console.error);
  });

  it('gives another address the same answer and schedules nothing', async () => {
    expect(await handleSignInRequest(form('someone@example.org'))).toEqual({ status: 'sent' });
    expect(after).not.toHaveBeenCalled();
  });

  it('touches no cookie and builds no client', async () => {
    await handleSignInRequest(form(OWNER));
    expect(cookies).not.toHaveBeenCalled();
    expect(createAdminSessionClient).not.toHaveBeenCalled();
  });
});

describe('handleSignOut', () => {
  it('ends this browser’s session with Supabase and deletes every admin cookie, nothing else', async () => {
    const store = serveCookies(
      new FakeCookieStore({
        [`${ADMIN_AUTH_COOKIE}.0`]: 'a',
        [`${ADMIN_AUTH_COOKIE}.1`]: 'b',
        [REFUSED_COOKIE]: 'someone@example.org',
        testpulse_session: 'visit',
      }),
    );
    const auth = fakeAuth();

    await handleSignOut();

    expect(auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' });
    expect(store.getAll().map(({ name }) => name)).toEqual(['testpulse_session']);
    expect(store.writes.filter(({ op }) => op === 'delete')).toEqual(
      [`${ADMIN_AUTH_COOKIE}.0`, `${ADMIN_AUTH_COOKIE}.1`, REFUSED_COOKIE].map((name) => ({
        op: 'delete',
        name,
        options: { path: '/admin' },
      })),
    );
  });

  it('deletes the cookies even when Supabase cannot be reached', async () => {
    const store = serveCookies(new FakeCookieStore({ [ADMIN_AUTH_COOKIE]: 'a' }));
    fakeAuth({
      signOut: vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    });

    await handleSignOut();

    expect(store.getAll()).toEqual([]);
  });

  it('builds no client without a session, and still clears a refused flash', async () => {
    const store = serveCookies(new FakeCookieStore({ [REFUSED_COOKIE]: 'someone@example.org' }));

    await handleSignOut();

    expect(createAdminSessionClient).not.toHaveBeenCalled();
    expect(store.getAll()).toEqual([]);
  });
});

describe('handleConfirm', () => {
  const link = new URLSearchParams(`token_hash=${HASH}&type=email`);

  it('signs the owner in and goes to /admin, clearing any refused flash', async () => {
    const store = serveCookies(new FakeCookieStore({ [REFUSED_COOKIE]: 'someone@example.org' }));
    const auth = fakeAuth();

    await expect(handleConfirm(link)).resolves.toBe('/admin');
    expect(auth.verifyOtp).toHaveBeenCalledOnce();
    expect(store.has(REFUSED_COOKIE)).toBe(false);
  });

  it('signs another address out, deletes its cookies and keeps its address for the refused card', async () => {
    const store = serveCookies(new FakeCookieStore());
    const auth = fakeAuth({
      verifyOtp: vi.fn(async () => {
        // As Supabase does: the session cookie is written as the token is spent.
        store.set(ADMIN_AUTH_COOKIE, 'other-session');
        return {
          data: { user: { id: 'u', email: 'someone@example.org' }, session: { access_token: 't' } },
          error: null,
        };
      }),
    });

    await expect(handleConfirm(link)).resolves.toBe('/admin');
    expect(auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'global' });
    expect(store.has(ADMIN_AUTH_COOKIE)).toBe(false);
    expect(store.writes.at(-1)).toEqual({
      op: 'set',
      name: REFUSED_COOKIE,
      value: 'someone@example.org',
      options: refusedCookieOptions(process.env),
    });
  });

  it('keeps no flash for a refused session without an address', async () => {
    const store = serveCookies(new FakeCookieStore());
    fakeAuth({
      verifyOtp: vi.fn(async () => ({
        data: { user: { id: 'u' }, session: { access_token: 't' } },
        error: null,
      })),
    });

    await expect(handleConfirm(link)).resolves.toBe('/admin');
    expect(store.has(REFUSED_COOKIE)).toBe(false);
  });

  it('sends an expired or used link to the expired notice', async () => {
    serveCookies(new FakeCookieStore());
    fakeAuth({
      verifyOtp: vi.fn(async () => ({
        data: { user: null, session: null },
        error: new AuthApiError('Email link is invalid or has expired', 403, 'otp_expired'),
      })),
    });

    await expect(handleConfirm(link)).resolves.toBe('/admin?notice=link-expired');
  });

  it('sends a link Supabase could not check to the error state', async () => {
    serveCookies(new FakeCookieStore());
    vi.mocked(createAdminSessionClient).mockImplementation(() => {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL.');
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(handleConfirm(link)).resolves.toBe('/admin?notice=unavailable');
    expect(error).toHaveBeenCalledExactlyOnceWith(
      'testpulse admin: not configured: Missing NEXT_PUBLIC_SUPABASE_URL.',
    );
    error.mockRestore();
  });
});

describe('readRefusedFlash', () => {
  it('reads the refused address the confirm route kept', async () => {
    serveCookies(new FakeCookieStore({ [REFUSED_COOKIE]: 'someone@example.org' }));
    await expect(readRefusedFlash()).resolves.toBe('someone@example.org');
    serveCookies(new FakeCookieStore());
    await expect(readRefusedFlash()).resolves.toBeUndefined();
  });
});
