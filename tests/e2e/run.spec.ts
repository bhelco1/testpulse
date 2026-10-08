import { expect, test, type Page } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe.ts';
import { capture, FAILING, HIDDEN, leaksIn, ROUTESERVE_RUNS } from './support/leaks.ts';
import { expectHydrated, open } from './support/open.ts';

// The run page, /p/[slug]/runs/[id] (spec section 13), against the seed (lib/seed/plan.ts) at
// SEED_NOW. Three runs: Ostomate2's latest (public, passed, 142 tests on the JVM and 50 of them
// also on the iOS simulator), testpulse's only run (public, failed, its failure text shown) and
// RouteServe's latest (private, failed, no failure text). Figures are the seed's hand-computed
// values in lib/seed/seed.int.test.ts. Tags route tests to projects (playwright.config.ts).

// A run page is reached as a visitor reaches it: from its project's latest-run card.
async function latestRunPath(page: Page, slug: string): Promise<string> {
  await open(page, `/p/${slug}`);
  const href = await page.getByRole('link', { name: 'View this run →' }).getAttribute('href');
  if (href === null || !/^\/p\/[a-z0-9]+\/runs\/[0-9a-f-]{36}$/.test(href))
    throw new Error(`no run link on /p/${slug}: ${String(href)}`);
  return href;
}

const tiles = (page: Page) => page.locator('[data-part="tile"]');
const reportRows = (page: Page) =>
  page.getByRole('table', { name: 'Reports in this run' }).locator('[data-part="report"]');
const statusRadios = (page: Page) =>
  page.getByRole('radiogroup', { name: 'Status' }).getByRole('radio');
const testRows = (page: Page) => page.locator('[data-part="test"]');
const showing = (page: Page) => page.locator('[data-part="showing"]');
const meta = (page: Page) => page.locator('[data-part="meta"]');
const banner = (page: Page) => page.locator('[data-part="banner"]');

const TESTPULSE_FAILURE =
  '1 test failed: zz-deliberate-failure.spec.ts › deliberately fails to capture a failing JUnit fixture';
const PRIVATE_SENTENCE =
  'This repository is private, so failure messages and stack traces are hidden.';

