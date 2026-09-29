import type { Page } from '@playwright/test';

import { SEED_NOW } from '../../../lib/seed/plan.ts';

/**
 * Opens a page as the seed sees it. The server renders every relative time from the fixed clock;
 * the browser's clock is fixed to the same instant so nothing on the client can drift from it.
 */
export async function open(page: Page, path: string) {
  await page.clock.setFixedTime(new Date(SEED_NOW));
  return page.goto(path);
}
