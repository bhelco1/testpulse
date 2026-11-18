import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import { expect, request, test, type APIRequestContext } from '@playwright/test';

import { FIXED_NOW_VAR } from '../../lib/clock.ts';
import { SEED_NOW } from '../../lib/seed/plan.ts';
import {
  admin,
  ingestLiveRun,
  registerProjects,
  removeProjects,
  SHARED_SLUG,
} from './support/ingest.ts';

// The public read cache, end to end (decision 2026-11-17): when a report arrives and many visitors
// load a page at once, the page's database reads run once, not once per visitor; only the data
// version, one row of reports, is read by every view. Against the production build and local
// Supabase, through a server of its own whose preload logs every request it sends to Supabase
// (tests/e2e/support/count-reads.ts), the database reads one load costs are counted first; a new
// report then makes every cached entry cold, and 20 concurrent loads of / and of /p/testpulse
// may cost at most twice that one load's reads. Then, with no new report, an entry older than
// its refresh time is served as it was while it refreshes in the background (decision
// 2026-11-18). It runs in the `live` project, one file at a time, since it writes a project of
// its own (playwright.config.ts), which it deletes afterwards.

test.describe.configure({ mode: 'serial' });

const PORT = 3108;
const BASE_URL = `http://127.0.0.1:${String(PORT)}`;
const VISITORS = 20;
const PAGES = ['/', '/p/testpulse'] as const;
// lib/queries/data-version.ts, as PostgREST receives it.
const PROBE = 'GET /rest/v1/reports?select=created_at&order=created_at.desc&limit=1';

const dir = mkdtempSync(join(tmpdir(), 'testpulse-shared-reads-'));
const log = join(dir, 'reads.log');

let server: { readonly stop: () => Promise<void> } | undefined;
let api: APIRequestContext | undefined;