test.describe('Ostomate2’s latest run (public, passed, two platforms)', () => {
  let path = '';
  test.beforeEach(async ({ page }) => {
    path = await latestRunPath(page, 'ostomate2');
    await open(page, path);
  });

  test('titles the run and its breadcrumbs', async ({ page }) => {
    await expect(page).toHaveTitle('Push to main · Ostomate 2.0 · testpulse');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Push to main');
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.getByRole('link')).toHaveText(['Overview', 'Ostomate 2.0']);
    await expect(crumbs.getByRole('link', { name: 'Ostomate 2.0' })).toHaveAttribute(
      'href',
      '/p/ostomate2',
    );
    await expect(crumbs.locator('[aria-current="page"]')).toHaveText('Run 36100000009');
  });

  test('gives its status, time, branch, linked commit, event, start and CI run', async ({
    page,
  }) => {
    const lead = page.locator('[data-part="lead"]');
    await expect(lead.locator('[data-status]')).toHaveText('Passed');
    // Finished at 09:26:36 UTC, 2 hours 33 minutes before SEED_NOW.
    await expect(lead.locator('time')).toHaveText('2 h ago');
    // "Reports {n}" counts the run's reports; no Attempt on a first attempt (components.md).
    await expect(meta(page).locator('dt')).toHaveText([
      'Branch',
      'Commit',
      'Event',
      'Started',
      'Reports',
      'CI',
    ]);
    await expect(meta(page).locator('dd')).toHaveText([
      'main',
      'd8dbd9c',
      'push',
      /^5 Oct, 09:2\d UTC$/,
      '3',
      'GitHub Actions',
    ]);
    await expect(banner(page)).toHaveCount(0);
    // Public: the commit links to its full SHA, the CI entry to the run on GitHub (section 9).
    await expect(meta(page).getByRole('link', { name: 'd8dbd9c' })).toHaveAttribute(
      'href',
      /^https:\/\/github\.com\/bhelco1\/Ostomate2\/commit\/d8dbd9c[0-9a-f]{33}$/,
    );
    await expect(meta(page).getByRole('link', { name: 'GitHub Actions' })).toHaveAttribute(
      'href',
      /^https:\/\/github\.com\/bhelco1\/Ostomate2\/actions\/runs\/36100000009/,
    );
  });

  test('counts 142 distinct tests, not the 192 executions', async ({ page }) => {
    // 35,604 ms: the three JUnit files' testsuite times.
    await expect(tiles(page)).toHaveText([
      'Tests142',
      'Passed142',
      'Failed0',
      'Skipped0',
      'Duration35 s',
    ]);
    await expect(tiles(page).nth(2)).not.toHaveAttribute('data-tone');
  });

  test('lists its three reports with their results, time received and duration', async ({
    page,
  }) => {
    const rows = reportRows(page);
    await expect(rows).toHaveCount(3);
    await expect(rows.locator('td:nth-child(2)')).toHaveText([
      'android/composeApp/jvm',
      'android/shared/jvm',
      'ios/composeApp/ios-sim',
    ]);
    await expect(rows.locator('[data-part="result"]')).toHaveText([
      '60 passed',
      '82 passed',
      '50 passed',
    ]);
    await expect(rows.locator('td:nth-child(4)')).toHaveText(['60', '82', '50']);
    // 17,746 ms, 17,747 ms and 111 ms, in whole seconds rounded down as the run durations read.
    await expect(rows.locator('td:nth-child(6)')).toHaveText(['17 s', '17 s', '0 s']);
    await expect(rows.locator('td:nth-child(5) time')).toHaveText([
      /^\d\d:\d\d:\d\d$/,
      /^\d\d:\d\d:\d\d$/,
      /^\d\d:\d\d:\d\d$/,
    ]);
  });

  test('filters by status in tests, and by layer; the first 50 rows show', async ({ page }) => {
    await expect(statusRadios(page)).toHaveText([
      'All 142',
      'Passed 142',
      'Failed 0',
      'Error 0',
      'Skipped 0',
    ]);
    await expect(page.getByRole('combobox', { name: 'Layer' }).locator('option')).toHaveText([
      'All layers',
      'Unit',
      'Integration',
      'Visual',
    ]);
    await expect(testRows(page)).toHaveCount(50);
    await expect(showing(page)).toHaveText('Showing50of142');
    // A passing row links to the test's history, which the test history page will serve.
    await expect(testRows(page).first().getByRole('link')).toHaveAttribute(
      'href',
      /^\/p\/ostomate2\/tests\/[0-9a-f]{64}$/,
    );
    // Passed on every platform: platforms by name, no marks, no failure detail.
    await expect(page.locator('[data-part="detail"]')).toHaveCount(0);
  });

  test(
    'shows all 142 rows, 50 on two platforms, each timed by its slowest',
    {
      tag: '@js',
    },
    async ({ page }) => {
      await page.getByRole('button', { name: 'Load 50 more' }).click();
      await expect(showing(page)).toHaveText('Showing100of142');
      await page.getByRole('button', { name: 'Load 50 more' }).click();
      await expect(showing(page)).toHaveText('Showing142of142');
      await expect(page.getByRole('button', { name: 'Load 50 more' })).toHaveCount(0);
      await expect(testRows(page)).toHaveCount(142);
      const platformCounts = await testRows(page).evaluateAll((rows) =>
        rows.map((row) => row.querySelectorAll('[data-part="platform"]').length),
      );
      expect(platformCounts.filter((count) => count === 2)).toHaveLength(50);
      expect(platformCounts.filter((count) => count === 1)).toHaveLength(92);
      // 25 ms on the JVM and 3 ms on the simulator in every seeded run: the row reads 0.03 s.
      const row = testRows(page).filter({ hasText: 'addEventForDateLogsAtNoon' });
      await expect(row.locator('[data-part="platform"]')).toHaveText(['jvm', 'ios-sim']);
      await expect(row.locator('td').last()).toHaveText('0.03 s');
    },
  );

  test(
    'narrows to a layer, and to nothing with “Clear filters”',
    { tag: '@js' },
    async ({ page }) => {
      await page.getByRole('combobox', { name: 'Layer' }).selectOption('visual');
      await expect(testRows(page)).toHaveCount(10);
      await expect(showing(page)).toHaveText('Showing10of10');
      await page.getByRole('radio', { name: 'Failed 0' }).click();
      await expect(page.getByText('No tests match')).toBeVisible();
      await page.getByRole('button', { name: 'Clear filters' }).click();
      await expect(showing(page)).toHaveText('Showing50of142');
    },
  );
});

