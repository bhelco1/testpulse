import { readFileSync } from 'node:fs';

import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';

import { ReportMetaSchema } from '../../lib/ingest/meta.ts';
import { normalizeReport } from '../../lib/ingest/normalize.ts';
import { parseJestJson } from '../../lib/parsers/index.ts';
import { loadProjectFile, projectFilePath } from '../../lib/projects/files.ts';
import { capture, FAILING, formsOf, HIDDEN, leaksIn, ROUTESERVE_RUNS } from './support/leaks.ts';
import { expectLive, open } from './support/open.ts';

// Spec section 17, Phase 5: for a private project, failure text, repository links and full SHAs
// are absent from the rendered HTML and from every network response. Each page spec checks its
// own page; this sweep checks every public page that can show RouteServe (private) in one place:
// the landing page, the project page through its branch filter and "Load 20 more", each of the 11
// run pages through its status filter and "Load 50 more", the history of every test RouteServe's
// seeded reports hold (in the browser for the failing test, through every run by keyboard and the
// run it opens; as served without scripts for all of them), the site's own pages and the
// not-found pages. Every HTML document, response body and WebSocket frame is checked for every
// value section 9 hides (tests/e2e/support/leaks.ts), in every form the checker knows.
//
// It runs in the Playwright project `leak-sweep` alone (playwright.config.ts): one desktop browser
// with a light system theme. The server renders the theme toggle for the dark default and the
// toggle reads the page's theme once the page's client code has run, so its label turning to
// "Switch to dark theme" is the signal that a click or key press on a page without the live feed
// reaches React (a click before hydration is lost). Pages with the live feed wait for "Live".

const SLUG = 'routeserve';
const RUN_PATH = /^\/p\/routeserve\/runs\/([0-9a-f-]{36})$/;
const TEST_PATH = /^\/p\/routeserve\/tests\/([0-9a-f]{64})$/;
const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';

// The site's own pages, each linked from every page's header or footer.
const SITE_PAGES = ['/', '/how-its-tested', '/privacy'] as const;

// A registered private project's not-found answers: an unknown run, a run ID that is not a UUID,
// an unknown test and a key that is not one, and a project that does not exist.
const NOT_FOUND = [
  `/p/${SLUG}/runs/${UNKNOWN_UUID}`,
  `/p/${SLUG}/runs/not-a-uuid`,
  `/p/${SLUG}/tests/${'0'.repeat(64)}`,
  `/p/${SLUG}/tests/not-a-key`,
  '/p/nope',
] as const;

interface SeededTest {
  readonly key: string;
  readonly name: string;
}

// Every test RouteServe's seeded reports hold, keyed as ingestion keys them: each distinct report
// file through the real parser and normalizeReport with the project's own rules.
function routeserveTests(): readonly SeededTest[] {
  const file = loadProjectFile(projectFilePath(SLUG));
  const project = {
    id: SLUG,
    layer_rules: file.layer_rules,
    name_normalization: file.name_normalization,
  };
  const tests = new Map<string, string>();
  const reportFiles = new Set<string>();
  for (const run of ROUTESERVE_RUNS) {
    for (const report of run.reports) {
      const { results } = report;
      if (results.format !== 'jest') throw new Error(`unexpected ${results.format} report`);
      const id = `${report.module}\n${results.source}`;
      if (reportFiles.has(id)) continue;
      reportFiles.add(id);
      const meta = ReportMetaSchema.parse({
        ci_run_id: run.ciRunId,
        run_attempt: run.runAttempt,
        job: report.job,
        module: report.module,
        platform: report.platform,
        commit_sha: run.commitSha,
        branch: run.branch,
        event: run.event,
        run_url: run.runUrl,
      });
      const parsed = parseJestJson(readFileSync(results.source, 'utf8'), {
        pathPrefix: results.pathPrefix,
      });
      const payload = normalizeReport(
        meta,
        project,
        { format: 'jest-json', report: parsed },
        [],
        new Date(run.startedAt),
      );
      for (const test of payload.tests) tests.set(test.test_key, test.name);
    }
  }
  return [...tests].map(([key, name]) => ({ key, name }));
}

const TESTS = routeserveTests();
const TEST_KEYS = new Set(TESTS.map((seeded) => seeded.key));
const testPath = (key: string) => `/p/${SLUG}/tests/${key}`;
const FAILING_TESTS = TESTS.filter((seeded) =>
  FAILING.some((result) => result.name === seeded.name),
);

interface Visit {
  readonly path: string;
  readonly status: number | null;
  readonly html: string;
  readonly texts: readonly string[];
  readonly frames: readonly string[];
  readonly responses: number;
  readonly links: readonly string[];
  /** The page's first heading as the capture ended. */
  readonly heading: string | null;
}

