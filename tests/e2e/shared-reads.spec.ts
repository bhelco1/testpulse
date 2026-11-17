import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, request, test, type APIRequestContext } from '@playwright/test';

import { FIXED_NOW_VAR } from '../../lib/clock.ts';
import { SEED_NOW } from '../../lib/seed/plan.ts';
import { ingestLiveRun, registerProjects, removeProjects, SHARED_SLUG } from './support/ingest.ts';

// The public read cache, end to end (decision 2026-11-17): when a report arrives and many visitors
// load a page at once, the page's database reads run once, not once per visitor; only the data
// version, one row of reports, is read by every view. Against the production build and local
// Supabase, through a server of its own whose preload logs every request it sends to Supabase
// (tests/e2e/support/count-reads.ts), the database reads one load costs are counted first; a new
// report then makes every cached entry cold, and 20 concurrent loads of / and of /p/testpulse
// may cost at most twice that one load's reads. It runs in the `live` project, one file at a
// time, since it writes a project of its own (playwright.config.ts), which it deletes afterwards.

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

async function startServer(): Promise<NonNullable<typeof server>> {
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
