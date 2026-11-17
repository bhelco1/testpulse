import { spawn } from 'node:child_process';
import { once } from 'node:events';

import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test';

import { FIXED_NOW_VAR } from '../../lib/clock.ts';
import { SEED_NOW } from '../../lib/seed/plan.ts';
import { expectNoSeriousAxeViolations } from './support/axe.ts';
import { expectHydrated } from './support/open.ts';

// The server-error page (design v21 items 1 and 2; components.md "Server error (page)";
// ServerError.dc.html) and the landing's error state, as a visitor gets them while the database
// does not answer. Nothing the seeded pages read may fail, so this spec starts a server of its own
// from the same production build, with a preload that fails every request to Supabase
// (tests/e2e/support/no-database.ts); nothing is written and no other server is touched. It runs
// in the `live` project, one file at a time (playwright.config.ts), and takes its snapshots in
// each viewport and theme from contexts of its own.

test.describe.configure({ mode: 'serial' });

const PORT = 3106;
const BASE_URL = `http://127.0.0.1:${String(PORT)}`;
const PREFIX = '/p/ostomate2';
const RUN = `${PREFIX}/runs/00000000-0000-4000-8000-000000000001`;
const TEST = `${PREFIX}/tests/com.ostomate.app.ui.home.HomeViewModelTest.rendersToday`;
const BODY =
  'Its results couldn’t be read just now. Nothing is shown rather than numbers that might be wrong; try again in a minute.';
// Realtime answers within a second when a page subscribes (tests/e2e/support/open.ts allows 15 s
// for a rejoin); a page that never subscribes must still show neither state after this long.
const SUBSCRIBE_WAIT_MS = 5_000;

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

async function startServer(): Promise<NonNullable<typeof server>> {
  const child = spawn(
    'node_modules/.bin/next',
    ['start', '--hostname', '127.0.0.1', '--port', String(PORT)],
    {
      env: {
        ...process.env,
        [FIXED_NOW_VAR]: SEED_NOW,
        SUPABASE_SECRET_KEY: '',
        NODE_OPTIONS: '--import ./tests/e2e/support/no-database.ts',
      },
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

async function newPage(
  browser: Browser,
  options: Record<string, unknown> = VIEWPORTS['desktop-dark'],
): Promise<Page> {
  const context = await browser.newContext({ baseURL: BASE_URL, ...options });
  contexts.push(context);
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(SEED_NOW));
  return page;
}

const banner = (page: Page) => page.getByRole('banner');

/** Neither "Live" nor "Offline": nothing on the page subscribes (design v21 item 2). */
async function expectNoLiveIndicator(page: Page) {
  await page.waitForTimeout(SUBSCRIBE_WAIT_MS);
  await expect(banner(page).getByText(/^(Live|Offline · reconnecting)$/)).toHaveCount(0);
  await expect(page.locator('[data-part="controls"] > *')).toHaveCount(1);
}

async function expectProjectsMenuUnavailable(page: Page) {
  const button = banner(page).getByRole('button', { name: 'Projects' });
  await button.click();
  const panel = page.locator(`[id="${(await button.getAttribute('aria-controls')) ?? ''}"]`);
  await expect(panel).toHaveText('Projects couldn’t be loaded');
  await expect(panel.getByRole('link')).toHaveCount(0);
}

test.beforeAll(async () => {
  server = await startServer();
});

test.afterAll(async () => {
  for (const context of contexts) await context.close();
  await server?.stop();
});

test.describe('a project, run or test page whose read fails', () => {
  for (const [path, headline] of [
    [PREFIX, 'This project couldn’t be loaded'],
    [RUN, 'This run couldn’t be loaded'],
    [TEST, 'This test’s history couldn’t be loaded'],
  ] as const) {
    test(`answers ${path} with 500 and the server-error page`, async ({ browser }) => {
      const page = await newPage(browser);
      const response = await page.goto(path);
      expect(response?.status()).toBe(500);
      await expect(page).toHaveTitle('Couldn’t load · Testament');
      const alert = page.getByRole('main').getByRole('alert');
      await expect(alert.getByRole('heading', { level: 1 })).toHaveText(headline);
      await expect(alert.getByText('Error', { exact: true })).toBeVisible();
      await expect(alert.locator('[data-part="path"]')).toHaveText(path);
      await expect(alert.locator('p')).toHaveText(BODY);
      await expect(alert.getByRole('link', { name: 'Try again' })).toHaveAttribute('href', path);
      await expect(alert.getByRole('link', { name: 'Go to overview' })).toHaveAttribute(
        'href',
        '/',
      );
      await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveCount(0);
      const footer = page.getByRole('contentinfo');
      await expect(footer.getByRole('link', { name: 'Privacy' })).toBeVisible();
      await expect(footer.getByRole('link', { name: 'Source on GitHub' })).toBeVisible();
      await expect(footer).not.toContainText('Last report received');
      await expectNoSeriousAxeViolations(page);
    });
  }

  test('shows nothing from the database: no Live, and the menu says so', async ({ browser }) => {
    const page = await newPage(browser);
    await page.goto(PREFIX);
    await expectHydrated(page, 'button[aria-expanded]');
    await expectNoLiveIndicator(page);
    await expectProjectsMenuUnavailable(page);
    await expectNoSeriousAxeViolations(page);
  });

  test('retries in place, still failing, without leaving the page', async ({ browser }) => {
    const page = await newPage(browser);
    await page.goto(`${PREFIX}?branches=all`);
    const retry = page.getByRole('link', { name: 'Try again' });
    await expect(retry).toHaveAttribute('href', `${PREFIX}?branches=all`);
    await expectHydrated(page, 'a[href="/p/ostomate2?branches=all"]');
    await retry.click();
    await expect(page).toHaveURL(`${PREFIX}?branches=all`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'This project couldn’t be loaded',
    );
  });

  test('follows the system theme', async ({ browser }) => {
    const page = await newPage(browser, VIEWPORTS['phone-light']);
    await page.goto(TEST);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
  });

  test('matches its visual snapshots', { tag: '@visual' }, async ({ browser }) => {
    // Four pages, each answered only once the server's failed reads have given up.
    test.setTimeout(120_000);
    for (const [name, options] of Object.entries(VIEWPORTS)) {
      const page = await newPage(browser, options);
      await page.goto(PREFIX);
      await expectHydrated(page, 'button[aria-expanded]');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page).toHaveScreenshot(`server-error-${name}.png`, { fullPage: true });
    }
  });
});

// The landing keeps its own error state (v11), with the item 2 rule: it no longer subscribes,
// so it shows neither Live nor Offline, and the menu says the projects couldn't be loaded.
test.describe('the landing while the database does not answer', () => {
  test('shows its error state with no Live and nothing from the database', async ({ browser }) => {
    const page = await newPage(browser);
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Results couldn’t be loaded');
    await expect(page.getByRole('main').getByRole('link', { name: 'Try again' })).toHaveAttribute(
      'href',
      '/',
    );
    await expect(page.getByText('Bobby Helco, quality engineering leader')).toHaveCount(0);
    await expect(page.getByRole('contentinfo')).not.toContainText('Last report received');
    await expectHydrated(page, 'button[aria-expanded]');
    await expectNoLiveIndicator(page);
    await expectProjectsMenuUnavailable(page);
    await expectNoSeriousAxeViolations(page);
  });
});
