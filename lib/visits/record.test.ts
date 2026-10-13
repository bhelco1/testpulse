import { describe, expect, it, vi } from 'vitest';

import { hashClientIp } from './ip-hash.ts';
import {
  BODY_LIMIT,
  handleVisit,
  handleVisitTime,
  IP_LIMIT_PER_MINUTE,
  isSameOrigin,
  onceLogger,
  SECONDS_CAP,
  SESSION_LIMIT_PER_MINUTE,
  supabaseVisitStore,
  visitDeps,
  type VisitDeps,
  type VisitStore,
} from './record.ts';
import { SESSION_COOKIE } from './session.ts';

// The beacon's routes (spec sections 14 and 15): POST /api/visits records a page view and answers
// only an opaque visit id; POST /api/visits/time sets the seconds of a view of the caller's own
// session, once. Both refuse other origins, cap their body and validate it; nothing they log
// carries an address, a cookie or a session identifier.

// Not secrets: values that exist only in this test.
const SALT = 'unit-test-ip-hash-salt-not-a-secret-0123456789';
const IP = '203.0.113.9';
const SESSION = '0b7c6f2e-4f1a-4c39-9a51-2d6f3e8b9c10';
const NEW_SESSION = '6a1f8e44-0c2b-4d7e-8f90-b1c2d3e4f5a6';
const VISIT = 'f0e1d2c3-b4a5-4697-8879-6a5b4c3d2e1f';
const LINK = '11111111-2222-4333-8444-555555555555';
const AT = new Date('2026-10-12T15:30:42.123Z');
const ORIGIN = 'https://testpulse.example';
const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/141.0.0.0 Safari/537.36';
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const SLACK = 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)';

function fakeStore(overrides: Partial<VisitStore> = {}) {
  const store = {
    rateLimitHit: vi.fn<VisitStore['rateLimitHit']>(async () => 1),
    linkForSession: vi.fn<VisitStore['linkForSession']>(async () => null),
    insertVisit: vi.fn(async () => VISIT),
    recordSeconds: vi.fn(async () => undefined),
    ...overrides,
  };
  return store;
}

function deps(
  store: VisitStore = fakeStore(),
  env: Record<string, string | undefined> = { IP_HASH_SALT: SALT },
) {
  const warn = vi.fn<(key: string, message: string) => void>();
  const log = vi.fn<(message: string) => void>();
  const value: VisitDeps = {
    store: () => store,
    receivedAt: () => AT,
    env,
    newSessionId: () => NEW_SESSION,
    secure: true,
    warn,
    log,
  };
  return { deps: value, warn, log };
}

function request(
  body: string | ReadableStream<Uint8Array> | null,
  options: {
    path?: string;
    headers?: Record<string, string>;
    omit?: string[];
  } = {},
): Request {
  const headers: Record<string, string> = {
    host: 'testpulse.example',
    origin: ORIGIN,
    'sec-fetch-site': 'same-origin',
    'user-agent': CHROME,
    'x-vercel-forwarded-for': IP,
    ...options.headers,
  };
  for (const name of options.omit ?? []) delete headers[name];
  return new Request(`${ORIGIN}${options.path ?? '/api/visits'}`, {
    method: 'POST',
    headers,
    body,
    ...(body instanceof ReadableStream ? { duplex: 'half' } : {}),
  } as RequestInit);
}

const pathBody = (path: string) => JSON.stringify({ path });
const cookie = { cookie: `${SESSION_COOKIE}=${SESSION}` };