test.describe('testpulse’s run (public, failed, one platform)', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, await latestRunPath(page, 'testpulse'));
  });

  test('reads failed, a week ago, with 3 tests: 1 passed, 1 failed, 1 skipped', async ({
    page,
  }) => {
    await expect(page).toHaveTitle('Push to main · testpulse · testpulse');
    await expect(page.locator('[data-part="lead"] [data-status]')).toHaveText('Failed');
    // 2026-09-22, 13 calendar days before SEED_NOW.
    await expect(page.locator('[data-part="lead"] time')).toHaveText('1 week ago');
    await expect(tiles(page)).toHaveText([
      'Tests3',
      'Passed1',
      'Failed1',
      'Skipped1',
      /^Duration\d+ s$/,
    ]);
    await expect(tiles(page).nth(2)).toHaveAttribute('data-tone', 'fail');
    await expect(reportRows(page)).toHaveCount(1);
    await expect(reportRows(page).first()).toHaveAttribute('data-status', 'failed');
    // Design v8 item 26: the skipped test has its share of the bar and its words.
    await expect(reportRows(page).locator('[data-part="result"]')).toHaveText(
      '1 failed · 1 passed · 1 skipped',
    );
    await expect(reportRows(page).locator('[data-part="bar-skip"]')).toHaveAttribute(
      'style',
      /width: ?33\.3/,
    );
  });

  test('names the failing test in the failed-run banner', async ({ page }) => {
    await expect(banner(page).locator('[data-part="title"]')).toHaveText(TESTPULSE_FAILURE);
    await expect(banner(page).locator('[data-part="body"]')).toHaveText('In e2e, E2E layer.');
    await expect(banner(page).getByRole('link', { name: 'Show failure' })).toHaveAttribute(
      'href',
      '#results',
    );
  });

  test(
    '“Show failure” filters to Failed and focuses the failing row',
    { tag: '@js' },
    async ({ page }) => {
      await expectHydrated(page, '[data-part="banner"] a');
      await banner(page).getByRole('link', { name: 'Show failure' }).click();
      await expect(page.getByRole('radio', { name: 'Failed 1' })).toHaveAttribute(
        'aria-checked',
        'true',
      );
      await expect(testRows(page)).toHaveCount(1);
      await expect(testRows(page).first().getByRole('button')).toBeFocused();
      await expect(page.locator('#results')).toBeInViewport();
    },
  );

  test('opens the failure with its message and stack trace, and no head', async ({ page }) => {
    await expect(statusRadios(page)).toHaveText([
      'All 3',
      'Passed 1',
      'Failed 1',
      'Error 0',
      'Skipped 1',
    ]);
    const failing = testRows(page).nth(0);
    const skipped = testRows(page).nth(2);
    await expect(failing.locator('[data-status]').first()).toHaveText('Failed');
    await expect(failing.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    await expect(failing.locator('[data-part="message"]')).toHaveText(
      'expect(received).toBe(expected) // Object.is equality',
    );
    await expect(failing.locator('pre')).toContainText('Expected: 2');
    await expect(failing.locator('[data-part="failure-head"]')).toHaveCount(0);
    await expect(failing.getByRole('link', { name: 'Test history' })).toHaveAttribute(
      'href',
      /^\/p\/testpulse\/tests\/[0-9a-f]{64}$/,
    );
    // A skipped test did not run, so it has no time.
    await expect(skipped.locator('td').last()).toHaveText('—');
  });

  test('closes and reopens the failure', { tag: '@js' }, async ({ page }) => {
    const toggle = testRows(page).first().getByRole('button');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('[data-part="message"]')).toBeHidden();
    await toggle.click();
    await expect(page.locator('[data-part="message"]')).toBeVisible();
  });
});

