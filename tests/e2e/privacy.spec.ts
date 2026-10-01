import { expect, test, type Page } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe.ts';
import { open } from './support/open.ts';

// The privacy page, /privacy (spec section 13.8), against the seed at SEED_NOW. It carries the
// "today" copy of design/pages/Privacy.dc.html (v9 item 3) with Bobby's edits: nothing records a
// visit, no cookie is set, no tracked link exists. The Phase 6 copy, which describes visit
// logging that is not built, must not reach it. Tags route tests to projects
// (playwright.config.ts): @js where scripts run, @no-js where they do not, @visual in the four
// viewport × theme projects inside the Playwright image.

const footer = (page: Page) => page.getByRole('contentinfo');

// A phrase from each block of the mock's "after Phase 6" version: the lede, both summary cards,
// "How a visit is recorded", "The cookie" and "If someone sent you a link".
const PHASE_6 = [
  'Which pages you view and for how long',
  'no third-party analytics',
  'Recorded per page view',
  'A salted hash of your IP address',
  'Never recorded',
  'Device fingerprints',
  'How a visit is recorded',
  'Link previews and mail scanners',
  'The cookie',
  'httpOnly',
  'If someone sent you a link',
  'the site owner can see',
];

test.describe('the privacy page', () => {
  test('answers 200 with its title, eyebrow and heading', async ({ page }) => {
    const response = await open(page, '/privacy');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle('Privacy · testpulse');
    const main = page.getByRole('main');
    await expect(main.locator('[data-part="eyebrow"]')).toHaveText('Privacy');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'What this site records about you',
    );
  });

  test('says what is recorded today: nothing, dated by its copy', async ({ page }) => {
    await open(page, '/privacy');
    const main = page.getByRole('main');
    await expect(main.locator('[data-part="lede"]')).toHaveText(
      'Nothing. There are no accounts, no cookies and no analytics, and this site keeps no record of who visits.',
    );
    const updated = main.locator('[data-part="updated"]');
    await expect(updated).toHaveText('Updated 1 Oct');
    await expect(updated.locator('time')).toHaveAttribute('datetime', '2026-10-01T00:00:00.000Z');
    await expect(updated.locator('time')).toHaveAttribute('title', '1 Oct 2026, 00:00 UTC');
    await expect(main.getByRole('heading', { level: 2 })).toHaveText([
      'What your browser does here',
      'What this site doesn’t do',
      'Live updates',
      'Your theme choice',
      'Hosting',
      'If this changes',
    ]);
    await expect(main).toContainText('Opens one live connection to Supabase Realtime');
    await expect(main).toContainText('with JavaScript off, none is opened.');
    await expect(main).toContainText(
      'Both keep their own server logs, which aren’t described here; see each provider’s privacy policy.',
    );
    await expect(main).toContainText(
      'A later version will log every visit anonymously and count visits to links sent with job applications.',
    );
  });

  test('states nothing of the Phase 6 visit logging, which is not built', async ({ page }) => {
    await open(page, '/privacy');
    const body = page.locator('body');
    for (const phrase of PHASE_6) await expect(body).not.toContainText(phrase);
  });

  // What the copy says of the site, checked in the browser: no cookie after the visit, and
  // nothing in localStorage until the toggle is pressed.
  test('sets no cookie and stores nothing until the toggle', { tag: '@js' }, async ({ page }) => {
    await open(page, '/privacy');
    expect(await page.context().cookies()).toEqual([]);
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  });

  // The design gives the page no live behaviour, as on the run page (section 13.5).
  test('shows neither “Live” nor “Offline”', async ({ page }) => {
    await open(page, '/privacy');
    await expect(page.getByText(/^Live$|Offline/)).toHaveCount(0);
  });

  test('marks its own footer link as the current page, in ink', async ({ page }) => {
    await open(page, '/privacy');
    const link = footer(page).getByRole('link', { name: 'Privacy' });
    await expect(link).toHaveAttribute('aria-current', 'page');
    await expect(link).toHaveAttribute('href', '/privacy');
    const [color, ink] = await link.evaluate((element) => [
      getComputedStyle(element).color,
      getComputedStyle(element).getPropertyValue('--ink'),
    ]);
    const probe = await page.evaluate((value) => {
      const span = document.createElement('span');
      span.style.color = value;
      document.body.append(span);
      const resolved = getComputedStyle(span).color;
      span.remove();
      return resolved;
    }, ink);
    expect(color).toBe(probe);
    await expect(footer(page).getByRole('link', { name: 'Source on GitHub' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  test('dates the last report in the footer', async ({ page }) => {
    await open(page, '/privacy');
    await expect(footer(page)).toContainText('Last report received 2 h ago');
  });

  test('does not scroll sideways', async ({ page }) => {
    await open(page, '/privacy');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });

  test('has no serious or critical axe violations', { tag: '@js' }, async ({ page }) => {
    await open(page, '/privacy');
    await expectNoSeriousAxeViolations(page);
  });

  test('follows the system theme', { tag: '@js' }, async ({ page }) => {
    await open(page, '/privacy');
    const { colorScheme } = test.info().project.use;
    await expect(page.locator('html')).toHaveAttribute('data-theme', String(colorScheme));
  });

  test(
    'Tab reaches every control, each with a visible focus ring',
    { tag: '@js' },
    async ({ page }) => {
      await open(page, '/privacy');
      const reached: string[] = [];
      for (let step = 0; step < 20; step += 1) {
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
      expect(reached).toEqual([
        'Skip to content',
        'testpulse',
        'Projects',
        'How it’s tested',
        expect.stringMatching(/^Switch to (light|dark) theme$/),
        'Privacy',
        'Source on GitHub',
      ]);
    },
  );

  test('renders without running scripts', { tag: '@no-js' }, async ({ page }) => {
    await open(page, '/privacy');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'What this site records about you',
    );
    await expect(page.locator('[data-part="lede"]')).toContainText('Nothing.');
    await expect(page.getByRole('heading', { name: 'If this changes' })).toBeVisible();
    await expect(footer(page).getByRole('link', { name: 'Privacy' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('matches its visual snapshot', { tag: '@visual' }, async ({ page }) => {
    await open(page, '/privacy');
    await expect(page).toHaveScreenshot('privacy.png', { fullPage: true });
  });
});

// Spec section 14: the footer links to /privacy from every page. The footer is one component, so
// a page of each loader's kind stands for the rest; following the link opens this page.
test.describe('the footer’s Privacy link', () => {
  test('resolves from every kind of page', async ({ page }) => {
    for (const path of ['/', '/p/routeserve']) {
      await open(page, path);
      const href = await footer(page).getByRole('link', { name: 'Privacy' }).getAttribute('href');
      expect(href, path).toBe('/privacy');
      const response = await page.request.get(String(href));
      expect(response.status(), path).toBe(200);
    }
  });

  test('opens the privacy page from the landing page', { tag: '@js' }, async ({ page }) => {
    await open(page, '/');
    await footer(page).getByRole('link', { name: 'Privacy' }).click();
    await expect(page).toHaveURL('/privacy');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'What this site records about you',
    );
  });
});
