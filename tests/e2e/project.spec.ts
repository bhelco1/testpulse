import { expect, test, type Page } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe.ts';
import { capture, FAILING, formsOf, HIDDEN, leaksIn, ROUTESERVE_RUNS } from './support/leaks.ts';
import { open } from './support/open.ts';

// The project page, /p/[slug] (spec section 13), against the seed (lib/seed/plan.ts) at
// SEED_NOW. Figures are the seed's hand-computed values in lib/seed/seed.int.test.ts. Tags route
// tests to projects (playwright.config.ts): @js where scripts run, @no-js where they do not,
// @visual in the four viewport × theme projects inside the Playwright image.

const runsLog = (page: Page) => page.getByRole('log');
const history = (page: Page) => page.getByRole('region', { name: 'History' });
const charts = (page: Page) => history(page).getByRole('figure');
const runStrip = (page: Page) => history(page).getByRole('region', { name: 'Last 40 runs' });

// Design v7 item 5: each chart's scope line names the last 30 runs its source rule admits.
const SCOPES = [
  'Default branch · last 30 runs · CI and imported history',
  'Default branch · last 30 CI runs',
  'Default branch · last 30 CI runs (imported history has no durations)',
];

test.describe('Ostomate2 (public)', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, '/p/ostomate2');
  });

  test('names the project, its breadcrumbs, health and repository', async ({ page }) => {
    await expect(page).toHaveTitle('Ostomate 2.0 · testpulse');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ostomate 2.0');
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/');
    await expect(crumbs.locator('[aria-current="page"]')).toHaveText('Ostomate 2.0');

    const main = page.getByRole('main');
    await expect(main.getByText('Reporting healthy')).toBeVisible();
    // The latest CI run finished at 09:26:36 UTC, 2 hours 33 minutes before SEED_NOW.
    await expect(main.getByText('Last report 2 h ago')).toBeVisible();
    await expect(main.getByRole('link', { name: 'Source on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/bhelco1/Ostomate2',
    );
    await expect(main.getByText('This repository is private')).toHaveCount(0);
  });

  test('leads the latest run with its 142 tests and the 30-day pass rate', async ({ page }) => {
    const card = page.getByRole('article');
    await expect(card.getByText('Passed', { exact: true })).toBeVisible();
    await expect(card.locator('[data-part="meta"]')).toHaveText(
      /^Latest run · 2 h ago · main · [0-9a-f]{7}$/,
    );
    await expect(card.locator('[data-part="figure"]')).toHaveText('142');
    // 35,604 ms: the three JUnit files' testsuite times.
    await expect(card.locator('[data-part="line"]')).toHaveText(
      'tests · 142 passed · 0 failed · 0 skipped · 36 s',
    );
    // 2,388 passed and none failed over 6 imported and 8 CI runs; 8 green CI runs, no recovery.
    await expect(card.locator('[data-part="stats"] > [data-part="cell"]')).toHaveText([
      'Pass rate, 30 days100%',
      'Green streak8runsLongest8 runs',
      'Time to greenNoneNo recoveries in 90 days',
    ]);
    await expect(card.getByRole('link', { name: 'View this run →' })).toHaveAttribute(
      'href',
      /^\/p\/ostomate2\/runs\/[0-9a-f-]{36}$/,
    );
  });

  // Design v7 item 17: three across on a desktop; on a phone Time to green takes its own line.
  test('wraps Time to green below the other stats only on a phone', async ({ page }, testInfo) => {
    const cells = page.locator('[data-part="stats"] > [data-part="cell"]');
    const tops = await cells.evaluateAll((elements) =>
      elements.map((element) => Math.round(element.getBoundingClientRect().top)),
    );
    const [passRate, streak, green] = tops;
    expect(streak).toBe(passRate);
    if (testInfo.project.name.startsWith('phone')) expect(green).toBeGreaterThan(streak ?? 0);
    else expect(green).toBe(passRate);
  });

  test('shows the pyramid, declared suites, coverage and reports', async ({ page }) => {
    const tested = page.getByRole('region', { name: 'How it’s tested' });
    await expect(tested.locator('figure')).toContainText('142tests executed in the latest run');
    const rows = tested.locator('figure [data-part="row"]');
    await expect(rows).toHaveText([
      'E2E12 flows declared · not counted',
      'Visual107%',
      'Integration2920%',
      'Unit10373%',
    ]);
    await expect(tested.getByRole('listitem').filter({ hasText: 'Maestro E2E' })).toHaveCount(2);
    // "Maestro 2.6.1" stands for both Maestro suites, which run in CI unreported (v7 item 8).
    await expect(page.locator('[data-part="tag"][data-declared]')).toHaveText([
      'Maestro 2.6.1 · not yet reported',
    ]);

    const coverage = page.getByRole('region', { name: 'Coverage and reports' });
    // 497 / 527 and 457 / 490.
    await expect(coverage.locator('[data-state]')).toHaveText([
      'composeApp94.3%floor 93%',
      'shared93.3%floor 91%',
    ]);
    await expect(
      coverage.getByRole('table', { name: 'Reports per run' }).getByRole('row'),
    ).toHaveText([
      'Job / module / platformTests',
      'android/composeApp/jvm60',
      'android/shared/jvm82',
      'ios/composeApp/ios-sim50',
    ]);
  });

  test('charts its last 30 runs on main: 21 for pass rate, its 8 CI runs for the rest', async ({
    page,
  }) => {
    await expect(charts(page).getByRole('heading', { level: 3 })).toHaveText([
      'Pass rate',
      'Tests per run',
      'Run duration',
    ]);
    await expect(charts(page).locator('[data-part="scope"]')).toHaveText(SCOPES);
    // 13 imported runs and 8 CI runs, none failed; 142 tests in each CI run; each CI run's
    // reports sum to 35,604 ms. No coverage chart: which module it shows is still open (13.2).
    await expect(charts(page).locator('[data-part="caption"]')).toHaveText([
      'All 21 runs passed.',
      'Held at 142 for the last 8 runs.',
      'Between 36 s and 36 s over the last 8 runs. Median 36 s.',
    ]);
    await expect(runStrip(page).getByRole('img')).toHaveAttribute(
      'aria-label',
      'Last 8 runs on main: 8 passed.',
    );
    await expect(runStrip(page).locator('[data-part="cell"][data-status="passed"]')).toHaveCount(8);
    await expect(runStrip(page).locator('[data-part="note"]')).toHaveText('All 8 passed.');
  });

  test('lists the 8 CI runs on main, newest first, and no flaky tests', async ({ page }) => {
    const rows = runsLog(page).getByRole('link');
    await expect(rows).toHaveCount(8);
    await expect(rows.first()).toContainText('Push to main');
    // Distinct tests, not the run's 192 executions.
    await expect(rows.first()).toContainText('142 tests· 36 s');
    await expect(rows.first()).toContainText('2 h ago');
    await expect(page.getByRole('button', { name: 'Load 20 more' })).toHaveCount(0);
    await expect(page.getByText('No flaky tests in the last 30 days')).toBeVisible();
  });

  test('adds the pull request run under All branches', { tag: '@js' }, async ({ page }) => {
    await page.getByRole('radio', { name: 'All branches' }).click();
    await expect(page).toHaveURL('/p/ostomate2?branches=all');
    await expect(runsLog(page).getByRole('link')).toHaveCount(9);
    await expect(runsLog(page)).toContainText('Pull request from seed/pull-request');
    await expect(page.getByRole('radio', { name: 'All branches' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});

test.describe('RouteServe (private)', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, '/p/routeserve');
  });

  test('marks the project private, with no repository link', async ({ page }) => {
    await expect(page).toHaveTitle('RouteServe · testpulse');
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toHaveText('RouteServe');
    await expect(heading.getByRole('img', { name: 'Private repository' })).toBeVisible();
    await expect(
      page.getByRole('main').getByText(/^This repository is private, so failure details/),
    ).toBeVisible();
    await expect(
      page.getByRole('main').getByRole('link', { name: 'Source on GitHub' }),
    ).toHaveCount(0);
  });

  test('leads with the failed latest run and its failing test, no failure text', async ({
    page,
  }) => {
    const card = page.getByRole('article');
    await expect(card.getByText('Failed', { exact: true })).toBeVisible();
    await expect(card.locator('[data-part="figure"]')).toHaveText('1');
    // 1,041 tests, 1 failed; 115,412 + 68,719 + 19,989 = 204,120 ms.
    await expect(card.locator('[data-part="line"]')).toHaveText(
      'failed · 1,040 of 1,041 passed · 204 s',
    );
    await expect(card.locator('[data-part="failing"]')).toContainText(
      'assetCreateSchema accepts a minimal valid asset',
    );
    await expect(card.locator('[data-part="failing"]')).toContainText('node');
    // 10,446 of 10,450 is 99.96%, rounded down to one decimal. Recoveries of 26, 44 and 247
    // minutes; red since the latest run finished at 08:13:55.
    await expect(card.locator('[data-part="stats"] > [data-part="cell"]')).toHaveText([
      'Pass rate, 30 days99.9%',
      'Green streak0runsLongest2 runs',
      'Time to green44mMedian of 3, 90 days · worst 4h 07mRed now for3h 46m',
    ]);
  });

  test('charts its ten CI runs on main, four of them red, and the strip of all ten', async ({
    page,
  }) => {
    await expect(charts(page).locator('[data-part="scope"]')).toHaveText(SCOPES);
    // A red run passed 1,044 of 1,045 executions, 99.90%. Every run has 1,041 tests. Green runs
    // take 206,735 ms and red ones 204,120 ms; six green make the median 207 s.
    await expect(charts(page).locator('[data-part="caption"]')).toHaveText([
      '99.9% on the latest run. 4 of the last 10 runs failed.',
      'Held at 1,041 for the last 10 runs.',
      'Between 204 s and 207 s over the last 10 runs. Median 207 s.',
    ]);
    await expect(runStrip(page).getByRole('img')).toHaveAttribute(
      'aria-label',
      'Last 10 runs on main: 6 passed, 4 failed.',
    );
    await expect(runStrip(page).locator('[data-part="cell"]')).toHaveText([
      '',
      '✕',
      '',
      '',
      '✕',
      '',
      '✕',
      '',
      '',
      '✕',
    ]);
    // The design draws a note for a strip that all passed only.
    await expect(runStrip(page).locator('[data-part="note"]')).toHaveCount(0);
  });

  test('marks the four red runs on each chart', { tag: '@js' }, async ({ page }) => {
    for (const chart of await charts(page).all()) {
      await expect(chart.locator('[data-part="mark"]')).toHaveCount(4);
    }
  });

  test('shows its pyramid, three floors and the flaky test', async ({ page }) => {
    await expect(page.locator('figure [data-part="row"]')).toHaveText([
      'E2E13 flows declared · not counted',
      'API26926%',
      'Component16516%',
      'Unit60758%',
    ]);
    await expect(page.locator('[data-part="tag"][data-declared]')).toHaveText([
      'Maestro · not yet executed',
    ]);
    await expect(
      page.getByRole('region', { name: 'Coverage and reports' }).locator('[data-state]'),
    ).toHaveText([
      'apps/backend94.6%floor 80%',
      'apps/mobile96.5%floor 80%',
      'packages/shared100%floor 80%',
    ]);
    const flaky = page.getByRole('region', { name: 'Flaky tests', exact: true }).getByRole('link');
    await expect(flaky).toHaveCount(1);
    await expect(flaky).toContainText('assetCreateSchema accepts a minimal valid asset');
    // It has a result in all 10 CI runs on main and failed in the 4 red ones.
    await expect(flaky.locator('[data-part="meta"]')).toHaveText(
      'Failed 4 of last 10 runsUnitnode',
    );
  });

  test('lists 10 untitled runs on main', async ({ page }) => {
    const rows = runsLog(page).getByRole('link');
    await expect(rows).toHaveCount(10);
    await expect(rows.filter({ hasText: 'Private repository' })).toHaveCount(10);
    // Distinct tests, as the latest-run card reads, not 1,044 of 1,045 executions.
    await expect(rows.first()).toContainText('1 failed· 1,040 of 1,041');
    await expect(page.getByRole('button', { name: 'Load 20 more' })).toHaveCount(0);
  });

  test('loads 20 more across all branches', { tag: '@js' }, async ({ page }) => {
    await page.getByRole('radio', { name: 'All branches' }).click();
    await expect(runsLog(page).getByRole('link')).toHaveCount(10);
    await page.getByRole('button', { name: 'Load 20 more' }).click();
    await expect(page).toHaveURL('/p/routeserve?branches=all&runs=30');
    await expect(runsLog(page).getByRole('link')).toHaveCount(11);
    await expect(page.getByRole('button', { name: 'Load 20 more' })).toHaveCount(0);
  });
});

for (const slug of ['ostomate2', 'routeserve']) {
  test(
    `${slug}: Tab reaches every control, each with a visible focus ring`,
    { tag: '@js' },
    async ({ page }) => {
      await open(page, `/p/${slug}`);
      const reached: string[] = [];
      let runRowsReached = 0;
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
        if (focused.inLog) runRowsReached += 1;
      }
      const expected: (string | RegExp)[] = [
        'Skip to content',
        'testpulse',
        'Projects',
        'How it’s tested',
        /^Switch to (light|dark) theme$/,
        'Overview',
        'View this run →',
        'Show table',
        'Default branch',
        'Privacy',
        'Source on GitHub',
      ];
      for (const name of expected) {
        const found = reached.some((seen) =>
          typeof name === 'string' ? seen === name : name.test(seen),
        );
        expect(found, `Tab reaches ${String(name)}`).toBe(true);
      }
      expect(runRowsReached).toBe(await runsLog(page).getByRole('link').count());
      // Each chart is one stop, named by its title and caption, with its "Show table" button.
      expect(reached.filter((name) => name === 'Show table')).toHaveLength(3);
      expect(
        reached.filter((name) => /^(Pass rate|Tests per run|Run duration)\. /.test(name)),
      ).toHaveLength(3);
      if (slug === 'routeserve') {
        // The failing test on the latest run card and the flaky test's row.
        expect(reached.filter((name) => name.includes('assetCreateSchema accepts'))).toHaveLength(
          2,
        );
      }
    },
  );

  test(`${slug}: no serious or critical axe violations`, { tag: '@js' }, async ({ page }) => {
    await open(page, `/p/${slug}`);
    await expectNoSeriousAxeViolations(page);
  });

  test(`${slug}: the page renders without running scripts`, { tag: '@no-js' }, async ({ page }) => {
    await open(page, `/p/${slug}`);
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('article').locator('[data-part="figure"]')).toBeVisible();
    await expect(runsLog(page).getByRole('link')).toHaveCount(slug === 'ostomate2' ? 8 : 10);
    await expect(
      page.getByRole('region', { name: 'Coverage and reports' }).locator('[data-state]').first(),
    ).toBeVisible();
    // Without scripts no chart is drawn; each chart's table stands in for it, newest run first.
    const table = page.getByRole('region', { name: 'Pass rate, table' }).getByRole('row');
    await expect(table).toHaveCount(slug === 'ostomate2' ? 22 : 11);
    await expect(table.nth(1)).toHaveText(slug === 'ostomate2' ? 'Latest100.0%' : 'Latest99.9%');
    await expect(runStrip(page).getByRole('img')).toHaveAttribute(
      'aria-label',
      slug === 'ostomate2'
        ? 'Last 8 runs on main: 8 passed.'
        : 'Last 10 runs on main: 6 passed, 4 failed.',
    );
  });

  test(`${slug}: the page follows the system theme`, { tag: '@js' }, async ({ page }) => {
    await open(page, `/p/${slug}`);
    const { colorScheme } = test.info().project.use;
    await expect(page.locator('html')).toHaveAttribute('data-theme', String(colorScheme));
  });

  test(`${slug}: the page does not scroll sideways`, async ({ page }) => {
    await open(page, `/p/${slug}`);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });

  test(`${slug}: matches its visual snapshot`, { tag: '@visual' }, async ({ page }) => {
    await open(page, `/p/${slug}`);
    await expect(page).toHaveScreenshot(`${slug}.png`, { fullPage: true });
  });
}

