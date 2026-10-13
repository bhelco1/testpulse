import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { refreshAdminSession } from './refresh.ts';
import { ADMIN_AUTH_COOKIE, createAdminSessionClient } from './session.ts';

vi.mock('./session.ts', async (original) => ({
  ...(await original<typeof import('./session.ts')>()),
  createAdminSessionClient: vi.fn(),
}));

// proxy.ts runs this for /admin requests only. A page cannot write cookies, so a session whose
// access token has expired is refreshed here, before the page's guard reads it; access itself is
// decided by the guard, never here.

const request = (cookie?: string) =>
  new NextRequest('http://127.0.0.1:3000/admin', {
    headers: cookie === undefined ? {} : { cookie },
  });

afterEach(() => {
  vi.mocked(createAdminSessionClient).mockReset();
});

describe('refreshAdminSession', () => {
  it('passes a request without a session through without asking Supabase', async () => {
    const response = await refreshAdminSession(request('testpulse_session=x'));

    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(createAdminSessionClient).not.toHaveBeenCalled();
  });

  it('writes a refreshed session to both the request the page reads and the response', async () => {
    vi.mocked(createAdminSessionClient).mockImplementation((methods) => {
      const getUser = vi.fn(async () => {
        await methods.setAll?.(
          [
            {
              name: ADMIN_AUTH_COOKIE,
              value: 'refreshed',
              options: { path: '/admin', httpOnly: true },
            },
          ],
          { 'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0' },
        );
        return { data: { user: null }, error: null };
      });
      return { auth: { getUser } } as never;
    });
    const incoming = request(`${ADMIN_AUTH_COOKIE}=stale`);

    const response = await refreshAdminSession(incoming);

    expect(incoming.cookies.get(ADMIN_AUTH_COOKIE)?.value).toBe('refreshed');
    expect(response.headers.get('x-middleware-request-cookie')).toContain(
      `${ADMIN_AUTH_COOKIE}=refreshed`,
    );
    expect(response.headers.get('set-cookie')).toMatch(
      new RegExp(`^${ADMIN_AUTH_COOKIE}=refreshed; Path=/admin; HttpOnly`),
    );
    expect(response.headers.get('cache-control')).toBe(
      'private, no-cache, no-store, must-revalidate, max-age=0',
    );
  });

  it('passes the request on unchanged when Supabase cannot be reached or is not configured', async () => {
    vi.mocked(createAdminSessionClient).mockImplementation(() => {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL.');
    });
    const response = await refreshAdminSession(request(`${ADMIN_AUTH_COOKIE}=stale`));

    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});
