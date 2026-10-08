import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { argsOf, fakeClient, type Answer, type Query } from './fake-client.test-support.ts';
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

const result = (id: string, testId: string, status: string, runId: string) => ({
  id,
  test_id: testId,
  status,
  tests: { layer: 'e2e' },
  reports: { run_id: runId },
});

interface Tables {
  readonly projects?: readonly unknown[];
  readonly runs?: readonly unknown[];
  readonly results?: readonly unknown[];
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
      case 'results':
        return { data: tables.results ?? [] };
      case 'coverage':
        return { data: [] };
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
    const { client } = fakeClient(
      answering({
        projects: [projectRow],
        runs: [runRow('r1', '2026-09-22T04:37:33.884+00:00')],
        results: [
          result('x1', 't1', 'passed', 'r1'),
          result('x2', 't2', 'failed', 'r1'),
          result('x3', 't3', 'skipped', 'r1'),
        ],
      }),
    );

    const { self } = await loadHowItsTested(client, NOW);

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

  it('answers a registered project with no run as having no latest run', async () => {
    const { client } = fakeClient(answering({ projects: [projectRow], runs: [] }));

    const { self } = await loadHowItsTested(client, NOW);

    expect(self?.summary.latestRun).toBeNull();
    expect(self?.latestDurationMs).toBeNull();
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
