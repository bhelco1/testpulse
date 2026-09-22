import { expect, test } from '@playwright/test';

test('home page renders the testpulse heading', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('testpulse');
  await expect(page.getByRole('heading', { level: 1, name: 'testpulse' })).toBeVisible();
});
