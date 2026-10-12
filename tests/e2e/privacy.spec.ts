import { expect, test, type Page } from '@playwright/test';

import { SESSION_COOKIE } from '../../lib/visits/session.ts';
import { expectNoSeriousAxeViolations } from './support/axe.ts';
import { open } from './support/open.ts';

// The privacy page, /privacy (spec section 13.8), against the seed at SEED_NOW. It carries the
// "after Phase 6" copy of design/pages/Privacy.dc.html, which ships with visit logging and
// tracked links: what a page view records, the one session cookie, and what a tracked link
// does; Live updates, Your theme choice and Hosting stay, Hosting with Bobby's edit. The "today"
// copy, which said nothing is recorded, must not reach it. Tags route tests to projects
// (playwright.config.ts): @js where scripts run, @no-js where they do not, @visual in the four
// viewport × theme projects inside the Playwright image.

const footer = (page: Page) => page.getByRole('contentinfo');

// A phrase from each block of the mock's "today" version: the lede, both summary cards and
// "If this changes".
const TODAY = [
  'Nothing. There are no accounts, no cookies',
  'keeps no record of who visits',
  'What your browser does here',
  'Opens one live connection to Supabase Realtime for new results',
  'What this site doesn’t do',
  'Log page views or visits',
  'Load analytics or ad scripts',
  'If this changes',
  'A later version will',
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

  test('says what a visit records, dated by its copy', async ({ page }) => {
    await open(page, '/privacy');
    const main = page.getByRole('main');
    await expect(main.locator('[data-part="lede"]')).toHaveText(
      'Which pages you view and for how long. There are no accounts and no third-party analytics, and this site stores a hash of your IP address, never the address itself.',
    );
    const updated = main.locator('[data-part="updated"]');
    await expect(updated).toHaveText('Updated 12 Oct');
    await expect(updated.locator('time')).toHaveAttribute('datetime', '2026-10-12T00:00:00.000Z');
    await expect(updated.locator('time')).toHaveAttribute('title', '12 Oct 2026, 00:00 UTC');
    await expect(main.getByRole('heading', { level: 2 })).toHaveText([
      'Recorded per page view',
      'Never stored by this site',
      'How a visit is recorded',
      'The cookie',
      'If someone sent you a link',
      'Live updates',
      'Your theme choice',
      'Hosting',
    ]);
    await expect(main).toContainText('A salted hash of your IP address');
    await expect(main).toContainText('Device fingerprints');
    await expect(main).toContainText('Visit records are kept for 365 days, then deleted.');
    await expect(main).toContainText(
      'It is marked httpOnly, so scripts on the page can’t read it, and it is never shared with another site.',
    );
    await expect(main).toContainText('so the code doesn’t stay in your address bar.');
    // The summary cards' items, each after its decorative dash, then the list that ends "If
    // someone sent you a link".
    await expect(main.locator('[data-part="summary"] li')).toHaveText(
      [
        'A random session identifier',
        'The page address',
        'Time spent on the page',
        'Browser, bot, or link preview',
        'A salted hash of your IP address',
        'Your IP address itself',
        'Your name or email',
        'Device fingerprints',
        'Anything sent to third-party analytics or ad networks',
      ].map((item) => `—${item}`),
    );
    await expect(main.locator('section:not([data-part="summary"]) li')).toHaveText([
      'when it was first and last opened',
      'how many separate sessions used it',
      'how many different IP hashes opened it, which shows whether it was passed around',
      'which pages were viewed, and time spent on each project',
    ]);
    await expect(main).toContainText('with JavaScript off, none is opened.');
    await expect(main).toContainText(
      'Both keep their own server logs, which aren’t described here; see each provider’s privacy policy.',
    );
  });

  test('no longer carries the copy from before visits were logged', async ({ page }) => {
    await open(page, '/privacy');
    const body = page.locator('body');
    for (const phrase of TODAY) await expect(body).not.toContainText(phrase);
  });

  // What the copy says of the site, checked in the browser: once the beacon has recorded the
  // view, one cookie, httpOnly, holding a random identifier and ending with the browser; and
  // nothing in localStorage until the toggle is pressed.
  test(
    'sets one httpOnly session cookie and stores nothing until the toggle',
    { tag: '@js' },
    async ({ page }) => {
      const recorded = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/visits' &&
          response.request().method() === 'POST',
      );
      await open(page, '/privacy');
      await recorded;
      const cookies = await page.context().cookies();
      expect(cookies).toEqual([
        expect.objectContaining({
          name: SESSION_COOKIE,
          value: expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
          ),
          path: '/',
          httpOnly: true,
          sameSite: 'Lax',
          expires: -1,
        }),
      ]);
      expect(await page.evaluate(() => document.cookie)).toBe('');
      expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
    },
  );

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
    await expect(page.locator('[data-part="lede"]')).toContainText(
      'Which pages you view and for how long.',
    );
    await expect(page.getByRole('heading', { name: 'If someone sent you a link' })).toBeVisible();
    // Without scripts there is no beacon, so nothing is recorded and no cookie is set.
    expect(await page.context().cookies()).toEqual([]);
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