/**
 * Captures one page in a browser context of its own, with every same-origin link it ends on. A
 * fresh context each time, because capture re-requests unread prefetch bodies through the
 * context's request client, and a keep-alive socket it pooled on an earlier page can sit idle past
 * the server's keep-alive timeout (5 s in Node) and be reset as it is reused.
 */
async function visit(
  browser: Browser,
  path: string,
  act?: (page: Page) => Promise<void>,
): Promise<Visit> {
  const { baseURL, viewport, colorScheme, userAgent, deviceScaleFactor } = test.info().project.use;
  const context = await browser.newContext({
    baseURL,
    viewport,
    colorScheme,
    userAgent,
    deviceScaleFactor,
  });
  try {
    const page = await context.newPage();
    const result = await capture(page, path, act);
    const links = await page
      .locator('a[href^="/"]')
      .evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href') ?? ''));
    const h1 = page.getByRole('heading', { level: 1 });
    const heading = (await h1.count()) > 0 ? await h1.first().innerText() : null;
    return { path, ...result, links, heading };
  } finally {
    await context.close();
  }
}

async function expectHydrated(page: Page) {
  await expect(
    page.getByRole('banner').getByRole('button', { name: 'Switch to dark theme' }),
  ).toBeVisible();
}

const pathOf = (href: string) => new URL(href, 'http://127.0.0.1:3000').pathname;

/**
 * Every link the sweep saw that can show RouteServe must be a page the sweep checks: a run page
 * it visited, a test page of a seeded test (all of which the no-script pass checks), the project
 * page, or one of the site's own pages. Other projects' pages are public and out of scope.
 */
function expectLinksSwept(visits: readonly Visit[], runPaths: ReadonlySet<string>) {
  const unswept = visits
    .flatMap((seen) => seen.links)
    .map(pathOf)
    .filter((path) => {
      if (RUN_PATH.test(path)) return !runPaths.has(path);
      const test = TEST_PATH.exec(path);
      if (test !== null) return !TEST_KEYS.has(String(test[1]));
      if (path === `/p/${SLUG}`) return false;
      if (/^\/p\/(?!routeserve(\/|$))/.test(path)) return false;
      return !SITE_PAGES.some((page) => page === path);
    });
  expect([...new Set(unswept)], 'links to pages the sweep does not check').toEqual([]);
}

async function discoverRunPaths(page: Page): Promise<string[]> {
  // Every run on every branch: the page's own "Load 20 more" asks for runs=30.
  await open(page, `/p/${SLUG}?branches=all&runs=30`);
  const hrefs = await page
    .getByRole('log')
    .getByRole('link')
    .evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href') ?? ''));
  return hrefs.filter((href) => RUN_PATH.test(href));
}

// A run page's own interactions: the status filter and back to All.
async function throughStatusFilter(page: Page) {
  await expectHydrated(page);
  await page.getByRole('radio', { name: /^Failed / }).click();
  await expect(page.getByRole('radio', { name: /^Failed / })).toBeChecked();
  await page.getByRole('radio', { name: /^All / }).click();
  await expect(page.getByRole('radio', { name: /^All / })).toBeChecked();
}

// ...then one "Load 50 more", on a run of RouteServe's 1,041 tests.
async function throughRunFilters(page: Page) {
  await throughStatusFilter(page);
  const rows = page.locator('[data-part="test"]');
  await expect(rows).toHaveCount(50);
  await page.getByRole('button', { name: 'Load 50 more' }).click();
  await expect(rows).toHaveCount(100);
}

test.describe.configure({ timeout: 240_000 });

