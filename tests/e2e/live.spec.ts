import { createHash } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe.ts';
import {
  admin,
  ingestLiveRun,
  registerLiveProjects,
  removeLiveProjects,
  type LiveRun,
} from './support/ingest.ts';
import { capture, FAILING, formsOf, HIDDEN, leaksIn } from './support/leaks.ts';
import { expectLive, open } from './support/open.ts';

// The live feed (spec sections 13, 13.2 and 13.3; section 17, Phase 5: "A new report appears in
// the landing page feed without reload", against local Supabase realtime). Runs in the `live`
// project, after every other project (playwright.config.ts): it writes reports while pages are
// open, through tests/e2e/support/ingest.ts, into two projects of its own that it deletes again,
// so the seeded pages the other specs check are as the seed left them. Each run is placed a few
// minutes before SEED_NOW, so it is the newest on the landing page and the order is fixed.

test.describe.configure({ mode: 'serial' });

const at = (time: string) => `2026-10-05T${time}.000Z`;
const sha = (label: string) => createHash('sha1').update(`testpulse live ${label}`).digest('hex');
const liveRun = (label: string, time: string, repo = 'testpulse'): LiveRun => ({
  ciRunId: `live-${label}`,
  commitSha: sha(label),
  runUrl: `https://github.com/bhelco1/${repo}/actions/runs/${label}`,
  startedAt: at(time),
});

// On the page before it opens: the baseline the "New" chip is measured against.
const PUBLIC_FIRST = liveRun('public-1', '11:50:00');
// Arrive while a page is open.
const PUBLIC_LANDING = liveRun('public-2', '11:55:00');
const PRIVATE_LANDING = liveRun('private-1', '11:57:00', 'routeserve');
const PUBLIC_PROJECT = liveRun('public-3', '11:58:00');

const sha7 = (run: LiveRun) => run.commitSha.slice(0, 7);
const feedRows = (page: Page) => page.getByRole('log').getByRole('link');
const newChip = '[data-part="new"]';
// Realtime delivery, the 2 s refresh debounce and the server render, with room to spare.
const ARRIVAL = { timeout: 15_000 };

// A document that was reloaded loses anything set on its window.
const markDocument = (page: Page) =>
  page.evaluate(() => Object.assign(window, { tpSameDocument: true }));
const sameDocument = (page: Page) => page.evaluate(() => 'tpSameDocument' in window);

test.beforeAll(async () => {
  await registerLiveProjects();
  await ingestLiveRun('live-public', PUBLIC_FIRST);
});

test.afterAll(async () => {
  await removeLiveProjects();
});

test('a new report appears in the landing feed without reload, marked New', async ({ page }) => {
  await open(page, '/');
  await expectLive(page);
  await expect(page.locator('[data-part="live-note"]')).toHaveText('Updates as reports arrive');
  await expect(feedRows(page).first()).toContainText(sha7(PUBLIC_FIRST));
  await expect(page.locator(newChip)).toHaveCount(0);
  await markDocument(page);

  await ingestLiveRun('live-public', PUBLIC_LANDING);

  const rows = feedRows(page);
  await expect(rows.first()).toContainText(sha7(PUBLIC_LANDING), ARRIVAL);
  await expect(rows.first()).toContainText('Live public·main·');
  await expect(rows.first().locator(newChip)).toHaveText('New');
  // The rows that were there stay, below it and not new; the feed keeps three.
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText(sha7(PUBLIC_FIRST));
  await expect(rows.nth(1).locator(newChip)).toHaveCount(0);
  await expect(rows.nth(2).locator(newChip)).toHaveCount(0);
  // The whole page was re-rendered on the server: the project's card shows the new run too.
  const card = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { level: 3, name: 'Live public' }) });
  await expect(card.locator('[data-part="sha"]')).toHaveText(sha7(PUBLIC_LANDING));
  expect(await sameDocument(page)).toBe(true);
  await expectLive(page);
  await expectNoSeriousAxeViolations(page);
});

