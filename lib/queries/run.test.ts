import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  argsOf,
  fakeClient,
  firstArgs,
  type Answer,
  type Query,
} from './fake-client.test-support.ts';
import { loadRunDetail } from './run.ts';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

// The run page loader's queries and how it assembles their rows (spec section 13,
// /p/[slug]/runs/[id]; design/data-map.md, Run detail). What it holds for the real seed read as
// anon, a private project's hidden failure text included, is proven in lib/seed/seed.int.test.ts.

const NOW = new Date('2026-10-05T12:00:00Z');
const RUN_ID = '0b5a3c1e-6f0e-4d1c-9a55-3c2a1b0f9e77';

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
  repo_url: 'https://github.com/bhelco1/Ostomate2',
  dev_stack: [],
  test_stack: [],
};

const runRow = (id: string, finishedAt: string, overrides: Record<string, unknown> = {}) => ({
  id,
  ci_run_id: '36100000009',
  run_attempt: 1,
  commit_sha: 'c1',
  branch: 'main',
  status: 'failed',
  passed: 2,
  failed: 1,
  skipped: 1,
  started_at: finishedAt,
  finished_at: finishedAt,
  source: 'ci',
  event: 'push',
  run_url: 'https://github.com/bhelco1/Ostomate2/actions/runs/36100000009',
  total: 4,
  duration_ms: 26_000,
  results_pruned_at: null,
  ...overrides,
});

const THE_RUN = runRow(RUN_ID, '2026-10-05T09:26:17.747+00:00');

const resultRow = (
  id: string,
  testId: string,
  status: string,
  platform: string,
  overrides: Record<string, unknown> = {},
) => ({
  id,
  test_id: testId,
  status,
  duration_ms: 400,
  tests: {
    test_key: `key-${testId}`,
    module: 'composeApp',
    suite: 'com.ostomate.app.HomeViewModelTest',
    name: testId,
    layer: 'unit',
  },
  reports: { run_id: RUN_ID, job: platform === 'jvm' ? 'android' : 'ios', platform },
  ...overrides,
});

// t-mismatch fails on the simulator and passes on the JVM; t-pass passes; t-skip is skipped.
const RESULTS = [
  resultRow('x1', 't-mismatch', 'passed', 'jvm'),
  resultRow('x2', 't-mismatch', 'failed', 'ios-sim'),
  resultRow('x3', 't-pass', 'passed', 'jvm'),
  resultRow('x4', 't-skip', 'skipped', 'jvm'),
];

const REPORT = {
  job: 'android',
  module: 'composeApp',
  platform: 'jvm',
  format: 'junit',
  total: 3,
  passed: 2,
  failed: 0,
  skipped: 1,
  duration_ms: 20_000,
  started_at: '2026-10-05T09:26:00+00:00',
  finished_at: '2026-10-05T09:26:17.747+00:00',
  received_at: '2026-10-05T09:26:19.120+00:00',
};

interface Tables {
  readonly projects?: readonly unknown[];
  readonly run?: readonly unknown[];
  readonly windowRuns?: readonly unknown[];
  readonly windowResults?: readonly unknown[];
  readonly failures?: readonly unknown[];
}

const isTheRun = (query: Query) => argsOf(query, 'eq').some(([column]) => column === 'id');

const answering =
  (tables: Tables) =>
  (query: Query): Answer => {
    switch (query.table) {
      case 'projects_public':
        return { data: tables.projects ?? [projectRow] };
      case 'runs_public':
        return { data: isTheRun(query) ? (tables.run ?? [THE_RUN]) : (tables.windowRuns ?? []) };
      case 'reports':
        return { data: [REPORT] };
      case 'results': {
        const select = String(firstArgs(query, 'select')[0]);
        return {
          data: select.includes('tests!inner') ? RESULTS : (tables.windowResults ?? []),
        };
      }
      case 'result_failures':
        return { data: tables.failures ?? [] };
      default:
        return { error: { code: 'X', message: `unexpected table ${query.table}` } };
    }
  };