test.describe('RouteServe’s latest run (private, failed)', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, await latestRunPath(page, 'routeserve'));
  });

  test('heads the page “Run {id}” with a lock, the commit short and unlinked, no CI', async ({
    page,
  }) => {
    await expect(page).toHaveTitle('Run 36200000010 · RouteServe · testpulse');
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toHaveText('Run 36200000010');
    await expect(heading.getByRole('img', { name: 'Private repository' })).toBeVisible();
    await expect(meta(page).locator('dt')).toHaveText([
      'Branch',
      'Commit',
      'Event',
      'Started',
      'Reports',
    ]);
    await expect(meta(page).locator('dd').nth(4)).toHaveText('3');
    await expect(meta(page).locator('dd').nth(1)).toHaveText(
      String(ROUTESERVE_RUNS.at(-1)?.commitSha.slice(0, 7)),
    );
    await expect(meta(page).getByRole('link')).toHaveCount(0);
  });

  test('says in the banner which test failed, where, and that its text is hidden', async ({
    page,
  }) => {
    await expect(banner(page).locator('[data-part="title"]')).toHaveText(
      `1 test failed: asset.test.ts › ${String(FAILING[0]?.name)}`,
    );
    await expect(banner(page).locator('[data-part="body"]')).toHaveText(
      `In packages/shared, Unit layer. ${PRIVATE_SENTENCE}`,
    );
  });

  test('counts 1,041 distinct tests, not the 1,045 executions', async ({ page }) => {
    // 115,412 + 68,719 + 19,989 = 204,120 ms.
    await expect(tiles(page)).toHaveText([
      'Tests1,041',
      'Passed1,040',
      'Failed1',
      'Skipped0',
      'Duration3m 24s',
    ]);
    await expect(reportRows(page).locator('td:nth-child(2)')).toHaveText([
      'test/apps/backend/node',
      'test/apps/mobile/node',
      'test/packages/shared/node',
    ]);
    await expect(reportRows(page).locator('[data-part="result"]')).toHaveText([
      '498 passed',
      '428 passed',
      '1 failed · 118 passed',
    ]);
    await expect(statusRadios(page)).toHaveText([
      'All 1,041',
      'Passed 1,040',
      'Failed 1',
      'Error 0',
      'Skipped 0',
    ]);
    await expect(showing(page)).toHaveText('Showing50of1,041');
  });

  test('leads with the failing, flaky test and the private notice, no failure text', async ({
    page,
  }) => {
    const failing = testRows(page).first();
    await expect(failing.locator('[data-part="name"]')).toHaveText(String(FAILING[0]?.name));
    await expect(failing.locator('[data-part="flaky-wide"]')).toHaveText('Flaky');
    await expect(failing.getByText('Details hidden: private repository')).toBeVisible();
    // One failure: no head, as on a public project (components.md, ResultsTable); the heads of a
    // private run failing on two platforms are proven in tests/e2e/live.spec.ts.
    await expect(
      failing.locator('[data-part="message"], pre, [data-part="failure-head"]'),
    ).toHaveCount(0);
    await expect(failing.getByRole('link', { name: 'Test history' })).toHaveAttribute(
      'href',
      /^\/p\/routeserve\/tests\/[0-9a-f]{64}$/,
    );
  });
});

const RUNS = ['ostomate2', 'testpulse', 'routeserve'] as const;

