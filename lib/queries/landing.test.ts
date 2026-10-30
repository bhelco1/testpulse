import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  argsOf,
  fakeClient,
  rpcArgs,
  type Answer,
  type Query,
} from './fake-client.test-support.ts';
import { loadLanding } from './landing.ts';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

// The query shapes, the coverage walk and the row handling of the landing loader. What the
// numbers are for real data read as anon is proven against the seeded database in
// lib/seed/seed.int.test.ts; the stats themselves are tested beside them in lib/stats.

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
  coverage_floors: { shared: 91, composeApp: 93 },
  expected_cadence_days: 8,
  ...overrides,
});

const runRow = (id: string, finishedAt: string, overrides: Record<string, unknown> = {}) => ({
  id,
  ci_run_id: id,
  run_attempt: 1,
  commit_sha: 'abcdef0',
  branch: 'main',
  status: 'passed',
  passed: 10,
  failed: 0,
  skipped: 1,
  started_at: finishedAt,
  finished_at: finishedAt,
  source: 'ci',
  event: 'push',
  run_url: null,
  total: 11,
  duration_ms: 26_000,
  results_pruned_at: null,
  ...overrides,
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

// A row of run_test_tallies: one run's distinct tests of one layer and combined status.
const tally = (runId: string, layer: string, status: string, tests: number) => ({
  run_id: runId,
  layer,
  status,
  tests,
});

const isLastReportQuery = (query: Query) =>
  query.table === 'runs_public' && argsOf(query, 'limit').length > 0;

interface Tables {
  readonly projects?: readonly unknown[];
  readonly runs?: readonly unknown[] | ((projectId: string) => readonly unknown[]);
  readonly lastReport?: readonly unknown[];
  readonly tallies?: readonly ReturnType<typeof tally>[];
  readonly coverage?: (runIds: readonly string[]) => readonly unknown[];
  readonly reports?: (runId: string) => readonly unknown[];
  readonly failing?: (runId: string) => readonly unknown[];
  readonly reportCounts?: readonly unknown[];
}

const report = (job: string, module: string, platform: string, total: number) => ({
  job,
  module,
  platform,
  format: 'junit',
  total,
  passed: total,
  failed: 0,
  skipped: 0,
  duration_ms: 1_000,
  started_at: '2026-10-05T09:25:00+00:00',
  finished_at: '2026-10-05T09:26:00+00:00',
  received_at: '2026-10-05T09:26:02+00:00',
});

const failingRow = (id: string, suite: string, name: string, platform: string) => ({
  id,
  status: 'failed',
  tests: { test_key: `key-${id}`, suite, name },
  reports: { run_id: 'r2', platform },
});

const eqValue = (query: Query, column: string) =>
  argsOf(query, 'eq').find(([name]) => name === column)?.[1];

const answering =
  (tables: Tables) =>
  (query: Query): Answer => {
    switch (query.table) {
      case 'projects_public':
        return { data: tables.projects ?? [projectRow()] };
      case 'runs_public': {
        if (isLastReportQuery(query)) return { data: tables.lastReport ?? [] };
        const { runs = [] } = tables;
        return {
          data: typeof runs === 'function' ? runs(String(eqValue(query, 'project_id'))) : runs,
        };
      }
      case 'results':
        return { data: tables.failing?.(String(eqValue(query, 'reports.run_id'))) ?? [] };
      case 'rpc:run_test_tallies': {
        const ids = rpcArgs(query).p_run_ids as string[];
        return { data: (tables.tallies ?? []).filter((row) => ids.includes(row.run_id)) };
      }
      case 'rpc:run_report_counts':
        return { data: tables.reportCounts ?? [] };
      case 'coverage': {
        const [, ids] = (argsOf(query, 'in')[0] ?? []) as [string, string[]];
        return { data: tables.coverage?.(ids) ?? [] };
      }
      case 'reports':
        return { data: tables.reports?.(String(eqValue(query, 'run_id'))) ?? [] };
      default:
        return { error: { code: 'X', message: `unexpected table ${query.table}` } };
    }
  };

describe('loadLanding', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(createClient).mockReset();
  });

  it('reads projects_public in dashboard order and has an empty headline with no projects', async () => {
    const { client, queries } = fakeClient(answering({ projects: [] }));

    const landing = await loadLanding(client, NOW);

    expect(queries).toEqual([
      {
        table: 'projects_public',
        calls: [
          [
            'select',
            'id, slug, name, tagline, visibility, default_branch, declared_suites, ' +
              'coverage_floors, expected_cadence_days',
          ],
          ['order', 'sort_order'],
          ['order', 'slug'],
        ],
      },
    ]);
    expect(landing.projects).toEqual([]);
    expect(landing.headline).toMatchObject({ totalTests: 0, passRate: { rate: null } });
  });

  it('reads one project’s runs, last report, latest-run test counts and coverage as anon', async () => {
    const { client, queries } = fakeClient(
      answering({
        runs: [
          runRow('r1', '2026-10-04T05:17:17.747+00:00'),
          runRow('r2', '2026-10-05T09:26:17.747+00:00', { passed: 192, skipped: 0 }),
        ],
        lastReport: [{ finished_at: '2026-10-05T09:26:17.747+00:00' }],
        // r2's distinct tests as the database counts them: t1 failed on one of its two
        // platforms, t2 passed.
        tallies: [tally('r2', 'unit', 'failed', 1), tally('r2', 'visual', 'passed', 1)],
        coverage: (ids) =>
          ids.includes('r2')
            ? [
                coverageRow('c1', 'r2', 'shared', 457, 490),
                coverageRow('c2', 'r2', 'composeApp', 497, 527),
              ]
            : [],
      }),
    );

    const landing = await loadLanding(client, NOW);

    const [, runs, lastReport, tallies, coverage, reports, failing, reportCounts, feed, ...rest] =
      queries;
    expect(rest).toEqual([]);
    expect(runs?.table).toBe('runs_public');
    expect(argsOf(runs as Query, 'eq')).toEqual([
      ['project_id', 'project-1'],
      ['branch', 'main'],
    ]);
    expect(argsOf(runs as Query, 'in')).toEqual([['source', ['ci', 'backfill']]]);
    expect(argsOf(runs as Query, 'lte')).toEqual([['finished_at', '2026-10-05T12:00:00.000Z']]);
    expect(argsOf(runs as Query, 'range')).toEqual([[0, 999]]);

    // Any branch, CI only: a pull request run is a report too.
    expect(argsOf(lastReport as Query, 'eq')).toEqual([
      ['project_id', 'project-1'],
      ['source', 'ci'],
    ]);
    expect(argsOf(lastReport as Query, 'order')).toEqual([['finished_at', { ascending: false }]]);

    // The latest run's tests are counted in the database, not read row by row.
    expect(tallies?.table).toBe('rpc:run_test_tallies');
    expect(rpcArgs(tallies as Query)).toEqual({ p_run_ids: ['r2'] });

    // Newest first: r2 holds both floor modules, so the walk stops after one chunk.
    expect(argsOf(coverage as Query, 'in')).toEqual([['reports.run_id', ['r2', 'r1']]]);

    const [summary] = landing.projects;
    expect(summary).toMatchObject({
      project: {
        slug: 'ostomate2',
        defaultBranch: 'main',
        coverageFloors: { shared: 91, composeApp: 93 },
        expectedCadenceDays: 8,
      },
      // Distinct tests, not r2's 192 executions: t1 failed on one of its two platforms, t2
      // passed. 1 / (1 + 1) = 0.5.
      latestRun: { id: 'r2', passed: 1, failed: 1, skipped: 0, passRate: 0.5 },
      // t1 and t2: 2 tests; the 5 declared flows are not added.
      totalTests: 2,
      layers: { unit: 1, visual: 1 },
      greenStreak: { current: 2, longest: 2 },
      runsInLast30Days: 2,
      // Both runs passed: nothing to recover from.
      timeToGreen: { recoveries: [], medianMs: null, worstMs: null, stillRed: null },
      health: { daysSinceLastReport: 0, marker: { health: 'healthy' } },
    });
    expect(summary?.coverage.map(({ module, runId }) => [module, runId])).toEqual([
      ['composeApp', 'r2'],
      ['shared', 'r2'],
    ]);
    expect(landing.headline).toMatchObject({ totalTests: 2, runsInLast30Days: { total: 2 } });

    // The latest run's reports in key order and its failing tests, for the card.
    expect(reports?.table).toBe('reports');
    expect(argsOf(reports as Query, 'eq')).toEqual([['run_id', 'r2']]);
    expect(failing?.table).toBe('results');
    expect(argsOf(failing as Query, 'eq')).toEqual([['reports.run_id', 'r2']]);
    expect(argsOf(failing as Query, 'in')).toEqual([['status', ['failed', 'error']]]);

    // The recent runs feed asks the database for its runs' reports and distinct tests, newest
    // first.
    expect(reportCounts?.table).toBe('rpc:run_report_counts');
    expect(rpcArgs(reportCounts as Query)).toEqual({ p_run_ids: ['r2', 'r1'] });
    expect(feed?.table).toBe('rpc:run_test_tallies');
    expect(rpcArgs(feed as Query)).toEqual({ p_run_ids: ['r2', 'r1'] });
  });

  it('gives each card its latest run’s reports, failing tests and duration', async () => {
    const { client } = fakeClient(
      answering({
        runs: [runRow('r2', '2026-10-05T09:26:17.747+00:00', { duration_ms: 35_604 })],
        lastReport: [{ finished_at: '2026-10-05T09:26:17.747+00:00' }],
        reports: (runId) =>
          runId === 'r2'
            ? [
                report('android', 'composeApp', 'jvm', 60),
                report('ios', 'composeApp', 'ios-sim', 50),
              ]
            : [],
        failing: (runId) =>
          runId === 'r2'
            ? [
                failingRow('f2', 'com.b.BTest', 'second', 'jvm'),
                failingRow('f1', 'com.a.ATest', 'first', 'ios-sim'),
              ]
            : [],
      }),
    );

    const landing = await loadLanding(client, NOW);

    expect(landing.projects[0]?.latestRunDetail).toEqual({
      reports: [
        expect.objectContaining({
          job: 'android',
          module: 'composeApp',
          platform: 'jvm',
          total: 60,
        }),
        expect.objectContaining({
          job: 'ios',
          module: 'composeApp',
          platform: 'ios-sim',
          total: 50,
        }),
      ],
      // By suite, then name.
      failing: [
        {
          testKey: 'key-f1',
          suite: 'com.a.ATest',
          name: 'first',
          platform: 'ios-sim',
          status: 'failed',
        },
        {
          testKey: 'key-f2',
          suite: 'com.b.BTest',
          name: 'second',
          platform: 'jvm',
          status: 'failed',
        },
      ],
      durationMs: 35_604,
    });
  });

  it('feeds the 3 newest default-branch CI runs across projects, in distinct tests', async () => {
    const other = projectRow({
      id: 'project-2',
      slug: 'routeserve',
      name: 'RouteServe',
      visibility: 'private',
      default_branch: 'develop',
    });
    const runsOf = (projectId: string) =>
      projectId === 'project-1'
        ? [
            runRow('o1', '2026-10-05T08:00:00+00:00'),
            runRow('o2', '2026-10-05T10:00:00+00:00', { event: 'schedule' }),
            // Imported history is not a report, so never a feed row, however recent.
            runRow('o3', '2026-10-05T11:00:00+00:00', { source: 'backfill' }),
          ]
        : [
            runRow('s1', '2026-10-05T09:00:00+00:00', {
              branch: 'develop',
              status: 'failed',
              commit_sha: '1234567',
            }),
            // Pruned: no per-test rows are left to count.
            runRow('s0', '2026-10-04T09:00:00+00:00', {
              branch: 'develop',
              results_pruned_at: '2026-10-05T00:00:00+00:00',
            }),
          ];
    const { client, queries } = fakeClient(
      answering({
        projects: [projectRow(), other],
        runs: runsOf,
        lastReport: [{ finished_at: '2026-10-05T10:00:00+00:00' }],
        reportCounts: [
          { run_id: 'o2', reports: 2 },
          { run_id: 's1', reports: 1 },
        ],
        // The database's distinct tests: o2 passed t1 (on two platforms) and skipped t2; s1
        // failed t3 (failed on one platform, passed on another) and passed t4; o1 passed t5.
        tallies: [
          tally('o1', 'unit', 'passed', 1),
          tally('o2', 'unit', 'passed', 1),
          tally('o2', 'unit', 'skipped', 1),
          tally('s1', 'unit', 'failed', 1),
          tally('s1', 'unit', 'passed', 1),
        ],
      }),
    );

    const landing = await loadLanding(client, NOW);

    expect(
      landing.recentRuns.map((run) => ({
        id: run.id,
        project: run.project,
        title: run.title,
        branch: run.branch,
        reports: run.reports,
        tests: run.tests,
      })),
    ).toEqual([
      {
        id: 'o2',
        project: { slug: 'ostomate2', name: 'Ostomate 2.0', visibility: 'public' },
        title: 'Scheduled run',
        branch: 'main',
        reports: 2,
        tests: { total: 2, passed: 1, failed: 0, skipped: 1 },
      },
      {
        id: 's1',
        project: { slug: 'routeserve', name: 'RouteServe', visibility: 'private' },
        title: 'Push to develop',
        branch: 'develop',
        reports: 1,
        tests: { total: 2, passed: 1, failed: 1, skipped: 0 },
      },
      {
        id: 'o1',
        project: { slug: 'ostomate2', name: 'Ostomate 2.0', visibility: 'public' },
        title: 'Push to main',
        branch: 'main',
        reports: 0,
        tests: { total: 1, passed: 1, failed: 0, skipped: 0 },
      },
    ]);
    expect(landing.recentRuns[1]?.commitSha).toBe('1234567');
    const counted = queries
      .filter((query) => query.table === 'rpc:run_test_tallies')
      .map((query) => rpcArgs(query).p_run_ids);
    // Each project's latest run for its card, then the feed's three.
    expect(counted).toEqual([['o2'], ['s1'], ['o2', 's1', 'o1']]);
  });

  it('keeps a pruned feed run’s executions, with no distinct tests to count', async () => {
    const { client, queries } = fakeClient(
      answering({
        runs: [
          runRow('r1', '2026-10-05T09:00:00+00:00', {
            results_pruned_at: '2026-10-05T10:00:00+00:00',
          }),
        ],
        lastReport: [{ finished_at: '2026-10-05T09:00:00+00:00' }],
      }),
    );

    const landing = await loadLanding(client, NOW);

    expect(landing.recentRuns).toEqual([
      expect.objectContaining({ id: 'r1', total: 11, passed: 10, skipped: 1, tests: null }),
    ]);
    // The feed asks nothing to count a pruned run's tests; the one count is the card's.
    expect(
      queries
        .filter((query) => query.table === 'rpc:run_test_tallies')
        .map((query) => rpcArgs(query).p_run_ids),
    ).toEqual([['r1']]);
  });

  it('walks back through older runs until every module with a floor has coverage', async () => {
    // 60 runs, newest last: only the oldest, run-00, reports composeApp. The first chunk of 50
    // (run-59 to run-10) finds shared alone, so the walk reads a second chunk.
    const runs = Array.from({ length: 60 }, (_, index) =>
      runRow(
        `run-${String(index).padStart(2, '0')}`,
        new Date(Date.UTC(2026, 8, 1, index)).toISOString(),
      ),
    );
    const { client, queries } = fakeClient(
      answering({
        runs,
        lastReport: [{ finished_at: '2026-09-03T11:00:00+00:00' }],
        coverage: (ids) => [
          ...(ids.includes('run-59') ? [coverageRow('c1', 'run-59', 'shared', 95, 100)] : []),
          ...(ids.includes('run-00') ? [coverageRow('c2', 'run-00', 'composeApp', 90, 100)] : []),
        ],
      }),
    );

    const landing = await loadLanding(client, NOW);

    const chunks = queries
      .filter((query) => query.table === 'coverage')
      .map((query) => (argsOf(query, 'in')[0]?.[1] as string[]).length);
    expect(chunks).toEqual([50, 10]);
    // 90% is under composeApp's floor of 93.
    expect(landing.projects[0]?.coverage).toEqual([
      { module: 'composeApp', runId: 'run-00', pct: 90, floor: 93, belowFloor: true },
      { module: 'shared', runId: 'run-59', pct: 95, floor: 91, belowFloor: false },
    ]);
  });

  it('reads no results or coverage for a project that has not reported', async () => {
    const { client, queries } = fakeClient(answering({}));

    const landing = await loadLanding(client, NOW);

    expect(queries.map((query) => query.table)).toEqual([
      'projects_public',
      'runs_public',
      'runs_public',
    ]);
    expect(landing.projects[0]).toMatchObject({
      latestRun: null,
      totalTests: 0,
      health: { daysSinceLastReport: null, marker: { health: 'not_reporting' } },
    });
    expect(landing.headline.projectsReporting).toEqual({
      reporting: 0,
      registered: 1,
      silent: [],
      notReporting: ['ostomate2'],
    });
  });

  it('reports a database error with its code', async () => {
    const { client } = fakeClient(() => ({
      error: { code: '42501', message: 'permission denied' },
    }));

    await expect(loadLanding(client, NOW)).rejects.toThrow(
      'list projects: 42501 permission denied',
    );
  });

  it.each([
    ['a project row', { projects: [projectRow({ visibility: 'internal' })] }, 'list projects'],
    ['a run row', { runs: [{ id: 'r1' }] }, 'load runs'],
    ['a last-report row', { lastReport: [{ finished_at: 'yesterday' }] }, 'load the last report'],
  ] as const)(
    'refuses %s it does not recognise rather than casting it',
    async (_, tables, what) => {
      const { client } = fakeClient(answering(tables));

      await expect(loadLanding(client, NOW)).rejects.toThrow(`${what} returned an unexpected row`);
    },
  );

  it('builds the publishable-key client and reads now from lib/clock when given neither', async () => {
    const { client, queries } = fakeClient(
      answering({ runs: [runRow('r1', '2026-10-01T00:00:00+00:00')] }),
    );
    vi.mocked(createClient).mockReturnValue(client as unknown as ReturnType<typeof createClient>);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_unit_test_placeholder');
    vi.stubEnv('TESTPULSE_FIXED_NOW', '2026-10-05T12:00:00.000Z');

    await loadLanding();

    expect(vi.mocked(createClient).mock.calls[0]?.[1]).toBe('sb_publishable_unit_test_placeholder');
    const runs = queries.find((query) => query.table === 'runs_public');
    expect(argsOf(runs as Query, 'lte')).toEqual([['finished_at', '2026-10-05T12:00:00.000Z']]);
  });
});