test.describe('the private-data leak sweep', { tag: '@js' }, () => {
  test('knows what it looks for, and finds each value in every form', () => {
    // The hidden values are the seeded ones: 11 runs' full SHAs and run URLs, the failure text.
    expect(ROUTESERVE_RUNS).toHaveLength(11);
    expect(ROUTESERVE_RUNS.every((run) => /^[0-9a-f]{40}$/.test(run.commitSha))).toBe(true);
    expect(
      ROUTESERVE_RUNS.every((run) =>
        run.runUrl.startsWith('https://github.com/bhelco1/routeserve/'),
      ),
    ).toBe(true);
    expect(FAILING.length).toBeGreaterThan(0);
    expect(FAILING.every((result) => (result.failure?.message ?? '').length > 0)).toBe(true);
    for (const run of ROUTESERVE_RUNS) {
      expect(HIDDEN).toContain(run.commitSha);
      expect(HIDDEN).toContain(run.runUrl);
    }
    expect(HIDDEN).toContain('github.com/bhelco1/routeserve');

    // The checker finds every value in each form in a body, and inside a WebSocket frame, whose
    // payload is JSON, as a Realtime record carrying it would be.
    for (const value of HIDDEN) {
      for (const form of formsOf(value))
        expect(leaksIn([`<p>${form}</p>`], [value]), form).toEqual([value]);
      const frame = JSON.stringify({
        event: 'postgres_changes',
        payload: { data: { record: { value } } },
      });
      expect(leaksIn(['clean', frame], [value]), value).toEqual([value]);
    }

    // The tests are the seeded ones: the 1,041 of every run on main, the failing one among them.
    expect(TESTS).toHaveLength(1_041);
    expect(FAILING_TESTS.length).toBeGreaterThan(0);
  });

  test('the landing page and the project page, through the branch filter and Load 20 more', async ({
    browser,
  }) => {
    const landing = await visit(browser, '/', expectLive);
    const project = await visit(browser, `/p/${SLUG}`, async (page) => {
      await expectLive(page);
      await page.getByRole('radio', { name: 'All branches' }).click();
      await expect(page).toHaveURL(`/p/${SLUG}?branches=all`);
      await page.getByRole('button', { name: 'Load 20 more' }).click();
      await expect(page.getByRole('log').getByRole('link')).toHaveCount(11);
    });

    for (const seen of [landing, project]) {
      expect(seen.status, seen.path).toBe(200);
      // Positive control: the capture holds the page's Realtime traffic, the join included.
      expect(seen.frames.length, seen.path).toBeGreaterThan(0);
      expect(
        seen.frames.some((frame) => frame.includes('postgres_changes')),
        seen.path,
      ).toBe(true);
      expect(seen.responses, seen.path).toBeGreaterThan(5);
    }
    // Positive controls: RouteServe's data is on both pages.
    expect(landing.html).toContain(String(ROUTESERVE_RUNS.at(-1)?.commitSha.slice(0, 7)));
    expect(landing.html).toContain(String(FAILING[0]?.name));
    for (const run of ROUTESERVE_RUNS) expect(project.html).toContain(run.commitSha.slice(0, 7));

    const runPaths = new Set(project.links.map(pathOf).filter((path) => RUN_PATH.test(path)));
    expect(runPaths.size).toBe(11);
    expectLinksSwept([landing, project], runPaths);
    expect(leaksIn([...landing.texts, ...project.texts], HIDDEN)).toEqual([]);
  });

  test('every RouteServe run page, through its status filter and Load 50 more', async ({
    browser,
    page,
  }) => {
    const runPaths = await discoverRunPaths(page);
    expect(new Set(runPaths).size).toBe(11);

    const visits: Visit[] = [];
    for (const path of runPaths) visits.push(await visit(browser, path, throughRunFilters));

    // Positive controls: each of the 11 seeded runs was reached (run 36200000005 twice, its first
    // and second attempt), with its 7-character SHA and the private notice where it failed.
    expect(visits.map((seen) => seen.status)).toEqual(runPaths.map(() => 200));
    expect(visits.map((seen) => seen.heading).sort()).toEqual(
      ROUTESERVE_RUNS.map((run) => `Run ${run.ciRunId}`).sort(),
    );
    for (const run of ROUTESERVE_RUNS)
      expect(visits.some((seen) => seen.html.includes(run.commitSha.slice(0, 7)))).toBe(true);
    expect(
      visits.filter((seen) => seen.html.includes('Details hidden: private repository')),
    ).toHaveLength(4);

    expectLinksSwept(visits, new Set(runPaths));
    expect(
      leaksIn(
        visits.flatMap((seen) => seen.texts),
        HIDDEN,
      ),
    ).toEqual([]);
  });

  test('the failing test’s history, through every run by keyboard, and the run it opens', async ({
    browser,
    page,
  }) => {
    const runPaths = new Set(await discoverRunPaths(page));
    const visits: Visit[] = [];
    for (const seeded of FAILING_TESTS) {
      visits.push(
        await visit(browser, testPath(seeded.key), async (current) => {
          await expectHydrated(current);
          const timeline = current.getByRole('region', { name: 'Status by run' });
          const cells = timeline.locator('[data-part="cell"]');
          const sha = timeline.locator('[data-part="panel"] [data-part="run-sha"]');
          await expect(cells).toHaveCount(ROUTESERVE_RUNS.length);
          await timeline.getByRole('listbox').first().focus();
          await current.keyboard.press('Home');
          // Each run in turn, oldest first, so every panel the page can draw is drawn.
          for (const [index, run] of ROUTESERVE_RUNS.entries()) {
            if (index > 0) await current.keyboard.press('ArrowRight');
            await expect(sha).toHaveText(run.commitSha.slice(0, 7));
          }
          await current.keyboard.press('End');
          await timeline.getByRole('link', { name: 'Open run →' }).click();
          await expect(current.getByRole('heading', { level: 1 })).toHaveText(/^Run 362\d{8}$/);
          await expect(current.getByText('Details hidden: private repository')).toBeVisible();
        }),
      );
    }

    for (const seen of visits) {
      expect(seen.status, seen.path).toBe(200);
      // The run the timeline opened is where the capture ended.
      expect(seen.html, seen.path).toContain('Details hidden: private repository');
    }
    expectLinksSwept(visits, runPaths);
    expect(
      leaksIn(
        visits.flatMap((seen) => seen.texts),
        HIDDEN,
      ),
    ).toEqual([]);
  });

  test('the site’s own pages and the not-found pages', async ({ browser, page }) => {
    const runPaths = new Set(await discoverRunPaths(page));
    const own: Visit[] = [];
    // The landing page is swept with the project page, once it is live.
    for (const path of SITE_PAGES.filter((path) => path !== '/'))
      own.push(await visit(browser, path));
    const missing: Visit[] = [];
    for (const path of NOT_FOUND) missing.push(await visit(browser, path));

    expect(own.map((seen) => seen.status)).toEqual(own.map(() => 200));
    expect(own.map((seen) => seen.heading)).toEqual([
      'This dashboard is tested the same way as the projects it reports on.',
      'What this site records about you',
    ]);
    expect(missing.map((seen) => [seen.path, seen.status])).toEqual(
      missing.map((seen) => [seen.path, 404]),
    );
    // Positive controls: the not-found pages drew their designed answers, RouteServe's kinds
    // naming the project and offering its latest run.
    expect(missing.map((seen) => seen.heading)).toEqual([
      'This run isn’t in RouteServe',
      'This run isn’t in RouteServe',
      'This test isn’t in RouteServe',
      'This test isn’t in RouteServe',
      'No project at this address',
    ]);

    const visits = [...own, ...missing];
    expectLinksSwept(visits, runPaths);
    expect(
      leaksIn(
        visits.flatMap((seen) => seen.texts),
        HIDDEN,
      ),
    ).toEqual([]);
  });

  test('every page as served without scripts, every seeded test’s history included', async ({
    page,
    request,
  }) => {
    const runPaths = await discoverRunPaths(page);
    const pages: [path: string, status: number, shows: string | null][] = [
      ...SITE_PAGES.map((path): [string, number, null] => [path, 200, null]),
      [`/p/${SLUG}`, 200, 'RouteServe'],
      [`/p/${SLUG}?branches=all`, 200, 'RouteServe'],
      [`/p/${SLUG}?branches=all&runs=30`, 200, 'RouteServe'],
      ...runPaths.map((path): [string, number, null] => [path, 200, null]),
      ...TESTS.map(({ key, name }): [string, number, string] => [testPath(key), 200, name]),
      ...NOT_FOUND.map((path): [string, number, null] => [path, 404, null]),
    ];

    // 3 site pages, 3 of the project page, 11 runs, 1,041 tests and 5 not found.
    expect(pages).toHaveLength(1_063);
    const results = await fetchAll(
      request,
      pages.map(([path]) => path),
    );
    const unexpected = pages.flatMap(([path, status, shows], index) => {
      const result = results[index];
      if (result === undefined) return [`${path}: not fetched`];
      if (result.status !== status) return [`${path}: ${String(result.status)}`];
      if (shows !== null && !formsOf(shows).some((form) => result.body.includes(form)))
        return [`${path}: does not show ${shows}`];
      return [];
    });
    // Positive control: every page answered as expected and each test page shows its own test.
    expect(unexpected).toEqual([]);
    expect(results).toHaveLength(pages.length);
    expect(
      leaksIn(
        results.map((result) => result.body),
        HIDDEN,
      ),
    ).toEqual([]);
  });

  test('while the same sweep finds a public project’s failure text, commit and run links', async ({
    browser,
    page,
    request,
  }) => {
    await open(page, '/p/testpulse');
    const href = await page.getByRole('link', { name: 'View this run →' }).getAttribute('href');
    // testpulse's run has 3 tests, so there is no "Load 50 more".
    const seen = await visit(browser, String(href), throughStatusFilter);
    const shown = [
      'expect(received).toBe(expected) // Object.is equality',
      'github.com/bhelco1/testpulse/commit/',
      'github.com/bhelco1/testpulse/actions/runs/36300000001',
    ];
    expect(leaksIn(seen.texts, shown)).toEqual(shown);
    const [served] = await fetchAll(request, [String(href)]);
    expect(leaksIn([String(served?.body)], shown)).toEqual(shown);
  });
});

async function fetchAll(
  request: APIRequestContext,
  paths: readonly string[],
): Promise<{ status: number; body: string }[]> {
  const results: { status: number; body: string }[] = [];
  let next = 0;
  // A few at a time: the server under test is shared with the other e2e worker.
  const worker = async () => {
    while (next < paths.length) {
      const index = next;
      next += 1;
      const response = await request.get(String(paths[index]));
      results[index] = { status: response.status(), body: await response.text() };
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return results;
}
