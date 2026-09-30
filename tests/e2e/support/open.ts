import { expect, type Page } from '@playwright/test';

import { SEED_NOW } from '../../../lib/seed/plan.ts';

/**
 * Opens a page as the seed sees it. The server renders every relative time from the fixed clock;
 * the browser's clock is fixed to the same instant so nothing on the client can drift from it.
 */
export async function open(page: Page, path: string) {
  await page.clock.setFixedTime(new Date(SEED_NOW));
  return page.goto(path);
}

// Realtime answers within a second once it is up (the global setup waits for that); this allows
// for a rejoin after a refused first attempt, which the Supabase client makes after a backoff.
const LIVE_TIMEOUT_MS = 15_000;

/** Waits until the page's live feed is listening: the header's LiveIndicator reads "Live". */
export async function expectLive(page: Page) {
  await expect(page.getByRole('banner').getByText('Live', { exact: true })).toBeVisible({
    timeout: LIVE_TIMEOUT_MS,
  });
}