describe('isSameOrigin', () => {
  const headers = (values: Record<string, string>) => new Headers(values);

  it('accepts a request whose Origin is the host it was sent to', () => {
    expect(isSameOrigin(headers({ host: 'testpulse.example', origin: ORIGIN }))).toBe(true);
    expect(isSameOrigin(headers({ host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' }))).toBe(
      true,
    );
  });

  it.each([
    ['no Origin', { host: 'testpulse.example' }],
    ['no Host', { origin: ORIGIN }],
    ['another site', { host: 'testpulse.example', origin: 'https://evil.example' }],
    ['another port', { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3001' }],
    ['a subdomain', { host: 'testpulse.example', origin: 'https://a.testpulse.example' }],
    ['an opaque origin', { host: 'testpulse.example', origin: 'null' }],
    [
      'a cross-site fetch',
      { host: 'testpulse.example', origin: ORIGIN, 'sec-fetch-site': 'cross-site' },
    ],
    [
      'a same-site fetch',
      { host: 'testpulse.example', origin: ORIGIN, 'sec-fetch-site': 'same-site' },
    ],
  ])('refuses %s', (_label, values) => {
    expect(isSameOrigin(headers(values))).toBe(false);
  });
});

describe('onceLogger', () => {
  it('logs each key once', () => {
    const log = vi.fn();
    const warn = onceLogger(log);
    warn('salt', 'first');
    warn('salt', 'again');
    warn('address', 'other');
    expect(log.mock.calls).toEqual([['first'], ['other']]);
  });
});

describe('handleVisit', () => {
  it('records a browser view with a new session and answers only its id', async () => {
    const store = fakeStore();
    const { deps: d } = deps(store);
    const response = await handleVisit(request(pathBody('/p/routeserve')), d);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: VISIT });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toBe(
      `${SESSION_COOKIE}=${NEW_SESSION}; Path=/; HttpOnly; SameSite=Lax; Secure`,
    );
    // A session that has just been made cannot have arrived by a link.
    expect(store.linkForSession).not.toHaveBeenCalled();
    expect(store.insertVisit).toHaveBeenCalledWith({
      session_id: NEW_SESSION,
      path: '/p/routeserve',
      entered_at: AT.toISOString(),
      user_agent_class: 'browser',
      ip_hash: hashClientIp(IP, SALT),
      tracked_link_id: null,
    });
  });

  it('keeps an existing session and attaches the link it arrived by', async () => {
    const store = fakeStore({ linkForSession: vi.fn(async () => LINK) });
    const { deps: d } = deps(store);
    const response = await handleVisit(request(pathBody('/'), { headers: cookie }), d);

    expect(response.status).toBe(201);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(store.linkForSession).toHaveBeenCalledWith(SESSION);
    expect(store.insertVisit).toHaveBeenCalledWith(
      expect.objectContaining({ session_id: SESSION, tracked_link_id: LINK, path: '/' }),
    );
  });

  it.each([
    ['bot', GOOGLEBOT],
    ['preview', SLACK],
    ['bot', ''],
  ])('stores a %s visit under its class', async (expected, agent) => {
    const store = fakeStore();
    const { deps: d } = deps(store);
    const response = await handleVisit(
      request(pathBody('/'), { headers: { 'user-agent': agent } }),
      d,
    );
    expect(response.status).toBe(201);
    expect(store.insertVisit).toHaveBeenCalledWith(
      expect.objectContaining({ user_agent_class: expected }),
    );
  });

  it.each([
    ['no Origin', { omit: ['origin'] }],
    ['another origin', { headers: { origin: 'https://evil.example' } }],
    ['a cross-site fetch', { headers: { 'sec-fetch-site': 'cross-site' } }],
  ])('refuses %s with 403 and touches nothing', async (_label, options) => {
    const store = fakeStore();
    const { deps: d } = deps(store);
    const response = await handleVisit(request(pathBody('/'), options), d);
    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await response.text()).toBe('');
    expect(store.rateLimitHit).not.toHaveBeenCalled();
    expect(store.insertVisit).not.toHaveBeenCalled();
  });

  it('refuses a declared body over the limit without reading it', async () => {
    const store = fakeStore();
    const { deps: d } = deps(store);
    const response = await handleVisit(
      request(pathBody('/'), { headers: { 'content-length': String(BODY_LIMIT + 1) } }),
      d,
    );
    expect(response.status).toBe(413);
    expect(store.insertVisit).not.toHaveBeenCalled();
  });

  it('refuses a streamed body that runs over the limit', async () => {
    const store = fakeStore();
    const { deps: d } = deps(store);
    const chunk = new TextEncoder().encode('x'.repeat(1_000));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 1;
        if (sent > 100) controller.close();
        else controller.enqueue(chunk);
      },
    });
    const response = await handleVisit(request(stream), d);
    expect(response.status).toBe(413);
    // It stopped reading soon after the limit rather than draining the stream.
    expect(sent).toBeLessThan(10);
    expect(store.insertVisit).not.toHaveBeenCalled();
  });

  it.each([
    ['not JSON', 'path=/'],
    ['an empty body', ''],
    ['no path', JSON.stringify({})],
    ['a path that is not a string', JSON.stringify({ path: 7 })],
    ['a relative path', pathBody('p/routeserve')],
    ['a full URL', pathBody('https://evil.example/')],
    ['a query string', pathBody('/p/routeserve?branches=all')],
    ['a hash', pathBody('/privacy#cookie')],
    ['whitespace', pathBody('/p/a b')],
    ['a path over 512 characters', pathBody(`/${'a'.repeat(512)}`)],
    ['an unknown field', JSON.stringify({ path: '/', referrer: 'https://mail.example' })],
  ])('refuses %s with 400', async (_label, body) => {
    const store = fakeStore();
    const { deps: d } = deps(store);
    const response = await handleVisit(request(body), d);
    expect(response.status).toBe(400);
    expect(store.insertVisit).not.toHaveBeenCalled();
  });

  it('accepts a path of exactly 512 characters', async () => {
    const store = fakeStore();
    const { deps: d } = deps(store);
    const response = await handleVisit(request(pathBody(`/${'a'.repeat(511)}`)), d);
    expect(response.status).toBe(201);
  });

  it.each([
    ['missing', undefined],
    ['blank', '   '],
    ['shorter than 32 characters', 'short-salt'],
  ])('stores nothing and names the variable when the salt is %s', async (_label, salt) => {
    const store = fakeStore();
    const { deps: d, warn, log } = deps(store, { IP_HASH_SALT: salt });
    const response = await handleVisit(request(pathBody('/')), d);

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(store.insertVisit).not.toHaveBeenCalled();
    expect(store.rateLimitHit).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    const [key, message] = warn.mock.calls[0] ?? [];
    expect(key).toBe('salt');
    expect(message).toContain('IP_HASH_SALT');
    expect(message).not.toContain(IP);
    if (salt !== undefined && salt.trim() !== '') expect(message).not.toContain(salt);
    expect(log).not.toHaveBeenCalled();
  });

  it('still gives the session its cookie when nothing can be stored', async () => {
    const { deps: d } = deps(fakeStore(), {});
    const response = await handleVisit(request(pathBody('/')), d);
    expect(response.headers.get('set-cookie')).toContain(NEW_SESSION);
  });

  it.each([
    ['no address header', { omit: ['x-vercel-forwarded-for'] }],
    ['a malformed address', { headers: { 'x-vercel-forwarded-for': '203.0.113.9, 10.0.0.1' } }],
  ])('stores nothing with %s, and never an unhashed value', async (_label, options) => {
    const store = fakeStore();
    const { deps: d, warn } = deps(store);
    const response = await handleVisit(request(pathBody('/'), options), d);
    expect(response.status).toBe(204);
    expect(store.insertVisit).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('address', expect.not.stringContaining('203.0.113.9'));
  });

  it('counts the session and the address hash in the minute the request arrived', async () => {
    const store = fakeStore();
    const { deps: d } = deps(store);
    await handleVisit(request(pathBody('/'), { headers: cookie }), d);
    const minute = new Date('2026-10-12T15:30:00.000Z');
    expect(vi.mocked(store.rateLimitHit).mock.calls).toEqual([
      [`visit-session:${SESSION}`, minute],
      [`visit-ip:${hashClientIp(IP, SALT)}`, minute],
    ]);
  });

  it.each([
    ['the session', SESSION_LIMIT_PER_MINUTE, 'visit-session:'],
    ['the address hash', IP_LIMIT_PER_MINUTE, 'visit-ip:'],
  ])('stores nothing once %s is over its limit in a minute', async (_label, limit, prefix) => {
    const count = (key: string, at: number) => (key.startsWith(prefix) ? at : 1);
    const allowed = fakeStore({ rateLimitHit: vi.fn(async (key: string) => count(key, limit)) });
    expect((await handleVisit(request(pathBody('/')), deps(allowed).deps)).status).toBe(201);

    const over = fakeStore({ rateLimitHit: vi.fn(async (key: string) => count(key, limit + 1)) });
    const response = await handleVisit(request(pathBody('/')), deps(over).deps);
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(over.insertVisit).not.toHaveBeenCalled();
  });

  it('answers 500 on a database error and logs it without the address or session', async () => {
    const store = fakeStore({
      insertVisit: vi.fn(async () => {
        throw new Error('insert the visit: 57P01 terminating connection');
      }),
    });
    const { deps: d, log } = deps(store);
    const response = await handleVisit(request(pathBody('/'), { headers: cookie }), d);
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('');
    expect(log).toHaveBeenCalledTimes(1);
    const [message] = log.mock.calls[0] ?? [];
    expect(message).toContain('57P01');
    for (const secret of [IP, SESSION, hashClientIp(IP, SALT), SALT]) {
      expect(message).not.toContain(secret);
    }
  });
});

