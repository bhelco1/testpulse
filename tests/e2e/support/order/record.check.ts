import { setTimeout as sleep } from 'node:timers/promises';

import { test } from '@playwright/test';

// One test per project of the e2e suite's graph (./playwright.config.ts). It takes long enough
// that projects running side by side overlap in time, and fails in the project named by
// TESTPULSE_ORDER_FAIL, so a run shows what a failure there does to the other projects.
test('runs', async () => {
  await sleep(100);
  if (test.info().project.name === process.env.TESTPULSE_ORDER_FAIL) {
    throw new Error(`deliberate failure in ${test.info().project.name}`);
  }
});