describe('loadRunDetail', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(createClient).mockReset();
  });

  it('is null for an unknown project, without looking for the run', async () => {
    const { client, queries } = fakeClient(answering({ projects: [] }));

    expect(await loadRunDetail('nope', RUN_ID, client, NOW)).toBeNull();
    expect(queries.map((query) => query.table)).toEqual(['projects_public']);
  });

  it.each(['36100000009', 'not-a-uuid', `${RUN_ID}x`, ''])(
    'is null for run ID %j, which is not a run’s UUID, without querying runs',
    async (id) => {
      const { client, queries } = fakeClient(answering({}));

      expect(await loadRunDetail('ostomate2', id, client, NOW)).toBeNull();
      expect(queries.map((query) => query.table)).toEqual(['projects_public']);
    },
  );

  it('is null for a run of another project', async () => {
    const { client, queries } = fakeClient(answering({ run: [] }));

    expect(await loadRunDetail('ostomate2', RUN_ID, client, NOW)).toBeNull();
    const runQuery = queries.find(isTheRun) as Query;
    expect(argsOf(runQuery, 'eq')).toEqual([
      ['id', RUN_ID],
      ['project_id', 'project-1'],
    ]);
  });

  it('carries the run’s metadata, titled, and its reports', async () => {
    const { client } = fakeClient(answering({}));

    const detail = await loadRunDetail('ostomate2', RUN_ID, client, NOW);

    expect(detail?.project.slug).toBe('ostomate2');
    expect(detail?.run).toEqual({
      id: RUN_ID,
      ciRunId: '36100000009',
      runAttempt: 1,
      title: 'Push to main',
      event: 'push',
      branch: 'main',
      commitSha: 'c1',
      runUrl: 'https://github.com/bhelco1/Ostomate2/actions/runs/36100000009',
      startedAt: new Date('2026-10-05T09:26:17.747Z'),
      finishedAt: new Date('2026-10-05T09:26:17.747Z'),
      source: 'ci',
      status: 'failed',
      total: 4,
      passed: 2,
      failed: 1,
      skipped: 1,
      durationMs: 26_000,
      reports: 1,
      resultsPrunedAt: null,
      tests: { total: 3, passed: 1, failed: 1, skipped: 1 },
    });
    expect(detail?.reports).toEqual([
      expect.objectContaining({
        job: 'android',
        module: 'composeApp',
        platform: 'jvm',
        total: 3,
        finishedAt: new Date('2026-10-05T09:26:17.747Z'),
        receivedAt: new Date('2026-10-05T09:26:19.120Z'),
      }),
    ]);
  });

  // Decision 2026-09-29: a run's counts are distinct tests, as the project page's run rows read.
  // The fixture's four executions are three tests: t-mismatch failed on one platform and passed
  // on the other, so it is one failed test.
  it('counts the run’s distinct tests beside its executions', async () => {
    const { client } = fakeClient(answering({}));

    const detail = await loadRunDetail('ostomate2', RUN_ID, client, NOW);

    expect(detail?.run.tests).toEqual({ total: 3, passed: 1, failed: 1, skipped: 1 });
    expect(detail?.run).toMatchObject({ total: 4, passed: 2, failed: 1, skipped: 1 });
  });

  it('makes one row per test with its platforms, mismatch and the failure text RLS returned', async () => {
    const { client, queries } = fakeClient(
      answering({
        failures: [{ result_id: 'x2', message: 'expected 3 but was 2', detail: 'at Home.kt:42' }],
      }),
    );

    const detail = await loadRunDetail('ostomate2', RUN_ID, client, NOW);

    expect(detail?.results?.map((row) => [row.testKey, row.status])).toEqual([
      ['key-t-mismatch', 'failed'],
      ['key-t-pass', 'passed'],
      ['key-t-skip', 'skipped'],
    ]);
    expect(detail?.results?.[0]).toMatchObject({
      mismatch: [
        { status: 'failed', platforms: ['ios-sim'] },
        { status: 'passed', platforms: ['jvm'] },
      ],
      platforms: [
        { platform: 'jvm', status: 'passed', failures: [] },
        {
          platform: 'ios-sim',
          status: 'failed',
          failures: [{ message: 'expected 3 but was 2', detail: 'at Home.kt:42' }],
        },
      ],
    });
    // Failure text is asked for the failing results only.
    const failures = queries.find((query) => query.table === 'result_failures') as Query;
    expect(argsOf(failures, 'in')).toEqual([['result_id', ['x2']]]);
  });

  // The failing result keeps its status and time, which the private run page heads with
  // (design v8 item 18); only the text RLS withheld is missing.
  it('has no failure text where RLS returns none, as for a private project', async () => {
    const { client } = fakeClient(answering({ failures: [] }));

    const detail = await loadRunDetail('ostomate2', RUN_ID, client, NOW);

    const failures = detail?.results?.[0]?.platforms.flatMap((platform) => platform.failures);
    expect(failures).toEqual([{ status: 'failed', durationMs: 400, message: null, detail: null }]);
  });

  it('flags tests flaky over the 30 days before now, from default-branch CI runs', async () => {
    const windowRuns = [
      runRow('w1', '2026-10-01T10:00:00+00:00', { commit_sha: 'c0' }),
      runRow('w2', '2026-10-01T11:00:00+00:00', { commit_sha: 'c0', run_attempt: 2 }),
    ];
    const windowResults = [
      { id: 'y1', test_id: 't-pass', status: 'failed', reports: { run_id: 'w1', platform: 'jvm' } },
      { id: 'y2', test_id: 't-pass', status: 'passed', reports: { run_id: 'w2', platform: 'jvm' } },
    ];
    const { client, queries } = fakeClient(answering({ windowRuns, windowResults }));

    const detail = await loadRunDetail('ostomate2', RUN_ID, client, NOW);

    expect(detail?.results?.map((row) => [row.testKey, row.flaky])).toEqual([
      ['key-t-mismatch', false],
      ['key-t-pass', true],
      ['key-t-skip', false],
    ]);
    const window = queries.find(
      (query) => query.table === 'runs_public' && !isTheRun(query),
    ) as Query;
    expect(argsOf(window, 'eq')).toEqual([
      ['project_id', 'project-1'],
      ['branch', 'main'],
      ['source', 'ci'],
    ]);
    // 2026-10-05 minus 29 days is 2026-09-06, the window's first day.
    expect(argsOf(window, 'gte')).toEqual([['finished_at', '2026-09-06T00:00:00.000Z']]);
    expect(argsOf(window, 'lte')).toEqual([['finished_at', '2026-10-05T12:00:00.000Z']]);
  });

  it('shows the pruned notice’s totals in place of results, and reads no results', async () => {
    const pruned = runRow(RUN_ID, '2026-03-01T10:00:00+00:00', {
      results_pruned_at: '2026-09-01T03:00:00+00:00',
    });
    const { client, queries } = fakeClient(answering({ run: [pruned] }));

    const detail = await loadRunDetail('ostomate2', RUN_ID, client, NOW);

    expect(detail?.run.resultsPrunedAt).toEqual(new Date('2026-09-01T03:00:00Z'));
    expect(detail?.results).toBeNull();
    // No per-test rows are left to count, so the run keeps its executions (section 5.12).
    expect(detail?.run.tests).toBeNull();
    expect(detail?.run).toMatchObject({ total: 4, passed: 2, failed: 1 });
    expect(queries.some((query) => query.table === 'results')).toBe(false);
    expect(queries.some((query) => query.table === 'result_failures')).toBe(false);
  });

  it('reads no failure text for a run with nothing failing', async () => {
    const { client, queries } = fakeClient(
      answering({ run: [runRow(RUN_ID, '2026-10-05T09:00:00+00:00', { status: 'passed' })] }),
    );
    const passing = RESULTS.filter((row) => row.status !== 'failed');
    const answer = answering({});
    const { client: passingClient, queries: passingQueries } = fakeClient((query) =>
      query.table === 'results' && String(firstArgs(query, 'select')[0]).includes('tests!inner')
        ? { data: passing }
        : answer(query),
    );

    await loadRunDetail('ostomate2', RUN_ID, client, NOW);
    await loadRunDetail('ostomate2', RUN_ID, passingClient, NOW);

    expect(queries.some((query) => query.table === 'result_failures')).toBe(true);
    expect(passingQueries.some((query) => query.table === 'result_failures')).toBe(false);
  });

  it('reports a database error with its code', async () => {
    const { client } = fakeClient((query) =>
      query.table === 'projects_public'
        ? { data: [projectRow] }
        : { error: { code: '42501', message: 'permission denied' } },
    );

    await expect(loadRunDetail('ostomate2', RUN_ID, client, NOW)).rejects.toThrow(
      'look up the run: 42501 permission denied',
    );
  });

  it('refuses a result row it does not recognise rather than casting it', async () => {
    const answer = answering({});
    const { client } = fakeClient((query) =>
      query.table === 'results' ? { data: [{ id: 'x1' }] } : answer(query),
    );

    await expect(loadRunDetail('ostomate2', RUN_ID, client, NOW)).rejects.toThrow(
      'load the run results returned an unexpected row',
    );
  });

  it('builds the publishable-key client and reads now from lib/clock when given neither', async () => {
    const { client, queries } = fakeClient(answering({}));
    vi.mocked(createClient).mockReturnValue(client as unknown as ReturnType<typeof createClient>);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_unit_test_placeholder');
    vi.stubEnv('TESTPULSE_FIXED_NOW', '2026-10-05T12:00:00.000Z');

    await loadRunDetail('ostomate2', RUN_ID);

    expect(vi.mocked(createClient).mock.calls[0]?.[1]).toBe('sb_publishable_unit_test_placeholder');
    const window = queries.find(
      (query) => query.table === 'runs_public' && !isTheRun(query),
    ) as Query;
    expect(argsOf(window, 'lte')).toEqual([['finished_at', '2026-10-05T12:00:00.000Z']]);
  });
});
