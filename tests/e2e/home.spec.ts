import { expect, test, type Page } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe.ts';
import { capture, FAILING, HIDDEN, leaksIn, ROUTESERVE_RUNS } from './support/leaks.ts';
import { open } from './support/open.ts';

// The landing page, / (spec section 13), against the seed (lib/seed/plan.ts) at SEED_NOW.
// Figures are the seed's hand-computed values in lib/seed/seed.int.test.ts ("landing headline
// and project cards"). Tags route tests to projects (playwright.config.ts): untagged tests run in
// every browser project, @js only where scripts run, @no-js only where they do not, @visual only
// in the four viewport × theme projects inside the Playwright image.

const card = (page: Page, name: string) =>
  page.getByRole('article').filter({ has: page.getByRole('heading', { level: 3, name }) });
const feed = (page: Page) => page.getByRole('log');

test.describe('the landing page', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, '/');
  });

  test('leads with the lede and the portfolio’s 1,186 tests', async ({ page }) => {
    await expect(page).toHaveTitle('testpulse');
    const main = page.getByRole('main');
    await expect(main.getByText('Live test results for every project I build.')).toBeVisible();
    // 142 + 1,041 + 3 distinct tests in the three latest runs.
    await expect(main.locator('[data-part="hero-total"]')).toHaveText('1,186');
  });

  test('shows the four portfolio tiles', async ({ page }) => {
    await expect(page.locator('[data-part="tiles"] > div')).toHaveText([
      // 1,183 / 1,185 distinct tests, rounded down; testpulse's one skipped test.
      'Pass rate99.8%1,183 of 1,185 · 1 skipped, excluded',
      // testpulse last reported 13 days before SEED_NOW, against a cadence of 8.
      'Projects reporting2 of 3testpulse silent 13 days',
      'Runs in last 30 days19Ostomate 2.0 8 · RouteServe 10 · testpulse 1',
      // testpulse never passed (13 d 7 h), RouteServe red since 08:13:55.
      'Projects passing1 of 3Red: testpulse 13d 7h · RouteServe 3h 46m',
    ]);
  });

  test('shows no time to green or green streak', async ({ page }) => {
    const main = page.getByRole('main');
    await expect(main.getByText(/time to green/i)).toHaveCount(0);
    await expect(main.getByText(/green streak/i)).toHaveCount(0);
  });

  test('lists the three projects’ cards under “Latest default-branch run”', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 2, name: 'Projects' })).toBeVisible();
    await expect(page.getByText('Latest default-branch run', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3 })).toHaveText([
      'Ostomate 2.0',
      'RouteServePrivate repository',
      'testpulse',
    ]);
  });

  test('gives Ostomate2 its passed run, layers, coverage and reports', async ({ page }) => {
    const ostomate2 = card(page, 'Ostomate 2.0');
    await expect(ostomate2.getByText('Passed', { exact: true })).toBeVisible();
    await expect(ostomate2.locator('[data-part="meta"]')).toHaveText(/^2 h ago·main·[0-9a-f]{7}$/);
    await expect(ostomate2.locator('[data-part="sha"]')).toHaveAttribute(
      'href',
      /^\/p\/ostomate2\/runs\/[0-9a-f-]{36}$/,
    );
    await expect(ostomate2.getByRole('link', { name: 'Ostomate 2.0' })).toHaveAttribute(
      'href',
      '/p/ostomate2',
    );
    await expect(ostomate2.locator('[data-part="total"]')).toHaveText('142');
    // 35,604 ms: the three JUnit files' testsuite times.
    await expect(ostomate2.locator('[data-part="sub"]')).toHaveText(
      'tests ·0 failed·0 skipped ·36 s',
    );
    await expect(ostomate2.locator('[data-state]')).toHaveText([
      'composeApp94.3%floor 93%',
      'shared93.3%floor 91%',
    ]);
    await expect(ostomate2.locator('[data-part="reports-head"]')).toHaveText(
      '3 reports in this run',
    );
    await expect(ostomate2.locator('[data-part="reports-side"]')).toHaveText(
      'jvm 142 · ios-sim 50',
    );
    await expect(ostomate2.locator('[data-part="declared"]')).toHaveText(
      'Not counted: 12 flows in 2 suites, run in CI, not yet reported',
    );
    await expect(ostomate2.getByText('Reporting healthy')).toBeVisible();
  });

  test('gives RouteServe a private failed card naming its failing test', async ({ page }) => {
    const routeserve = card(page, 'RouteServe');
    await expect(routeserve.getByText('Failed', { exact: true })).toBeVisible();
    // The private SHA is plain text: no run URL exists (section 9).
    await expect(routeserve.locator('[data-part="sha"]')).toHaveText(/^[0-9a-f]{7}$/);
    await expect(routeserve.locator('a[data-part="sha"]')).toHaveCount(0);
    await expect(routeserve.locator('[data-part="total"]')).toHaveText('1,041');
    // 115,412 + 68,719 + 19,989 ms.
    await expect(routeserve.locator('[data-part="sub"]')).toHaveText(
      'tests ·1 failed·0 skipped ·204 s',
    );
    await expect(routeserve.locator('[data-part="failing"]')).toContainText(
      'asset.test.ts › assetCreateSchema accepts a minimal valid asset',
    );
    await expect(routeserve.locator('[data-part="failing"]')).toHaveAttribute(
      'href',
      /^\/p\/routeserve\/runs\/[0-9a-f-]{36}$/,
    );
    await expect(routeserve.locator('[data-state]')).toHaveText([
      'apps/backend94.6%floor 80%',
      'apps/mobile96.5%floor 80%',
      'packages/shared100%floor 80%',
    ]);
    await expect(routeserve.locator('[data-part="reports-side"]')).toHaveText('node 1,045');
    await expect(routeserve.locator('[data-part="declared"]')).toHaveText(
      'Not counted: Maestro E2E (iOS) (13 flows), authored, not yet executed',
    );
  });

  test('gives testpulse a stale failed card with no coverage', async ({ page }) => {
    const testpulse = card(page, 'testpulse');
    await expect(testpulse.getByText('Failed', { exact: true })).toBeVisible();
    // 13 UTC days back reads in weeks (design v7 item 16).
    await expect(testpulse.locator('[data-part="when"]')).toHaveText('1 week ago');
    await expect(testpulse.locator('[data-part="total"]')).toHaveText('3');
    await expect(testpulse.locator('[data-part="sub"]')).toHaveText(
      /^tests ·1 failed·1 skipped ·\d+ s$/,
    );
    await expect(testpulse.locator('[data-part="no-coverage"]')).toHaveText('No coverage reported');
    await expect(testpulse.getByText('No report in 13 days')).toBeVisible();
  });

  test('lists the three newest default-branch runs, a private one untitled', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 2, name: 'Recent runs' })).toBeVisible();
    const rows = feed(page).getByRole('link');
    await expect(rows).toHaveCount(3);
    // Distinct tests, as the cards count them, not the runs' executions.
    await expect(rows.nth(0)).toContainText('Push to main');
    await expect(rows.nth(0)).toContainText('Ostomate 2.0·main·');
    await expect(rows.nth(0)).toContainText('142 tests· 36 s');
    await expect(rows.nth(0)).toContainText('2 h ago');
    await expect(rows.nth(1)).toContainText('Private repository');
    await expect(rows.nth(1)).toContainText('1 failed· 1,040 of 1,041');
    await expect(rows.nth(1)).toContainText('3 h ago');
    // The 2026-10-04 scheduled run: 115,412 + 68,719 + 22,604 ms.
    await expect(rows.nth(2)).toContainText('Private repository');
    await expect(rows.nth(2)).toContainText('1,041 tests· 207 s');
    await expect(rows.nth(2)).toContainText('yesterday');
    await expect(rows.nth(0)).toHaveAttribute('href', /^\/p\/ostomate2\/runs\/[0-9a-f-]{36}$/);
  });

  // The live feed comes with Phase 5 PR 8; until then neither would be true (section 13.3).
  test('shows neither “Live” nor “Offline”', async ({ page }) => {
    await expect(page.getByText(/^Live$|Offline|Updates as reports arrive/)).toHaveCount(0);
  });

  test('says what the site is and links to how it is tested', async ({ page }) => {
    const about = page.getByRole('region', { name: 'About this site' });
    await expect(about).toContainText('I’m Bobby Helco, a quality engineering leader.');
    await expect(about.getByRole('link', { name: 'How testpulse is tested →' })).toHaveAttribute(
      'href',
      '/how-its-tested',
    );
  });

  test('dates the last report in the footer', async ({ page }) => {
    // Ostomate2's 09:26:17 run, 2 h 33 min before SEED_NOW.
    const footer = page.getByRole('contentinfo');
    await expect(footer).toContainText('Last report received 2 h ago');
    // Every "when" carries its instant and full date and time (design v7 item 16).
    const time = footer.locator('time');
    await expect(time).toHaveAttribute('datetime', /^2026-10-05T09:26:\d{2}\.\d{3}Z$/);
    await expect(time).toHaveAttribute('title', '5 Oct 2026, 09:26 UTC');
  });

  test('does not scroll sideways', async ({ page }) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});

