import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  argsOf,
  fakeClient,
  firstArgs,
  type Answer,
  type Query,
} from './fake-client.test-support.ts';
import { loadTestHistory } from './test-history.ts';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

// The test history loader's queries and how it assembles their rows (spec section 13,
// /p/[slug]/tests/[testKey]; design/data-map.md, Test history). The history itself is tested in
// lib/stats/test-history.test.ts; the real seed read as anon in lib/seed/seed.int.test.ts.

const NOW = new Date('2026-10-05T12:00:00Z');
// tests.test_key is the SHA-256 of module, suite and name in lowercase hex (5.4), and is the
// URL segment as stored.
const KEY = 'a'.repeat(64);

const projectRow = {
  id: 'project-1',
  slug: 'ostomate2',
  name: 'Ostomate 2.0',
  tagline: 'Tracker',
  visibility: 'public',
  default_branch: 'main',
  declared_suites: [],
  coverage_floors: {},
  expected_cadence_days: 8,
  description: 'About it.',
  repo_url: null,
  dev_stack: [],
  test_stack: [],
};

const testRow = {
  id: 'test-1',
  test_key: KEY,
  module: 'composeApp',
  suite: 'com.ostomate.app.HomeViewModelTest',
  name: 'rendersToday',
  layer: 'unit',
  first_seen_at: '2026-09-24T14:05:00+00:00',
  last_seen_at: '2026-10-05T09:26:17.747+00:00',
};

const runRow = (id: string, finishedAt: string, overrides: Record<string, unknown> = {}) => ({
  id,
  ci_run_id: id,
  run_attempt: 1,
  commit_sha: `sha-${id}`,
  branch: 'main',
  status: 'passed',
  passed: 2,
  failed: 0,
  skipped: 0,
  started_at: finishedAt,
  finished_at: finishedAt,
  source: 'ci',
  event: 'push',
  run_url: null,
  total: 2,
  duration_ms: 20_000,
  results_pruned_at: null,
  ...overrides,
});

const resultRow = (id: string, runId: string, platform: string, status: string, ms: number) => ({
  id,
  status,
  duration_ms: ms,
  reports: {
    run_id: runId,
    job: platform === 'jvm' ? 'android' : 'ios',
    module: 'composeApp',
    platform,
  },
});

interface Tables {
  readonly tests?: readonly unknown[];
  readonly results?: readonly unknown[];
  readonly runs?: readonly unknown[];
  /** The project's latest default-branch CI runs, read for the duration chart. */
  readonly recent?: readonly unknown[];
}

// The duration chart's query asks for the last 30 runs; the timeline's asks for runs by id.
const isRecent = (query: Query) =>
  query.table === 'runs_public' && query.calls.some(([name]) => name === 'limit');

const answering =
  (tables: Tables) =>
  (query: Query): Answer => {
    switch (query.table) {
      case 'projects_public':
        return { data: [projectRow] };
      case 'tests':
        return { data: tables.tests ?? [testRow] };
      case 'results':
        return {
          data: tables.results ?? [
            resultRow('x1', 'r1', 'jvm', 'passed', 410),
            resultRow('x2', 'r1', 'ios-sim', 'failed', 630),
            resultRow('x3', 'r2', 'jvm', 'passed', 400),
          ],
        };
      case 'runs_public':
        if (isRecent(query)) return { data: tables.recent ?? [] };
        return {
          data: tables.runs ?? [
            runRow('r2', '2026-10-05T09:26:17.747+00:00'),
            runRow('r1', '2026-10-04T10:00:00+00:00', {
              branch: 'fix-today-count',
              event: 'pull_request',
              status: 'failed',
            }),
          ],
        };
      default:
        return { error: { code: 'X', message: `unexpected table ${query.table}` } };
    }
  };

