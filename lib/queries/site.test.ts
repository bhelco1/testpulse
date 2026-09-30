import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { argsOf, fakeClient, type Answer, type Query } from './fake-client.test-support.ts';
import { loadSiteChrome } from './site.ts';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

// What every public page's header and footer read (design/components.md, SiteHeader,
// ProjectSwitcher, SiteFooter): each project with its latest run's status, and when the last
// report arrived. What they hold for the real seed is proven in lib/seed/seed.int.test.ts.

const NOW = new Date('2026-10-05T12:00:00Z');

const PROJECTS = [
  { id: 'p1', slug: 'ostomate2', name: 'Ostomate 2.0', default_branch: 'main' },
  { id: 'p2', slug: 'routeserve', name: 'RouteServe', default_branch: 'main' },
  { id: 'p3', slug: 'testpulse', name: 'testpulse', default_branch: 'trunk' },
];

const projectOf = (query: Query) =>
  argsOf(query, 'eq').find(([column]) => column === 'project_id')?.[1];

const answering =
  (latest: Record<string, string | undefined>, lastReport: string | null) =>
  (query: Query): Answer => {
    if (query.table === 'projects_public') return { data: PROJECTS };
    if (query.table !== 'runs_public') {
      return { error: { code: 'X', message: `unexpected ${query.table}` } };
    }
    const project = projectOf(query);
    if (project === undefined) {
      return { data: lastReport === null ? [] : [{ finished_at: lastReport }] };
    }
    const status = latest[String(project)];
    return { data: status === undefined ? [] : [{ id: `run-${String(project)}`, status }] };
  };

describe('loadSiteChrome', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(createClient).mockReset();
  });

  it('lists every project in dashboard order with its latest run and its status', async () => {
    const { client, queries } = fakeClient(
      answering({ p1: 'passed', p2: 'failed' }, '2026-10-05T09:26:00+00:00'),
    );

    const chrome = await loadSiteChrome(client, NOW);

    expect(chrome.projects).toEqual([
      { slug: 'ostomate2', name: 'Ostomate 2.0', status: 'passed', latestRunId: 'run-p1' },
      { slug: 'routeserve', name: 'RouteServe', status: 'failed', latestRunId: 'run-p2' },
      // No CI run on its default branch yet.
      { slug: 'testpulse', name: 'testpulse', status: 'not_reporting', latestRunId: null },
    ]);
    expect(queries[0]).toEqual({
      table: 'projects_public',
      calls: [
        ['select', 'id, slug, name, default_branch'],
        ['order', 'sort_order'],
        ['order', 'slug'],
      ],
    });
  });

  it('takes the latest default-branch CI run up to now, in the run list’s order', async () => {
    const { client, queries } = fakeClient(answering({}, null));

    await loadSiteChrome(client, NOW);

    const testpulse = queries.find((query) => projectOf(query) === 'p3') as Query;
    expect(testpulse.calls).toEqual([
      ['select', 'id, status'],
      ['eq', 'project_id', 'p3'],
      ['eq', 'branch', 'trunk'],
      ['eq', 'source', 'ci'],
      ['lte', 'finished_at', '2026-10-05T12:00:00.000Z'],
      ['order', 'finished_at', { ascending: false }],
      ['order', 'started_at', { ascending: false }],
      ['order', 'ci_run_id', { ascending: false }],
      ['order', 'run_attempt', { ascending: false }],
      ['limit', 1],
    ]);
  });

  it('dates the last report by the latest CI run on any branch of any project', async () => {
    const { client, queries } = fakeClient(answering({}, '2026-10-05T09:26:00+00:00'));

    const chrome = await loadSiteChrome(client, NOW);

    expect(chrome.lastReportAt).toEqual(new Date('2026-10-05T09:26:00Z'));
    const last = queries.find(
      (query) => query.table === 'runs_public' && projectOf(query) === undefined,
    ) as Query;
    expect(last.calls).toEqual([
      ['select', 'finished_at'],
      ['eq', 'source', 'ci'],
      ['lte', 'finished_at', '2026-10-05T12:00:00.000Z'],
      ['order', 'finished_at', { ascending: false }],
      ['limit', 1],
    ]);
  });

  it('has no last report before any project has reported', async () => {
    const { client } = fakeClient(answering({}, null));

    expect((await loadSiteChrome(client, NOW)).lastReportAt).toBeNull();
  });

  it('refuses a row it does not recognise rather than casting it', async () => {
    const { client } = fakeClient((query) =>
      query.table === 'projects_public' ? { data: PROJECTS } : { data: [{ status: 'running' }] },
    );

    await expect(loadSiteChrome(client, NOW)).rejects.toThrow('load the latest run status');
  });

  it('reports a database error with its code', async () => {
    const { client } = fakeClient(() => ({
      error: { code: '42501', message: 'permission denied' },
    }));

    await expect(loadSiteChrome(client, NOW)).rejects.toThrow(
      'list the projects: 42501 permission denied',
    );
  });

  it('builds the publishable-key client and reads now from lib/clock when given neither', async () => {
    const { client, queries } = fakeClient(answering({}, null));
    vi.mocked(createClient).mockReturnValue(client as unknown as ReturnType<typeof createClient>);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_unit_test_placeholder');
    vi.stubEnv('TESTPULSE_FIXED_NOW', '2026-10-05T12:00:00.000Z');

    await loadSiteChrome();

    expect(vi.mocked(createClient).mock.calls[0]?.[1]).toBe('sb_publishable_unit_test_placeholder');
    const last = queries.find(
      (query) => query.table === 'runs_public' && projectOf(query) === undefined,
    ) as Query;
    expect(argsOf(last, 'lte')).toEqual([['finished_at', '2026-10-05T12:00:00.000Z']]);
  });
});
