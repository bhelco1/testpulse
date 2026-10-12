import { describe, expect, it, vi } from 'vitest';

import { SESSION_COOKIE } from '../visits/session.ts';
import {
  arrivalDeps,
  handleArrival,
  supabaseArrivalStore,
  type ArrivalDeps,
  type ArrivalStore,
} from './arrive.ts';

// /v/<token> (spec sections 14 and 15; decision rows of 2026-10-12): the visitor gets the session
// cookie and a 303 to /, so the token leaves the address bar. Only a known token opened by a
// browser records the session against its link. Every other request (an unknown or malformed
// token, a bot, a link preview, a database that does not answer) gets the same answer, so the
// response says nothing about whether a token exists. The request is not a visit: the beacon
// records visits (section 14).

const TOKEN = 'Qm8r2LxT0aZe';
const LINK = '11111111-2222-4333-8444-555555555555';
const SESSION = '0b7c6f2e-4f1a-4c39-9a51-2d6f3e8b9c10';
const NEW_SESSION = '6a1f8e44-0c2b-4d7e-8f90-b1c2d3e4f5a6';
const AT = new Date('2026-10-12T15:30:42.123Z');
const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/141.0.0.0 Safari/537.36';
const SAFE_LINKS = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const SLACK = 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)';

function fakeStore(overrides: Partial<ArrivalStore> = {}) {
  return {
    findLink: vi.fn(async (token: string): Promise<string | null> =>
      token === TOKEN ? LINK : null,
    ),
    attachSession: vi.fn(async () => undefined),
    ...overrides,
  };
}

function deps(store: ArrivalStore = fakeStore(), secure = false) {
  const log = vi.fn<(message: string) => void>();
  const value: ArrivalDeps = {
    store: () => store,
    receivedAt: () => AT,
    newSessionId: () => NEW_SESSION,
    secure,
    log,
  };
  return { deps: value, log };
}

const request = (headers: Record<string, string> = {}) =>
  new Request(`https://testpulse.example/v/${TOKEN}`, {
    headers: { 'user-agent': CHROME, ...headers },
  });

const withCookie = { cookie: `${SESSION_COOKIE}=${SESSION}` };

/** Everything a client sees, with the cookie's random value blanked. */
async function seen(response: Response) {
  return {
    status: response.status,
    headers: [...response.headers.entries()].map(([name, value]) =>
      name === 'set-cookie' ? [name, value.replace(/=[0-9a-f-]{36};/, '=<id>;')] : [name, value],
    ),
    body: await response.text(),
  };
}

describe('handleArrival', () => {
  it('records a new session against the link and redirects to / with the cookie', async () => {
    const store = fakeStore();
    const { deps: d } = deps(store);
    const response = await handleArrival(request(), TOKEN, d);

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toBe(
      `${SESSION_COOKIE}=${NEW_SESSION}; Path=/; HttpOnly; SameSite=Lax`,
    );
    expect(await response.text()).toBe('');
    expect(store.findLink).toHaveBeenCalledWith(TOKEN);
    expect(store.attachSession).toHaveBeenCalledWith(NEW_SESSION, LINK, AT);
  });

  it('marks the cookie Secure where the site is served over HTTPS', async () => {
    const { deps: d } = deps(fakeStore(), true);
    const response = await handleArrival(request(), TOKEN, d);
    expect(response.headers.get('set-cookie')).toMatch(/; Secure$/);
  });

  it('reuses the session a visitor already has, and re-points it at this link', async () => {
    const store = fakeStore();
    const { deps: d } = deps(store);
    const response = await handleArrival(request(withCookie), TOKEN, d);
    expect(response.status).toBe(303);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(store.attachSession).toHaveBeenCalledWith(SESSION, LINK, AT);
  });

  it('answers an unknown token exactly as a known one, and records nothing', async () => {
    const known = await seen(await handleArrival(request(), TOKEN, deps().deps));
    const store = fakeStore();
    const unknown = await handleArrival(request(), 'Zz9Zz9Zz9Zz9', deps(store).deps);
    expect(await seen(unknown)).toEqual(known);
    expect(store.findLink).toHaveBeenCalledWith('Zz9Zz9Zz9Zz9');
    expect(store.attachSession).not.toHaveBeenCalled();
  });

  it.each([
    ['too short', 'Qm8r2LxT0aZ'],
    ['too long', 'Qm8r2LxT0aZe1'],
    ['not alphanumeric', 'Qm8r2LxT0a-e'],
    ['an encoded slash', 'Qm8r2%2FT0aZe'],
    ['SQL', "' or 1=1 --"],
    ['empty', ''],
  ])('answers a token that is %s the same way without looking it up', async (_label, token) => {
    const known = await seen(await handleArrival(request(), TOKEN, deps().deps));
    const store = fakeStore();
    const response = await handleArrival(request(), token, deps(store).deps);
    expect(await seen(response)).toEqual(known);
    expect(store.findLink).not.toHaveBeenCalled();
    expect(store.attachSession).not.toHaveBeenCalled();
  });

  it.each([
    ['a crawler or scanner', SAFE_LINKS],
    ['a link preview', SLACK],
    ['no agent', ''],
  ])('records no session for %s, and answers the same way', async (_label, agent) => {
    const known = await seen(await handleArrival(request(), TOKEN, deps().deps));
    const store = fakeStore();
    const response = await handleArrival(request({ 'user-agent': agent }), TOKEN, deps(store).deps);
    expect(await seen(response)).toEqual(known);
    expect(store.attachSession).not.toHaveBeenCalled();
  });

  it('still redirects when the database fails, and logs without the token or session', async () => {
    const known = await seen(await handleArrival(request(), TOKEN, deps().deps));
    const store = fakeStore({
      attachSession: vi.fn(async () => {
        throw new Error('record the session: 57P01 terminating connection');
      }),
    });
    const { deps: d, log } = deps(store);
    const response = await handleArrival(request(withCookie), TOKEN, d);
    expect((await seen(response)).status).toBe(known.status);
    expect(response.headers.get('location')).toBe('/');
    expect(log).toHaveBeenCalledTimes(1);
    const [message] = log.mock.calls[0] ?? [];
    expect(message).toContain('57P01');
    expect(message).not.toContain(TOKEN);
    expect(message).not.toContain(SESSION);
  });
});

