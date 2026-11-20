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

const runRow = (id: string, status: string, finishedAt: string, startedAt = finishedAt) => ({
  id,
  ci_run_id: `ci-${id}`,
  run_attempt: 1,
  commit_sha: `sha-${id}`,
  branch: 'main',
  status,
  passed: 1,
  failed: status === 'failed' ? 1 : 0,
  skipped: 0,
  started_at: startedAt,
  finished_at: finishedAt,
  source: 'ci',
});

const reportRow = (runId: string, job: string, receivedAt: string) => ({
  run_id: runId,
  job,
  module: job,
  platform: 'node',
  format: 'junit',
  total: 1,
  passed: 1,
  failed: 0,
  skipped: 0,
  duration_ms: 1_000,
  started_at: receivedAt,
  finished_at: receivedAt,
  received_at: receivedAt,
});

const answering =
  (
    latest: Record<string, string | readonly unknown[] | undefined>,
    lastReport: string | null,
    reports: readonly ReturnType<typeof reportRow>[] = [],
  ) =>
  (query: Query): Answer => {
    if (query.table === 'projects_public') return { data: PROJECTS };
    if (query.table === 'reports') {
      const [, ids = []] = (argsOf(query, 'in')[0] ?? []) as [string, string[]];
      return { data: reports.filter((row) => ids.includes(row.run_id)) };
    }
    if (query.table !== 'runs_public') {
      return { error: { code: 'X', message: `unexpected ${query.table}` } };
    }
    const project = projectOf(query);
    if (project === undefined) {
      return { data: lastReport === null ? [] : [{ finished_at: lastReport }] };
    }
    const runs = latest[String(project)];
    if (runs === undefined) return { data: [] };
    return {
      data:
        typeof runs === 'string'
          ? [runRow(`run-${String(project)}`, runs, '2026-10-05T09:00:00+00:00')]
          : runs,
    };
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
      [
        'select',
        'id, ci_run_id, run_attempt, commit_sha, branch, status, passed, failed, skipped, ' +
          'started_at, finished_at, source',
      ],
      ['eq', 'project_id', 'p3'],
      ['eq', 'branch', 'trunk'],
      ['eq', 'source', 'ci'],
      ['lte', 'finished_at', '2026-10-05T12:00:00.000Z'],
      ['order', 'finished_at', { ascending: false }],
      ['order', 'started_at', { ascending: false }],
      ['order', 'ci_run_id', { ascending: false }],
      ['order', 'run_attempt', { ascending: false }],
      ['range', 0, 4],
    ]);
  });

  it('keeps the latest settled run while a new run’s reports are arriving (decision 2026-11-19)', async () => {
    // s1 passed with unit and e2e reports. n2 has its unit report in, failing, 10 minutes after
    // it arrived, and is waiting on e2e: the switcher keeps s1, as the landing card does.
    const runs = [
      runRow('n2', 'failed', '2026-10-05T11:50:00+00:00'),
      runRow('s1', 'passed', '2026-10-05T10:20:00+00:00', '2026-10-05T10:00:00+00:00'),
    ];
    const reports = [
      reportRow('n2', 'unit', '2026-10-05T11:50:00+00:00'),
      reportRow('s1', 'unit', '2026-10-05T10:01:00+00:00'),
      reportRow('s1', 'e2e', '2026-10-05T10:20:00+00:00'),
    ];
    const { client, queries } = fakeClient(answering({ p1: runs }, null, reports));

    const chrome = await loadSiteChrome(client, NOW);

    expect(chrome.projects[0]).toEqual({
      slug: 'ostomate2',
      name: 'Ostomate 2.0',
      status: 'passed',
      latestRunId: 's1',
    });
    const read = queries.filter((query) => query.table === 'reports');
    expect(read.map((query) => argsOf(query, 'in'))).toEqual([[['run_id', ['n2', 's1']]]]);
  });

  it('reads further back while none of the runs read has settled by time', async () => {
    const page = (from: number) =>
      Array.from({ length: 5 }, (_, index) => {
        const minute = 59 - from - index;
        return runRow(
          `r${String(from + index)}`,
          'passed',
          `2026-10-05T11:${String(minute).padStart(2, '0')}:00+00:00`,
        );
      });
    const { client, queries } = fakeClient((query) => {
      if (query.table === 'runs_public' && projectOf(query) === 'p1') {
        const [from = 0] = (argsOf(query, 'range')[0] ?? []) as number[];
        return { data: from === 0 ? page(0) : page(5).slice(0, 2) };
      }
      return answering({}, null)(query);
    });

    const chrome = await loadSiteChrome(client, NOW);

    // Every run is under 45 minutes old and none has reports to compare: the newest is latest.
    expect(chrome.projects[0]?.latestRunId).toBe('r0');
    const pages = queries.filter(
      (query) => query.table === 'runs_public' && projectOf(query) === 'p1',
    );
    expect(pages.map((query) => argsOf(query, 'range'))).toEqual([[[0, 4]], [[5, 9]]]);
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
