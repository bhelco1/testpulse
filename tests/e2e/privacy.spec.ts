import { expect, test, type Page } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe.ts';
import { open } from './support/open.ts';

// The privacy page, /privacy (spec section 13.8), against the seed at SEED_NOW. Every sentence in
// design/pages/Privacy.dc.html below its heading describes the visit logging of section 14, which
// is Phase 6 and not built: nothing records a page view, no cookie is set, no tracked link
// exists. Those claims would be false today, so the page draws the eyebrow and heading only, and
// these tests hold that none of the held-back copy reaches it. Tags route tests to projects
// (playwright.config.ts): @js where scripts run, @no-js where they do not, @visual in the four
// viewport × theme projects inside the Playwright image.

const footer = (page: Page) => page.getByRole('contentinfo');

// A phrase from each held-back block of the mock: the lede, both summary cards, "How a visit is
// recorded", "The cookie" and "If someone sent you a link".
const HELD_BACK = [
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

  test('states nothing about visit logging, which is not built', async ({ page }) => {
    await open(page, '/privacy');
    await expect(page.getByRole('main')).toHaveText('PrivacyWhat this site records about you');
    const body = page.locator('body');
    for (const phrase of HELD_BACK) await expect(body).not.toContainText(phrase);
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
