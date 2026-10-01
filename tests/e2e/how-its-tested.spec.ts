import { expect, test, type Page } from '@playwright/test';

import { planSeed, SEED_NOW } from '../../lib/seed/plan.ts';
import { expectNoSeriousAxeViolations } from './support/axe.ts';
import { open } from './support/open.ts';

// /how-its-tested (spec section 13; docs/spec.md 13.7) against the seed (lib/seed/plan.ts) at
// SEED_NOW, where testpulse has reported once: its Playwright fixture, 1 passed, 1 failed and 1
// skipped, 13 days before SEED_NOW. Production has no testpulse project until Phase 7; that state
// ("Not reporting yet") is proven in lib/pages/how-its-tested.test.ts and
// components/SelfReport/SelfReport.test.tsx, since this harness cannot remove a seeded project
// without changing the pages other specs check. Tags route tests to projects
// (playwright.config.ts): @js where scripts run, @no-js where they do not, @visual in the four
// viewport × theme projects inside the Playwright image.

const PATH = '/how-its-tested';
const REPO = 'https://github.com/bhelco1/testpulse';

const PLAN = planSeed(new Date(SEED_NOW));
const [TESTPULSE_SHA] = PLAN.runs
  .filter((run) => run.slug === 'testpulse')
  .map((run) => run.commitSha.slice(0, 7));

const section = (page: Page, name: string) => page.getByRole('region', { name });
const selfResults = (page: Page) => section(page, 'testpulse’s own results');

test.describe('the page', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, PATH);
  });

  test('is titled and marked current in the header', async ({ page }) => {
    await expect(page).toHaveTitle('How it’s tested · testpulse');
    const nav = page.getByRole('navigation', { name: 'Site' });
    await expect(nav.getByRole('link', { name: 'How it’s tested' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('opens with the heading, the lede and the repository links', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'This dashboard is tested the same way as the projects it reports on.',
    );
    // Design v9 item 4: the hero no longer says testpulse reports itself.
    await expect(page.locator('[data-part="lede"]')).toHaveText(
      'A test dashboard that isn’t tested is just a claim. testpulse is built test-first, and its own CI runs every suite on every pull request. From Phase 7 it will report its results here alongside everything else.',
    );
    const main = page.getByRole('main');
    await expect(main.getByRole('link', { name: 'Source on GitHub' })).toHaveAttribute(
      'href',
      REPO,
    );
    await expect(main.getByRole('link', { name: 'Read the specification' })).toHaveAttribute(
      'href',
      `${REPO}/blob/main/docs/spec.md`,
    );
  });

  test('lists the five principles, 01 ending with a recorded manual check', async ({ page }) => {
    const principles = section(page, 'Principles');
    await expect(principles).toContainText(
      'Five rules from the specification. Each one exists because breaking it has cost real time on a real project.',
    );
    await expect(principles.getByRole('heading', { level: 3 })).toHaveText([
      'Test-first',
      'Real fixtures',
      'Normalize on the server',
      'Never fail the caller’s build',
      'No swallowed failures',
    ]);
    await expect(principles.getByRole('listitem')).toHaveCount(5);
    // Some criteria are manual checks (section 17); Bobby's edit of 2026-09-30.
    await expect(principles.getByRole('listitem').first()).toContainText(
      'Every phase starts with failing tests written from its acceptance criteria. A phase is done when each criterion has a passing automated test or a recorded manual check.',
    );
  });

  test('says what runs, layer by layer, with nothing from Phase 6', async ({ page }) => {
    const strategy = section(page, 'What runs, and what it covers');
    await expect(strategy).toContainText(
      'Parsers are tested against result files captured from Ostomate2 and RouteServe, not hand-written samples. Integration tests run against a local Supabase, including the row-level security that hides private projects from the public.',
    );
    const table = strategy.getByRole('table', { name: 'What runs, by layer' });
    await expect(table.getByRole('columnheader')).toHaveText(['Layer', 'Tool', 'Scope']);
    await expect(table.locator('[data-part="layer"] td:first-child')).toHaveText([
      'Unit',
      'Contract',
      'Component',
      'Integration',
      'E2E',
      'Accessibility',
      'Visual',
      'Leak sweep',
    ]);
    await expect(table).toContainText(
      'a contrast check of the design’s token pairs in both themes. Counted with E2E.',
    );
    await expect(table).toContainText('Walks every page that can show a private project');
    await expect(table).toContainText('Runs in the unit job; counted as Unit.');
    await expect(strategy.locator('[data-part="fact"]')).toHaveText([
      'Coverage floor90% linesEnforced by Vitest thresholds in the unit job. Below it, CI fails.',
      'On every pull requestLint, typecheck, unit, integration, E2E',
      'Failure maskingNoneNo || true, no continue-on-error on test steps.',
    ]);
    for (const phase6 of ['bot classification', 'prune', 'tracked', 'admin', 'alert']) {
      await expect(strategy).not.toContainText(phase6);
    }
  });

  test('tells the two incidents as the pages show them today', async ({ page }) => {
    const silence = section(page, 'Why it watches for silence');
    await expect(silence.getByRole('heading', { level: 3 })).toHaveText([
      'CI was silently dead for 11 days',
      'E2E reported green without ever passing',
    ]);
    await expect(silence).toContainText(
      'Two incidents from Ostomate2’s post-mortems shaped how results are shown.',
    );
    await expect(silence.locator('[data-part="now"]')).toHaveText([
      'Now: each project has an expected cadence. When a project goes quiet past it, its card and project page say so, for example “No report in 12 days”.',
      'Now: a run with zero tests executed is marked Empty and shown as a problem, never as a pass.',
    ]);
    await expect(silence).not.toContainText('daily check');
    await expect(silence).not.toContainText('raises an alert');
  });

  test('shows testpulse’s latest run from the seed', async ({ page }) => {
    const self = selfResults(page);
    await expect(self).toContainText(
      'From Phase 7, testpulse’s CI posts its JUnit and coverage output to this site as the project testpulse, the same way the other projects do.',
    );
    const run = self.getByRole('article');
    await expect(run.getByText('Failed', { exact: true })).toBeVisible();
    // 13 UTC days back reads in weeks (design v7 item 16), as on the landing card.
    await expect(run.locator('[data-part="when"]')).toHaveText('1 week ago');
    await expect(run.locator('[data-part="meta"]')).toHaveText(
      `1 week ago·main·${String(TESTPULSE_SHA)}`,
    );
    await expect(run.locator('[data-part="total"]')).toHaveText('3');
    // 238 + 4 ms, the fixture's two testsuite times, rounds to 0 s.
    await expect(run.locator('[data-part="sub"]')).toHaveText('tests ·1 failed·1 skipped ·0 s');
    await expect(run.locator('[data-part="row"]')).toHaveText(['E2E3100%']);
    await expect(run.getByRole('link', { name: 'Full project page →' })).toHaveAttribute(
      'href',
      '/p/testpulse',
    );
    await expect(run.locator('[data-part="pyramid-note"]')).toHaveText(
      'Only spec §8 layers are counted. Accessibility, visual and leak-sweep checks run inside the Playwright suite and count as E2E; the reporter contract tests run in the unit job and count as Unit.',
    );
    // Only the designed reporting state: no sample tags, no coverage card without data, and
    // build progress only in the not-reporting state, as the mock draws it.
    await expect(self).not.toContainText('Not reporting yet');
    await expect(self).not.toContainText('Build progress');
    await expect(page.getByRole('main')).not.toContainText('SAMPLE');
    await expect(self).not.toContainText('Coverage against the floor');
  });

  test('dates the last report in the footer', async ({ page }) => {
    await expect(page.getByRole('contentinfo')).toContainText('Last report received 2 h ago');
  });

  test('does not scroll sideways', async ({ page }) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });

  // The design gives the page no live behaviour (13.7), as the run and test pages.
  test('shows neither “Live” nor “Offline”', async ({ page }) => {
    await expect(page.getByText(/^Live$|Offline/)).toHaveCount(0);
  });
});

