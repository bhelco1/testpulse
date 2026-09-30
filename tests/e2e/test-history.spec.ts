import { expect, test, type Page } from '@playwright/test';

import { testKey } from '../../lib/ingest/normalize.ts';
import { planSeed, SEED_NOW, type SeedSlug } from '../../lib/seed/plan.ts';
import { expectNoSeriousAxeViolations } from './support/axe.ts';
import { capture, FAILING, formsOf, HIDDEN, leaksIn, ROUTESERVE_RUNS } from './support/leaks.ts';
import { open } from './support/open.ts';

// The test history page, /p/[slug]/tests/[testKey] (spec section 13), against the seed
// (lib/seed/plan.ts) at SEED_NOW. Four tests: an Ostomate2 test on the JVM only, an Ostomate2
// test on the JVM and the iOS simulator, RouteServe's flaky test (private) and testpulse's
// failing test. Every seeded run of a project posts the same fixtures, so a test takes the same
// time in each run, the time its file records. Tags route tests to projects
// (playwright.config.ts): @js where scripts run, @no-js where they do not, @visual in the four
// viewport × theme projects inside the Playwright image.

interface SeededTest {
  readonly slug: SeedSlug;
  readonly project: string;
  readonly module: string;
  readonly suite: string;
  readonly name: string;
}

const SINGLE: SeededTest = {
  slug: 'ostomate2',
  project: 'Ostomate 2.0',
  module: 'shared',
  suite: 'com.ostomate.app.data.db.ChangeEventDaoTest',
  name: 'insertAndReadBackJoinedWithSupply',
};
const TWO_PLATFORMS: SeededTest = {
  slug: 'ostomate2',
  project: 'Ostomate 2.0',
  module: 'composeApp',
  suite: 'com.ostomate.app.ui.calendar.CalendarViewModelTest',
  name: 'addEventForDateLogsAtNoon',
};
const FLAKY: SeededTest = {
  slug: 'routeserve',
  project: 'RouteServe',
  module: 'packages/shared',
  suite: 'packages/shared/src/schemas/asset.test.ts',
  name: 'assetCreateSchema accepts a minimal valid asset',
};
const FAILING_TEST: SeededTest = {
  slug: 'testpulse',
  project: 'testpulse',
  module: 'e2e',
  suite: 'zz-deliberate-failure.spec.ts',
  name: 'deliberately fails to capture a failing JUnit fixture',
};

const keyOf = (test: SeededTest) => testKey(test.module, test.suite, test.name);
const pathOf = (test: SeededTest) => `/p/${test.slug}/tests/${keyOf(test)}`;

const PLAN = planSeed(new Date(SEED_NOW));
const shasOf = (slug: SeedSlug) =>
  PLAN.runs.filter((run) => run.slug === slug).map((run) => run.commitSha.slice(0, 7));
const OSTOMATE2_SHAS = shasOf('ostomate2');
const ROUTESERVE_SHAS = shasOf('routeserve');
const TESTPULSE_SHAS = shasOf('testpulse');

const RUN_HREF = (slug: string) => new RegExp(`^/p/${slug}/runs/[0-9a-f-]{36}$`);
const RUN_URL = (slug: string) =>
  new RegExp(`^http://127\\.0\\.0\\.1:3000/p/${slug}/runs/[0-9a-f-]{36}$`);

const timeline = (page: Page) => page.getByRole('region', { name: 'Status by run' });
const strips = (page: Page) => timeline(page).getByRole('listbox');
const cells = (page: Page) => timeline(page).locator('[data-part="cell"]');
const legend = (page: Page) => timeline(page).locator('[data-part="legend"] li');
const panel = (page: Page) => timeline(page).locator('[data-part="panel"]');
const fields = (page: Page) => panel(page).locator('[data-part="field"]');
const duration = (page: Page) =>
  page.getByRole('figure').filter({ has: page.getByRole('heading', { name: 'Duration' }) });

const DURATION_SCOPE = 'Default branch · last 30 CI runs (imported history has no durations)';

