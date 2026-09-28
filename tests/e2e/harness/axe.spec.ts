import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from '../support/axe.ts';

// Negative controls for the accessibility helper every page spec uses. The pages are injected
// with setContent, so nothing is added to the app.

test('fails on a critical violation and names it', async ({ page }) => {
  // image-alt is a critical rule in axe-core.
  await page.setContent(
    '<!doctype html><html lang="en"><head><title>control</title></head>' +
      '<body><main><h1>control</h1><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></main>' +
      '</body></html>',
  );

  await expect(expectNoSeriousAxeViolations(page)).rejects.toThrow(/image-alt \(critical\)/);
});

test('fails on a serious violation and names it', async ({ page }) => {
  // Grey on grey text fails color-contrast, a serious rule in axe-core.
  await page.setContent(
    '<!doctype html><html lang="en"><head><title>control</title></head>' +
      '<body><main><h1>control</h1>' +
      '<p style="color:#777;background:#888">Too little contrast to read.</p></main></body></html>',
  );

  await expect(expectNoSeriousAxeViolations(page)).rejects.toThrow(/color-contrast \(serious\)/);
});

test('lets moderate violations through, as the spec sets the bar at serious', async ({ page }) => {
  // No main landmark: axe reports region and landmark-one-main, both moderate.
  await page.setContent(
    '<!doctype html><html lang="en"><head><title>control</title></head>' +
      '<body><h1>control</h1><p>Text outside any landmark.</p></body></html>',
  );

  const results = await expectNoSeriousAxeViolations(page);

  const moderate = results.violations.filter((violation) => violation.impact === 'moderate');
  expect(moderate.map((violation) => violation.id)).toEqual(
    expect.arrayContaining(['landmark-one-main', 'region']),
  );
});
