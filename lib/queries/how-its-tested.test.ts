import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  argsOf,
  fakeClient,
  rpcArgs,
  type Answer,
  type Query,
} from './fake-client.test-support.ts';
import { loadHowItsTested, SELF_SLUG } from './how-its-tested.ts';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

// The /how-its-tested loader's queries (spec section 13; design/data-map.md, How it's tested).
// The summary itself is lib/stats/summary.ts, tested beside it; the real seed read as anon is in
// lib/seed/seed.int.test.ts.

const NOW = new Date('2026-10-05T12:00:00Z');

const projectRow = {
  id: 'project-tp',
  slug: 'testpulse',
  name: 'testpulse',
  tagline: 'Dashboard',
  visibility: 'public',
  default_branch: 'main',
  declared_suites: [],
  coverage_floors: {},
  expected_cadence_days: 8,
  description: 'About it.',
  repo_url: 'https://github.com/bhelco1/testpulse',
  dev_stack: [],
  test_stack: [],
};

const runRow = (id: string, finishedAt: string, overrides: Record<string, unknown> = {}) => ({
  id,
  ci_run_id: id,
  run_attempt: 1,
  commit_sha: `sha-${id}`,
  branch: 'main',
  status: 'failed',
  passed: 1,
  failed: 1,
  skipped: 1,
  started_at: finishedAt,
  finished_at: finishedAt,
  source: 'ci',
  event: 'push',
  run_url: null,
  total: 3,
  duration_ms: 242,
  results_pruned_at: null,
  ...overrides,
});

// A row of run_test_tallies: one run's distinct tests of one layer and combined status.
const tally = (runId: string, status: string, tests: number, layer = 'e2e') => ({
  run_id: runId,
  layer,
  status,
  tests,
});

const coverageRow = (
  id: string,
  runId: string,
  module: string,
  covered: number,
  total: number,
) => ({
  id,
  module,
  lines_covered: covered,
  lines_total: total,
  lines_pct: null,
  reports: { run_id: runId },
});

interface Tables {
  readonly projects?: readonly unknown[];
  readonly runs?: readonly unknown[];
  readonly tallies?: readonly unknown[];
  readonly coverage?: readonly unknown[];
}

const isLastReportQuery = (query: Query) =>
  query.table === 'runs_public' && argsOf(query, 'limit').length > 0;

const answering =
  (tables: Tables) =>
  (query: Query): Answer => {
    switch (query.table) {
      case 'projects_public':
        return { data: tables.projects ?? [] };
      case 'runs_public':
        if (isLastReportQuery(query)) {
          const runs = (tables.runs ?? []) as { finished_at: string }[];
          return { data: runs.slice(-1).map(({ finished_at }) => ({ finished_at })) };
        }
        return { data: tables.runs ?? [] };
      case 'rpc:run_test_tallies':
        return { data: tables.tallies ?? [] };
      case 'coverage':
        return { data: tables.coverage ?? [] };
      default:
        return { error: { code: 'X', message: `unexpected table ${query.table}` } };
    }
  };

describe('loadHowItsTested', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(createClient).mockReset();
  });

  it('answers no project, with no further query, when testpulse is not registered', async () => {
    // As in production before 2026-10-07: the page must still render.
    const { client, queries } = fakeClient(answering({ projects: [] }));

    await expect(loadHowItsTested(client, NOW)).resolves.toEqual({ self: null });
    expect(queries.map((query) => query.table)).toEqual(['projects_public']);
    expect(argsOf(queries[0] as Query, 'eq')).toEqual([['slug', SELF_SLUG]]);
  });

  it('reads the latest default-branch CI run, its tests and its duration', async () => {
    const { client, queries } = fakeClient(
      answering({
        projects: [projectRow],
        runs: [runRow('r1', '2026-09-22T04:37:33.884+00:00')],
        tallies: [tally('r1', 'failed', 1), tally('r1', 'passed', 1), tally('r1', 'skipped', 1)],
      }),
    );

    const { self } = await loadHowItsTested(client, NOW);

    // The latest run's tests are counted in the database (run_test_tallies).
    const counted = queries.filter((query) => query.table === 'rpc:run_test_tallies');
    expect(counted.map(rpcArgs)).toEqual([{ p_run_ids: ['r1'] }]);
    expect(self?.latestDurationMs).toBe(242);
    expect(self?.summary.latestRun).toMatchObject({
      id: 'r1',
      status: 'failed',
      branch: 'main',
      commitSha: 'sha-r1',
      passed: 1,
      failed: 1,
      skipped: 1,
    });
    expect(self?.summary.totalTests).toBe(3);
    expect(self?.summary.layers).toEqual({ e2e: 3 });
  });

  // Design v12 item 1 (decided by Bobby, 2026-10-07): the results card counts distinct tests per
  // layer, Unit and Component apart. A test reported twice (two platforms) counts once, which the
  // database's tallies already hold: t-e2e on two platforms is one e2e test.
  it('counts distinct tests per layer, unit and component apart', async () => {
    const { client } = fakeClient(
      answering({
        projects: [projectRow],
        runs: [runRow('r1', '2026-10-05T10:00:00+00:00', { status: 'passed', failed: 0 })],
        tallies: [
          tally('r1', 'passed', 1, 'component'),
          tally('r1', 'passed', 1, 'e2e'),
          tally('r1', 'passed', 1, 'unit'),
        ],
      }),
    );

    const { self } = await loadHowItsTested(client, NOW);

    expect(self?.summary.totalTests).toBe(3);
    expect(self?.summary.layers).toEqual({ unit: 1, component: 1, e2e: 1 });
  });

  // Design v12 item 10 (data-map v11): the coverage card's rows and their line counts.
  it('reads the latest coverage per module with its line counts and floor', async () => {
    const { client } = fakeClient(
      answering({
        projects: [{ ...projectRow, coverage_floors: { unit: 90 } }],
        runs: [runRow('r1', '2026-10-05T10:00:00+00:00')],
        coverage: [coverageRow('c1', 'r1', 'unit', 3125, 3141)],
      }),
    );

    const { self } = await loadHowItsTested(client, NOW);

    expect(self?.coverage).toEqual([
      {
        module: 'unit',
        runId: 'r1',
        pct: (3125 / 3141) * 100,
        floor: 90,
        belowFloor: false,
        lines: { covered: 3125, total: 3141 },
      },
    ]);
  });

  it('answers a registered project with no run as having no latest run', async () => {
    const { client } = fakeClient(answering({ projects: [projectRow], runs: [] }));

    const { self } = await loadHowItsTested(client, NOW);

    expect(self?.summary.latestRun).toBeNull();
    expect(self?.latestDurationMs).toBeNull();
    expect(self?.coverage).toEqual([]);
  });

  it('fails loudly when the database refuses, rather than showing “not reporting”', async () => {
    const { client } = fakeClient(() => ({ error: { code: '42501', message: 'denied' } }));

    await expect(loadHowItsTested(client, NOW)).rejects.toThrow(/42501/);
  });

  it('reads through the publishable-key client by default', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
    const { client } = fakeClient(answering({ projects: [] }));
    vi.mocked(createClient).mockReturnValue(client as never);

    await expect(loadHowItsTested(undefined, NOW)).resolves.toEqual({ self: null });
    expect(vi.mocked(createClient).mock.calls[0]?.slice(0, 2)).toEqual([
      'http://127.0.0.1:54321',
      'sb_publishable_test',
    ]);
  });
});
