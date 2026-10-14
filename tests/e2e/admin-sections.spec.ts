import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';

import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test';

import { FIXED_NOW_VAR } from '../../lib/clock.ts';
import type { DailySummary } from '../../lib/jobs/summary.ts';
import { addProject } from '../../lib/projects/repo.ts';
import { parseProjectFile } from '../../lib/projects/schema.ts';
import { SEED_NOW } from '../../lib/seed/plan.ts';
import { createTrackedLink } from '../../lib/tracked-links/create.ts';
import { E2E_ADMIN_EMAIL, signInAsOwner } from './support/admin.ts';
import { expectNoSeriousAxeViolations } from './support/axe.ts';
import { admin } from './support/ingest.ts';
import { expectHydrated } from './support/open.ts';

// Admin's sections (spec section 15, "Admin" as built; section 17, Phase 6 criterion 2;
// design/pages/Admin.dc.html): open alerts of every kind, tracked links with their browser visits
// and none of their bot ones, projects with their YAML sync, and the daily job, read and changed
// through the real page and its server actions against the seeded database.
//
// Admin reads and writes with the secret client, and the server every page spec uses is started
// without the secret key, so each public page is proven to render as anon (decision of
// 2026-09-29); there admin shows its error state (tests/e2e/admin.spec.ts). This spec therefore
// starts a server of its own from the same production build, with the local secret key, the e2e
// owner's address and the seed clock, as tests/e2e/tracked-link.spec.ts does. It runs in the
// `live` project, one file at a time and after every other project (playwright.config.ts): it
// seeds what admin shows (alerts, links, visits, a heartbeat, a project without a file, a changed
// retention) and removes or restores all of it afterwards, so no seeded page or snapshot changes.
// Its snapshots are taken in each viewport and theme from contexts of its own.

test.describe.configure({ mode: 'serial' });

const PORT = 3105;
const BASE_URL = `http://127.0.0.1:${String(PORT)}`;
const ORPHAN = 'admin-e2e-legacy';
const GONE = 'admin-e2e-gone';
const ACME_TOKEN = 'Qm8r2LxT0aZe';
const GLOBEX_TOKEN = 'Tb9eJx3mRq6u';
const SESSIONS = ['admin-e2e-s1', 'admin-e2e-s2', 'admin-e2e-s3', 'admin-e2e-bot'];
const RUN_PATH = '/p/ostomate2/runs/00000000-0000-4000-8000-000000000001';
const HEARTBEAT_AT = '2026-10-05T04:12:00.000Z';
const minutesBefore = (minutes: number) =>
  new Date(Date.parse(SEED_NOW) - minutes * 60_000).toISOString();

const VIEWPORTS = {
  'desktop-dark': { viewport: { width: 1440, height: 900 }, colorScheme: 'dark' },
  'desktop-light': { viewport: { width: 1440, height: 900 }, colorScheme: 'light' },
  'phone-dark': {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
  },
  'phone-light': {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    colorScheme: 'light',
  },
} as const;

let server: { readonly stop: () => Promise<void>; readonly output: () => string } | undefined;
const contexts: BrowserContext[] = [];
const ids: {
  projects: Record<string, string>;
  alerts: Record<string, string>;
  acme: string;
  globex: string;
  retention: number;
} = { projects: {}, alerts: {}, acme: '', globex: '', retention: 180 };
const issuedKeys: string[] = [];

function check<R extends { data: unknown; error: { code: string; message: string } | null }>(
  result: R,
  what: string,
): NonNullable<R['data']> {
  if (result.error) throw new Error(`${what}: ${result.error.code} ${result.error.message}`);
  if (result.data === null || result.data === undefined) throw new Error(`${what}: no rows`);
  return result.data as NonNullable<R['data']>;
}

/** For a write that answers no rows: only its error matters. */
function succeeded(result: { error: { code: string; message: string } | null }, what: string) {
  if (result.error) throw new Error(`${what}: ${result.error.code} ${result.error.message}`);
}