test(
  'Tab reaches every control, each with a visible focus ring',
  { tag: '@js' },
  async ({ page }) => {
    await open(page, '/');
    const reached: string[] = [];
    let feedRowsReached = 0;
    for (let step = 0; step < 80; step += 1) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        if (!(el instanceof HTMLElement) || el === document.body) return null;
        const style = getComputedStyle(el);
        return {
          name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim(),
          inLog: el.closest('[role="log"]') !== null,
          ring: style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) >= 2,
        };
      });
      if (focused === null || focused.name === reached[0]) break;
      expect(focused.ring, `focus ring on "${focused.name}"`).toBe(true);
      reached.push(focused.name);
      if (focused.inLog) feedRowsReached += 1;
    }
    const expected: (string | RegExp)[] = [
      'Skip to content',
      'testpulse',
      'Projects',
      'How it’s tested',
      /^Switch to (light|dark) theme$/,
      'Ostomate 2.0',
      'RouteServe',
      'testpulse',
      /assetCreateSchema accepts a minimal valid asset/,
      'How testpulse is tested →',
      'Privacy',
      'Source on GitHub',
    ];
    for (const name of expected) {
      const found = reached.some((seen) =>
        typeof name === 'string' ? seen === name : name.test(seen),
      );
      expect(found, `Tab reaches ${String(name)}`).toBe(true);
    }
    expect(feedRowsReached).toBe(3);
  },
);

