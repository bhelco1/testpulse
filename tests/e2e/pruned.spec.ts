import { createHash } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

import { pruneUntilDone } from '../../lib/jobs/daily.ts';
import { SEED_NOW } from '../../lib/seed/plan.ts';
import { expectNoSeriousAxeViolations } from './support/axe.ts';
import {
  admin,
  ingestLiveRun,
  PRUNED_SLUG,
  registerProjects,
  removeProjects,
  type LiveRun,
} from './support/ingest.ts';
import { open } from './support/open.ts';

// Spec section 17, Phase 6: "Run detail page shows the pruned-results notice for a run with
// results_pruned_at set", through the real prune (prune_expired, called by the daily job's
// pruneUntilDone at SEED_NOW). Runs in the `live` project, one file at a time and after every
// other project (playwright.config.ts), in a project of its own that it deletes before and
// after, so no seeded page, figure or snapshot changes. Its six runs, from testpulse's captured
// Playwright failure, finished in March 2026, more than 180 days before SEED_NOW: the oldest is
// not among the latest 5, so the prune removes its results and marks it; the other five keep
// theirs. No seeded run is that old with results, so the prune removes nothing else.

test.describe.configure({ mode: 'serial' });

const sha = (label: string) => createHash('sha1').update(`testpulse pruned ${label}`).digest('hex');
const run = (day: number): LiveRun => ({
  ciRunId: `pruned-${day}`,
  commitSha: sha(String(day)),
  runUrl: `https://github.com/bhelco1/testpulse/actions/runs/${day}`,
  startedAt: `2026-03-0${day}T10:00:00.000Z`,
});
const RUNS = [1, 2, 3, 4, 5, 6].map(run);

let oldest = '';
let kept = '';

const tiles = (page: Page) => page.locator('[data-part="tile"]');
const prunedTitle = (page: Page) => page.locator('[data-part="pruned-title"]');

test.beforeAll(async () => {
  await registerProjects([PRUNED_SLUG]);
  const ids: string[] = [];
  for (const each of RUNS) ids.push((await ingestLiveRun(PRUNED_SLUG, each)).runId);
  [oldest = '', kept = ''] = ids;

  const outcome = await pruneUntilDone(admin(), new Date(SEED_NOW), {
    log: { info: () => undefined, error: () => undefined },
  });
  // Exactly the oldest run's 3 results and 1 failure: nothing seeded was touched.
  expect(outcome).toMatchObject({
    complete: true,
    error: null,
    removed: {
      results: 3,
      result_failures: 1,
      visits: 0,
      rate_limit_buckets: 0,
      runs_marked_pruned: 1,
    },
  });
  expect(outcome.byProject.map((project) => project.slug)).toEqual([PRUNED_SLUG]);
  const marked = await admin()
    .from('runs')
    .select('id, results_pruned_at')
    .not('results_pruned_at', 'is', null);
  expect(marked.data?.map((row) => row.id)).toEqual([oldest]);
});

test.afterAll(async () => {
  await removeProjects([PRUNED_SLUG]);
});

test('a pruned run shows the retention notice in place of the results table', async ({ page }) => {
  const response = await open(page, `/p/${PRUNED_SLUG}/runs/${oldest}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  await expect(prunedTitle(page)).toHaveText('Per-test results retained for 180 days');
  await expect(page.locator('[data-part="pruned-text"]')).toContainText(
    'Summary totals are permanent: 3 tests, 1 passed, 1 failed.',
  );
  // results_pruned_at is SEED_NOW, the instant the prune was given.
  const prunedOn = page.locator('[data-part="pruned-on"]');
  await expect(prunedOn).toContainText('Pruned on');
  await expect(prunedOn.locator('time')).toHaveAttribute(
    'datetime',
    new Date(SEED_NOW).toISOString(),
  );

  // No results table, filters or rows, and no failed-run banner: its failing test is gone.
  await expect(page.locator('[data-part="test"]')).toHaveCount(0);
  await expect(page.getByRole('radiogroup', { name: 'Status' })).toHaveCount(0);
  await expect(page.locator('[data-part="banner"]')).toHaveCount(0);
  // The tiles read the run's executions, which are permanent.
  await expect(tiles(page)).toHaveText([
    'Tests3',
    'Passed1',
    'Failed1',
    'Skipped1',
    /^Duration\d+ s$/,
  ]);
  await expectNoSeriousAxeViolations(page);
});

test('a run among the latest 5 keeps its results, however old', async ({ page }) => {
  await open(page, `/p/${PRUNED_SLUG}/runs/${kept}`);
  await expect(prunedTitle(page)).toHaveCount(0);
  await expect(page.locator('[data-part="test"]')).toHaveCount(3);
  await expect(page.locator('[data-part="banner"]')).toHaveCount(1);
});