test('answers 200', async ({ page }) => {
  const response = await open(page, PATH);
  expect(response?.status()).toBe(200);
});

test('no serious or critical axe violations', { tag: '@js' }, async ({ page }) => {
  await open(page, PATH);
  await expectNoSeriousAxeViolations(page);
});

test('the page follows the system theme', { tag: '@js' }, async ({ page }) => {
  await open(page, PATH);
  const { colorScheme } = test.info().project.use;
  await expect(page.locator('html')).toHaveAttribute('data-theme', String(colorScheme));
});

test('the page renders without running scripts', { tag: '@no-js' }, async ({ page }) => {
  await open(page, PATH);
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(section(page, 'Principles').getByRole('listitem')).toHaveCount(5);
  await expect(selfResults(page).locator('[data-part="total"]')).toHaveText('3');
});

test(
  'Tab reaches every control, each with a visible focus ring',
  { tag: '@js' },
  async ({ page }) => {
    await open(page, PATH);
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
    for (const name of [
      'Skip to content',
      'How it’s tested',
      'Source on GitHub',
      'Read the specification',
      'What runs, by layer',
      'Full project page →',
      'Privacy',
    ]) {
      expect(reached, `Tab reaches ${name}`).toContain(name);
    }
  },
);

test.describe('links to the page resolve', () => {
  test('from the header', { tag: '@js' }, async ({ page }) => {
    await open(page, '/p/ostomate2');
    await page
      .getByRole('navigation', { name: 'Site' })
      .getByRole('link', { name: 'How it’s tested' })
      .click();
    await expect(page).toHaveURL(PATH);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'This dashboard is tested the same way as the projects it reports on.',
    );
  });

  test('from the landing page’s About button', { tag: '@js' }, async ({ page }) => {
    await open(page, '/');
    await page
      .getByRole('region', { name: 'About this site' })
      .getByRole('link', { name: 'How testpulse is tested →' })
      .click();
    await expect(page).toHaveURL(PATH);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'This dashboard is tested the same way as the projects it reports on.',
    );
  });

  test('without scripts too', { tag: '@no-js' }, async ({ page }) => {
    await open(page, '/');
    await page.getByRole('link', { name: 'How testpulse is tested →' }).click();
    await expect(page).toHaveURL(PATH);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

test('matches its visual snapshot', { tag: '@visual' }, async ({ page }) => {
  await open(page, PATH);
  await expect(page).toHaveScreenshot('how-its-tested.png', { fullPage: true });
});