describe('supabaseArrivalStore', () => {
  type Call = readonly [string, ...unknown[]];

  function client(answer: { data?: unknown; error?: { code: string; message: string } | null }) {
    const calls: Call[] = [];
    const chain = (): unknown =>
      new Proxy(
        {},
        {
          get: (_, property) => {
            if (property === 'then') {
              return (resolve: (v: unknown) => void) =>
                resolve({ data: answer.data ?? null, error: answer.error ?? null });
            }
            return (...args: unknown[]) => {
              calls.push([String(property), ...args]);
              return chain();
            };
          },
        },
      );
    const value = {
      from: (table: string) => {
        calls.push(['from', table]);
        return chain();
      },
    };
    return { value: value as never, calls };
  }

  it('finds a link by its token', async () => {
    const fake = client({ data: { id: LINK } });
    expect(await supabaseArrivalStore(fake.value).findLink(TOKEN)).toBe(LINK);
    expect(fake.calls).toEqual([
      ['from', 'tracked_links'],
      ['select', 'id'],
      ['eq', 'token', TOKEN],
      ['maybeSingle'],
    ]);
    expect(await supabaseArrivalStore(client({ data: null }).value).findLink(TOKEN)).toBeNull();
  });

  it('upserts the session so the latest link wins', async () => {
    const fake = client({});
    await supabaseArrivalStore(fake.value).attachSession(SESSION, LINK, AT);
    expect(fake.calls).toEqual([
      ['from', 'tracked_sessions'],
      [
        'upsert',
        { session_id: SESSION, tracked_link_id: LINK, created_at: AT.toISOString() },
        { onConflict: 'session_id' },
      ],
    ]);
  });

  it('names the step and the database code when one fails, never the token', async () => {
    const error = { code: '42501', message: 'permission denied' };
    const store = supabaseArrivalStore(client({ error }).value);
    await expect(store.findLink(TOKEN)).rejects.toThrow(
      'look up the link: 42501 permission denied',
    );
    const message = await store.findLink(TOKEN).then(
      () => '',
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    );
    expect(message).not.toContain(TOKEN);
    await expect(store.attachSession(SESSION, LINK, AT)).rejects.toThrow(
      'record the session: 42501 permission denied',
    );
  });
});

describe('arrivalDeps', () => {
  it('marks the cookie Secure on Vercel and draws random session identifiers', () => {
    expect(arrivalDeps({ VERCEL: '1' }).secure).toBe(true);
    const d = arrivalDeps({});
    expect(d.secure).toBe(false);
    expect(d.newSessionId()).toMatch(/^[0-9a-f-]{36}$/);
    expect(d.newSessionId()).not.toBe(d.newSessionId());
  });

  it('builds the secret client only when a link is looked up, naming a missing setting', async () => {
    const d = arrivalDeps({ NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' });
    expect(() => d.store()).toThrow('Missing SUPABASE_SECRET_KEY');
    // Unconfigured, the visitor is still redirected the same way, and the cause is logged.
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await handleArrival(request(), TOKEN, d);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('SUPABASE_SECRET_KEY'));
    expect(String(error.mock.calls[0]?.[0])).not.toContain(TOKEN);
    error.mockRestore();
    expect(d.receivedAt()).toBeInstanceOf(Date);
  });
});