test.describe('an unknown project', () => {
  test('is served with HTTP 404 and the Not found title', async ({ page }) => {
    const response = await open(page, '/p/nope');
    expect(response?.status()).toBe(404);
    await expect(page).toHaveTitle('Not found · testpulse');
  });

  // @js: Next.js 16 renders a not-found page for a dynamically rendered route in the browser
  // (docs/spec.md section 13, "Held back"); without scripts the 404 body is empty.
  test('shows the designed Not found page', { tag: '@js' }, async ({ page }) => {
    await open(page, '/p/nope');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('No project at this address');
    await expect(page.locator('[data-part="path"]')).toHaveText('/p/nope');
    const projects = page.getByRole('list', { name: 'Projects' }).getByRole('link');
    await expect(projects).toHaveText([
      'Ostomate 2.0Passed',
      'RouteServeFailed',
      'testpulseFailed',
    ]);
    await expect(page.getByRole('link', { name: 'Go to overview' })).toHaveAttribute('href', '/');
  });

  test('has no serious or critical axe violations', { tag: '@js' }, async ({ page }) => {
    await open(page, '/p/nope');
    await expectNoSeriousAxeViolations(page);
  });
});

// Spec section 17, Phase 5: for a private project, failure text, repository links and full SHAs
// are absent from the rendered HTML and from every network response (tests/e2e/support/leaks.ts).
// The positive controls below prove the derivation matches the seeded database and that the
// capture sees the page's data.

