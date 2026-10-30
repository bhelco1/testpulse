import { spawn } from 'node:child_process';
import { once } from 'node:events';

import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { FIXED_NOW_VAR } from '../../lib/clock.ts';
import { SEED_NOW } from '../../lib/seed/plan.ts';
import { createTrackedLink, type TrackedLinkRow } from '../../lib/tracked-links/create.ts';
import { hashClientIp, IP_HASH_SALT_VAR } from '../../lib/visits/ip-hash.ts';
import { SESSION_COOKIE } from '../../lib/visits/session.ts';
import { expectNoSeriousAxeViolations } from './support/axe.ts';
import { admin } from './support/ingest.ts';
import { E2E_IP_HASH_SALT } from './support/visits.ts';

// Spec section 17, Phase 6, criteria 3 and 4: "visiting /v/[token] sets the cookie, redirects,
// and subsequent page views attach to that link"; bot visits are stored but not counted. A real
// browser opens a tracked link whose lead project is RouteServe (private), against the seeded
// database and the production build. It runs in the `live` project, one file at a time and after
// every other project (playwright.config.ts), since it writes a link and visits; it deletes them
// afterwards, and nothing it writes changes a seeded page.
//
// The visit routes and /v/<token> write with the secret client, and the server every page spec
// uses is started without the secret key, so each page is proven to render as anon (decision of
// 2026-09-29). This spec therefore starts a server of its own, from the same production build,
// with the local secret key, the e2e salt and the seed clock, and points its browsers at it.
//
// Headless Chromium's own agent names it HeadlessChrome, which classifies as a bot, so the
// browser visits use an ordinary Chrome agent. Each context sends its own documentation-range
// address in x-vercel-forwarded-for (Vercel overwrites it in production; locally `next start`
// passes it on), so its visits have a known hash and their own rate-limit bucket.

test.describe.configure({ mode: 'serial' });

const CHROME =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/141.0.0.0 Safari/537.36';
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
// TEST-NET-3 (RFC 5737): never a real client.
const TRACKED_IP = '203.0.113.71';
const UNTRACKED_IP = '203.0.113.72';
const BOT_IP = '203.0.113.73';
const COMPANY = 'E2E Tracked Company';
const ROLE = 'Director of Quality, e2e';
const CONTACT = 'e2e-contact-person';

const PORT = 3104;
const BASE_URL = `http://127.0.0.1:${String(PORT)}`;

let server: { readonly stop: () => Promise<void>; readonly output: () => string } | undefined;
let link: TrackedLinkRow;
const sessions = new Set<string>();
const contexts: BrowserContext[] = [];

interface VisitRow {
  readonly id: string;
  readonly session_id: string;
  readonly path: string;
  readonly tracked_link_id: string | null;
  readonly user_agent_class: string;
  readonly ip_hash: string;
  readonly seconds_on_page: number | null;
  readonly entered_at: string;
}

async function visitsOf(session: string): Promise<VisitRow[]> {
  const { data, error } = await admin()
    .from('visits')
    .select(
      'id, session_id, path, tracked_link_id, user_agent_class, ip_hash, seconds_on_page, entered_at',
    )
    .eq('session_id', session)
    .order('entered_at')
    .order('path');
  if (error) throw new Error(`read visits: ${error.code} ${error.message}`);
  return data as VisitRow[];
}

async function startServer(): Promise<NonNullable<typeof server>> {
  if (!process.env.SUPABASE_SECRET_KEY) {
    throw new Error('the tracked-link spec needs the local SUPABASE_SECRET_KEY for its server');
  }
  const child = spawn(
    'node_modules/.bin/next',
    ['start', '--hostname', '127.0.0.1', '--port', String(PORT)],
    {
      env: { ...process.env, [FIXED_NOW_VAR]: SEED_NOW, [IP_HASH_SALT_VAR]: E2E_IP_HASH_SALT },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
  const exited = once(child, 'exit');
  const started = {
    output: () => output,
    stop: async () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        await exited;
      }
    },
  };
  await expect
    .poll(() => output, { timeout: 30_000 })
    .toContain(`clock fixed by ${FIXED_NOW_VAR} at ${SEED_NOW}`);
  return started;
}

async function browse(browser: Browser, userAgent: string, ip: string): Promise<Page> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    userAgent,
    extraHTTPHeaders: { 'x-vercel-forwarded-for': ip },
  });
  contexts.push(context);
  const page = await context.newPage();
  await page.clock.install({ time: new Date(SEED_NOW) });
  return page;
}

const recorded = (page: Page) =>
  page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/visits' && response.request().method() === 'POST',
  );

async function sessionCookie(page: Page) {
  const cookies = await page.context().cookies();
  expect(cookies.map((cookie) => cookie.name)).toEqual([SESSION_COOKIE]);
  const [cookie] = cookies;
  if (cookie === undefined) throw new Error('no session cookie');
  sessions.add(cookie.value);
  return cookie;
}

test.beforeAll(async () => {
  server = await startServer();
  const result = await createTrackedLink(
    admin(),
    { company: COMPANY, role: ROLE, contact: CONTACT, lead_project_slug: 'routeserve' },
    new Date(SEED_NOW),
  );
  if (!result.ok) throw new Error(`tracked link not created: ${result.reason}`);
  link = result.link;
});

