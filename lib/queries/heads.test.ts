import { describe, expect, it } from 'vitest';

import { argsOf, fakeClient, type Answer, type Query } from './fake-client.test-support.ts';
import { loadProjectHead, loadRunHead, loadTestHead } from './heads.ts';

// The page heads' reads (decision 2026-09-30): the project, and the run or test the URL names,
// never a page's results. The routes' own heads are pinned in app/p/[slug]/metadata.test.ts.

const RUN_ID = '0b5a3c1e-6f0e-4d1c-9a55-3c2a1b0f9e77';
const KEY = 'a'.repeat(64);

const projectRow = {
  id: 'project-1',
  slug: 'routeserve',
  name: 'RouteServe',
  tagline: 'CRM',
  visibility: 'private',
  default_branch: 'main',
  declared_suites: [],
  coverage_floors: {},
  expected_cadence_days: 8,
  description: 'About it.',
  repo_url: null,
  dev_stack: [],
  test_stack: [],
};

const runRow = {
  id: RUN_ID,
  ci_run_id: '36100000009',
  run_attempt: 1,
  commit_sha: 'c1',
  branch: 'feature/x',
  status: 'passed',
  passed: 3,
  failed: 0,
  skipped: 0,
  started_at: '2026-10-05T09:26:00+00:00',
  finished_at: '2026-10-05T09:26:17.747+00:00',
  source: 'ci',
  event: 'pull_request',
  run_url: null,
  total: 3,
  duration_ms: 17_000,
  results_pruned_at: null,
};

const testRow = {
  id: 'test-1',
  test_key: KEY,
  module: 'api',
  suite: 'asset.test.ts',
  name: 'accepts a minimal asset',
  layer: 'unit',
  first_seen_at: '2026-09-24T14:05:00+00:00',
  last_seen_at: '2026-10-05T09:26:17.747+00:00',
};

const answering =
  (rows: Partial<Record<string, readonly unknown[]>>) =>
  (query: Query): Answer => ({ data: rows[query.table] ?? [] });

const found = { projects_public: [projectRow], runs_public: [runRow], tests: [testRow] };
const tables = (queries: readonly Query[]) => queries.map((query) => query.table);

describe('loadProjectHead', () => {
  it('is the project, read alone', async () => {
    const { client, queries } = fakeClient(answering(found));

    expect((await loadProjectHead('routeserve', client))?.name).toBe('RouteServe');
    expect(tables(queries)).toEqual(['projects_public']);
  });

  it('is null for an unknown project', async () => {
    const { client } = fakeClient(answering({}));

    expect(await loadProjectHead('nope', client)).toBeNull();
  });
});

describe('loadRunHead', () => {
  it('is the project and the run’s ID and title, from the project’s run with that ID', async () => {
    const { client, queries } = fakeClient(answering(found));

    const head = await loadRunHead('routeserve', RUN_ID, client);

    expect(head?.project.slug).toBe('routeserve');
    expect(head?.run).toEqual({ ciRunId: '36100000009', title: 'Pull request from feature/x' });
    expect(tables(queries)).toEqual(['projects_public', 'runs_public']);
    expect(argsOf(queries[1] as Query, 'eq')).toEqual([
      ['id', RUN_ID],
      ['project_id', 'project-1'],
    ]);
  });

  it('is null for an unknown project, a run of another project, or an ID that is no UUID', async () => {
    const none = fakeClient(answering({}));
    expect(await loadRunHead('nope', RUN_ID, none.client)).toBeNull();

    const elsewhere = fakeClient(answering({ projects_public: [projectRow] }));
    expect(await loadRunHead('routeserve', RUN_ID, elsewhere.client)).toBeNull();

    const malformed = fakeClient(answering(found));
    expect(await loadRunHead('routeserve', '36100000009', malformed.client)).toBeNull();
    expect(tables(malformed.queries)).toEqual(['projects_public']);
  });
});

describe('loadTestHead', () => {
  it('is the project and the test with that key', async () => {
    const { client, queries } = fakeClient(answering(found));

    const head = await loadTestHead('routeserve', KEY, client);

    expect(head?.test).toEqual({
      testKey: KEY,
      module: 'api',
      suite: 'asset.test.ts',
      name: 'accepts a minimal asset',
      layer: 'unit',
      firstSeenAt: new Date('2026-09-24T14:05:00Z'),
      lastSeenAt: new Date('2026-10-05T09:26:17.747Z'),
    });
    expect(tables(queries)).toEqual(['projects_public', 'tests']);
    expect(argsOf(queries[1] as Query, 'eq')).toEqual([
      ['project_id', 'project-1'],
      ['test_key', KEY],
    ]);
  });

  it('is null for an unknown project, an unknown test, or a key that is no test key', async () => {
    const none = fakeClient(answering({}));
    expect(await loadTestHead('nope', KEY, none.client)).toBeNull();

    const unknown = fakeClient(answering({ projects_public: [projectRow] }));
    expect(await loadTestHead('routeserve', KEY, unknown.client)).toBeNull();

    const malformed = fakeClient(answering(found));
    expect(await loadTestHead('routeserve', 'A'.repeat(64), malformed.client)).toBeNull();
    expect(tables(malformed.queries)).toEqual(['projects_public']);
  });
});