test.describe('a private project’s page leaks nothing', { tag: '@js' }, () => {
  test('the values it must not show exist in what the seed sends', () => {
    expect(FAILING.length).toBeGreaterThan(0);
    expect(FAILING.every((result) => (result.failure?.message ?? '').length > 0)).toBe(true);
    expect(ROUTESERVE_RUNS).toHaveLength(11);
    expect(ROUTESERVE_RUNS.every((run) => /^[0-9a-f]{40}$/.test(run.commitSha))).toBe(true);
    expect(
      ROUTESERVE_RUNS.every((run) =>
        run.runUrl.startsWith('https://github.com/bhelco1/routeserve/'),
      ),
    ).toBe(true);
    // The checker finds a value in each form it can take.
    for (const value of HIDDEN.slice(0, 3)) {
      for (const form of formsOf(value)) expect(leaksIn([`x${form}x`], HIDDEN)).toContain(value);
    }
  });

  test('in the HTML and every response of /p/routeserve, through both list filters', async ({
    page,
  }) => {
    const { html, texts, responses } = await capture(page, '/p/routeserve', async (current) => {
      await current.getByRole('radio', { name: 'All branches' }).click();
      await expect(current).toHaveURL('/p/routeserve?branches=all');
      await current.getByRole('button', { name: 'Load 20 more' }).click();
      await expect(runsLog(current).getByRole('link')).toHaveCount(11);
    });

    // Positive controls: the derived values are the seeded ones (each run's SHA shows cut to 7
    // characters, the failing test's name from the same fixture shows on the card), and the
    // capture holds the page's own data, not only static files.
    expect(responses).toBeGreaterThan(5);
    const latest = ROUTESERVE_RUNS.at(-1);
    expect(html).toContain(String(latest?.commitSha.slice(0, 7)));
    for (const run of ROUTESERVE_RUNS)
      expect(texts.join('\n')).toContain(run.commitSha.slice(0, 7));
    expect(html).toContain(String(FAILING[0]?.name));
    // The History section and the flaky rate are in what was captured.
    expect(html).toContain('Last 10 runs on main: 6 passed, 4 failed.');
    expect(html).toContain('99.9% on the latest run. 4 of the last 10 runs failed.');
    expect(html).toContain('Failed 4 of last 10 runs');

    expect(leaksIn(texts, HIDDEN)).toEqual([]);
  });

  test('while the same capture finds a public project’s repository link', async ({ page }) => {
    const { texts } = await capture(page, '/p/ostomate2');
    expect(leaksIn(texts, ['github.com/bhelco1/Ostomate2'])).toEqual([
      'github.com/bhelco1/Ostomate2',
    ]);
  });
});
