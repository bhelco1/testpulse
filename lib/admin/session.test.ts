import { createServerClient } from '@supabase/ssr';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ADMIN_AUTH_COOKIE,
  ADMIN_COOKIE_PATH,
  adminCookieOptions,
  createAdminSessionClient,
  isAdminSessionCookie,
  REFUSED_COOKIE,
  refusedCookieOptions,
} from './session.ts';

vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn(() => ({ auth: {} })) }));

const url = 'http://127.0.0.1:54321';
const publishableKey = 'sb_publishable_unit_test_placeholder';
const env = { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey };
const noCookies = { getAll: () => [], setAll: () => undefined };

afterEach(() => {
  vi.mocked(createServerClient).mockClear();
});

// Spec section 15, "Admin" as built: the owner's session lives in cookies scoped to /admin, which
// no script can read and no public page is sent.
describe('admin session cookies', () => {
  it('are httpOnly, SameSite=Lax and sent only to /admin', () => {
    expect(ADMIN_COOKIE_PATH).toBe('/admin');
    expect(adminCookieOptions({})).toEqual({
      name: ADMIN_AUTH_COOKIE,
      path: '/admin',
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
    });
  });

  it('are Secure on every Vercel deployment', () => {
    expect(adminCookieOptions({ VERCEL: '1' }).secure).toBe(true);
    expect(adminCookieOptions({ VERCEL: '0' }).secure).toBe(false);
  });

  it('recognises the session cookie and its chunks, and nothing else', () => {
    expect(isAdminSessionCookie(ADMIN_AUTH_COOKIE)).toBe(true);
    expect(isAdminSessionCookie(`${ADMIN_AUTH_COOKIE}.0`)).toBe(true);
    expect(isAdminSessionCookie(`${ADMIN_AUTH_COOKIE}.12`)).toBe(true);
    expect(isAdminSessionCookie(`${ADMIN_AUTH_COOKIE}-code-verifier`)).toBe(true);
    expect(isAdminSessionCookie('testpulse_session')).toBe(false);
    expect(isAdminSessionCookie(REFUSED_COOKIE)).toBe(false);
    expect(isAdminSessionCookie(`x${ADMIN_AUTH_COOKIE}`)).toBe(false);
    expect(isAdminSessionCookie(`${ADMIN_AUTH_COOKIE}x`)).toBe(false);
  });

  it('keeps the refused address for five minutes, on /admin only, out of scripts’ reach', () => {
    expect(refusedCookieOptions({ VERCEL: '1' })).toEqual({
      path: '/admin',
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      maxAge: 300,
    });
  });
});

describe('createAdminSessionClient', () => {
  it('runs on the publishable key with the cookie options above', () => {
    createAdminSessionClient(noCookies, env);

    expect(createServerClient).toHaveBeenCalledWith(url, publishableKey, {
      cookieOptions: adminCookieOptions(env),
      cookies: noCookies,
    });
  });

  it('refuses a secret key in place of the publishable one, as the anon client does', () => {
    expect(() =>
      createAdminSessionClient(noCookies, {
        NEXT_PUBLIC_SUPABASE_URL: url,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_unit_test_placeholder',
      }),
    ).toThrow(/holds a secret key/);
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it('names a missing setting before building a client', () => {
    expect(() => createAdminSessionClient(noCookies, {})).toThrow(
      /Missing NEXT_PUBLIC_SUPABASE_URL/,
    );
    expect(createServerClient).not.toHaveBeenCalled();
  });
});
