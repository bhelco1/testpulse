import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe.ts';

// Tags route each test to projects (playwright.config.ts): untagged tests run in every browser
// project, @js only where scripts run, @no-js only where they do not, @visual only in the four
// viewport × theme projects inside the Playwright image.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('home page renders the testpulse heading', async ({ page }) => {
  await expect(page).toHaveTitle('testpulse');
  await expect(page.getByRole('heading', { level: 1, name: 'testpulse' })).toBeVisible();
});

// @js because axe cannot run with scripts disabled: it schedules its work with timers, and
// Chromium fires no timers then, so the check never finishes. The markup it checks here is the
// same server-rendered HTML the no-JS project gets.
test('home page has no serious or critical axe violations', { tag: '@js' }, async ({ page }) => {
  await expectNoSeriousAxeViolations(page);
});

test('home page applies the theme the system prefers', { tag: '@js' }, async ({ page }) => {
  const { colorScheme } = test.info().project.use;
  expect(colorScheme === 'light' || colorScheme === 'dark', 'project sets a theme').toBe(true);

  await expect(page.locator('html')).toHaveAttribute('data-theme', String(colorScheme));
});

test('home page renders without running scripts', { tag: '@no-js' }, async ({ page }) => {
  // The inline theme script in <head> sets data-theme before first paint whenever scripts run
  // (the @js test above sees it), so its absence shows none ran; the tokens' dark default applies.
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
});

test('home page matches its visual snapshot', { tag: '@visual' }, async ({ page }) => {
  await expect(page).toHaveScreenshot('home.png', { fullPage: true });
});