for (const slug of RUNS) {
  test(`${slug}: no serious or critical axe violations`, { tag: '@js' }, async ({ page }) => {
    await open(page, await latestRunPath(page, slug));
    await expectNoSeriousAxeViolations(page);
  });

  test(`${slug}: the page follows the system theme`, { tag: '@js' }, async ({ page }) => {
    await open(page, await latestRunPath(page, slug));
    const { colorScheme } = test.info().project.use;
    await expect(page.locator('html')).toHaveAttribute('data-theme', String(colorScheme));
  });

  test(`${slug}: the page does not scroll sideways`, async ({ page }) => {
    await open(page, await latestRunPath(page, slug));
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });

  // The design gives the run page no live behaviour (section 13.5).
  test(`${slug}: shows neither “Live” nor “Offline”`, async ({ page }) => {
    await open(page, await latestRunPath(page, slug));
    await expect(page.getByText(/^Live$|Offline/)).toHaveCount(0);
  });

  test(`${slug}: the page renders without running scripts`, { tag: '@no-js' }, async ({ page }) => {
    await open(page, await latestRunPath(page, slug));
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(tiles(page)).toHaveCount(5);
    await expect(reportRows(page).first()).toBeVisible();
    await expect(testRows(page).first()).toBeVisible();
    await expect(statusRadios(page).first()).toBeVisible();
  });

  test(
    `${slug}: Tab reaches every control, each with a visible focus ring`,
    {
      tag: '@js',
    },
    async ({ page }) => {
      await open(page, await latestRunPath(page, slug));
      const reached: string[] = [];
      for (let step = 0; step < 90; step += 1) {
        await page.keyboard.press('Tab');
        const focused = await page.evaluate(() => {
          const el = document.activeElement;
          if (!(el instanceof HTMLElement) || el === document.body) return null;
          const style = getComputedStyle(el);
          return {
            name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim(),
            ring: style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) >= 2,
          };
        });
        if (focused === null || focused.name === reached[0]) break;
        expect(focused.ring, `focus ring on "${focused.name}"`).toBe(true);
        reached.push(focused.name);
      }
      const expected: (string | RegExp)[] = [
        'Skip to content',
        'Overview',
        'Reports in this run',
        /^All [\d,]+$/,
        /^All layers/,
        'Privacy',
      ];
      if (slug !== 'routeserve') expected.push('GitHub Actions', /^[0-9a-f]{7}$/);
      if (slug !== 'ostomate2') expected.push('Show failure');
      if (slug !== 'testpulse') expected.push('Load 50 more');
      else expected.push('Test history');
      for (const name of expected) {
        const found = reached.some((seen) =>
          typeof name === 'string' ? seen === name : name.test(seen),
        );
        expect(found, `Tab reaches ${String(name)}`).toBe(true);
      }
    },
  );

  test(`${slug}: matches its visual snapshot`, { tag: '@visual' }, async ({ page }) => {
    await open(page, await latestRunPath(page, slug));
    await expect(page).toHaveScreenshot(`${slug}.png`, { fullPage: true });
  });
}

test.describe('links to a run page resolve', () => {
  test('from each run row on the project page', async ({ page }) => {
    await open(page, '/p/ostomate2?branches=all');
    const hrefs = await page
      .getByRole('log')
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
    expect(hrefs).toHaveLength(9);
    for (const href of hrefs) {
      const response = await page.request.get(href);
      expect(response.status(), href).toBe(200);
    }
  });

  test(
    'from the landing feed, to a pull request run by its title',
    { tag: '@js' },
    async ({ page }) => {
      await open(page, '/');
      await page.getByRole('log').getByRole('link').first().click();
      await expect(page).toHaveURL(
        /^http:\/\/127\.0\.0\.1:3000\/p\/ostomate2\/runs\/[0-9a-f-]{36}$/,
      );
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Push to main');

      await open(page, '/p/ostomate2?branches=all');
      await page
        .getByRole('log')
        .getByRole('link', { name: /Pull request from/ })
        .click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'Pull request from seed/pull-request',
      );
      await expect(meta(page).locator('dd').nth(2)).toHaveText('pull_request');
    },
  );
});