async function startServer(
  extraEnv: Readonly<Record<string, string>> = {},
): Promise<NonNullable<typeof server>> {
  writeFileSync(log, '');
  const child = spawn(
    'node_modules/.bin/next',
    ['start', '--hostname', '127.0.0.1', '--port', String(PORT)],
    {
      env: {
        ...process.env,
        [FIXED_NOW_VAR]: SEED_NOW,
        // Pages render as anon, as on the server under test.
        SUPABASE_SECRET_KEY: '',
        TESTPULSE_E2E_READ_LOG: log,
        NODE_OPTIONS: '--import ./tests/e2e/support/count-reads.ts',
        ...extraEnv,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
  const exited = once(child, 'exit');
  await expect
    .poll(() => output, { timeout: 30_000 })
    .toContain(`clock fixed by ${FIXED_NOW_VAR} at ${SEED_NOW}`);
  return {
    stop: async () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        await exited;
      }
    },
  };
}

interface Reads {
  readonly probes: number;
  /** Every other request to Supabase, by method and path: the query names rows that change. */
  readonly reads: ReadonlyMap<string, number>;
  readonly total: number;
}

function takeReads(): Reads {
  const lines = readFileSync(log, 'utf8').split('\n').filter(Boolean);
  writeFileSync(log, '');
  const reads = new Map<string, number>();
  for (const line of lines.filter((each) => each !== PROBE)) {
    const [path = line] = line.split('?');
    reads.set(path, (reads.get(path) ?? 0) + 1);
  }
  return {
    probes: lines.filter((line) => line === PROBE).length,
    reads,
    total: lines.length - lines.filter((line) => line === PROBE).length,
  };
}

async function load(path: string, times: number): Promise<void> {
  if (api === undefined) throw new Error('no request context');
  const context = api;
  const responses = await Promise.all(Array.from({ length: times }, () => context.get(path)));
  for (const response of responses) {
    expect(response.status(), path).toBe(200);
    expect(await response.text(), path).not.toContain('couldn’t be loaded');
  }
}

// Runs placed before SEED_NOW, as the live feed's are; each one is a new report.
const run = (label: string, time: string) => ({
  ciRunId: `shared-${label}`,
  commitSha: `5ba7ed${label.padStart(34, '0')}`,
  runUrl: `https://github.com/bhelco1/testpulse/actions/runs/${label}`,
  startedAt: `2026-10-05T${time}.000Z`,
});

const baseline = new Map<string, Reads>();

test.beforeAll(async () => {
  await registerProjects([SHARED_SLUG]);
  server = await startServer();
  api = await request.newContext({ baseURL: BASE_URL });
});

test.afterAll(async () => {
  await api?.dispose();
  await server?.stop();
  await removeProjects([SHARED_SLUG]);
  rmSync(dir, { recursive: true, force: true });
});

test('one load of each page after a report: its reads and one data version', async () => {
  await ingestLiveRun(SHARED_SLUG, run('1', '11:30:00'));
  takeReads();

  for (const path of PAGES) {
    await load(path, 1);
    const reads = takeReads();
    test.info().annotations.push({
      type: 'reads',
      description: `${path}: 1 load after a report, ${String(reads.total)} reads, ${String(reads.probes)} version probe`,
    });
    expect(reads.probes, path).toBe(1);
    expect(reads.total, path).toBeGreaterThan(0);
    baseline.set(path, reads);
  }
});

test(`${String(VISITORS)} concurrent loads of each page after a report share its reads`, async () => {
  await ingestLiveRun(SHARED_SLUG, run('2', '11:31:00'));
  takeReads();

  for (const path of PAGES) {
    const one = baseline.get(path);
    if (one === undefined) throw new Error(`no baseline for ${path}`);

    await load(path, VISITORS);
    const reads = takeReads();
    test.info().annotations.push({
      type: 'reads',
      description: `${path}: ${String(VISITORS)} concurrent loads after a report, ${String(reads.total)} reads (one load: ${String(one.total)}), ${String(reads.probes)} version probes`,
    });

    // Every view reads the version, and nothing else per view.
    expect(reads.probes, path).toBe(VISITORS);
    // The new report made every entry cold, so the reads ran, and ran about once, not 20 times.
    expect(reads.total, path).toBeGreaterThan(0);
    expect(reads.total, path).toBeLessThanOrEqual(2 * one.total);
    for (const [read, count] of reads.reads) {
      expect(count, read).toBeLessThanOrEqual(2 * (one.reads.get(read) ?? 0));
    }
  }
});

// Next.js's file cache, which every `next start` of this build shares: one file per entry, its
// age read from the file's modified time when a server has it in memory no longer.
const FETCH_CACHE = join(process.cwd(), '.next', 'cache', 'fetch-cache');
const SHARED_NAME = 'Shared public';
const RENAMED = 'Common public';
// Past the 60-second refresh time of lib/queries/cache.ts, and short of the 300 seconds it was.
const AGE_SECONDS = 90;
// Every read a view waits on is held this long on the restarted server (count-reads.ts); the
// data version's probe is not.
const SLOW_READS_MS = 3_000;

async function rename(name: string): Promise<void> {
  const { error } = await admin().from('projects').update({ name }).eq('slug', SHARED_SLUG);
  if (error) throw new Error(`rename ${SHARED_SLUG}: ${error.code} ${error.message}`);
}

/** The cache files that hold the spec project’s name, written since `since` (by default, ever). */
function entriesNaming(name: string, since = 0): string[] {
  return readdirSync(FETCH_CACHE)
    .map((file) => join(FETCH_CACHE, file))
    .filter((file) => statSync(file).mtimeMs >= since && readFileSync(file, 'utf8').includes(name));
}

async function view(path: string): Promise<{ readonly html: string; readonly ms: number }> {
  if (api === undefined) throw new Error('no request context');
  const started = performance.now();
  const response = await api.get(path);
  const html = await response.text();
  const ms = performance.now() - started;
  expect(response.status(), path).toBe(200);
  expect(html, path).not.toContain('couldn’t be loaded');
  return { html, ms };
}

// A rename changes a project's row and no report, so the data version and every key stay as they
// were: only the entries' age can bring the new name in, as for projects:sync in production. The
// entries are aged by setting their files' modified time back past the refresh time and starting
// a new server, which has nothing in memory and so reads them, and their age, from the file, as a
// new instance would; waiting out the refresh time would do the same in a minute more. Overlapping
// views of the stale entries then share one refresh: a stale hit returns at once, so only the
// refresh's own flight (lib/queries/cache.ts) keeps each view from starting another.
test('an entry past its refresh time is served as it was, and refreshed once for a later view', async () => {
  test.setTimeout(120_000);
  const path = `/p/${SHARED_SLUG}`;
  // A new report makes every entry of the page cold, so the first view's reads are all of them.
  await ingestLiveRun(SHARED_SLUG, run('3', '11:32:00'));
  const since = Date.now() - 1_000;
  takeReads();

  const first = await view(path);
  const one = takeReads();
  expect(first.html).toContain(SHARED_NAME);
  expect(one.total).toBeGreaterThan(0);
  await expect.poll(() => entriesNaming(SHARED_NAME, since).length).toBeGreaterThan(0);

  await rename(RENAMED);
  const fresh = await view(path);
  // Younger than its refresh time, the entry is served as it is.
  expect(fresh.html).toContain(SHARED_NAME);
  expect(fresh.html).not.toContain(RENAMED);

  await server?.stop();
  const aged = new Date(Date.now() - AGE_SECONDS * 1_000);
  const entries = entriesNaming(SHARED_NAME);
  for (const file of entries) utimesSync(file, aged, aged);
  server = await startServer({
    TESTPULSE_E2E_SLOW_READS_MS: String(SLOW_READS_MS),
    TESTPULSE_E2E_FAST_READ: PROBE,
  });

  const stale = await view(path);
  test.info().annotations.push({
    type: 'reads',
    description: `${path}: ${String(entries.length)} cache files naming the project aged ${String(AGE_SECONDS)} s; the stale view took ${String(Math.round(stale.ms))} ms with every read held ${String(SLOW_READS_MS)} ms`,
  });
  // Served as it was, and without waiting on a read: a refresh in the request would have held it.
  expect(stale.html).toContain(SHARED_NAME);
  expect(stale.html).not.toContain(RENAMED);
  expect(stale.ms).toBeLessThan(SLOW_READS_MS);

  // While that refresh's reads are held, more views find the entries stale, all at hit speed.
  const overlapping = await Promise.all(Array.from({ length: VISITORS }, () => view(path)));
  for (const each of overlapping) {
    expect(each.html).toContain(SHARED_NAME);
    expect(each.ms).toBeLessThan(SLOW_READS_MS);
  }

  // The refresh ran in the background, so a later view has the new name.
  await expect
    .poll(async () => (await view(path)).html.includes(RENAMED), { timeout: 30_000 })
    .toBe(true);

  // One refresh in all: no read ran more often than the cold view ran it.
  const refreshed = takeReads();
  test.info().annotations.push({
    type: 'reads',
    description: `${path}: ${String(VISITORS + 1)} stale views, ${String(refreshed.total)} refresh reads (one cold view: ${String(one.total)})`,
  });
  expect(refreshed.total).toBeGreaterThan(0);
  for (const [read, count] of refreshed.reads) {
    expect(count, read).toBeLessThanOrEqual(one.reads.get(read) ?? 0);
  }
});
