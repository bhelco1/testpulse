import { randomUUID } from 'node:crypto';

import { createClient, type Session } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { after, NextRequest } from 'next/server';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  confirmParams,
  cookiesFor,
  secretClient,
  sessionIn,
  signInTokenHash,
} from '../../tests/int/admin-session.ts';
import { readIntegrationEnv } from '../../tests/int/env.ts';
import {
  confirmLinkIn,
  deleteMessagesTo,
  messagesTo,
  waitForMessageTo,
} from '../../tests/int/mailpit.ts';
import { FakeCookieStore } from './cookie-store.test-support.ts';
import { cookieMethods, getAdminAccess } from './guard.ts';
import { handleConfirm, handleSignInRequest, handleSignOut } from './handlers.ts';
import { refreshAdminSession } from './refresh.ts';
import { createAdminSessionClient, isAdminSessionCookie, REFUSED_COOKIE } from './session.ts';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  after: vi.fn(),
}));

// Spec section 17, Phase 6 criterion 2, against local Supabase Auth and its mail catcher: admin
// requires magic-link sign-in from the allowlisted address, any other address is refused, and the
// guard has Supabase check the session on every call. Every address is new to each test, so tests
// never share a user or a token; ADMIN_EMAIL is set per test.

const admin = secretClient();
const created = new Set<string>();
const unique = (label: string) => `${label}-${randomUUID()}@testpulse.test`;

function serveCookies(store: FakeCookieStore): FakeCookieStore {
  vi.mocked(cookies).mockResolvedValue(store as never);
  return store;
}

/** Runs the tasks the sign-in action hands to `after`, as Next does once it has answered. */
function runAfterTasks(): Promise<void>[] {
  const running: Promise<void>[] = [];
  vi.mocked(after).mockImplementation((task) => {
    running.push(Promise.resolve((task as () => Promise<void>)()));
  });
  return running;
}

const form = (email: string) => {
  const data = new FormData();
  data.set('email', email);
  return data;
};

/** Signs the address in through the confirm route, returning the browser's cookies after it. */
async function signInByLink(email: string): Promise<FakeCookieStore> {
  const store = serveCookies(new FakeCookieStore());
  const location = await handleConfirm(confirmParams(await signInTokenHash(admin, email)));
  expect(location).toBe('/admin');
  return store;
}

const sentCookies = (store: FakeCookieStore) =>
  Object.fromEntries(store.getAll().map(({ name, value }) => [name, value]));

async function remember(email: string) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const user = data.users.find((candidate) => candidate.email === email.toLowerCase());
  if (user !== undefined) created.add(user.id);
}

beforeEach(() => {
  vi.mocked(after).mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  for (const id of created) await admin.auth.admin.deleteUser(id);
});

