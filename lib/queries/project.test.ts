import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  argsOf,
  fakeClient,
  firstArgs,
  type Answer,
  type Query,
} from './fake-client.test-support.ts';
import { loadProjectPage, runListLimit } from './project.ts';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

// The project page loader's queries and how it assembles their rows (spec section 13,
// /p/[slug]). The stats are tested beside them in lib/stats; what the page holds for the real
// seed, read as anon, is proven in lib/seed/seed.int.test.ts.

const NOW = new Date('2026-10-05T12:00:00Z');

const projectRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'project-1',
  slug: 'ostomate2',
  name: 'Ostomate 2.0',
  tagline: 'Tracker',
  visibility: 'public',
  default_branch: 'main',
  declared_suites: [
    { name: 'Maestro E2E (iOS)', layer: 'e2e', count: 5, status: 'runs_in_ci_not_reported' },
  ],
  coverage_floors: { shared: 91 },
  expected_cadence_days: 8,
  description: 'First paragraph.\n\nSecond paragraph.',
  repo_url: 'https://github.com/bhelco1/Ostomate2',
  dev_stack: [{ category: 'Mobile', items: ['Kotlin Multiplatform 2.3.21'] }],
  test_stack: [{ category: 'E2E', items: ['Maestro 2.6.1'] }],
  ...overrides,
});

const runRow = (id: string, finishedAt: string, overrides: Record<string, unknown> = {}) => ({
  id,
  ci_run_id: id,
  run_attempt: 1,
  commit_sha: `sha-${id}`,
  branch: 'main',
  status: 'passed',
  passed: 3,
  failed: 0,
  skipped: 0,
  started_at: finishedAt,
  finished_at: finishedAt,
  source: 'ci',
  event: 'push',
  run_url: `https://github.com/bhelco1/Ostomate2/actions/runs/${id}`,
  total: 3,
  duration_ms: 20_000,
  results_pruned_at: null,
  ...overrides,
});

// Two CI runs on main, one imported run before them, and a pull request run the feed shows
// under "All branches" only.
const RUNS = [
  runRow('bf', '2026-09-20T10:00:00+00:00', { source: 'backfill', duration_ms: 0, passed: 2 }),
  runRow('ci-1', '2026-10-03T10:00:00+00:00', {
    status: 'failed',
    passed: 2,
    failed: 1,
    duration_ms: 21_000,
  }),
  runRow('ci-2', '2026-10-05T09:00:00+00:00', { duration_ms: 19_500 }),
];
const PR_RUN = runRow('pr', '2026-10-04T10:00:00+00:00', {
  branch: 'seed/pull-request',
  event: 'pull_request',
});

const statsResult = (id: string, runId: string, testId: string, status: string) => ({
  id,
  test_id: testId,
  status,
  reports: { run_id: runId, platform: 'jvm' },
});

// ci-1: t1 failed, t2 passed. ci-2: t1, t2 and t3 passed.
const RESULTS = [
  statsResult('x1', 'ci-1', 't1', 'failed'),
  statsResult('x2', 'ci-1', 't2', 'passed'),
  statsResult('x3', 'ci-2', 't1', 'passed'),
  statsResult('x4', 'ci-2', 't2', 'passed'),
  statsResult('x5', 'ci-2', 't3', 'passed'),
];

const REPORT = {
  id: 'rep-1',
  run_id: 'ci-2',
  job: 'android',
  module: 'shared',
  platform: 'jvm',
  format: 'junit',
  total: 3,
  passed: 3,
  failed: 0,
  skipped: 0,
  duration_ms: 19_500,
  started_at: '2026-10-05T08:59:40.5+00:00',
  finished_at: '2026-10-05T09:00:00+00:00',
};

interface Tables {
  readonly projects?: readonly unknown[];
  readonly runs?: readonly unknown[];
  readonly feed?: readonly unknown[];
  readonly results?: readonly unknown[];
  readonly failing?: readonly unknown[];
  readonly tests?: readonly unknown[];
}