// Spec section 9 and section 17, Phase 5. What anon receives over Realtime is the reports row;
// the check covers every WebSocket frame, sent and received, while a private project's failing
// report arrives, as well as the HTML and every response of the refresh it causes.
test('a private report arriving live leaks nothing, in any frame or response', async ({ page }) => {
  let arrived: { runId: string; reportId: string } | undefined;
  const { html, texts } = await capture(page, '/', async (current) => {
    await expectLive(current);
    arrived = await ingestLiveRun('live-private', PRIVATE_LANDING);
    const row = feedRows(current).first();
    await expect(row).toContainText(sha7(PRIVATE_LANDING), ARRIVAL);
    await expect(row).toContainText('Private repository');
    await expect(row.locator(newChip)).toHaveText('New');
  });
  if (arrived === undefined) throw new Error('the private report was not written');
  const { runId, reportId } = arrived;
  const hidden = [...HIDDEN, PRIVATE_LANDING.commitSha, PRIVATE_LANDING.runUrl];

  // Positive controls. The database holds the hidden values for this run, read with the secret
  // key, so their absence below is row-level security and the views, not a missing write.
  const stored = await admin().from('runs').select('commit_sha, run_url').eq('id', runId).single();
  expect(stored.data).toEqual({
    commit_sha: PRIVATE_LANDING.commitSha,
    run_url: PRIVATE_LANDING.runUrl,
  });
  const failures = await admin()
    .from('result_failures')
    .select('message, results!inner(report_id)')
    .eq('results.report_id', reportId);
  expect(failures.data?.map((row) => row.message)).toEqual(
    FAILING.map((result) => result.failure?.message),
  );
  // The capture saw the report's own INSERT frame, and the refreshed page shows the run.
  const frame = realtimeRecord(texts, reportId);
  expect(frame.table).toBe('reports');
  expect(frame.record.run_id).toBe(runId);
  // Exactly the reports columns (spec 5.3), none of them hidden by section 9.
  expect(Object.keys(frame.record).sort()).toEqual([
    'created_at',
    'duration_ms',
    'failed',
    'finished_at',
    'format',
    'id',
    'job',
    'module',
    'passed',
    'platform',
    'received_at',
    'run_id',
    'skipped',
    'started_at',
    'total',
  ]);
  expect(html).toContain(sha7(PRIVATE_LANDING));
  // The checker would find each planted value in a frame, in each form it can take.
  for (const value of [PRIVATE_LANDING.commitSha, PRIVATE_LANDING.runUrl]) {
    for (const form of formsOf(value)) {
      expect(leaksIn([`${frame.raw.slice(0, -1)},"x":"${form}"]`], hidden)).toContain(value);
    }
  }

  expect(leaksIn(texts, hidden)).toEqual([]);
});

// Design v8 item 18 and v9 item 12 (decision 2026-10-01): a private run's failure heads show,
// "{platform} · {status} · {time}" with the bare platform key, since section 9 hides only the text.
// No seeded run fails on two platforms, so this one is written: the captured failure on "node" and
// again on "node-24", in one run older than the feed's three, so the landing pages stay as above.
const PRIVATE_TWO_PLATFORMS = liveRun('private-2', '11:40:00', 'routeserve');

test('a private run failing on two platforms shows each head, and no failure text', async ({
  page,
}) => {
  await ingestLiveRun('live-private', PRIVATE_TWO_PLATFORMS);
  const { runId } = await ingestLiveRun('live-private', PRIVATE_TWO_PLATFORMS, {
    job: 'test-next',
    platform: 'node-24',
  });
  const { html, texts } = await capture(page, `/p/live-private/runs/${runId}`);
  const hidden = [...HIDDEN, PRIVATE_TWO_PLATFORMS.commitSha, PRIVATE_TWO_PLATFORMS.runUrl];

  // Positive controls: the heads are there, the notice once after them, and the database holds
  // the text the page leaves out, read with the secret key.
  const failing = page.locator('[data-part="test"]').first();
  await expect(failing.locator('[data-part="failure-head"]')).toHaveText([
    /^node · Failed · \d+\.\d\d s$/,
    /^node-24 · Failed · \d+\.\d\d s$/,
  ]);
  await expect(failing.locator('[data-part="private-notice"]')).toHaveCount(1);
  expect(html).toContain('Details hidden: private repository');
  // Both platforms failed, so there is no mismatch sentence.
  await expect(page.locator('[data-part="banner"] [data-part="body"]')).toHaveText(
    'In packages/shared, Unit layer. This repository is private, so failure messages and stack traces are hidden.',
  );
  const failures = await admin()
    .from('result_failures')
    .select('message, results!inner(reports!inner(run_id))')
    .eq('results.reports.run_id', runId);
  expect(failures.data?.length).toBe(2 * FAILING.length);

  // Negative: no failure text, stack trace line, full SHA, run URL or repository link.
  await expect(failing.locator('[data-part="message"], pre')).toHaveCount(0);
  expect(leaksIn(texts, hidden)).toEqual([]);
  await expectNoSeriousAxeViolations(page);
});