async function startServer(): Promise<NonNullable<typeof server>> {
  if (!process.env.SUPABASE_SECRET_KEY) {
    throw new Error('the admin sections spec needs the local SUPABASE_SECRET_KEY for its server');
  }
  const child = spawn(
    'node_modules/.bin/next',
    ['start', '--hostname', '127.0.0.1', '--port', String(PORT)],
    {
      env: { ...process.env, [FIXED_NOW_VAR]: SEED_NOW, ADMIN_EMAIL: E2E_ADMIN_EMAIL },
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

async function registerOrphan(slug: string, name: string): Promise<string> {
  const file = parseProjectFile(
    readFileSync('projects/routeserve.yaml', 'utf8'),
    'projects/routeserve.yaml',
  );
  issuedKeys.push(await addProject(admin(), { ...file, slug, name, sort_order: 40 }));
  return check(await admin().from('projects').select('id').eq('slug', slug).single(), slug)
    .id as string;
}

async function seed() {
  const projects = check(
    await admin().from('projects').select('id, slug, retention_days'),
    'projects',
  );
  for (const project of projects) ids.projects[project.slug as string] = project.id as string;
  ids.retention = projects.find((p) => p.slug === 'testpulse')?.retention_days as number;
  const [o2, rs, tp] = ['ostomate2', 'routeserve', 'testpulse'].map((slug) => {
    const id = ids.projects[slug];
    if (id === undefined) throw new Error(`the seed has no ${slug}; run npm run db:seed`);
    return id;
  }) as [string, string, string];

  const runsOf = async (project: string) =>
    check(
      await admin()
        .from('runs')
        .select('id, finished_at, reports(id, job, module, platform)')
        .eq('project_id', project)
        .eq('source', 'ci')
        .order('finished_at', { ascending: false }),
      'runs',
    ) as {
      id: string;
      finished_at: string;
      reports: { id: string; job: string; module: string; platform: string }[];
    }[];
  const [o2Latest, o2Before] = await runsOf(o2);
  const [rsLatest] = await runsOf(rs);
  const [tpLatest] = await runsOf(tp);
  if (!o2Latest || !o2Before || !rsLatest || !tpLatest) throw new Error('the seed has no runs');
  const ios = o2Latest.reports.find((r) => r.platform === 'ios-sim');
  if (!ios) throw new Error('no ios-sim report');

  const alerts = [
    [
      tp,
      'stale',
      { last_report_at: tpLatest.finished_at, expected_cadence_days: 8 },
      minutesBefore(4 * 1440 + 468),
    ],
    [
      o2,
      'count_drop',
      {
        job: 'android',
        module: 'shared',
        platform: 'jvm',
        baseline: 82,
        current: 60,
        baseline_run_id: o2Before.id,
        run_id: o2Latest.id,
      },
      minutesBefore(150),
    ],
    [
      o2,
      'empty_run',
      { job: ios.job, module: ios.module, platform: ios.platform, report_id: ios.id },
      minutesBefore(748),
    ],
    [
      rs,
      'coverage_below_floor',
      {
        module: 'packages/shared',
        floor: 80,
        lines_pct: 79.98,
        report_id: rsLatest.reports[0]?.id,
      },
      minutesBefore(5 * 1440 + 164),
    ],
  ] as const;
  for (const [project, kind, detail, opened] of alerts) {
    ids.alerts[kind] = check(
      await admin()
        .from('alerts')
        .insert({ project_id: project, kind, detail, opened_at: opened })
        .select('id')
        .single(),
      kind,
    ).id as string;
  }

  const link = async (input: Record<string, string>, token: string, created: string) => {
    const result = await createTrackedLink(admin(), input, new Date(created), {
      generateToken: () => token,
    });
    if (!result.ok) throw new Error(result.reason);
    return result.link.id;
  };
  ids.globex = await link(
    {
      company: 'Globex',
      role: 'QA Manager',
      contact: 'Sam Patel (recruiter)',
      sent_on: '2026-09-12',
      notes: 'Referral from a former colleague.',
    },
    GLOBEX_TOKEN,
    '2026-09-12T10:00:00Z',
  );
  ids.acme = await link(
    {
      company: 'Acme Health',
      role: 'Director of Quality Engineering',
      contact: 'Dana Ruiz, dana.ruiz@acme.example',
      sent_on: '2026-09-18',
      notes: 'Met at the QA leaders meetup. Asked how flaky tests are handled.',
      lead_project_slug: 'routeserve',
    },
    ACME_TOKEN,
    '2026-09-18T09:00:00Z',
  );
  const visit = (
    session: string,
    path: string,
    ip: string,
    cls: string,
    entered: string,
    seconds: number | null,
  ) => ({
    tracked_link_id: ids.acme,
    session_id: session,
    path,
    entered_at: entered,
    seconds_on_page: seconds,
    user_agent_class: cls,
    ip_hash: createHash('sha256').update(ip).digest('hex'),
  });
  succeeded(
    await admin()
      .from('visits')
      .insert([
        visit('admin-e2e-s1', '/', 'a', 'browser', '2026-09-18T16:02:00Z', 74),
        visit('admin-e2e-s1', '/p/ostomate2', 'a', 'browser', '2026-09-18T16:03:00Z', 412),
        visit('admin-e2e-s2', '/p/routeserve', 'a', 'browser', '2026-10-01T13:40:00Z', 41),
        visit(
          'admin-e2e-s2',
          // A fixed path, so the snapshots do not depend on the seed's run ids.
          RUN_PATH,
          'a',
          'browser',
          '2026-10-01T13:41:00Z',
          95,
        ),
        visit('admin-e2e-s3', '/how-its-tested', 'b', 'browser', minutesBefore(120), null),
        visit('admin-e2e-bot', '/privacy', 'c', 'bot', minutesBefore(60), 30),
      ]),
    'visits',
  );

  const summary: DailySummary = {
    started_at: HEARTBEAT_AT,
    finished_at: '2026-10-05T04:12:03.000Z',
    status: 'ok',
    failed_step: null,
    error: null,
    failed_steps: [],
    heartbeat_written: true,
    projects_checked: 3,
    stale_opened: 1,
    stale_opened_project_ids: [tp],
    pruned: {
      results: 0,
      result_failures: 0,
      visits: 0,
      tracked_sessions: 0,
      rate_limit_buckets: 12,
      runs_marked_pruned: 0,
    },
    pruned_by_project: [],
    prune_batches: 2,
    prune_complete: true,
  };
  succeeded(
    await admin().from('heartbeats').insert({ created_at: HEARTBEAT_AT, summary }),
    'heartbeat',
  );

  ids.projects[ORPHAN] = await registerOrphan(ORPHAN, 'routeserve-legacy');
  succeeded(
    await admin().from('projects').update({ retention_days: 365 }).eq('id', tp),
    'retention',
  );
}

async function unseed() {
  await admin().from('alerts').delete().in('id', Object.values(ids.alerts));
  await admin().from('tracked_links').delete().in('token', [ACME_TOKEN, GLOBEX_TOKEN]);
  await admin().from('tracked_links').delete().like('company', 'E2E admin %');
  await admin().from('visits').delete().in('session_id', SESSIONS);
  await admin().from('heartbeats').delete().eq('created_at', HEARTBEAT_AT);
  await admin().from('projects').delete().in('slug', [ORPHAN, GONE]);
  const tp = ids.projects.testpulse;
  if (tp !== undefined)
    await admin().from('projects').update({ retention_days: ids.retention }).eq('id', tp);
}

async function ownerPage(browser: Browser, options: Record<string, unknown> = {}): Promise<Page> {
  const context = await browser.newContext({ baseURL: BASE_URL, ...options });
  contexts.push(context);
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(SEED_NOW));
  await signInAsOwner(page);
  return page;
}

const section = (page: Page, name: string | RegExp) => page.getByRole('region', { name });

test.beforeAll(async () => {
  await unseed();
  server = await startServer();
  await seed();
});

test.afterAll(async () => {
  for (const context of contexts) await context.close();
  await server?.stop();
  await unseed();
  // Nothing the server logged may carry an issued key.
  for (const key of issuedKeys) expect(server?.output() ?? '').not.toContain(key);
});

test('shows every section from the database, and records no visit of admin', async ({
  browser,
}) => {
  const page = await ownerPage(browser);
  const visits: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/visits')) visits.push(request.url());
  });
  await page.reload();
  await expectHydrated(page, 'button[aria-label="Copy link for Acme Health"]');

  const alerts = section(page, 'Open alerts');
  await expect(alerts.getByText('4 open')).toBeVisible();
  await expect(alerts.getByRole('group')).toHaveText([
    /^COUNT DROPOstomate 2\.0: test count fell 26%android\/shared\/jvm: 82 → 60 tests \(−26%\) since the previous default-branch runOpened5 Oct, 09:30 UTC·Closes when the count recovers, or acknowledge it\.Acknowledge$/,
    /^EMPTY REPORTOstomate 2\.0: a report held no testsios\/composeApp\/ios-sim parsed with 0 tests on main \([0-9a-f]{7}\)\.Opened4 Oct, 23:32 UTC·Closes by itself when that key reports tests$/,
    /^STALEtestpulse: no report in 13 daysNo report in 13 days\. Expected every 8 days; last report 22 Sep\.Opened1 Oct, 04:12 UTC·Closes by itself when testpulse reports$/,
    /^BELOW FLOORRouteServe: coverage under its floorpackages\/shared lines 79\.9% under its 80% floorOpened30 Sep, 09:16 UTC·Closes by itself when the module is back at its floor$/,
  ]);
  await expect(alerts.getByRole('button')).toHaveText(['Acknowledge']);

  const links = section(page, /^Tracked links/);
  await expect(links.getByText('2 links')).toBeVisible();
  const rows = links.getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).getByRole('link', { name: 'Acme Health' })).toHaveAttribute(
    'href',
    `/admin/links/${ids.acme}`,
  );
  // Three sessions, two addresses: the bot's visit is in none of the figures.
  await expect(rows.nth(0).locator('dl')).toHaveText(
    'Sent18 SepOpened3 sessions · 2 visitorsLast seen2 h agoPagesOverviewOstomate 2.0RouteServeHow it’s tested',
  );
  await expect(rows.nth(0).locator('code')).toHaveText(`${BASE_URL}/v/${ACME_TOKEN}`);
  await expect(rows.nth(1).locator('dl')).toHaveText(
    'Sent12 SepOpenedNot yet openedLast seen—Pages—',
  );

  const projects = section(page, 'Projects');
  await expect(projects.getByRole('listitem')).toHaveText([
    'Ostomate 2.0PublicLast report2 h agoYAML sync✓ In syncRotate key',
    'RouteServePrivateLast report3 h agoYAML sync✓ In syncRotate key',
    'testpulsePublicLast report◷ 1 week agoYAML sync≠ Differsretention_days: YAML 180, database 365Rotate key',
    'routeserve-legacyPrivateLast report—YAML sync? No YAMLA database row with no projects/*.yaml file. The sync leaves it as it is.Rotate key',
    'ATPRPrivateLast report—YAML sync+ Not registeredprojects/atpr.yaml has no database row. Register it with npm run project:add atpr.No row, no key',
  ]);

  const job = section(page, 'Daily job');
  await expect(job.locator('p').first()).toHaveText(
    /^Runs once a day around 04:00 UTC on Vercel cron\./,
  );
  await expect(job.locator(':scope > div:last-child > div')).toHaveText([
    'Last run5 Oct, 04:12 UTC7 h ago · next around 04:00 UTC',
    'Heartbeat✓ WrittenDatabase kept awake',
    'Stale check1 openedOpened: testpulse',
    'Prune12 rows removedResults 0 · failure text 0 · visits 0 · tracked sessions 0 · rate-limit buckets 12',
  ]);

  await expectNoSeriousAxeViolations(page);
  expect(visits).toEqual([]);
});