const isFeed = (query: Query) =>
  query.table === 'runs_public' &&
  argsOf(query, 'order').some(([column]) => column === 'finished_at') &&
  argsOf(query, 'limit').length === 0;
const isLastReport = (query: Query) =>
  query.table === 'runs_public' && argsOf(query, 'limit').length > 0;

const answering =
  (tables: Tables) =>
  (query: Query): Answer => {
    switch (query.table) {
      case 'projects_public':
        return { data: tables.projects ?? [projectRow()] };
      case 'runs_public':
        if (isLastReport(query)) return { data: [{ finished_at: '2026-10-05T09:00:00+00:00' }] };
        return { data: isFeed(query) ? (tables.feed ?? []) : (tables.runs ?? RUNS) };
      case 'results': {
        const select = String(firstArgs(query, 'select')[0]);
        if (select.includes('tests!inner(layer)')) {
          return {
            data: [
              { id: 'x3', test_id: 't1', tests: { layer: 'unit' }, reports: { run_id: 'ci-2' } },
              { id: 'x4', test_id: 't2', tests: { layer: 'unit' }, reports: { run_id: 'ci-2' } },
              {
                id: 'x5',
                test_id: 't3',
                tests: { layer: 'integration' },
                reports: { run_id: 'ci-2' },
              },
            ],
          };
        }
        if (select.includes('test_key')) return { data: tables.failing ?? [] };
        return { data: tables.results ?? RESULTS };
      }
      case 'coverage':
        return {
          data: [
            {
              id: 'c1',
              module: 'shared',
              lines_covered: 457,
              lines_total: 490,
              lines_pct: null,
              reports: { run_id: 'ci-2' },
            },
          ],
        };
      case 'reports': {
        const select = String(firstArgs(query, 'select')[0]);
        return { data: select === 'run_id' ? [{ run_id: 'ci-2' }, { run_id: 'pr' }] : [REPORT] };
      }
      case 'tests':
        return { data: tables.tests ?? [] };
      default:
        return { error: { code: 'X', message: `unexpected table ${query.table}` } };
    }
  };

