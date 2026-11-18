import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeClient, type Answer, type Query } from './fake-client.test-support.ts';
import { cacheCalls, resetNextCache } from './next-cache.test-support.ts';
import {
  readHowItsTested,
  readLanding,
  readProjectHead,
  readProjectPage,
  readRunDetail,
  readRunHead,
  readSiteChrome,
  readTestHead,
  readTestHistory,
} from './public-reads.ts';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
vi.mock('next/cache', () => import('./next-cache.test-support.ts'));

// What the public pages and their heads read through the cache (decisions 2026-11-17 and
// 2026-11-18): each read's key is its arguments as plain values, the data version, the UTC day and the build; a run's
// per-test rows are never cached; and what moves with the clock is put back at the exact instant.

const RUN_ID = '0b5a3c1e-6f0e-4d1c-9a55-3c2a1b0f9e77';
const KEY = 'a'.repeat(64);
const AT = new Date('2026-10-05T11:59:42.318Z');
const UNTIL = '2026-10-05T11:59:59.999Z';
const VERSION = '27:2026-10-05T11:58:00.123456+00:00';

const projectRow = {
  id: 'project-1',
  slug: 'ostomate2',
  name: 'Ostomate 2.0',
  tagline: 'Tracker',
  visibility: 'public',
  default_branch: 'main',
  declared_suites: [],
  coverage_floors: {},
  expected_cadence_days: 1,
  description: 'About it.',
  repo_url: 'https://github.com/bhelco1/Ostomate2',
  dev_stack: [],
  test_stack: [],
};

const runRow = (id: string, finishedAt: string, status = 'passed') => ({
  id,
  ci_run_id: '36100000009',
  run_attempt: 1,
  commit_sha: 'c1',
  branch: 'main',
  status,
  passed: 2,
  failed: status === 'failed' ? 1 : 0,
  skipped: 0,
  started_at: finishedAt,
  finished_at: finishedAt,
  source: 'ci',
  event: 'push',
  run_url: null,
  total: 3,
  duration_ms: 26_000,
  results_pruned_at: null,
});

const RUNS = [
  runRow('r0', '2026-10-04T08:00:00+00:00'),
  runRow(RUN_ID, '2026-10-04T09:00:00+00:00', 'failed'),
];

const testRow = {
  id: 'test-1',
  test_key: KEY,
  module: 'composeApp',
  suite: 'HomeViewModelTest',
  name: 'rendersToday',
  layer: 'unit',
  first_seen_at: '2026-09-24T14:05:00+00:00',
  last_seen_at: '2026-10-04T09:00:00+00:00',
};

const resultRow = {
  id: 'res-1',
  test_id: 'test-1',
  status: 'failed',
  duration_ms: 400,
  tests: {
    test_key: KEY,
    module: 'composeApp',
    suite: 'HomeViewModelTest',
    name: 'rendersToday',
    layer: 'unit',
  },
  reports: { run_id: RUN_ID, job: 'test', module: 'composeApp', platform: 'jvm' },
};

let queries: Query[] = [];

const answer = (query: Query): Answer => {
  switch (query.table) {
    case 'reports':
      return query.calls.some(([method]) => method === 'eq')
        ? { data: [] }
        : { data: [{ created_at: '2026-10-05T11:58:00.123456+00:00' }], count: 27 };
    case 'projects_public':
      return { data: [projectRow] };
    case 'runs_public':
      return query.calls.some(([method, column]) => method === 'eq' && column === 'id')
        ? { data: [RUNS[1]] }
        : query.calls.some(([method]) => method === 'limit')
          ? // The latest run and the last report, dated so the project goes stale within AT's minute.
            { data: [runRow(RUN_ID, '2026-10-03T11:59:30+00:00', 'failed')] }
          : { data: RUNS };
    case 'tests':
      return { data: [testRow] };
    case 'results':
      return { data: [resultRow] };
    default:
      return { data: [] };
  }
};

const tables = () => queries.map((query) => query.table);
const keys = () => cacheCalls.map((call) => JSON.parse(call.keyParts[0] ?? '{}') as unknown);
const key = (read: string, args: readonly unknown[]) => ({
  read,
  build: 'unbuilt',
  version: VERSION,
  day: '2026-10-05',
  args,
});

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_unit_test_placeholder');
  resetNextCache();
  const fake = fakeClient(answer);
  queries = fake.queries;
  vi.mocked(createClient).mockReturnValue(
    fake.client as unknown as ReturnType<typeof createClient>,
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(createClient).mockReset();
});