test(
  'matches its visual snapshots, page and link detail',
  { tag: '@visual' },
  async ({ browser }) => {
    for (const [name, options] of Object.entries(VIEWPORTS)) {
      const page = await ownerPage(browser, options);
      await expectHydrated(page, 'button[aria-label="Copy link for Acme Health"]');
      await expect(page).toHaveScreenshot(`admin-populated-${name}.png`, { fullPage: true });
      await page.goto(`/admin/links/${ids.acme}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Acme Health');
      await expect(page).toHaveScreenshot(`admin-link-${name}.png`, { fullPage: true });
    }
  },
);

test('lays the tables out as cards on a phone', async ({ browser }) => {
  const page = await ownerPage(browser, VIEWPORTS['phone-dark']);
  const links = section(page, /^Tracked links/);
  await expect(links.getByText('COMPANY / ROLE', { exact: true })).toBeHidden();
  await expect(
    links.getByRole('listitem').first().getByText('Opened', { exact: true }),
  ).toBeVisible();
  await expect(section(page, 'Projects').getByText('YAML SYNC', { exact: true })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expectNoSeriousAxeViolations(page);
});

test('shows a link’s detail, opened and not, and 404 for no such link', async ({ browser }) => {
  const page = await ownerPage(browser);
  await page.getByRole('link', { name: 'Acme Health' }).click();
  await expect(page).toHaveURL(`/admin/links/${ids.acme}`);
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveText(
    'Admin/Tracked links/Acme Health',
  );
  await expect(page.getByRole('region', { name: 'Link details' })).toHaveText(
    'ContactDana Ruiz, dana.ruiz@acme.exampleLead projectRouteServePrivateSent18 Sep' +
      'NotesMet at the QA leaders meetup. Asked how flaky tests are handled.',
  );
  const visits = page.getByRole('region', { name: 'Visits' });
  await expect(visits.locator(':scope > div').first().locator(':scope > div')).toHaveText([
    'First seen18 Sep, 16:02 UTCFirst browser visit',
    'Last seen2 h agoLatest browser visit',
    'Sessions3Distinct session cookies',
    'Visitors2Distinct salted IP hashes',
  ]);
  await expect(visits.getByRole('listitem')).toHaveText([
    'Overview/Views: 1Time: 1m 14s',
    'Ostomate 2.0/p/ostomate2Views: 1Time: 6m 52s',
    'RouteServe/p/routeserveViews: 1Time: 41 s',
    `Ostomate 2.0 run${RUN_PATH}Views: 1Time: 1m 35s`,
    'How it’s tested/how-its-testedViews: 1Time: —',
    'Ostomate 2.08m 27s',
    'RouteServe41 s',
  ]);
  await expectNoSeriousAxeViolations(page);

  await page.goto(`/admin/links/${ids.globex}`);
  await expect(page.getByRole('region', { name: 'Visits' })).toContainText(
    'Not yet openedVisits appear here once someone opens the link in a browser. Link previews and bots are never counted.',
  );
  await expect(page.getByRole('region', { name: 'Link details' })).toHaveText(
    'ContactSam Patel (recruiter)Lead projectNone, opens the overviewSent12 SepNotesReferral from a former colleague.',
  );
  await expectNoSeriousAxeViolations(page);

  for (const id of ['00000000-0000-4000-8000-000000000000', 'not-a-link']) {
    const response = await page.goto(`/admin/links/${id}`);
    expect(response?.status(), id).toBe(404);
    // Until an admin not-found is designed (asked in v18), the site-wide one answers.
    await expect(page.getByRole('heading', { level: 1 }), id).toHaveText('Nothing at this address');
  }
});

test('copies a link, and offers it to select when the browser refuses', async ({ browser }) => {
  const page = await ownerPage(browser);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await expectHydrated(page, 'button[aria-label="Copy link for Acme Health"]');
  await page.getByRole('button', { name: 'Copy link for Acme Health' }).click();
  await expect(page.getByRole('button', { name: 'Copy link for Acme Health' })).toHaveText(
    'Copied',
  );
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${BASE_URL}/v/${ACME_TOKEN}`,
  );

  await page.addInitScript(() => {
    navigator.clipboard.writeText = () =>
      Promise.reject(new DOMException('blocked', 'NotAllowedError'));
  });
  await page.reload();
  await expectHydrated(page, 'button[aria-label="Copy link for Globex"]');
  await page.getByRole('button', { name: 'Copy link for Globex' }).click();
  const offered = page.getByRole('textbox', { name: 'Link for Globex' });
  await expect(offered).toHaveValue(`${BASE_URL}/v/${GLOBEX_TOKEN}`);
  await expect(
    page.getByText('Your browser blocked copying. Select the link and copy it.'),
  ).toBeVisible();
  await expectNoSeriousAxeViolations(page);
});

test('creates a link, marking its fields and the new row', async ({ browser }) => {
  const page = await ownerPage(browser);
  await expectHydrated(page, 'button[aria-label="Copy link for Acme Health"]');
  await page.getByRole('button', { name: 'New link' }).click();
  const form = page.getByRole('group', { name: 'New tracked link' });
  await expect(form.getByRole('combobox', { name: 'Lead project' }).locator('option')).toHaveText([
    'None, open the overview',
    'Ostomate 2.0',
    'RouteServe (private)',
    'testpulse',
    'routeserve-legacy (private)',
  ]);
  await form.getByRole('button', { name: 'Create link' }).click();
  await expect(form.getByText('Company is required')).toBeVisible();
  await expect(form.getByText('Role is required')).toBeVisible();
  await expectNoSeriousAxeViolations(page);

  await form.getByRole('textbox', { name: /^Company/ }).fill('E2E admin Initech');
  await form.getByRole('textbox', { name: /^Role/ }).fill('Head of QA');
  await form.getByRole('combobox', { name: 'Lead project' }).selectOption('routeserve');
  await expect(
    form.getByText('Private: the visitor sees counts and trends, never failure text.'),
  ).toBeVisible();
  await form.getByRole('button', { name: 'Create link' }).click();

  await expect(page.getByRole('group', { name: 'New tracked link' })).toHaveCount(0);
  const links = section(page, /^Tracked links/);
  await expect(links.getByText('3 links')).toBeVisible();
  const created = links.getByRole('listitem').filter({ hasText: 'E2E admin Initech' });
  await expect(created.getByText('NEW', { exact: true })).toBeVisible();
  const row = check(
    await admin()
      .from('tracked_links')
      .select('token, role, lead_project_slug, sent_at')
      .eq('company', 'E2E admin Initech')
      .single(),
    'created link',
  );
  expect(row).toMatchObject({ role: 'Head of QA', lead_project_slug: 'routeserve' });
  expect(new Date(row.sent_at as string).toISOString()).toBe('2026-10-05T00:00:00.000Z');
  await expect(created.locator('code')).toHaveText(`${BASE_URL}/v/${row.token as string}`);
  await expectNoSeriousAxeViolations(page);
});

test('acknowledges a count drop, and says so when one cannot be', async ({ browser }) => {
  const page = await ownerPage(browser);
  await expectHydrated(page, 'button[aria-label="Copy link for Acme Health"]');
  const alerts = section(page, 'Open alerts');
  await alerts.getByRole('button', { name: 'Acknowledge' }).click();
  await expect(alerts.getByText('3 open')).toBeVisible();
  await expect(alerts.getByRole('group', { name: 'count drop alert' })).toHaveCount(0);
  const acknowledged = check(
    await admin()
      .from('alerts')
      .select('acknowledged_at, resolved_at')
      .eq('id', ids.alerts.count_drop as string)
      .single(),
    'acknowledged',
  );
  expect(acknowledged.acknowledged_at).not.toBeNull();
  expect(acknowledged.resolved_at).toBe(acknowledged.acknowledged_at);

  // A count drop that closes by itself while the page is open can no longer be acknowledged.
  const reopened = check(
    await admin()
      .from('alerts')
      .insert({
        project_id: ids.projects.ostomate2,
        kind: 'count_drop',
        detail: {
          job: 'android',
          module: 'composeApp',
          platform: 'jvm',
          baseline: 60,
          current: 40,
          baseline_run_id: ids.alerts.count_drop,
          run_id: ids.alerts.count_drop,
        },
        opened_at: minutesBefore(30),
      })
      .select('id')
      .single(),
    'another drop',
  );
  ids.alerts.again = reopened.id as string;
  await page.reload();
  await expectHydrated(page, 'button[aria-label="Copy link for Acme Health"]');
  await admin()
    .from('alerts')
    .update({ resolved_at: SEED_NOW })
    .eq('id', reopened.id as string);
  await alerts.getByRole('button', { name: 'Acknowledge' }).click();
  await expect(alerts.getByRole('alert')).toHaveText(
    'Couldn’t acknowledge. The alert is still open. Try again.',
  );
  await expectNoSeriousAxeViolations(page);
});

test('rotates a key, shown once: the hash changes and hiding it removes it', async ({
  browser,
}) => {
  const page = await ownerPage(browser);
  await expectHydrated(page, 'button[aria-label="Copy link for Acme Health"]');
  const before = check(
    await admin().from('projects').select('api_key_hash').eq('slug', ORPHAN).single(),
    'hash',
  );
  const orphan = section(page, 'Projects')
    .getByRole('listitem')
    .filter({ hasText: 'routeserve-legacy' });
  await orphan.getByRole('button', { name: 'Rotate key' }).click();
  const dialog = orphan.getByRole('alertdialog', { name: 'Rotate the routeserve-legacy key' });
  await expect(dialog).toContainText('The current key stops working immediately.');
  await expectNoSeriousAxeViolations(page);
  await dialog.getByRole('button', { name: 'Rotate key' }).click();

  const key = (await orphan.locator('code').textContent()) ?? '';
  issuedKeys.push(key);
  expect(key).toMatch(/^tp_[A-Za-z0-9_-]{43}$/);
  await expect(orphan.getByText('New key. Copy it now; it won’t be shown again.')).toBeVisible();
  const after = check(
    await admin().from('projects').select('api_key_hash').eq('slug', ORPHAN).single(),
    'hash',
  );
  expect(after.api_key_hash).not.toBe(before.api_key_hash);
  expect(after.api_key_hash).toBe(createHash('sha256').update(key).digest('hex'));
  expect(page.url()).not.toContain(key);
  await expectNoSeriousAxeViolations(page);

  await orphan.getByRole('button', { name: 'Copied, hide it' }).click();
  await expect(page.getByText(key)).toHaveCount(0);
  await page.reload();
  expect(await page.content()).not.toContain(key);
});

test('says what failed when a project or lead is gone, and nothing changes', async ({
  browser,
}) => {
  ids.projects[GONE] = await registerOrphan(GONE, 'Gone project');
  const page = await ownerPage(browser);
  await expectHydrated(page, 'button[aria-label="Copy link for Acme Health"]');
  await page.getByRole('button', { name: 'New link' }).click();
  const form = page.getByRole('group', { name: 'New tracked link' });
  await form.getByRole('textbox', { name: /^Company/ }).fill('E2E admin Gone');
  await form.getByRole('textbox', { name: /^Role/ }).fill('Head of QA');
  await form.getByRole('combobox', { name: 'Lead project' }).selectOption(GONE);
  await admin().from('projects').delete().eq('slug', GONE);

  await form.getByRole('button', { name: 'Create link' }).click();
  await expect(form.getByRole('alert')).toHaveText(
    'Couldn’t create the linkNothing was saved; your entries are still here. Try again.',
  );
  await expect(form.getByRole('textbox', { name: /^Company/ })).toHaveValue('E2E admin Gone');
  await expectNoSeriousAxeViolations(page);

  const gone = section(page, 'Projects').getByRole('listitem').filter({ hasText: 'Gone project' });
  await gone.getByRole('button', { name: 'Rotate key' }).click();
  await gone.getByRole('alertdialog').getByRole('button', { name: 'Rotate key' }).click();
  await expect(gone.getByRole('alert')).toHaveText(
    'Couldn’t rotate the Gone project key.The current key still works. Try again.Try again',
  );
  await expectNoSeriousAxeViolations(page);
  const { data } = await admin().from('tracked_links').select('id').eq('company', 'E2E admin Gone');
  expect(data).toEqual([]);
});

test('deletes a link, keeping its visits, and says so when it cannot', async ({ browser }) => {
  const page = await ownerPage(browser);
  await page.goto(`/admin/links/${ids.acme}`);
  await expectHydrated(page, 'button[aria-label="Copy link for Acme Health"]');
  const remove = page.getByRole('region', { name: 'Delete this link' });
  await remove.getByRole('button', { name: 'Delete link' }).click();
  await expect(
    remove.getByRole('alertdialog', { name: 'Delete the Acme Health link?' }),
  ).toBeVisible();
  await expectNoSeriousAxeViolations(page);
  await remove.getByRole('alertdialog').getByRole('button', { name: 'Delete link' }).click();
  await expect(page).toHaveURL('/admin');
  await expect(
    section(page, /^Tracked links/).getByRole('link', { name: 'Acme Health' }),
  ).toHaveCount(0);
  const visits = check(
    await admin().from('visits').select('tracked_link_id').in('session_id', SESSIONS),
    'visits',
  );
  expect(visits).toHaveLength(6);
  expect(visits.every((visit) => visit.tracked_link_id === null)).toBe(true);

  await page.goto(`/admin/links/${ids.globex}`);
  await expectHydrated(page, 'button[aria-label="Copy link for Globex"]');
  await admin().from('tracked_links').delete().eq('id', ids.globex);
  await page.getByRole('button', { name: 'Delete link' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete link' }).click();
  await expect(
    page.getByRole('region', { name: 'Delete this link' }).getByRole('alert'),
  ).toHaveText('Couldn’t delete the link. Nothing was removed. Try again.');
  await expectNoSeriousAxeViolations(page);
});

test('refuses every action once the session has gone, and changes nothing', async ({ browser }) => {
  const created = await createTrackedLink(
    admin(),
    { company: 'E2E admin Kept', role: 'QA Lead' },
    new Date(SEED_NOW),
  );
  if (!created.ok) throw new Error(created.reason);
  ids.alerts.held = check(
    await admin()
      .from('alerts')
      .insert({
        project_id: ids.projects.ostomate2,
        kind: 'count_drop',
        detail: {
          job: 'ios',
          module: 'composeApp',
          platform: 'ios-sim',
          baseline: 50,
          current: 30,
          baseline_run_id: ids.alerts.count_drop,
          run_id: ids.alerts.count_drop,
        },
        opened_at: minutesBefore(20),
      })
      .select('id')
      .single(),
    'held drop',
  ).id as string;
  const hash = check(
    await admin().from('projects').select('api_key_hash').eq('slug', ORPHAN).single(),
    'hash',
  );

  const page = await ownerPage(browser);
  await expectHydrated(page, 'button[aria-label="Copy link for E2E admin Kept"]');
  await page.getByRole('button', { name: 'New link' }).click();
  const form = page.getByRole('group', { name: 'New tracked link' });
  await form.getByRole('textbox', { name: /^Company/ }).fill('E2E admin Refused');
  await form.getByRole('textbox', { name: /^Role/ }).fill('Head of QA');
  await page.context().clearCookies();

  const notice = page.getByRole('main').getByRole('alert').first();
  await form.getByRole('button', { name: 'Create link' }).click();
  await expect(notice).toHaveText(
    'Your session has endedThe link wasn’t created. Sign in again to finish; nothing was changed, ' +
      'and the form keeps what you typed until you leave this page.Sign in again',
  );
  await expect(form.getByRole('textbox', { name: /^Company/ })).toHaveValue('E2E admin Refused');
  await expectNoSeriousAxeViolations(page);

  await section(page, 'Open alerts').getByRole('button', { name: 'Acknowledge' }).click();
  await expect(notice).toContainText('The alert wasn’t acknowledged.');
  const orphan = section(page, 'Projects')
    .getByRole('listitem')
    .filter({ hasText: 'routeserve-legacy' });
  await orphan.getByRole('button', { name: 'Rotate key' }).click();
  await orphan.getByRole('alertdialog').getByRole('button', { name: 'Rotate key' }).click();
  await expect(notice).toContainText('The key wasn’t rotated.');

  // The link page's own action, from a session that has gone.
  const detail = await ownerPage(browser);
  await detail.goto(`/admin/links/${created.link.id}`);
  await expectHydrated(detail, 'button[aria-label="Copy link for E2E admin Kept"]');
  await detail.context().clearCookies();
  await detail.getByRole('button', { name: 'Delete link' }).click();
  await detail.getByRole('alertdialog').getByRole('button', { name: 'Delete link' }).click();
  await expect(detail.getByRole('main').getByRole('alert').first()).toHaveText(
    'Your session has endedSign in again to finish. Nothing was changed.Sign in again',
  );
  await expectNoSeriousAxeViolations(detail);

  await notice.getByRole('link', { name: 'Sign in again' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in to admin');

  const { data: refused } = await admin()
    .from('tracked_links')
    .select('id')
    .eq('company', 'E2E admin Refused');
  expect(refused).toEqual([]);
  const { data: kept } = await admin().from('tracked_links').select('id').eq('id', created.link.id);
  expect(kept).toHaveLength(1);
  const after = check(
    await admin().from('projects').select('api_key_hash').eq('slug', ORPHAN).single(),
    'hash',
  );
  expect(after.api_key_hash).toBe(hash.api_key_hash);
  const open = check(
    await admin()
      .from('alerts')
      .select('id')
      .in('id', [
        ids.alerts.held,
        ids.alerts.stale,
        ids.alerts.empty_run,
        ids.alerts.coverage_below_floor,
      ])
      .is('resolved_at', null),
    'open alerts',
  );
  expect(open).toHaveLength(4);
});
