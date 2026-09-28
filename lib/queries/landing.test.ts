import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PublicClient } from '../supabase/public.ts';
import { loadLanding } from './landing.ts';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

// The query shapes, the coverage walk and the row handling of the landing loader. What the
// numbers are for real data read as anon is proven against the seeded database in
// lib/seed/seed.int.test.ts; the stats themselves are tested beside them in lib/stats.

type Call = readonly [method: string, ...args: unknown[]];

interface Query {
  readonly table: string;
  readonly calls: readonly Call[];
}

interface Answer {
  readonly data?: unknown;
  readonly error?: { code: string; message: string } | null;
}

const argsOf = (query: Query, method: string): unknown[][] =>
  query.calls.filter(([name]) => name === method).map(([, ...args]) => args);

function fakeClient(answer: (query: Query) => Answer): { client: PublicClient; queries: Query[] } {
  const queries: Query[] = [];
  const settle = (query: Query) => {
    queries.push(query);
    const { data = null, error = null } = answer(query);
    return { data, error };
  };
  const chain = (query: Query): unknown =>
    new Proxy(
      {},
      {
        get: (_, property) => {
          if (property === 'then') {
            return (resolve: (value: unknown) => void) => resolve(settle(query));
          }
          return (...args: unknown[]) =>
            chain({ ...query, calls: [...query.calls, [String(property), ...args]] });
        },
      },
    );
  const client = {
    from: (table: string) => chain({ table, calls: [] }),
  } as unknown as PublicClient;
  return { client, queries };
}

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

const isLastReportQuery = (query: Query) =>
  query.table === 'runs_public' && argsOf(query, 'limit').length > 0;

interface Tables {
  readonly projects?: readonly unknown[];
  readonly runs?: readonly unknown[];
  readonly lastReport?: readonly unknown[];
  readonly results?: readonly unknown[];
  readonly coverage?: (runIds: readonly string[]) => readonly unknown[];
}

const answering =
  (tables: Tables) =>
  (query: Query): Answer => {
    switch (query.table) {
      case 'projects_public':
        return { data: tables.projects ?? [projectRow()] };
      case 'runs_public':
        return { data: isLastReportQuery(query) ? (tables.lastReport ?? []) : (tables.runs ?? []) };
      case 'results':
        return { data: tables.results ?? [] };
      case 'coverage': {
        const [, ids] = (argsOf(query, 'in')[0] ?? []) as [string, string[]];
        return { data: tables.coverage?.(ids) ?? [] };
      }
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

  it('reads one project’s runs, last report, latest-run results and coverage through anon views', async () => {
    const { client, queries } = fakeClient(
      answering({
        runs: [
          runRow('r1', '2026-10-04T05:17:17.747+00:00'),
          runRow('r2', '2026-10-05T09:26:17.747+00:00', { passed: 192, skipped: 0 }),
        ],
        lastReport: [{ finished_at: '2026-10-05T09:26:17.747+00:00' }],
        results: [
          { id: 'x1', test_id: 't1', tests: { layer: 'unit' }, reports: { run_id: 'r2' } },
          { id: 'x2', test_id: 't1', tests: { layer: 'unit' }, reports: { run_id: 'r2' } },
          { id: 'x3', test_id: 't2', tests: { layer: 'visual' }, reports: { run_id: 'r2' } },
        ],
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

    const [, runs, lastReport, results, coverage, ...rest] = queries;
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

    expect(results?.table).toBe('results');
    expect(argsOf(results as Query, 'select')).toEqual([
      ['id, test_id, tests!inner(layer), reports!inner(run_id)'],
    ]);
    expect(argsOf(results as Query, 'eq')).toEqual([['reports.run_id', 'r2']]);

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
      latestRun: { id: 'r2', passed: 192, passRate: 1 },
      // t1 twice and t2: 2 tests; the 5 declared flows are not added.
      totalTests: 2,
      layers: { unit: 1, visual: 1 },
      greenStreak: { current: 2, longest: 2 },
      runsInLast30Days: 2,
      health: { daysSinceLastReport: 0, marker: { health: 'healthy' } },
    });
    expect(summary?.coverage.map(({ module, runId }) => [module, runId])).toEqual([
      ['composeApp', 'r2'],
      ['shared', 'r2'],
    ]);
    expect(landing.headline).toMatchObject({ totalTests: 2, runsInLast30Days: { total: 2 } });
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