describe('loadTestHistory', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(createClient).mockReset();
  });

  it.each(['abc', 'A'.repeat(64), `${KEY}0`, 'g'.repeat(64), ''])(
    'is null for %j, which is not a test key, without looking it up',
    async (key) => {
      const { client, queries } = fakeClient(answering({}));

      expect(await loadTestHistory('ostomate2', key, client, NOW)).toBeNull();
      expect(queries.map((query) => query.table)).toEqual(['projects_public']);
    },
  );

  it('is null for a key no test of this project has', async () => {
    const { client, queries } = fakeClient(answering({ tests: [] }));

    expect(await loadTestHistory('ostomate2', KEY, client, NOW)).toBeNull();
    const tests = queries.find((query) => query.table === 'tests') as Query;
    expect(argsOf(tests, 'eq')).toEqual([
      ['project_id', 'project-1'],
      ['test_key', KEY],
    ]);
  });

  it('is null for an unknown project', async () => {
    const { client } = fakeClient((query) =>
      query.table === 'projects_public' ? { data: [] } : answering({})(query),
    );

    expect(await loadTestHistory('nope', KEY, client, NOW)).toBeNull();
  });

  it('carries the test and its results by run, oldest first, with each run’s title', async () => {
    const { client, queries } = fakeClient(answering({}));

    const page = await loadTestHistory('ostomate2', KEY, client, NOW);

    expect(page?.test).toEqual({
      testKey: KEY,
      module: 'composeApp',
      suite: 'com.ostomate.app.HomeViewModelTest',
      name: 'rendersToday',
      layer: 'unit',
      firstSeenAt: new Date('2026-09-24T14:05:00Z'),
      lastSeenAt: new Date('2026-10-05T09:26:17.747Z'),
    });
    expect(page?.history.platforms).toEqual(['jvm', 'ios-sim']);
    expect(
      page?.history.runs.map((run) => [
        run.id,
        run.title,
        run.results.map((cell) => [cell.platform, cell.status, cell.durationMs]),
      ]),
    ).toEqual([
      [
        'r1',
        'Pull request from fix-today-count',
        [
          ['jvm', 'passed', 410],
          ['ios-sim', 'failed', 630],
        ],
      ],
      ['r2', 'Push to main', [['jvm', 'passed', 400]]],
    ]);
    // Duration reads the default branch only: the pull request run has no point.
    expect(page?.history.duration.points.map((point) => point.durationsMs)).toEqual([[400]]);
    expect(page?.history.flaky).toBe(false);

    const results = queries.find((query) => query.table === 'results') as Query;
    expect(firstArgs(results, 'select')).toEqual([
      'id, status, duration_ms, reports!inner(run_id, job, module, platform)',
    ]);
    expect(argsOf(results, 'eq')).toEqual([['test_id', 'test-1']]);
    const runs = queries.find(
      (query) => query.table === 'runs_public' && !isRecent(query),
    ) as Query;
    expect(argsOf(runs, 'in')).toEqual([['id', ['r1', 'r2']]]);
    expect(argsOf(runs, 'eq')).toEqual([['project_id', 'project-1']]);
  });

  // Section 11 (the 2026-09-29 row Bobby confirmed on 2026-09-30): the duration chart covers the
  // project's last 30 default-branch CI runs, however old, in the run list's order; one of them
  // in which the test has no result is a gap, not a reason to reach further back.
  it('reads the last 30 default-branch CI runs up to now for the duration chart', async () => {
    const { client, queries } = fakeClient(
      answering({
        recent: [
          runRow('r3', '2026-10-05T11:00:00+00:00'),
          runRow('r2', '2026-10-05T09:26:17.747+00:00'),
          runRow('r0', '2026-05-01T10:00:00+00:00'),
        ],
      }),
    );

    const page = await loadTestHistory('ostomate2', KEY, client, NOW);

    const recent = queries.find((query) => isRecent(query)) as Query;
    expect(recent.calls).toEqual([
      ['select', expect.stringContaining('finished_at')],
      ['eq', 'project_id', 'project-1'],
      ['eq', 'branch', 'main'],
      ['eq', 'source', 'ci'],
      ['lte', 'finished_at', '2026-10-05T12:00:00.000Z'],
      ['order', 'finished_at', { ascending: false }],
      ['order', 'started_at', { ascending: false }],
      ['order', 'ci_run_id', { ascending: false }],
      ['order', 'run_attempt', { ascending: false }],
      ['limit', 30],
    ]);
    // r0 is five months old and still among the last 30; r3 has no result for the test: a gap.
    // The pull request r1 is on the timeline only.
    expect(page?.history.duration.points.map((point) => [point.runId, point.durationsMs])).toEqual([
      ['r0', [null]],
      ['r2', [400]],
      ['r3', [null]],
    ]);
    expect(page?.history.runs.map((run) => run.id)).toEqual(['r1', 'r2']);
  });

  it('has an empty history for a test whose results were all pruned', async () => {
    const { client, queries } = fakeClient(answering({ results: [] }));

    const page = await loadTestHistory('ostomate2', KEY, client, NOW);

    expect(page?.history.runs).toEqual([]);
    expect(queries.some((query) => query.table === 'runs_public')).toBe(false);
  });

  it('reports a database error with its code', async () => {
    const { client } = fakeClient((query) =>
      query.table === 'tests'
        ? { error: { code: '42501', message: 'permission denied' } }
        : answering({})(query),
    );

    await expect(loadTestHistory('ostomate2', KEY, client, NOW)).rejects.toThrow(
      'look up the test: 42501 permission denied',
    );
  });

  it('refuses a result row it does not recognise rather than casting it', async () => {
    const { client } = fakeClient(answering({ results: [{ id: 'x1', status: 'green' }] }));

    await expect(loadTestHistory('ostomate2', KEY, client, NOW)).rejects.toThrow(
      'load the test results returned an unexpected row',
    );
  });

  it('builds the publishable-key client and reads now from lib/clock when given neither', async () => {
    const { client } = fakeClient(
      answering({ runs: [runRow('r1', '2026-10-05T12:00:00.001+00:00')] }),
    );
    vi.mocked(createClient).mockReturnValue(client as unknown as ReturnType<typeof createClient>);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_unit_test_placeholder');
    vi.stubEnv('TESTPULSE_FIXED_NOW', '2026-10-05T12:00:00.000Z');

    const page = await loadTestHistory('ostomate2', KEY);

    expect(vi.mocked(createClient).mock.calls[0]?.[1]).toBe('sb_publishable_unit_test_placeholder');
    // The one run finished 1 ms after the fixed now, so the timeline leaves it out.
    expect(page?.history.runs).toEqual([]);
  });
});
