import { expect, test, type Page } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe.ts';
import { open } from './support/open.ts';

// Any address no route answers (design/components.md "NotFound (page)", page kind, design v17
// item 19), against the seed at SEED_NOW. It is the site's own page with the header and footer,
// never Next.js's default, so its footer carries the Privacy link (spec section 17, Phase 6
// criterion 5). Tags route tests to projects (playwright.config.ts): @js where scripts run,
// @no-js where they do not, @visual in the four viewport × theme projects inside the image.

const PATH = '/no-such-page';
const footer = (page: Page) => page.getByRole('contentinfo');

test.describe('an address no page answers', () => {
  test('is served with HTTP 404 and the Not found title', async ({ page }) => {
    const response = await open(page, PATH);
    expect(response?.status()).toBe(404);
    await expect(page).toHaveTitle('Not found · testpulse');
  });

  test('says nothing is here, shows the path and offers a way on', async ({ page }) => {
    await open(page, PATH);
    const main = page.getByRole('main');
    await expect(main.locator('[data-part="eyebrow"]')).toHaveText('404 · Not found');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nothing at this address');
    await expect(main.locator('[data-part="path"]')).toHaveText(PATH);
    await expect(main.locator('p')).toHaveText(
      'There’s no page here. The link may be mistyped, or the page may have moved. Every project’s results start from the overview.',
    );
    await expect(main.getByRole('link')).toHaveText(['Go to overview', 'How it’s tested']);
    await expect(main.getByRole('link', { name: 'Go to overview' })).toHaveAttribute('href', '/');
    await expect(main.getByRole('link', { name: 'How it’s tested' })).toHaveAttribute(
      'href',
      '/how-its-tested',
    );
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveCount(0);
  });

  test('has the site’s header, and a footer whose Privacy link opens', async ({ page }) => {
    await open(page, PATH);
    await expect(page.getByRole('banner').getByRole('link', { name: 'testpulse' })).toHaveAttribute(
      'href',
      '/',
    );
    const privacy = footer(page).getByRole('link', { name: 'Privacy' });
    await expect(privacy).toHaveAttribute('href', '/privacy');
    await expect(privacy).not.toHaveAttribute('aria-current');
    await expect(footer(page).getByRole('link', { name: 'Source on GitHub' })).toBeVisible();
    await expect(footer(page)).toContainText('Last report received 2 h ago');
    const response = await page.request.get('/privacy');
    expect(response.status()).toBe(200);
  });

  test('answers any depth of unknown address the same way', async ({ page }) => {
    const response = await open(page, '/no/such/page');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nothing at this address');
    await expect(page.locator('[data-part="path"]')).toHaveText('/no/such/page');
  });

  test('does not scroll sideways', async ({ page }) => {
    await open(page, PATH);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });

  test('has no serious or critical axe violations', { tag: '@js' }, async ({ page }) => {
    await open(page, PATH);
    await expectNoSeriousAxeViolations(page);
  });

  test('renders without running scripts', { tag: '@no-js' }, async ({ page }) => {
    const response = await open(page, PATH);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nothing at this address');
    await expect(footer(page).getByRole('link', { name: 'Privacy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
  });

  test('matches its visual snapshot', { tag: '@visual' }, async ({ page }) => {
    await open(page, PATH);
    await expect(page).toHaveScreenshot('not-found.png', { fullPage: true });
  });
});