test.afterAll(async () => {
  for (const context of contexts) await context.close();
  await server?.stop();
  // Nothing the server logged may carry an address, a session, the token or the salt.
  const logged = server?.output() ?? '';
  for (const secret of [
    TRACKED_IP,
    UNTRACKED_IP,
    BOT_IP,
    E2E_IP_HASH_SALT,
    ...sessions,
    ...(link === undefined ? [] : [link.token]),
  ]) {
    expect(logged).not.toContain(secret);
  }
  const ids = [...sessions];
  await admin().from('visits').delete().in('session_id', ids);
  await admin()
    .from('rate_limit_buckets')
    .delete()
    .in('api_key_hash', [
      ...ids.map((id) => `visit-session:${id}`),
      ...[TRACKED_IP, UNTRACKED_IP, BOT_IP].map(
        (ip) => `visit-ip:${hashClientIp(ip, E2E_IP_HASH_SALT)}`,
      ),
    ]);
  // Deleting the link deletes its tracked session (on delete cascade).
  await admin().from('tracked_links').delete().eq('id', link.id);
});

test('a tracked link sets the cookie, redirects to /, puts the lead first and attaches page views', async ({
  browser,
}) => {
  const page = await browse(browser, CHROME, TRACKED_IP);
  const addresses: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) addresses.push(frame.url());
  });
  const bodies: string[] = [];
  page.on('response', async (response) => {
    bodies.push(await response.text().catch(() => ''));
  });

  const first = recorded(page);
  const response = await page.goto(`/v/${link.token}`);
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe('/');
  expect(new URL(page.url()).search).toBe('');
  // The token was only ever in the address that redirected: no page the browser showed has it.
  expect(addresses.length).toBeGreaterThan(0);
  for (const address of addresses) expect(address).not.toContain(link.token);
  expect(await page.evaluate(() => location.href)).not.toContain(link.token);

  const cookie = await sessionCookie(page);
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/', expires: -1 });
  expect(await page.evaluate(() => document.cookie)).toBe('');

  // The lead project's card is first; the others keep their order.
  await expect(page.getByRole('main').getByRole('heading', { level: 3 })).toHaveText([
    'RouteServePrivate repository',
    'Ostomate 2.0',
    'Testament',
  ]);

  const firstVisit = (await (await first).json()) as Record<string, unknown>;
  expect(Object.keys(firstVisit)).toEqual(['id']);
  const [landing] = await visitsOf(cookie.value);
  expect(landing).toMatchObject({
    id: firstVisit.id,
    path: '/',
    tracked_link_id: link.id,
    user_agent_class: 'browser',
    ip_hash: hashClientIp(TRACKED_IP, E2E_IP_HASH_SALT),
    seconds_on_page: null,
  });

  // Nothing shown to the visitor names the company, the role, the contact or the link.
  const html = await page.content();
  for (const hidden of [COMPANY, ROLE, CONTACT, link.token, link.id]) {
    expect(html).not.toContain(hidden);
    for (const body of bodies) expect(body).not.toContain(hidden);
  }
  await expectNoSeriousAxeViolations(page);

  // A client-side route change ends the first view and records the next, in the same session.
  await page.clock.fastForward(5_000);
  const second = recorded(page);
  await page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { level: 3, name: 'Ostomate 2.0' }) })
    .getByRole('link', { name: 'Ostomate 2.0' })
    .click();
  await expect(page).toHaveURL('/p/ostomate2');
  await second;

  await expect
    .poll(async () => (await visitsOf(cookie.value)).map(({ path }) => path).sort())
    .toEqual(['/', '/p/ostomate2']);
  await expect
    .poll(
      async () => (await visitsOf(cookie.value)).find(({ path }) => path === '/')?.seconds_on_page,
    )
    .toBeGreaterThanOrEqual(5);
  const views = await visitsOf(cookie.value);
  expect(views.find(({ path }) => path === '/')?.seconds_on_page).toBeLessThan(120);
  expect(views.find(({ path }) => path === '/p/ostomate2')).toMatchObject({
    tracked_link_id: link.id,
    user_agent_class: 'browser',
    seconds_on_page: null,
  });
  expect((await sessionCookie(page)).value).toBe(cookie.value);
});

test('a visit that did not come by a link is logged with no link, in the usual order', async ({
  browser,
}) => {
  const page = await browse(browser, CHROME, UNTRACKED_IP);
  const done = recorded(page);
  await page.goto('/');
  await done;
  await expect(page.getByRole('main').getByRole('heading', { level: 3 })).toHaveText([
    'Ostomate 2.0',
    'RouteServePrivate repository',
    'Testament',
  ]);
  const cookie = await sessionCookie(page);
  expect(await visitsOf(cookie.value)).toEqual([
    expect.objectContaining({
      path: '/',
      tracked_link_id: null,
      user_agent_class: 'browser',
      ip_hash: hashClientIp(UNTRACKED_IP, E2E_IP_HASH_SALT),
    }),
  ]);
});

test('a bot that runs the page is stored as a bot', async ({ browser }) => {
  const page = await browse(browser, GOOGLEBOT, BOT_IP);
  const done = recorded(page);
  await page.goto(`/v/${link.token}`);
  await done;
  expect(new URL(page.url()).pathname).toBe('/');
  const cookie = await sessionCookie(page);
  // The bot's session was not attached to the link, so the landing order is the usual one.
  await expect(page.getByRole('main').getByRole('heading', { level: 3 }).first()).toHaveText(
    'Ostomate 2.0',
  );
  expect(await visitsOf(cookie.value)).toEqual([
    expect.objectContaining({ path: '/', tracked_link_id: null, user_agent_class: 'bot' }),
  ]);
});