describe('the public reads’ cache keys', () => {
  it.each([
    ['site chrome', () => readSiteChrome(AT), key('site-chrome', [])],
    ['landing', () => readLanding(AT), key('landing', [])],
    ['How it’s tested', () => readHowItsTested(AT), key('how-its-tested', [])],
    ['project head', () => readProjectHead('ostomate2', AT), key('project-head', ['ostomate2'])],
    [
      'run head',
      () => readRunHead('ostomate2', RUN_ID, AT),
      key('run-head', ['ostomate2', RUN_ID]),
    ],
    ['test head', () => readTestHead('ostomate2', KEY, AT), key('test-head', ['ostomate2', KEY])],
    [
      'test history',
      () => readTestHistory('ostomate2', KEY, AT),
      key('test-history', ['ostomate2', KEY]),
    ],
    [
      'run page, all but its per-test rows',
      () => readRunDetail('ostomate2', RUN_ID, AT),
      key('run-shell', ['ostomate2', RUN_ID]),
    ],
  ])('%s', async (_label, read, expected) => {
    await read();

    expect(keys()).toEqual([expected]);
    expect(tables()[0]).toBe('reports');
  });

  it('project page: its branch scope and its run list length as the page clamps it', async () => {
    await readProjectPage('ostomate2', { branches: 'all', runLimit: 5000 }, AT);
    await readProjectPage('ostomate2', {}, AT);

    expect(keys()).toEqual([
      key('project-page', ['ostomate2', 'all', 999]),
      key('project-page', ['ostomate2', 'default', 10]),
    ]);
  });
});

describe('the public reads', () => {
  it('read as of the end of the minute', async () => {
    await readSiteChrome(AT);

    const runQuery = queries.find((query) => query.table === 'runs_public');
    expect(runQuery?.calls).toContainEqual(['lte', 'finished_at', UNTIL]);
  });

  it('give a hit exactly what the miss gave', async () => {
    const miss = await readLanding(AT);
    const hit = await readLanding(AT);

    expect(cacheCalls.map((call) => call.hit)).toEqual([false, true]);
    expect(hit).toStrictEqual(miss);
    expect(hit.projects[0]?.lastReportAt).toBeInstanceOf(Date);
  });

  it('put Red now and the days since the last report back at the exact instant', async () => {
    const at = (instant: string) => new Date(instant);
    const before = await readLanding(at('2026-10-05T11:59:29Z'));
    const after = await readLanding(at('2026-10-05T11:59:31Z'));
    const page = await readProjectPage('ostomate2', {}, at('2026-10-05T11:59:31Z'));
    const self = await readHowItsTested(at('2026-10-05T11:59:31Z'));

    // One entry each: both landings came from the one read of the day.
    expect(cacheCalls.filter((call) => call.hit)).toHaveLength(1);
    // Red since 2026-10-04T09:00Z; last reported 2026-10-03T11:59:30Z, cadence 1 day.
    expect(before.projects[0]?.timeToGreen.stillRed?.elapsedMs).toBe(
      at('2026-10-05T11:59:29Z').getTime() - at('2026-10-04T09:00:00Z').getTime(),
    );
    expect(after.projects[0]?.timeToGreen.stillRed?.elapsedMs).toBe(
      at('2026-10-05T11:59:31Z').getTime() - at('2026-10-04T09:00:00Z').getTime(),
    );
    expect(before.projects[0]?.health.marker).toEqual({ health: 'healthy' });
    expect(after.projects[0]?.health.marker).toEqual({ health: 'stale', days: 2 });
    expect(after.headline.projectsReporting.silent).toEqual([{ slug: 'ostomate2', days: 2 }]);
    expect(page?.summary.health.marker).toEqual({ health: 'stale', days: 2 });
    expect(self.self?.summary.health.marker).toEqual({ health: 'stale', days: 2 });
  });

  it('read a run’s per-test rows live every time, with the cached flaky set', async () => {
    const first = await readRunDetail('ostomate2', RUN_ID, AT);
    const second = await readRunDetail('ostomate2', RUN_ID, AT);

    expect(cacheCalls.map((call) => call.hit)).toEqual([false, true]);
    expect(tables().filter((table) => table === 'results')).toHaveLength(2);
    expect(tables().filter((table) => table === 'rpc:flaky_tests')).toHaveLength(1);
    expect(second).toStrictEqual(first);
    expect(first?.results?.map((row) => [row.testKey, row.status])).toEqual([[KEY, 'failed']]);
  });

  it('answer null for a run that is not there, and read no rows', async () => {
    vi.mocked(createClient).mockReturnValue(
      fakeClient((query) => (query.table === 'runs_public' ? { data: [] } : answer(query)))
        .client as unknown as ReturnType<typeof createClient>,
    );

    await expect(readRunDetail('ostomate2', RUN_ID, AT)).resolves.toBeNull();
  });
});