async function expectIdentity(page: Page, test: SeededTest, short: string, layer: string) {
  await expect(page).toHaveTitle(`${test.name} · ${test.project} · testpulse`);
  const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(crumbs.getByRole('link')).toHaveText(['Overview', test.project]);
  await expect(crumbs.getByRole('link', { name: test.project })).toHaveAttribute(
    'href',
    `/p/${test.slug}`,
  );
  await expect(crumbs.locator('[aria-current="page"]')).toHaveText(`${short} › ${test.name}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(test.name);
  await expect(page.locator('[data-part="suite"]')).toHaveText(test.suite);
  await expect(page.locator('[data-part="layer"]')).toHaveText(layer);
  await expect(timeline(page).getByRole('heading', { level: 2 })).toHaveText('Status by run');
}

test.describe('an Ostomate2 test on one platform (public)', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, pathOf(SINGLE));
  });

  test('names the test, its suite, layer and breadcrumbs', async ({ page }) => {
    await expectIdentity(page, SINGLE, 'ChangeEventDaoTest', 'Integration');
    await expect(page.locator('[data-part="flaky"]')).toHaveCount(0);
  });

  test('draws one strip of its 9 runs, all passed, and opens on the latest', async ({ page }) => {
    await expect(strips(page)).toHaveCount(1);
    await expect(strips(page)).toHaveAccessibleName(`${SINGLE.name}, last 9 runs`);
    await expect(timeline(page).locator('[data-part="platform"]')).toHaveCount(0);
    await expect(cells(page)).toHaveCount(9);
    await expect(cells(page).and(page.locator('[data-status="passed"]'))).toHaveCount(9);
    await expect(cells(page).last()).toHaveAttribute('aria-selected', 'true');
    await expect(cells(page).last()).toHaveAccessibleName(
      `Passed, 2 h ago, Push to main, ${String(OSTOMATE2_SHAS.at(-1))}`,
    );
    await expect(legend(page)).toHaveText(['Passed']);
    // The run the timeline opens on: the latest, since the test never failed.
    await expect(panel(page).locator('[data-part="run-title"]')).toHaveText('Push to main');
    await expect(panel(page).locator('[data-part="run-sha"]')).toHaveText(
      String(OSTOMATE2_SHAS.at(-1)),
    );
    await expect(panel(page).locator('[data-part="when"]')).toHaveText('2 h ago');
    // 68 ms, as its JUnit file records it.
    await expect(fields(page)).toHaveText(['ResultPassed·0.07 s']);
    await expect(panel(page).getByRole('link', { name: 'Open run →' })).toHaveAttribute(
      'href',
      RUN_HREF('ostomate2'),
    );
  });

  test('charts its duration over the 8 default-branch CI runs', async ({ page }) => {
    const figure = duration(page);
    await expect(figure.locator('[data-part="scope"]')).toHaveText(DURATION_SCOPE);
    // The pull request run is on the timeline but not on the default-branch chart.
    await expect(figure.locator('[data-part="caption"]')).toHaveText(
      'Held at 0.07 s over the last 8 runs.',
    );
  });

  test('the oldest cell is 8 runs ago', { tag: '@js' }, async ({ page }) => {
    await expect(timeline(page).locator('[data-part="oldest"]')).toHaveText('8 runs ago');
  });
});

test.describe('an Ostomate2 test on two platforms (public)', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, pathOf(TWO_PLATFORMS));
  });

  test('names the test and draws a strip per platform', async ({ page }) => {
    await expectIdentity(page, TWO_PLATFORMS, 'CalendarViewModelTest', 'Unit');
    await expect(timeline(page).locator('[data-part="platform"]')).toHaveText(['jvm', 'ios-sim']);
    await expect(strips(page).nth(0)).toHaveAccessibleName(
      `${TWO_PLATFORMS.name} on jvm, last 9 runs`,
    );
    await expect(strips(page).nth(1)).toHaveAccessibleName(
      `${TWO_PLATFORMS.name} on ios-sim, last 9 runs`,
    );
    await expect(cells(page)).toHaveCount(18);
    // 25 ms on the JVM and 3 ms on the simulator, as the two JUnit files record them.
    await expect(fields(page)).toHaveText(['jvmPassed·0.03 s', 'ios-simPassed·0.00 s']);
  });

  test('charts a line per platform, giving the range across both', async ({ page }) => {
    const figure = duration(page);
    await expect(figure.locator('[data-part="caption"]')).toHaveText(
      'Between 3 ms and 0.03 s over the last 8 runs.',
    );
    await expect(figure.locator('[data-part="legend"] li')).toHaveText(['jvm', 'ios-sim']);
  });

  test(
    'moves the selected run with the keyboard, in both strips',
    { tag: '@js' },
    async ({ page }) => {
      const [jvm, ios] = [strips(page).nth(0), strips(page).nth(1)];
      await jvm.focus();
      await page.keyboard.press('ArrowLeft');
      // The run before the latest: the scheduled run on 2026-10-04 at 05:17.
      await expect(panel(page).locator('[data-part="run-title"]')).toHaveText('Scheduled run');
      await expect(panel(page).locator('[data-part="run-sha"]')).toHaveText(
        String(OSTOMATE2_SHAS.at(-2)),
      );
      await expect(panel(page).locator('[data-part="when"]')).toHaveText('yesterday');
      await expect(jvm.locator('[aria-selected="true"]')).toHaveAccessibleName(
        `Passed, yesterday, Scheduled run, ${String(OSTOMATE2_SHAS.at(-2))}`,
      );

      await page.keyboard.press('ArrowDown');
      await expect(ios).toBeFocused();
      await expect(ios.locator('[aria-selected="true"]')).toHaveAccessibleName(
        `Passed, yesterday, Scheduled run, ${String(OSTOMATE2_SHAS.at(-2))}`,
      );

      await page.keyboard.press('Home');
      await expect(panel(page).locator('[data-part="run-sha"]')).toHaveText(
        String(OSTOMATE2_SHAS[0]),
      );
      await expect(panel(page).locator('[data-part="when"]')).toHaveText('1 week ago');
      await page.keyboard.press('ArrowUp');
      await expect(jvm).toBeFocused();
      await page.keyboard.press('End');
      await expect(panel(page).locator('[data-part="run-sha"]')).toHaveText(
        String(OSTOMATE2_SHAS.at(-1)),
      );
      await expect(cells(page).and(page.locator('[aria-selected="true"]'))).toHaveCount(2);
    },
  );

  test('opens the selected run', { tag: '@js' }, async ({ page }) => {
    await strips(page).first().focus();
    await page.keyboard.press('Home');
    await panel(page).getByRole('link', { name: 'Open run →' }).click();
    await expect(page).toHaveURL(RUN_URL('ostomate2'));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Push to main');
    await expect(page.locator('[data-part="meta"] dd').nth(1)).toHaveText(
      String(OSTOMATE2_SHAS[0]),
    );
  });
});

test.describe('RouteServe’s flaky test (private)', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, pathOf(FLAKY));
  });

  test('names the test and marks it flaky', async ({ page }) => {
    await expectIdentity(page, FLAKY, 'asset.test.ts', 'Unit');
    await expect(page.locator('[data-part="flaky"]')).toHaveText('Flaky');
  });

  test('marks the flip of one commit on both of its cells and opens on the latest failure', async ({
    page,
  }) => {
    await expect(cells(page)).toHaveCount(11);
    const statuses = await cells(page).evaluateAll((all) =>
      all.map((cell) => cell.getAttribute('data-status')),
    );
    // The 5th and 6th runs are the failed first and passing second attempt of one commit.
    expect(statuses).toEqual([
      'passed',
      'failed',
      'passed',
      'passed',
      'flaky',
      'flaky',
      'passed',
      'failed',
      'passed',
      'passed',
      'failed',
    ]);
    await expect(legend(page)).toHaveText(['Passed', 'Failed', 'Flaky']);
    await expect(cells(page).last()).toHaveAttribute('aria-selected', 'true');
    // A private project's run is untitled, as its feed rows are (design/components.md RunFeedRow).
    await expect(cells(page).last()).toHaveAccessibleName(
      `Failed, 3 h ago, Private repository, ${String(ROUTESERVE_SHAS.at(-1))}`,
    );
    await expect(panel(page).locator('[data-part="run-title"]')).toHaveText('Private repository');
    await expect(panel(page).locator('[data-part="run-sha"]')).toHaveText(
      String(ROUTESERVE_SHAS.at(-1)),
    );
    // 2 ms when it fails, as the captured failing Jest file records it.
    await expect(fields(page)).toHaveText(['ResultFailed·0.00 s']);
    await expect(panel(page).getByRole('link', { name: 'Open run →' })).toHaveAttribute(
      'href',
      RUN_HREF('routeserve'),
    );
    await expect(page.getByText('Pull request from', { exact: false })).toHaveCount(0);
  });

  test('charts its 10 runs on main, leaving the pull request out', async ({ page }) => {
    await expect(duration(page).locator('[data-part="caption"]')).toHaveText(
      // Every run under 10 ms: whole milliseconds (design v8 item 48).
      'Between 1 ms and 2 ms over the last 10 runs. Median 1 ms.',
    );
  });

  test(
    'selects a flaky run by pointer and a passing one by keyboard',
    { tag: '@js' },
    async ({ page }) => {
      await cells(page).nth(4).click();
      await expect(cells(page).nth(4)).toHaveAttribute('aria-selected', 'true');
      await expect(fields(page)).toHaveText(['ResultFlaky·0.00 s']);
      await page.keyboard.press('ArrowRight');
      await expect(cells(page).nth(5)).toHaveAttribute('aria-selected', 'true');
      await expect(panel(page).locator('[data-part="run-sha"]')).toHaveText(
        String(ROUTESERVE_SHAS[5]),
      );
    },
  );
});

test.describe('testpulse’s failing test (public, one run)', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, pathOf(FAILING_TEST));
  });

  test('names the test and shows its one failed run', async ({ page }) => {
    // The design's shortening takes a bare file name's last dotted segment (section 13.3).
    await expectIdentity(page, FAILING_TEST, 'zz-deliberate-failure.spec.ts', 'E2E');
    await expect(strips(page)).toHaveAccessibleName(`${FAILING_TEST.name}, last 1 run`);
    await expect(cells(page)).toHaveCount(1);
    await expect(cells(page)).toHaveAttribute('data-status', 'failed');
    await expect(timeline(page).locator('[data-part="oldest"]')).toHaveText('');
    await expect(timeline(page).locator('[data-part="latest"]')).toHaveText('Latest');
    await expect(panel(page).locator('[data-part="run-title"]')).toHaveText('Push to main');
    await expect(panel(page).locator('[data-part="run-sha"]')).toHaveText(
      String(TESTPULSE_SHAS[0]),
    );
    await expect(panel(page).locator('[data-part="when"]')).toHaveText('1 week ago');
    // 4 ms, as the Playwright JUnit file records it.
    await expect(fields(page)).toHaveText(['ResultFailed·0.00 s']);
  });

  test('draws the duration chart’s one-run state, with no caption', async ({ page }) => {
    const figure = duration(page);
    await expect(figure.locator('[data-part="one-point"]')).toContainText(
      'One run so far. The trend appears after the next run.',
    );
    await expect(figure.locator('[data-part="caption"]')).toHaveCount(0);
  });
});

const PAGES = [
  { id: 'ostomate2-one-platform', test: SINGLE },
  { id: 'ostomate2-two-platforms', test: TWO_PLATFORMS },
  { id: 'routeserve-flaky', test: FLAKY },
  { id: 'testpulse-failing', test: FAILING_TEST },
] as const;

for (const { id, test: seeded } of PAGES) {
  test(`${id}: no serious or critical axe violations`, { tag: '@js' }, async ({ page }) => {
    await open(page, pathOf(seeded));
    await expectNoSeriousAxeViolations(page);
  });

  test(`${id}: the page follows the system theme`, { tag: '@js' }, async ({ page }) => {
    await open(page, pathOf(seeded));
    const { colorScheme } = test.info().project.use;
    await expect(page.locator('html')).toHaveAttribute('data-theme', String(colorScheme));
  });

  test(`${id}: the page does not scroll sideways`, async ({ page }) => {
    await open(page, pathOf(seeded));
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });

  // The design gives the test history page no live behaviour (section 13.6).
  test(`${id}: shows neither “Live” nor “Offline”`, async ({ page }) => {
    await open(page, pathOf(seeded));
    await expect(page.getByText(/^Live$|Offline/)).toHaveCount(0);
  });

  test(`${id}: the page renders without running scripts`, { tag: '@no-js' }, async ({ page }) => {
    await open(page, pathOf(seeded));
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(seeded.name);
    await expect(cells(page).first()).toBeVisible();
    await expect(panel(page)).toBeVisible();
    await expect(duration(page).getByRole('heading', { name: 'Duration' })).toBeVisible();
  });

  test(
    `${id}: Tab reaches every control, each with a visible focus ring`,
    { tag: '@js' },
    async ({ page }) => {
      await open(page, pathOf(seeded));
      const reached: string[] = [];
      for (let step = 0; step < 40; step += 1) {
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
        seeded.project,
        new RegExp(`^${seeded.name}.*, last \\d+ runs?$`),
        'Open run →',
        'Privacy',
      ];
      for (const name of expected) {
        const found = reached.some((seen) =>
          typeof name === 'string' ? seen === name : name.test(seen),
        );
        expect(found, `Tab reaches ${String(name)}`).toBe(true);
      }
    },
  );

  test(`${id}: matches its visual snapshot`, { tag: '@visual' }, async ({ page }) => {
    await open(page, pathOf(seeded));
    await expect(page).toHaveScreenshot(`${id}.png`, { fullPage: true });
  });
}

test.describe('without scripts, the duration chart is its table', { tag: '@no-js' }, () => {
  test('lists the two-platform test’s 8 runs, newest first', async ({ page }) => {
    await open(page, pathOf(TWO_PLATFORMS));
    const table = duration(page).getByRole('table');
    await expect(table.locator('thead th')).toHaveText(['Run', 'jvm', 'ios-sim']);
    await expect(table.locator('tbody tr')).toHaveCount(8);
    // The simulator's 3 ms reads in whole ms (design v8 item 48).
    await expect(table.locator('tbody tr').first()).toHaveText('Latest0.03 s3 ms');
    await expect(table.locator('tbody tr').last()).toHaveText('7 runs ago0.03 s3 ms');
    await expect(duration(page).getByRole('button', { name: 'Show table' })).toHaveCount(0);
  });
});

test.describe('links to a test history resolve', () => {
  test('from a passing row of the run page', { tag: '@js' }, async ({ page }) => {
    await open(page, '/p/ostomate2');
    await page.getByRole('link', { name: 'View this run →' }).click();
    await page.getByRole('button', { name: 'Load 50 more' }).click();
    await page.getByRole('button', { name: 'Load 50 more' }).click();
    await page
      .locator('[data-part="test"]')
      .filter({ hasText: TWO_PLATFORMS.name })
      .getByRole('link')
      .click();
    await expect(page).toHaveURL(pathOf(TWO_PLATFORMS));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(TWO_PLATFORMS.name);
  });

  test('from every row of a run page, without scripts too', async ({ page }) => {
    await open(page, '/p/testpulse');
    await page.getByRole('link', { name: 'View this run →' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Push to main');
    const failing = page.locator('[data-part="test"]').first();
    await expect(failing.getByRole('link', { name: 'Test history' })).toHaveAttribute(
      'href',
      pathOf(FAILING_TEST),
    );
    const hrefs = await page
      .locator('[data-part="test"] a')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
    expect(hrefs).toHaveLength(3);
    for (const href of hrefs) {
      const response = await page.request.get(href);
      expect(response.status(), href).toBe(200);
    }
  });

  test('from the failure’s “Test history” link', { tag: '@js' }, async ({ page }) => {
    await open(page, '/p/testpulse');
    await page.getByRole('link', { name: 'View this run →' }).click();
    await page.getByRole('link', { name: 'Test history' }).click();
    await expect(page).toHaveURL(pathOf(FAILING_TEST));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(FAILING_TEST.name);
  });
});

test.describe('a test that is not there', () => {
  test('answers 404 for a malformed, unknown or other project’s key and an unknown project', async ({
    page,
  }) => {
    const key = keyOf(SINGLE);
    for (const path of [
      '/p/ostomate2/tests/not-a-key',
      `/p/ostomate2/tests/${key.toUpperCase()}`,
      `/p/ostomate2/tests/${key.slice(1)}`,
      `/p/ostomate2/tests/${'0'.repeat(64)}`,
      `/p/ostomate2/tests/${keyOf(FLAKY)}`,
      `/p/routeserve/tests/${key}`,
      `/p/nope/tests/${key}`,
    ]) {
      const response = await open(page, path);
      expect(response?.status(), path).toBe(404);
      await expect(page).toHaveTitle('Not found · testpulse');
      await expect(page.locator('body')).not.toContainText(/22P02|invalid input syntax|PGRST/);
    }
  });

  // @js: Next.js 16 renders a not-found page for a dynamically rendered route in the browser
  // (docs/spec.md section 13.2); without scripts the 404 body is empty.
  test(
    'shows the designed test kind for a key the project does not have',
    { tag: '@js' },
    async ({ page }) => {
      const path = `/p/ostomate2/tests/${'0'.repeat(64)}`;
      await open(page, path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'This test isn’t in Ostomate 2.0',
      );
      await expect(page.locator('[data-part="path"]')).toHaveText(path);
      await expect(page.getByRole('main')).toContainText(
        'Test history follows each test’s key, so a renamed or moved test starts a new history under its new name. Nothing has reported under this key.',
      );
      const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
      await expect(crumbs.getByRole('link')).toHaveText(['Overview', 'Ostomate 2.0']);
      await expect(crumbs.locator('[aria-current="page"]')).toHaveText('Not found');
      await page.getByRole('link', { name: 'Latest Ostomate 2.0 results' }).click();
      await expect(page).toHaveURL(RUN_URL('ostomate2'));
      await expect(page.locator('[data-part="meta"] dd').nth(1)).toHaveText(
        String(OSTOMATE2_SHAS.at(-1)),
      );
    },
  );

  test('the test kind links to the overview', { tag: '@js' }, async ({ page }) => {
    await open(page, `/p/ostomate2/tests/${keyOf(FLAKY)}`);
    await expect(page.getByRole('main').getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'href',
      '/',
    );
    await expectNoSeriousAxeViolations(page);
  });

  test(
    'shows the project kind for a test URL naming no project',
    { tag: '@js' },
    async ({ page }) => {
      await open(page, `/p/nope/tests/${keyOf(SINGLE)}`);
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
// The test history page shows no failure text on any project; the check still covers everything
// the page and the run page it opens send.

test.describe('a private test history leaks nothing', { tag: '@js' }, () => {
  test('the values it must not show exist in what the seed sends', () => {
    expect(FAILING.map((result) => result.name)).toContain(FLAKY.name);
    expect(ROUTESERVE_RUNS.every((run) => /^[0-9a-f]{40}$/.test(run.commitSha))).toBe(true);
    for (const value of HIDDEN.slice(0, 3)) {
      for (const form of formsOf(value)) expect(leaksIn([`x${form}x`], HIDDEN)).toContain(value);
    }
  });

  test('in the HTML and every response of the flaky test’s page, through its timeline', async ({
    page,
  }) => {
    const { html, texts, responses } = await capture(page, pathOf(FLAKY), async (current) => {
      await strips(current).first().focus();
      await current.keyboard.press('Home');
      await expect(panel(current).locator('[data-part="run-sha"]')).toHaveText(
        String(ROUTESERVE_SHAS[0]),
      );
      await current.keyboard.press('End');
    });

    // Positive controls: every seeded run's SHA shows cut to 7 characters in the cells' names,
    // the test's name is the one the hidden failure text belongs to, and the capture holds the
    // page's own data, not only static files.
    expect(responses).toBeGreaterThan(3);
    for (const sha of ROUTESERVE_SHAS) expect(html).toContain(sha);
    expect(html).toContain(FLAKY.name);
    expect(html).toContain('Private repository');

    expect(leaksIn(texts, HIDDEN)).toEqual([]);
  });

  test('in every response of the run it opens', async ({ page }) => {
    const { html, texts } = await capture(page, pathOf(FLAKY), async (current) => {
      await panel(current).getByRole('link', { name: 'Open run →' }).click();
      await expect(current.getByRole('heading', { level: 1 })).toHaveText(/^Run 362000000\d\d$/);
      await expect(current.getByText('Details hidden: private repository')).toBeVisible();
    });
    expect(html).toContain(String(ROUTESERVE_SHAS.at(-1)));
    expect(leaksIn(texts, HIDDEN)).toEqual([]);
  });

  test('while the same capture finds a public run’s failure text and repository', async ({
    page,
  }) => {
    const { texts } = await capture(page, pathOf(FAILING_TEST), async (current) => {
      await panel(current).getByRole('link', { name: 'Open run →' }).click();
      await expect(current.getByRole('heading', { level: 1 })).toHaveText('Push to main');
    });
    const shown = [
      'expect(received).toBe(expected) // Object.is equality',
      'github.com/bhelco1/testpulse/commit/',
      'github.com/bhelco1/testpulse/actions/runs/36300000001',
    ];
    expect(leaksIn(texts, shown)).toEqual(shown);
  });
});