// @js because axe cannot run with scripts disabled: it schedules its work with timers, and
// Chromium fires no timers then, so the check never finishes. The markup it checks here is the
// same server-rendered HTML the no-JS project gets.
test('has no serious or critical axe violations', { tag: '@js' }, async ({ page }) => {
  await open(page, '/');
  await expectNoSeriousAxeViolations(page);
});

test('follows the system theme', { tag: '@js' }, async ({ page }) => {
  await open(page, '/');
  const { colorScheme } = test.info().project.use;
  expect(colorScheme === 'light' || colorScheme === 'dark', 'project sets a theme').toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-theme', String(colorScheme));
});

test('renders its static content without running scripts', { tag: '@no-js' }, async ({ page }) => {
  await open(page, '/');
  // The inline theme script sets data-theme whenever scripts run, so its absence shows none ran.
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
  await expect(page.locator('[data-part="hero-total"]')).toHaveText('1,186');
  await expect(page.locator('[data-part="tiles"] > div')).toHaveCount(4);
  await expect(page.getByRole('article')).toHaveCount(3);
  // The recent runs degrade to the server-rendered list (spec section 13).
  await expect(feed(page).getByRole('link')).toHaveCount(3);
  await expect(page.getByRole('region', { name: 'About this site' })).toBeVisible();
});

test('matches its visual snapshot', { tag: '@visual' }, async ({ page }) => {
  await open(page, '/');
  await expect(page).toHaveScreenshot('home.png', { fullPage: true });
});

// Spec section 17, Phase 5: a private project's failure text, repository link and full SHAs are
// absent from the landing page's HTML and every response (tests/e2e/support/leaks.ts). RouteServe
// is on the page as a card and two feed rows.
test.describe('the landing page leaks nothing of a private project', { tag: '@js' }, () => {
  test('in the HTML and every response of /', async ({ page }) => {
    const { html, texts, responses } = await capture(page, '/');

    // Positive controls: the derived values are the seeded ones (the latest and the 2026-10-04
    // runs' SHAs show cut to 7 characters, the failing test's name from the same fixture shows
    // on the card), and the capture holds the page's own data, not only static files.
    expect(responses).toBeGreaterThan(5);
    const [latest, previous] = ROUTESERVE_RUNS.filter((run) => run.branch === 'main')
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map((run) => run.commitSha.slice(0, 7));
    expect(html).toContain(String(latest));
    expect(html).toContain(String(previous));
    expect(html).toContain(String(FAILING[0]?.name));

    expect(leaksIn(texts, HIDDEN)).toEqual([]);
  });
});