describe('without the secret client', () => {
  const unconfigured = () => {
    const { deps: d, warn, log } = deps();
    const store = () => {
      throw new Error('Missing SUPABASE_SECRET_KEY. Set them in the environment');
    };
    return { deps: { ...d, store }, warn, log };
  };

  it('records nothing, answers 204 with the session cookie, and says why once', async () => {
    const { deps: d, warn, log } = unconfigured();
    const response = await handleVisit(request(pathBody('/')), d);
    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toContain(NEW_SESSION);
    expect(warn).toHaveBeenCalledWith('store', expect.stringContaining('SUPABASE_SECRET_KEY'));
    expect(log).not.toHaveBeenCalled();
  });

  it('takes no time update either', async () => {
    const { deps: d, warn } = unconfigured();
    const response = await handleVisitTime(
      request(JSON.stringify({ id: VISIT, seconds: 3 }), {
        path: '/api/visits/time',
        headers: cookie,
      }),
      d,
    );
    expect(response.status).toBe(204);
    expect(warn).toHaveBeenCalledWith('store', expect.stringContaining('not configured'));
  });
});

describe('visitDeps', () => {
  it('marks the cookie Secure on Vercel and not elsewhere', () => {
    expect(visitDeps({ VERCEL: '1' }).secure).toBe(true);
    expect(visitDeps({}).secure).toBe(false);
  });

  it('draws a fresh random session identifier each time', () => {
    const d = visitDeps({});
    const [first, second] = [d.newSessionId(), d.newSessionId()];
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(second).not.toBe(first);
  });

  it('builds the secret client only when a visit is stored, naming a missing setting', () => {
    const d = visitDeps({ NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' });
    expect(() => d.store()).toThrow('Missing SUPABASE_SECRET_KEY');
    const configured = visitDeps({
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_SECRET_KEY: 'sb_secret_not-a-real-key-used-only-in-this-test',
    });
    expect(typeof configured.store().insertVisit).toBe('function');
  });

  it('reads the wall clock for the arrival, and logs to the error stream', () => {
    const d = visitDeps({});
    const before = Date.now();
    const at = d.receivedAt().getTime();
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    d.log('testpulse visits: probe');
    expect(error).toHaveBeenCalledWith('testpulse visits: probe');
    error.mockRestore();
  });
});

describe('handleVisitTime', () => {
  const timeRequest = (body: unknown, headers: Record<string, string> = cookie) =>
    request(JSON.stringify(body), { path: '/api/visits/time', headers });

  it('records the seconds of a view of the caller’s own session', async () => {
    const store = fakeStore();
    const { deps: d } = deps(store);
    const response = await handleVisitTime(timeRequest({ id: VISIT, seconds: 42 }), d);
    expect(response.status).toBe(204);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(store.recordSeconds).toHaveBeenCalledWith(VISIT, SESSION, 42);
  });

  it(`caps the seconds at ${String(SECONDS_CAP)}`, async () => {
    const store = fakeStore();
    const { deps: d } = deps(store);
    await handleVisitTime(timeRequest({ id: VISIT, seconds: SECONDS_CAP + 1 }), d);
    await handleVisitTime(timeRequest({ id: VISIT, seconds: SECONDS_CAP }), d);
    expect(vi.mocked(store.recordSeconds).mock.calls).toEqual([
      [VISIT, SESSION, SECONDS_CAP],
      [VISIT, SESSION, SECONDS_CAP],
    ]);
  });

  it('records nothing without a session cookie, and sets none', async () => {
    const store = fakeStore();
    const { deps: d } = deps(store);
    const response = await handleVisitTime(timeRequest({ id: VISIT, seconds: 5 }, {}), d);
    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(store.recordSeconds).not.toHaveBeenCalled();
  });

  it.each([
    ['a negative time', { id: VISIT, seconds: -1 }],
    ['a fraction', { id: VISIT, seconds: 1.5 }],
    ['a string', { id: VISIT, seconds: '5' }],
    ['an absurd time', { id: VISIT, seconds: 1e12 }],
    ['an id that is not a UUID', { id: 'visit-1', seconds: 5 }],
    ['an unknown field', { id: VISIT, seconds: 5, session: SESSION }],
  ])('refuses %s with 400', async (_label, body) => {
    const store = fakeStore();
    const { deps: d } = deps(store);
    const response = await handleVisitTime(timeRequest(body), d);
    expect(response.status).toBe(400);
    expect(store.recordSeconds).not.toHaveBeenCalled();
  });

  it('refuses another origin', async () => {
    const store = fakeStore();
    const { deps: d } = deps(store);
    const response = await handleVisitTime(
      timeRequest({ id: VISIT, seconds: 5 }, { ...cookie, origin: 'https://evil.example' }),
      d,
    );
    expect(response.status).toBe(403);
    expect(store.recordSeconds).not.toHaveBeenCalled();
  });

  it('answers 500 on a database error without logging the session', async () => {
    const store = fakeStore({
      recordSeconds: vi.fn(async () => {
        throw new Error('record the time: 57P01 terminating connection');
      }),
    });
    const { deps: d, log } = deps(store);
    const response = await handleVisitTime(timeRequest({ id: VISIT, seconds: 5 }), d);
    expect(response.status).toBe(500);
    expect(String(log.mock.calls[0]?.[0])).not.toContain(SESSION);
  });
});

describe('supabaseVisitStore', () => {
  type Call = readonly [string, ...unknown[]];

  function client(answers: { data?: unknown; error?: { code: string; message: string } | null }) {
    const calls: Call[] = [];
    const settle = () => ({ data: answers.data ?? null, error: answers.error ?? null });
    const chain = (): unknown =>
      new Proxy(
        {},
        {
          get: (_, property) => {
            if (property === 'then') return (resolve: (v: unknown) => void) => resolve(settle());
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
      rpc: (fn: string, args: unknown) => {
        calls.push(['rpc', fn, args]);
        return chain();
      },
    };
    return { value: value as never, calls };
  }

  it('counts a hit through rate_limit_hit', async () => {
    const fake = client({ data: 3 });
    const minute = new Date('2026-10-12T15:30:00.000Z');
    expect(await supabaseVisitStore(fake.value).rateLimitHit('visit-ip:abc', minute)).toBe(3);
    expect(fake.calls).toEqual([
      [
        'rpc',
        'rate_limit_hit',
        { p_api_key_hash: 'visit-ip:abc', p_minute: '2026-10-12T15:30:00.000Z' },
      ],
    ]);
  });

  it('reads the link a session arrived by', async () => {
    const fake = client({ data: { tracked_link_id: LINK } });
    expect(await supabaseVisitStore(fake.value).linkForSession(SESSION)).toBe(LINK);
    expect(fake.calls).toEqual([
      ['from', 'tracked_sessions'],
      ['select', 'tracked_link_id'],
      ['eq', 'session_id', SESSION],
      ['maybeSingle'],
    ]);
    expect(await supabaseVisitStore(client({ data: null }).value).linkForSession(SESSION)).toBe(
      null,
    );
  });

  it('inserts a visit and returns its id', async () => {
    const fake = client({ data: { id: VISIT } });
    const row = {
      session_id: SESSION,
      path: '/',
      entered_at: AT.toISOString(),
      user_agent_class: 'browser' as const,
      ip_hash: 'h',
      tracked_link_id: null,
    };
    expect(await supabaseVisitStore(fake.value).insertVisit(row)).toBe(VISIT);
    expect(fake.calls).toEqual([['from', 'visits'], ['insert', row], ['select', 'id'], ['single']]);
  });

  it('sets the seconds only on an untimed visit of the same session', async () => {
    const fake = client({});
    await supabaseVisitStore(fake.value).recordSeconds(VISIT, SESSION, 9);
    expect(fake.calls).toEqual([
      ['from', 'visits'],
      ['update', { seconds_on_page: 9 }],
      ['eq', 'id', VISIT],
      ['eq', 'session_id', SESSION],
      ['is', 'seconds_on_page', null],
    ]);
  });

  it('names the step and the database code when one fails, and nothing else', async () => {
    const error = { code: '42501', message: 'permission denied' };
    const store = supabaseVisitStore(client({ error }).value);
    await expect(store.rateLimitHit('visit-ip:abc', AT)).rejects.toThrow(
      'rate_limit_hit: 42501 permission denied',
    );
    await expect(store.linkForSession(SESSION)).rejects.toThrow(
      'read the session’s link: 42501 permission denied',
    );
    await expect(store.recordSeconds(VISIT, SESSION, 1)).rejects.toThrow(
      'record the time: 42501 permission denied',
    );
    await expect(
      store.insertVisit({
        session_id: SESSION,
        path: '/',
        entered_at: AT.toISOString(),
        user_agent_class: 'browser',
        ip_hash: 'h',
        tracked_link_id: null,
      }),
    ).rejects.toThrow('insert the visit: 42501 permission denied');
  });
});