test.describe('a run that is not there', () => {
  const OTHER_UUID = '00000000-0000-4000-8000-000000000000';

  test('answers 404 for a malformed ID, an unknown ID, another project’s run and an unknown project', async ({
    page,
  }) => {
    const routeserveRun = await latestRunPath(page, 'routeserve');
    const runId = routeserveRun.split('/').at(-1);
    for (const path of [
      '/p/ostomate2/runs/not-a-uuid',
      '/p/ostomate2/runs/36100000009',
      `/p/ostomate2/runs/${OTHER_UUID}`,
      `/p/ostomate2/runs/${String(runId)}`,
      `/p/nope/runs/${OTHER_UUID}`,
    ]) {
      const response = await open(page, path);
      expect(response?.status(), path).toBe(404);
      await expect(page).toHaveTitle('Not found · testpulse');
      // No database error reaches the page.
      await expect(page.locator('body')).not.toContainText(/22P02|invalid input syntax|PGRST/);
    }
  });

  // @js: Next.js 16 renders a not-found page for a dynamically rendered route in the browser
  // (docs/spec.md section 13.2); without scripts the 404 body is empty.
  test(
    'shows the designed run kind for a run the project does not have',
    { tag: '@js' },
    async ({ page }) => {
      await open(page, `/p/ostomate2/runs/${OTHER_UUID}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'This run isn’t in Ostomate 2.0',
      );
      await expect(page.locator('[data-part="path"]')).toHaveText(
        `/p/ostomate2/runs/${OTHER_UUID}`,
      );
      const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
      await expect(crumbs.getByRole('link')).toHaveText(['Overview', 'Ostomate 2.0']);
      await expect(crumbs.locator('[aria-current="page"]')).toHaveText('Not found');
      await expect(page.getByRole('link', { name: 'Ostomate 2.0 runs' })).toHaveAttribute(
        'href',
        '/p/ostomate2',
      );
      await expect(page.getByRole('main').getByRole('link', { name: 'Overview' })).toHaveAttribute(
        'href',
        '/',
      );
      await expectNoSeriousAxeViolations(page);
    },
  );

  test(
    'shows the project kind for a run URL naming no project',
    { tag: '@js' },
    async ({ page }) => {
      await open(page, `/p/nope/runs/${OTHER_UUID}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'No project at this address',
      );
      await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveCount(0);
      await expectNoSeriousAxeViolations(page);
    },
  );
});

// Spec section 17, Phase 5: for a private project, failure text, repository links and full SHAs
// are absent from the rendered HTML and from every network response (tests/e2e/support/leaks.ts).

test.describe('a private run page leaks nothing', { tag: '@js' }, () => {
  test('in the HTML and every response of RouteServe’s failed run, through its filters', async ({
    page,
  }) => {
    const path = await latestRunPath(page, 'routeserve');
    const { html, texts, responses } = await capture(page, path, async (current) => {
      await expectHydrated(current, '[data-part="banner"] a');
      await banner(current).getByRole('link', { name: 'Show failure' }).click();
      await expect(testRows(current)).toHaveCount(1);
      await current.getByRole('radio', { name: 'All 1,041' }).click();
      await current.getByRole('button', { name: 'Load 50 more' }).click();
      await expect(showing(current)).toHaveText('Showing100of1,041');
    });

    // Positive controls: the page shows the seeded run (its 7-character SHA, the failing test's
    // name from the same fixture the hidden text is derived from), and the capture holds the
    // page's own data.
    expect(responses).toBeGreaterThan(3);
    expect(html).toContain(String(ROUTESERVE_RUNS.at(-1)?.commitSha.slice(0, 7)));
    expect(html).toContain(String(FAILING[0]?.name));
    expect(html).toContain('Details hidden: private repository');
    expect(html).toContain(`1 test failed: asset.test.ts › ${String(FAILING[0]?.name)}`);
    expect(html).toContain(PRIVATE_SENTENCE);

    expect(leaksIn(texts, HIDDEN)).toEqual([]);
  });

  test('while the same capture finds a public run’s failure text and repository', async ({
    page,
  }) => {
    const path = await latestRunPath(page, 'testpulse');
    const { texts } = await capture(page, path);
    // The commit link and the CI run link are testpulse's own, not the footer's source link.
    const shown = [
      'expect(received).toBe(expected) // Object.is equality',
      'github.com/bhelco1/testpulse/commit/',
      'github.com/bhelco1/testpulse/actions/runs/36300000001',
    ];
    expect(leaksIn(texts, shown)).toEqual(shown);
  });
});