describe('the emailed sign-in link', () => {
  it('reaches the owner, opens /admin/auth/confirm, signs in once and only once', async () => {
    const owner = unique('owner');
    vi.stubEnv('ADMIN_EMAIL', owner);
    await deleteMessagesTo(owner);
    const running = runAfterTasks();

    await expect(handleSignInRequest(form(owner))).resolves.toEqual({ status: 'sent' });
    await Promise.all(running);
    await remember(owner);

    const message = await waitForMessageTo(owner);
    expect(message.subject).toBe('Sign in to testpulse admin');
    const link = await confirmLinkIn(message.id);
    expect(`${link.origin}${link.pathname}`).toBe('http://127.0.0.1:3000/admin/auth/confirm');
    expect(link.searchParams.get('type')).toBe('email');

    const store = serveCookies(new FakeCookieStore());
    await expect(handleConfirm(link.searchParams)).resolves.toBe('/admin');
    expect(store.getAll().some(({ name }) => isAdminSessionCookie(name))).toBe(true);
    await expect(getAdminAccess()).resolves.toEqual({ status: 'allowed', email: owner });

    // The same link a second time: spent, so the expired notice, and no session.
    const again = serveCookies(new FakeCookieStore());
    await expect(handleConfirm(link.searchParams)).resolves.toBe('/admin?notice=link-expired');
    expect(again.getAll()).toEqual([]);
  });

  it('is never sent to another address, which gets the same answer', async () => {
    const owner = unique('owner');
    const other = unique('other');
    vi.stubEnv('ADMIN_EMAIL', owner);
    const running = runAfterTasks();

    const answer = await handleSignInRequest(form(other));
    expect(answer).toEqual(await handleSignInRequest(form(owner)));
    await Promise.all(running);
    await remember(owner);

    // The owner's link, asked for second, has arrived, so a message to the other address would
    // have too: there is none, and Supabase never heard of that address.
    await waitForMessageTo(owner);
    expect(await messagesTo(other)).toEqual([]);
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    expect(data.users.some((user) => user.email === other)).toBe(false);
  });

  it('ends a session for another address at once, and names it on the refused card', async () => {
    const owner = unique('owner');
    const other = unique('other');
    vi.stubEnv('ADMIN_EMAIL', owner);
    const store = serveCookies(new FakeCookieStore());

    await expect(handleConfirm(confirmParams(await signInTokenHash(admin, other)))).resolves.toBe(
      '/admin',
    );
    await remember(other);

    // Supabase made a session and the route wrote it; then it was ended and its cookies deleted.
    const made = sessionIn(
      store.writes
        .filter(({ op, value }) => op === 'set' && value !== '' && value !== undefined)
        .map(({ name, value }) => ({ name, value: value ?? '' }))
        .filter(({ name }) => isAdminSessionCookie(name)),
    );
    expect(made?.user.email).toBe(other);
    expect(store.getAll().map(({ name }) => name)).toEqual([REFUSED_COOKIE]);
    expect(store.get(REFUSED_COOKIE)?.value).toBe(other);
    // Supabase no longer knows the session: supabase-js reads its session_not_found as missing.
    expect(made?.access_token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    const { error } = await admin.auth.getUser(made?.access_token);
    expect(error?.name).toBe('AuthSessionMissingError');

    // With the flash alone, the guard sees no session.
    await expect(getAdminAccess()).resolves.toEqual({ status: 'signed-out', reason: 'no-session' });
  });
});

describe('the guard against real sessions', () => {
  it('allows the owner’s magic-link session, and refuses it once ADMIN_EMAIL names another', async () => {
    const owner = unique('owner');
    vi.stubEnv('ADMIN_EMAIL', owner);
    const store = await signInByLink(owner);
    await remember(owner);

    await expect(getAdminAccess()).resolves.toEqual({ status: 'allowed', email: owner });
    vi.stubEnv('ADMIN_EMAIL', unique('owner'));
    serveCookies(store);
    await expect(getAdminAccess()).resolves.toEqual({ status: 'refused', email: owner });
    vi.stubEnv('ADMIN_EMAIL', '');
    await expect(getAdminAccess()).resolves.toEqual({ status: 'refused', email: owner });
  });

  it('does not let the owner in on a password session', async () => {
    const owner = unique('owner');
    const password = randomUUID();
    vi.stubEnv('ADMIN_EMAIL', owner);
    const { data, error } = await admin.auth.admin.createUser({
      email: owner,
      password,
      email_confirm: true,
    });
    expect(error).toBeNull();
    created.add(data.user?.id ?? '');

    const store = serveCookies(new FakeCookieStore());
    const client = createAdminSessionClient(cookieMethods(store as never));
    const signIn = await client.auth.signInWithPassword({ email: owner, password });
    expect(signIn.error).toBeNull();
    expect(store.getAll().some(({ name }) => isAdminSessionCookie(name))).toBe(true);

    await expect(getAdminAccess()).resolves.toEqual({
      status: 'signed-out',
      reason: 'not-magic-link',
    });
  });

  it('treats a session whose token was not signed by Supabase as ended', async () => {
    const owner = unique('owner');
    vi.stubEnv('ADMIN_EMAIL', owner);
    const real = sessionIn((await signInByLink(owner)).getAll()) as Session;
    await remember(owner);

    // The same claims, the owner's address and a magic-link sign-in, under a signature Supabase
    // did not make; the session's expiry is pushed out so no refresh is tried first.
    const [header, payload] = real.access_token.split('.');
    const forged = {
      ...real,
      access_token: `${header}.${payload}.Zm9yZ2Vk`,
      expires_at: 4102444800,
    };
    serveCookies(new FakeCookieStore(cookiesFor(forged)));
    await expect(getAdminAccess()).resolves.toEqual({
      status: 'signed-out',
      reason: 'session-ended',
    });

    // And one made up whole.
    const made = { access_token: 'a.b.c', refresh_token: 'r', expires_at: 4102444800, user: {} };
    serveCookies(new FakeCookieStore(cookiesFor(made)));
    await expect(getAdminAccess()).resolves.toEqual({
      status: 'signed-out',
      reason: 'session-ended',
    });
  });

  it('ends the session with Supabase on sign-out, so a copy of its cookies no longer works', async () => {
    const owner = unique('owner');
    vi.stubEnv('ADMIN_EMAIL', owner);
    const store = await signInByLink(owner);
    await remember(owner);
    const copy = sentCookies(store);

    serveCookies(store);
    await handleSignOut();
    expect(store.getAll()).toEqual([]);

    serveCookies(new FakeCookieStore(copy));
    await expect(getAdminAccess()).resolves.toEqual({
      status: 'signed-out',
      reason: 'session-ended',
    });
  });

  it('refreshes an expired session in the proxy, and it is still a magic-link session after', async () => {
    const owner = unique('owner');
    vi.stubEnv('ADMIN_EMAIL', owner);
    const session = sessionIn((await signInByLink(owner)).getAll()) as Session;
    await remember(owner);

    // An access token the client reads as expired, which makes it use the refresh token.
    const stale = cookiesFor({ ...session, expires_at: Math.floor(Date.now() / 1000) - 60 });
    const request = new NextRequest('http://127.0.0.1:3000/admin', {
      headers: {
        cookie: Object.entries(stale)
          .map(([name, value]) => `${name}=${value}`)
          .join('; '),
      },
    });

    const response = await refreshAdminSession(request);

    const refreshed = sessionIn(request.cookies.getAll());
    expect(refreshed?.refresh_token).not.toBe(session.refresh_token);
    expect(response.headers.get('set-cookie')).toContain('Path=/admin');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');

    serveCookies(
      new FakeCookieStore(
        Object.fromEntries(request.cookies.getAll().map((c) => [c.name, c.value])),
      ),
    );
    await expect(getAdminAccess()).resolves.toEqual({ status: 'allowed', email: owner });
  });
});

describe('the session client', () => {
  it('runs as the authenticated role, which is granted nothing in the database', async () => {
    const owner = unique('owner');
    vi.stubEnv('ADMIN_EMAIL', owner);
    const session = sessionIn((await signInByLink(owner)).getAll()) as Session;
    await remember(owner);
    const { url, publishableKey } = readIntegrationEnv();
    const client = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    });

    const { error } = await client.from('projects').select('id').limit(1);
    expect(error?.code).toBe('42501');
  });
});
