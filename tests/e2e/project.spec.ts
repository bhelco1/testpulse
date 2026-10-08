import { expect, test, type Page } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe.ts';
import { expectReadableYAxes, expectValueLabelsClearOfFloor } from './support/charts.ts';
import { capture, FAILING, formsOf, HIDDEN, leaksIn, ROUTESERVE_RUNS } from './support/leaks.ts';
import { expectLive, open } from './support/open.ts';

// The project page, /p/[slug] (spec section 13), against the seed (lib/seed/plan.ts) at
// SEED_NOW. Figures are the seed's hand-computed values in lib/seed/seed.int.test.ts. Tags route
// tests to projects (playwright.config.ts): @js where scripts run, @no-js where they do not,
// @visual in the four viewport × theme projects inside the Playwright image.

const runsLog = (page: Page) => page.getByRole('log');
const history = (page: Page) => page.getByRole('region', { name: 'History' });
const charts = (page: Page) => history(page).getByRole('figure');
const runStrip = (page: Page) => history(page).getByRole('region', { name: 'Last 40 runs' });

// Design v7 item 5: each chart's scope line names the last 30 runs its source rule admits. Line
// coverage has a chart per module (design v8 item 3), between tests per run and duration.
const BOTH_SOURCES = 'Default branch · last 30 runs · CI and imported history';
const scopes = (modules: number) => [
  BOTH_SOURCES,
  'Default branch · last 30 CI runs',
  ...Array.from({ length: modules }, () => BOTH_SOURCES),
  'Default branch · last 30 CI runs (imported history has no durations)',
];
const RUN_HREF = (slug: string) => new RegExp(`^/p/${slug}/runs/[0-9a-f-]{36}$`);

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

  // projects/ostomate2.yaml as the seed registers it: a folded description is one paragraph.
  test('introduces itself with its description and its dev stack', async ({ page }) => {
    const intro = page.getByRole('heading', { level: 1 }).locator('xpath=..');
    await expect(intro.locator(':scope > p')).toHaveText([
      'Local-first ostomy supply tracker for Android and iOS. Kotlin Multiplatform rewrite of ' +
        'Ostomate v1.',
      'Track ostomy supply changes, predict reorders, and manage inventory, privately and ' +
        'locally. Logs bag and flange changes by tap or QR deep link, predicts days of supply, ' +
        'schedules reorder notifications, and adds calendar and stats views, QR label printing, ' +
        'backup and restore, home-screen widgets, and an optional biometric lock. No ' +
        'analytics; crash reporting is opt-in.',
    ]);

    const built = page.locator('[data-variant="built"]');
    await expect(built.getByRole('heading')).toHaveText('Built with');
    await expect(built.locator('dt')).toHaveText(['Mobile', 'Platforms', 'Services', 'Delivery']);
    const tagsOf = (category: string) =>
      built.locator('div', { has: page.locator('dt', { hasText: category }) }).locator('li');
    await expect(tagsOf('Mobile')).toHaveText([
      'Kotlin Multiplatform 2.3.21',
      'Compose Multiplatform 1.11.0',
      'Room KMP 2.8.4',
      'Koin 4.2.1',
    ]);
    await expect(tagsOf('Platforms')).toHaveText([
      'Android (minSdk 26, targetSdk 36)',
      'iOS 15.3+ (SwiftUI shell, WidgetKit)',
    ]);
    await expect(tagsOf('Services')).toHaveText(['Sentry (opt-in crash reporting)']);
    await expect(tagsOf('Delivery')).toHaveText([
      'Gradle 9.3.1',
      'JDK 21',
      'GitHub Actions',
      'Fastlane',
    ]);
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
      'tests · 142 passed · 0 failed · 0 skipped · 35 s',
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

  test('shows the pyramid, coverage and reports, with no declared suites', async ({ page }) => {
    const tested = page.getByRole('region', { name: 'How it’s tested' });
    await expect(tested.locator('figure')).toContainText('142tests executed in the latest run');
    const rows = tested.locator('figure [data-part="row"]');
    await expect(rows).toHaveText(['Visual107%', 'Integration2920%', 'Unit10373%']);
    // Its Maestro flows report as module e2e, so nothing is declared and the Maestro tag is plain.
    await expect(page.getByRole('region', { name: 'Declared suites' })).toHaveCount(0);
    await expect(page.locator('[data-part="tag"][data-declared]')).toHaveCount(0);
    await expect(page.locator('[data-part="tag"]').filter({ hasText: 'Maestro' })).toHaveText([
      'Maestro 2.11.0',
    ]);
    const testStack = page.locator('[data-variant="tested"]');
    await expect(testStack.locator('dt')).toHaveText([
      'Runners',
      'Property',
      'Visual',
      'Coverage',
      'Static analysis',
      'E2E',
    ]);
    await expect(
      testStack
        .locator('div', { has: page.locator('dt', { hasText: 'Static analysis' }) })
        .locator('li'),
    ).toHaveText(['detekt 1.23.8', 'ktlint 1.0.1', 'SwiftLint']);

    const coverage = page.getByRole('region', { name: 'Coverage and reports' });
    // 497 / 527 and 457 / 490.
    await expect(coverage.locator('[data-state]')).toHaveText([
      'composeApp94.3%floor 93%',
      'shared93.2%floor 91%',
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
      'Line coverage, composeApp',
      'Line coverage, shared',
      'Run duration',
    ]);
    await expect(charts(page).locator('[data-part="scope"]')).toHaveText(scopes(2));
    // 13 imported runs and 8 CI runs, none failed; 142 tests in each CI run; each CI run's
    // reports sum to 35,604 ms. Coverage over all 21: composeApp from the history's first 93.6%
    // to 497 / 527 = 94.31%, shared from 93.2% to 457 / 490 = 93.27%, both read to the tenth.
    await expect(charts(page).locator('[data-part="caption"]')).toHaveText([
      'All 21 runs passed.',
      'Held at 142 for the last 8 runs.',
      'Rose from 93.6% to 94.3% over 21 runs; above its 93% floor.',
      'Held at 93.2% over 21 runs; above its 91% floor.',
      'Held at 35 s over the last 8 runs.',
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
    await expect(rows.first()).toContainText('142 tests· 35 s');
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
      'failed · 1,040 of 1,041 passed · 3m 24s',
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
    await expect(charts(page).locator('[data-part="scope"]')).toHaveText(scopes(3));
    // A red run passed 1,044 of 1,045 executions, 99.90%. Every run has 1,041 tests. Every run
    // covers apps/backend 1,862 / 1,968 = 94.61% and apps/mobile 1,496 / 1,551 = 96.45%; the four
    // red runs post packages/shared without coverage, so it has 6 runs of 102 / 102, and the
    // latest, red but not empty, adds no sentence. Green runs take 206,735 ms and red ones
    // 204,120 ms; six green make the median 3m 26s.
    await expect(charts(page).locator('[data-part="caption"]')).toHaveText([
      '99.9% on the latest run. 4 of the last 10 runs failed.',
      'Held at 1,041 for the last 10 runs.',
      'Held at 94.6% over 10 runs; above its 80% floor.',
      'Held at 96.4% over 10 runs; above its 80% floor.',
      'Held at 100.0% over 6 runs; above its 80% floor.',
      'Between 3m 24s and 3m 26s over the last 10 runs. Median 3m 26s.',
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
    // Every run the server read, counted (owner decision 2026-09-30).
    await expect(runStrip(page).locator('[data-part="note"]')).toHaveText('6 passed, 4 failed.');
  });

  // A mark sits on a value (design v9 item 13): packages/shared has none at the red runs.
  test(
    'marks the four red runs on each chart that has a value there',
    { tag: '@js' },
    async ({ page }) => {
      const all = await charts(page).all();
      expect(all).toHaveLength(6);
      for (const [index, chart] of all.entries()) {
        // A chart is drawn once it has measured its width: wait for its first point's dot.
        await expect(chart.locator('[data-part="end-dot"]').first()).toBeVisible();
        await expect(chart.locator('[data-part="mark"]')).toHaveCount(index === 4 ? 0 : 4);
      }
    },
  );

  test('shows its pyramid, declared suite, three floors and the flaky test', async ({ page }) => {
    await expect(page.locator('figure [data-part="row"]')).toHaveText([
      'E2E13 flows declared · not counted',
      'API26926%',
      'Component16516%',
      'Unit60758%',
    ]);
    await expect(
      page.getByRole('region', { name: 'Declared suites' }).getByRole('listitem'),
    ).toHaveText(['Maestro E2E (iOS)E2E13 flowsAuthored, not yet executed']);
    await expect(page.locator('[data-part="tag"][data-declared]')).toHaveText([
      'Maestro · not yet executed',
    ]);
    await expect(
      page.getByRole('region', { name: 'Coverage and reports' }).locator('[data-state]'),
    ).toHaveText([
      'apps/backend94.6%floor 80%',
      'apps/mobile96.4%floor 80%',
      'packages/shared100%floor 80%',
    ]);
    const flaky = page.getByRole('region', { name: 'Flaky tests', exact: true }).getByRole('link');
    await expect(flaky).toHaveCount(1);
    await expect(flaky).toContainText('assetCreateSchema accepts a minimal valid asset');
    // It has a result in all 10 CI runs on main and failed in the 4 red ones, one of them the
    // flip's failing side, which counts as Flaky, never Failed (decision 2026-10-07).
    await expect(flaky.locator('[data-part="meta"]')).toHaveText(
      'Failed 3 of last 10 runsUnitnode',
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
      const chartCount = slug === 'ostomate2' ? 5 : 6;
      expect(reached.filter((name) => name === 'Show table')).toHaveLength(chartCount);
      expect(
        reached.filter((name) =>
          /^(Pass rate|Tests per run|Line coverage, [^.]+|Run duration)\. /.test(name),
        ),
      ).toHaveLength(chartCount);
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
    await expectLive(page);
    await expectNoSeriousAxeViolations(page);
  });

  // The live feed (section 13.2); tests/e2e/live.spec.ts proves a run arriving and going offline.
  test(`${slug}: goes live, with the run list's note`, { tag: '@js' }, async ({ page }) => {
    await open(page, `/p/${slug}`);
    await expectLive(page);
    await expect(page.locator('[data-part="live-note"]')).toHaveText('Updates as reports arrive');
    await expect(page.locator('[data-part="new"]')).toHaveCount(0);
  });

  test(
    `${slug}: shows neither “Live” nor “Offline” without scripts`,
    { tag: '@no-js' },
    async ({ page }) => {
      await open(page, `/p/${slug}`);
      await expect(page.getByText(/^Live$|Offline|Updates as reports arrive/)).toHaveCount(0);
    },
  );

  test(`${slug}: the page renders without running scripts`, { tag: '@no-js' }, async ({ page }) => {
    await open(page, `/p/${slug}`);
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('article').locator('[data-part="figure"]')).toBeVisible();
    await expect(runsLog(page).getByRole('link')).toHaveCount(slug === 'ostomate2' ? 8 : 10);
    await expect(
      page.getByRole('region', { name: 'Coverage and reports' }).locator('[data-state]').first(),
    ).toBeVisible();
    // Without scripts no chart is drawn; each chart's table stands open in its place, newest run
    // first, with no empty plot area and no "Show table" button (design v8 item 32).
    await expect(page.getByRole('button', { name: 'Show table' })).toHaveCount(0);
    for (const placeholder of await page.locator('[data-part="placeholder"]').all()) {
      await expect(placeholder).toBeHidden();
    }
    const passRate = page.getByRole('region', { name: 'Pass rate, table' });
    const table = passRate.getByRole('row');
    await expect(table).toHaveCount(slug === 'ostomate2' ? 22 : 11);
    // Each run's finish time in UTC (design v9 item 1): Ostomate2's latest run started at 09:26
    // and RouteServe's at 08:12, whose slowest report took 204 s.
    await expect(table.nth(1)).toHaveText(
      slug === 'ostomate2' ? 'Latest5 Oct,09:26 UTC100.0%' : 'Latest5 Oct,08:13 UTC99.9%',
    );
    await expect(table.nth(0)).toHaveText('RunWhenPass rate');
    // Its CI runs link to their run pages, a private project's alike; Ostomate2's 13 imported
    // runs have none and read as plain text (design v9 item 2).
    await expect(passRate.getByRole('link')).toHaveCount(slug === 'ostomate2' ? 8 : 10);
    await expect(passRate.getByRole('link').first()).toHaveAttribute('href', RUN_HREF(slug));
    await expect(passRate.getByRole('link').first()).toHaveText('Latest');
    await expect(table.last()).toHaveText(
      slug === 'ostomate2' ? /^20 runs ago.*%$/ : /^9 runs ago.*%$/,
    );
    await expect(table.last().getByRole('link')).toHaveCount(slug === 'ostomate2' ? 0 : 1);
    await expect(runStrip(page).getByRole('img')).toHaveAttribute(
      'aria-label',
      slug === 'ostomate2'
        ? 'Last 8 runs on main: 8 passed.'
        : 'Last 10 runs on main: 6 passed, 4 failed.',
    );
  });

  // Design v9 items 1 and 2: rows 44 px tall, the Run cell a link to the run's page, and the
  // table scrolling inside its frame rather than the page sideways.
  test(`${slug}: a chart's table links each run to its page`, { tag: '@js' }, async ({ page }) => {
    await open(page, `/p/${slug}`);
    // A click before the page's client code runs is lost; "Live" shows once it has.
    await expectLive(page);
    const chart = charts(page).filter({ has: page.getByRole('heading', { name: 'Run duration' }) });
    await chart.getByRole('button', { name: 'Show table' }).click();
    const table = chart.getByRole('table');
    await expect(table.locator('thead th')).toHaveText(['Run', 'When', 'Duration']);
    // Each row is a 44 px target, the Run cell's link or text, over its 1 px rule, as
    // tp-charts.js builds it (44 px cells, border-box, and a 44 px link inside).
    const heights = await table
      .locator('tbody tr')
      .evaluateAll((rows) =>
        rows.map((row) => [
          row.querySelector('th > *')?.getBoundingClientRect().height,
          row.getBoundingClientRect().height,
        ]),
      );
    expect(heights.length).toBeGreaterThan(0);
    expect(heights.every(([target, row]) => target === 44 && row === 45)).toBe(true);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
    await table.getByRole('link', { name: 'Latest' }).click();
    await expect(page).toHaveURL(new RegExp(`/p/${slug}/runs/[0-9a-f-]{36}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      // A private run is headed by its CI run ID (section 13.5).
      slug === 'ostomate2' ? 'Push to main' : 'Run 36200000010',
    );
  });

  test(`${slug}: the page follows the system theme`, { tag: '@js' }, async ({ page }) => {
    await open(page, `/p/${slug}`);
    const { colorScheme } = test.info().project.use;
    await expect(page.locator('html')).toHaveAttribute('data-theme', String(colorScheme));
  });

  // Phase 5 design review: at 390 Ostomate2's "Line coverage, shared" cut "92.5%" to "2.5%".
  test(
    `${slug}: every chart's y labels are whole and distinct`,
    { tag: '@js' },
    async ({ page }) => {
      await open(page, `/p/${slug}`);
      await expectReadableYAxes(page);
    },
  );

  // Phase 5 design review: Ostomate2's composeApp coverage drew "93.6%" on "floor 93%".
  test(`${slug}: no value label overlaps a floor label`, { tag: '@js' }, async ({ page }) => {
    await open(page, `/p/${slug}`);
    await expectValueLabelsClearOfFloor(page);
  });

  test(`${slug}: the page does not scroll sideways`, async ({ page }) => {
    await open(page, `/p/${slug}`);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });

  // Taken live, as a visitor sees it; toHaveScreenshot stops the pulse at its first frame.
  test(`${slug}: matches its visual snapshot`, { tag: '@visual' }, async ({ page }) => {
    await open(page, `/p/${slug}`);
    await expectLive(page);
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
      // "Live" shows only once the page's client code runs; a click before hydration is lost.
      await expectLive(current);
      await current.getByRole('radio', { name: 'All branches' }).click();
      await expect(current).toHaveURL('/p/routeserve?branches=all');
      await current.getByRole('button', { name: 'Load 20 more' }).click();
      await expect(runsLog(current).getByRole('link')).toHaveCount(11);
      // A chart's table, its runs linked as a public project's are (design v9 item 2).
      const chart = charts(current).filter({
        has: current.getByRole('heading', { name: 'Run duration' }),
      });
      await chart.getByRole('button', { name: 'Show table' }).click();
      await expect(chart.getByRole('table').getByRole('link')).toHaveCount(10);
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
    expect(html).toContain('6 passed, 4 failed.');
    expect(html).toContain('Held at 100.0% over 6 runs; above its 80% floor.');
    expect(html).toMatch(/href="\/p\/routeserve\/runs\/[0-9a-f-]{36}" class="[^"]*runLink/);
    expect(html).toContain('99.9% on the latest run. 4 of the last 10 runs failed.');
    expect(html).toContain('Failed 3 of last 10 runs');

    expect(leaksIn(texts, HIDDEN)).toEqual([]);
  });

  test('while the same capture finds a public project’s repository link', async ({ page }) => {
    const { texts } = await capture(page, '/p/ostomate2');
    expect(leaksIn(texts, ['github.com/bhelco1/Ostomate2'])).toEqual([
      'github.com/bhelco1/Ostomate2',
    ]);
  });
});