test('a new run appears in the project page’s run list without reload', async ({ page }) => {
  await open(page, '/p/live-public');
  await expectLive(page);
  const note = page.locator('[data-part="live-note"]');
  await expect(note).toHaveText('Updates as reports arrive');
  const rows = feedRows(page);
  await expect(rows).toHaveCount(2);
  await markDocument(page);

  await ingestLiveRun('live-public', PUBLIC_PROJECT);

  await expect(rows).toHaveCount(3, ARRIVAL);
  await expect(rows.first()).toContainText(`main·${sha7(PUBLIC_PROJECT)}`);
  await expect(rows.first().locator(newChip)).toHaveText('New');
  await expect(rows.nth(1)).toContainText(sha7(PUBLIC_LANDING));
  await expect(rows.nth(1).locator(newChip)).toHaveCount(0);
  expect(await sameDocument(page)).toBe(true);
  await expectNoSeriousAxeViolations(page);
});

// The postgres_changes record in the text frame that carries the given report, as Realtime sends
// it: [join_ref, ref, topic, event, {ids, data: {table, record, …}}].
function realtimeRecord(texts: readonly string[], reportId: string) {
  for (const raw of texts) {
    if (!raw.startsWith('[') || !raw.includes(reportId)) continue;
    const message: unknown = JSON.parse(raw);
    if (!Array.isArray(message) || message[3] !== 'postgres_changes') continue;
    const data: unknown = (message[4] as { data?: unknown } | undefined)?.data;
    if (typeof data !== 'object' || data === null || !('record' in data) || !('table' in data)) {
      continue;
    }
    const record = data.record as Record<string, unknown>;
    if (record.id === reportId) return { raw, table: data.table, record };
  }
  throw new Error(`no postgres_changes frame for report ${reportId} was captured`);
}

// The connection's other states. Offline: the header reads "Offline · reconnecting", the note
// dates the page's data at the render instant, SEED_NOW, in UTC, and the rows stay.
async function expectOffline(page: Page) {
  const header = page.getByRole('banner');
  await expect(header.getByText('Offline · reconnecting', { exact: true })).toBeVisible(ARRIVAL);
  await expect(header.getByText('Live', { exact: true })).toHaveCount(0);
  const note = page.locator('[data-part="live-note"]');
  await expect(note).toHaveText('Offline. Showing runs as of 12:00 UTC; reconnecting');
  await expect(note.locator('time')).toHaveAttribute('datetime', '2026-10-05T12:00:00.000Z');
  await expect(note.locator('time')).toHaveAttribute('title', '5 Oct 2026, 12:00 UTC');
  await expect(feedRows(page).first()).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  await expectNoSeriousAxeViolations(page);
}

const REALTIME_SOCKET = /\/realtime\/v1\/websocket/;

// Errors the page logs, so going offline is seen to be quiet. Next.js's prefetches of pages not
// built yet (the run page, How it's tested) answer 404 and are left out: they are not the feed's.
function consoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.includes('_rsc=')) {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test.describe('offline', () => {
  test('when the socket cannot stay open, on the landing page', async ({ page }) => {
    const errors = consoleErrors(page);
    await page.routeWebSocket(REALTIME_SOCKET, (socket) => socket.close());
    await open(page, '/');
    await expectOffline(page);
    expect(errors).toEqual([]);
  });

  // Production until the Realtime migration is applied to the hosted database: the socket opens
  // and Realtime refuses the binding for a table it does not publish. Played here by asking for
  // runs, which is unpublished, in place of reports.
  test('when Realtime refuses the subscription, on the project page', async ({ page }) => {
    const errors = consoleErrors(page);
    await page.routeWebSocket(REALTIME_SOCKET, (socket) => {
      const server = socket.connectToServer();
      socket.onMessage((message) =>
        server.send(
          typeof message === 'string'
            ? message.replace('"table":"reports"', '"table":"runs"')
            : message,
        ),
      );
    });
    await open(page, '/p/live-public');
    await expectOffline(page);
    expect(errors).toEqual([]);
  });

  // The Supabase client reconnects by itself, with backoff; sockets are refused until the page
  // has been seen offline, so the offline state cannot pass before it is checked.
  test('and live again when the socket reconnects', async ({ page }) => {
    let refusing = true;
    let connections = 0;
    await page.routeWebSocket(REALTIME_SOCKET, (socket) => {
      connections += 1;
      if (refusing) socket.close();
      else socket.connectToServer();
    });
    await open(page, '/');
    await expectOffline(page);
    refusing = false;

    await expectLive(page);
    await expect(page.locator('[data-part="live-note"]')).toHaveText('Updates as reports arrive');
    expect(connections).toBeGreaterThan(1);
  });
});
