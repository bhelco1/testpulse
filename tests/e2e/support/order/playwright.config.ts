import path from 'node:path';

import { defineConfig } from '@playwright/test';

import suite from '../../../../playwright.config.ts';

// The e2e suite's projects with the dependencies and teardowns playwright.config.ts gives them,
// each running one trivial test (none where the suite's project has none), so
// tests/e2e/harness/order.spec.ts can show how Playwright schedules the real graph in seconds.
const output = process.env.TESTPULSE_ORDER_OUTPUT ?? 'test-results/order';

export default defineConfig({
  testDir: '.',
  outputDir: output,
  workers: 2,
  retries: 0,
  reporter: [['json', { outputFile: path.join(output, 'report.json') }]],
  projects: (suite.projects ?? []).map(({ name, dependencies, teardown, testMatch }) => ({
    name,
    dependencies,
    teardown,
    testMatch: Array.isArray(testMatch) && testMatch.length === 0 ? [] : 'record.check.ts',
  })),
});