describe('loadProjectPage', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(createClient).mockReset();
  });

  it('is null for a slug with no project, after one lookup', async () => {
    const { client, queries } = fakeClient(answering({ projects: [] }));

    expect(await loadProjectPage('nope', {}, client, NOW)).toBeNull();
    expect(queries).toHaveLength(1);
    expect(queries[0]).toEqual({
      table: 'projects_public',
      calls: [
        [
          'select',
          'id, slug, name, tagline, visibility, default_branch, declared_suites, ' +
            'coverage_floors, expected_cadence_days, description, repo_url, dev_stack, test_stack',
        ],
        ['eq', 'slug', 'nope'],
        ['limit', 1],
      ],
    });
  });

  it.each(['../etc', 'Ostomate2', '', 'a b', '-lead'])(
    'is null for %j, which could never be a slug, without querying',
    async (slug) => {
      const { client, queries } = fakeClient(answering({}));

      expect(await loadProjectPage(slug, {}, client, NOW)).toBeNull();
      expect(queries).toEqual([]);
    },
  );

  it('carries the project’s own fields, stacks and declared suites', async () => {
    const { client } = fakeClient(answering({}));

    const page = await loadProjectPage('ostomate2', {}, client, NOW);

    expect(page?.project).toEqual({
      id: 'project-1',
      slug: 'ostomate2',
      name: 'Ostomate 2.0',
      tagline: 'Tracker',
      visibility: 'public',
      defaultBranch: 'main',
      declaredSuites: [
        { name: 'Maestro E2E (iOS)', layer: 'e2e', count: 5, status: 'runs_in_ci_not_reported' },
      ],
      coverageFloors: { shared: 91 },
      expectedCadenceDays: 8,
      description: 'First paragraph.\n\nSecond paragraph.',
      repoUrl: 'https://github.com/bhelco1/Ostomate2',
      devStack: [{ category: 'Mobile', items: ['Kotlin Multiplatform 2.3.21'] }],
      testStack: [{ category: 'E2E', items: ['Maestro 2.6.1'] }],
    });
  });

  it('summarises the latest run: pyramid, coverage, streaks, time to green and health', async () => {
    const { client } = fakeClient(answering({}));

    const page = await loadProjectPage('ostomate2', {}, client, NOW);

    expect(page?.summary).toMatchObject({
      latestRun: { id: 'ci-2', status: 'passed', passRate: 1 },
      // t1, t2 unit and t3 integration; the 5 declared flows are not added.
      totalTests: 3,
      layers: { unit: 2, integration: 1 },
      // 457 / 490 = 93.27% against 91.
      coverage: [{ module: 'shared', runId: 'ci-2', pct: (457 / 490) * 100, floor: 91 }],
      // CI runs only: ci-1 failed, ci-2 passed.
      greenStreak: { current: 1, longest: 1 },
      // ci-1 failed with no passed CI run before it (the imported run does not count), so no
      // recovery.
      timeToGreen: { recoveries: [], medianMs: null, worstMs: null, stillRed: null },
      health: { marker: { health: 'healthy' } },
    });
    expect(page?.latestRun?.reports).toEqual([
      {
        job: 'android',
        module: 'shared',
        platform: 'jvm',
        format: 'junit',
        total: 3,
        passed: 3,
        failed: 0,
        skipped: 0,
        durationMs: 19_500,
        startedAt: new Date('2026-10-05T08:59:40.5Z'),
        finishedAt: new Date('2026-10-05T09:00:00Z'),
      },
    ]);
  });

  it('lists the latest run’s failing tests by suite and name with their platform', async () => {
    const failingRow = (id: string, suite: string, name: string, status: string) => ({
      id,
      status,
      tests: { test_key: `key-${id}`, suite, name },
      reports: { run_id: 'ci-2', platform: 'ios-sim' },
    });
    const { client, queries } = fakeClient(
      answering({
        failing: [
          failingRow('f2', 'B', 'second', 'error'),
          failingRow('f1', 'A', 'first', 'failed'),
        ],
      }),
    );

    const page = await loadProjectPage('ostomate2', {}, client, NOW);

    expect(page?.latestRun?.failing).toEqual([
      { testKey: 'key-f1', suite: 'A', name: 'first', platform: 'ios-sim', status: 'failed' },
      { testKey: 'key-f2', suite: 'B', name: 'second', platform: 'ios-sim', status: 'error' },
    ]);
    const failingQuery = queries.find(
      (query) =>
        query.table === 'results' && String(firstArgs(query, 'select')[0]).includes('test_key'),
    );
    expect(argsOf(failingQuery as Query, 'eq')).toEqual([['reports.run_id', 'ci-2']]);
    expect(argsOf(failingQuery as Query, 'in')).toEqual([['status', ['failed', 'error']]]);
  });

  it('trends pass rate, run count and coverage over both sources, duration and test count over CI', async () => {
    const { client } = fakeClient(answering({}));

    const page = await loadProjectPage('ostomate2', {}, client, NOW);
    const trends = page?.trends[30];

    expect(trends?.passRate.runs.map((point) => [point.runId, point.passRate])).toEqual([
      ['bf', 1],
      // 2 / (2 + 1).
      ['ci-1', 2 / 3],
      ['ci-2', 1],
    ]);
    // (2 + 2 + 3) / (2 + 2 + 3 + 0 + 1 + 0) = 7 / 8.
    expect(trends?.windowPassRate).toEqual({
      runs: 3,
      passed: 7,
      failed: 1,
      skipped: 0,
      passRate: 7 / 8,
    });
    expect(trends?.runCount.filter((day) => day.runs > 0)).toEqual([
      { day: '2026-09-20', runs: 1 },
      { day: '2026-10-03', runs: 1 },
      { day: '2026-10-05', runs: 1 },
    ]);
    expect(trends?.coverage).toEqual([
      expect.objectContaining({
        module: 'shared',
        points: [expect.objectContaining({ runId: 'ci-2' })],
      }),
    ]);
    expect(trends?.duration.map((point) => [point.runId, point.durationMs])).toEqual([
      ['ci-1', 21_000],
      ['ci-2', 19_500],
    ]);
    // ci-1: t1, t2 = 2 tests; ci-2: t1, t2, t3 = 3 tests.
    expect(trends?.testCount.map((point) => [point.runId, point.totalTests])).toEqual([
      ['ci-1', 2],
      ['ci-2', 3],
    ]);
    // 2026-09-20 is 15 days before 2026-10-05, inside both windows.
    expect(page?.trends[90].passRate.runs).toHaveLength(3);
  });

  it('reads results of default-branch CI runs in the 90 days only', async () => {
    const { client, queries } = fakeClient(answering({}));

    await loadProjectPage('ostomate2', {}, client, NOW);

    const results = queries.find(
      (query) =>
        query.table === 'results' &&
        firstArgs(query, 'select')[0] === 'id, test_id, status, reports!inner(run_id, platform)',
    );
    expect(argsOf(results as Query, 'in')).toEqual([['reports.run_id', ['ci-1', 'ci-2']]]);
  });

  it('lists flaky tests with their names and the platforms they flipped on', async () => {
    const runs = [
      runRow('a1', '2026-10-04T10:00:00+00:00', { commit_sha: 'c1', status: 'failed', failed: 1 }),
      runRow('a2', '2026-10-04T11:00:00+00:00', { commit_sha: 'c1', run_attempt: 2 }),
    ];
    const { client, queries } = fakeClient(
      answering({
        runs,
        results: [statsResult('y1', 'a1', 't1', 'failed'), statsResult('y2', 'a2', 't1', 'passed')],
        tests: [
          {
            id: 't1',
            test_key: 'key-t1',
            module: 'shared',
            suite: 'ChangeEventDaoTest',
            name: 'insertsAndQueriesByDay',
            layer: 'integration',
          },
        ],
      }),
    );

    const page = await loadProjectPage('ostomate2', {}, client, NOW);

    expect(page?.flaky).toEqual({
      tests: [
        {
          testKey: 'key-t1',
          module: 'shared',
          suite: 'ChangeEventDaoTest',
          name: 'insertsAndQueriesByDay',
          layer: 'integration',
          platforms: ['jvm'],
        },
      ],
      // One test in the latest CI run (a2): 1 / 1.
      totalTests: 1,
      flakeRate: 1,
    });
    const tests = queries.find((query) => query.table === 'tests');
    expect(argsOf(tests as Query, 'in')).toEqual([['id', ['t1']]]);
  });

  it('reads no tests when nothing is flaky', async () => {
    const { client, queries } = fakeClient(answering({}));

    const page = await loadProjectPage('ostomate2', {}, client, NOW);

    expect(page?.flaky).toEqual({ tests: [], totalTests: 3, flakeRate: 0 });
    expect(queries.some((query) => query.table === 'tests')).toBe(false);
  });

  it('lists the newest default-branch CI runs first, titled, with their report counts', async () => {
    const { client, queries } = fakeClient(answering({ feed: [RUNS[2], RUNS[1]] }));

    const page = await loadProjectPage('ostomate2', {}, client, NOW);

    const feed = queries.find(isFeed) as Query;
    expect(argsOf(feed, 'eq')).toEqual([
      ['project_id', 'project-1'],
      ['source', 'ci'],
      ['branch', 'main'],
    ]);
    expect(argsOf(feed, 'lte')).toEqual([['finished_at', '2026-10-05T12:00:00.000Z']]);
    expect(argsOf(feed, 'order')).toEqual([
      ['finished_at', { ascending: false }],
      ['started_at', { ascending: false }],
      ['ci_run_id', { ascending: false }],
      ['run_attempt', { ascending: false }],
    ]);
    // Ten rows and one more, to know whether there are more.
    expect(argsOf(feed, 'range')).toEqual([[0, 10]]);

    expect(page?.runs).toEqual({
      branches: 'default',
      hasMore: false,
      items: [
        expect.objectContaining({
          id: 'ci-2',
          title: 'Push to main',
          status: 'passed',
          total: 3,
          durationMs: 19_500,
          reports: 1,
        }),
        expect.objectContaining({ id: 'ci-1', status: 'failed', failed: 1, passed: 2, reports: 0 }),
      ],
    });
  });

  it('adds every branch when asked, and says when there are more runs than the limit', async () => {
    const { client, queries } = fakeClient(answering({ feed: [RUNS[2], PR_RUN, RUNS[1]] }));

    const page = await loadProjectPage('ostomate2', { branches: 'all', runLimit: 2 }, client, NOW);

    const feed = queries.find(isFeed) as Query;
    expect(argsOf(feed, 'eq')).toEqual([
      ['project_id', 'project-1'],
      ['source', 'ci'],
    ]);
    expect(argsOf(feed, 'range')).toEqual([[0, 2]]);
    expect(page?.runs.branches).toBe('all');
    expect(page?.runs.hasMore).toBe(true);
    expect(page?.runs.items.map((run) => [run.id, run.title, run.reports])).toEqual([
      ['ci-2', 'Push to main', 1],
      ['pr', 'Pull request from seed/pull-request', 1],
    ]);
  });

  it('has no latest run, trends or runs for a project that has not reported', async () => {
    const { client, queries } = fakeClient(answering({ runs: [], results: [] }));

    const page = await loadProjectPage('ostomate2', {}, client, NOW);

    expect(page?.summary.latestRun).toBeNull();
    expect(page?.latestRun).toBeNull();
    expect(page?.trends[90].duration).toEqual([]);
    expect(page?.trends[90].testCount).toEqual([]);
    expect(page?.runs).toEqual({ branches: 'default', items: [], hasMore: false });
    expect(queries.filter((query) => query.table === 'reports')).toEqual([]);
  });

  it('reports a database error with its code', async () => {
    const { client } = fakeClient(() => ({
      error: { code: '42501', message: 'permission denied' },
    }));

    await expect(loadProjectPage('ostomate2', {}, client, NOW)).rejects.toThrow(
      'look up the project: 42501 permission denied',
    );
  });

  it('reports a run list error with its code', async () => {
    const answer = answering({});
    const { client } = fakeClient((query) =>
      isFeed(query) ? { error: { code: '57014', message: 'canceling statement' } } : answer(query),
    );

    await expect(loadProjectPage('ostomate2', {}, client, NOW)).rejects.toThrow(
      'load the run list: 57014 canceling statement',
    );
  });

  it('refuses a feed row it does not recognise rather than casting it', async () => {
    const { client } = fakeClient(answering({ feed: [{ id: 'r1' }] }));

    await expect(loadProjectPage('ostomate2', {}, client, NOW)).rejects.toThrow(
      'load the run list returned an unexpected row',
    );
  });

  it('builds the publishable-key client and reads now from lib/clock when given neither', async () => {
    const { client, queries } = fakeClient(answering({}));
    vi.mocked(createClient).mockReturnValue(client as unknown as ReturnType<typeof createClient>);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_unit_test_placeholder');
    vi.stubEnv('TESTPULSE_FIXED_NOW', '2026-10-05T12:00:00.000Z');

    await loadProjectPage('ostomate2');

    expect(vi.mocked(createClient).mock.calls[0]?.[1]).toBe('sb_publishable_unit_test_placeholder');
    expect(argsOf(queries.find(isFeed) as Query, 'lte')).toEqual([
      ['finished_at', '2026-10-05T12:00:00.000Z'],
    ]);
  });
});

describe('runListLimit', () => {
  it.each([
    [undefined, 10],
    [Number.NaN, 10],
    [Number.POSITIVE_INFINITY, 10],
    [30, 30],
    [12.7, 12],
    [0, 1],
    [-5, 1],
    // One response holds 1,000 rows and the list reads one past its limit.
    [999, 999],
    [5_000, 999],
  ])('reads %s as %i', (requested, limit) => {
    expect(runListLimit(requested)).toBe(limit);
  });
});
