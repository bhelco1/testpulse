import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { loadStatsInput } from './load.ts';

// The query shapes, paging, chunking and failure handling of the loader. What the rows mean,
// and that the anon role may read them, is proven against a real database in load.int.test.ts.

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

const rangeOf = (query: Query): [number, number] | undefined =>
  argsOf(query, 'range')[0] as [number, number] | undefined;

// Records every builder call and, when the chain is awaited, answers it from the test.
function fakeClient(answer: (query: Query) => Answer): {
  client: SupabaseClient;
  queries: Query[];
} {
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
          if (property === 'maybeSingle') {
            return async () => settle({ ...query, calls: [...query.calls, ['maybeSingle']] });
          }
          return (...args: unknown[]) =>
            chain({ ...query, calls: [...query.calls, [String(property), ...args]] });
        },
      },
    );
  const client = { from: (table: string) => chain({ table, calls: [] }) } as SupabaseClient;
  return { client, queries };
}

const NOW = new Date('2026-10-01T12:00:00Z');
const PROJECT = { id: 'project-1', default_branch: 'main' };

const runRow = (index: number, finishedAt = '2026-09-20T00:00:00+00:00') => ({
  id: `run-${String(index).padStart(4, '0')}`,
  ci_run_id: String(1000 + index),
  run_attempt: 1,
  commit_sha: 'abcdef0',
  branch: 'main',
  status: 'passed',
  passed: 1,
  failed: 0,
  skipped: 0,
  started_at: finishedAt,
  finished_at: finishedAt,
  source: 'ci',
});

// Answers the project lookup, then each table from the given function; everything else empty.
const answering =
  (tables: Partial<Record<string, (query: Query) => Answer>>) =>
  (query: Query): Answer => {
    if (query.table === 'projects_public') return { data: PROJECT };
    return tables[query.table]?.(query) ?? { data: [] };
  };

const isWindowQuery = (query: Query) => argsOf(query, 'gte').length > 0;

describe('loadStatsInput', () => {
  it('reads runs through runs_public: default branch, both sources, the 90-day window', async () => {
    const { client, queries } = fakeClient(answering({}));
    await loadStatsInput(client, 'ostomate2', NOW);

    const [project, window, before] = queries;
    expect(project).toEqual({
      table: 'projects_public',
      calls: [['select', 'id, default_branch'], ['eq', 'slug', 'ostomate2'], ['maybeSingle']],
    });
    expect(window?.table).toBe('runs_public');
    expect(argsOf(window as Query, 'eq')).toEqual([
      ['project_id', 'project-1'],
      ['branch', 'main'],
    ]);
    expect(argsOf(window as Query, 'in')).toEqual([['source', ['ci', 'backfill']]]);
    expect(argsOf(window as Query, 'gte')).toEqual([['finished_at', '2026-07-04T00:00:00.000Z']]);
    expect(argsOf(window as Query, 'lte')).toEqual([['finished_at', '2026-10-01T12:00:00.000Z']]);

    expect(before?.table).toBe('runs_public');
    expect(argsOf(before as Query, 'in')).toEqual([['source', ['ci']]]);
    expect(argsOf(before as Query, 'lt')).toEqual([['finished_at', '2026-07-04T00:00:00.000Z']]);
    expect(argsOf(before as Query, 'limit')).toEqual([[1]]);
    // No runs, so nothing to read coverage or results for.
    expect(queries).toHaveLength(3);
  });

  it('pages past the 1000-row cap', async () => {
    const { client, queries } = fakeClient(
      answering({
        runs_public: (query) => {
          if (!isWindowQuery(query)) return { data: [] };
          const [from] = rangeOf(query) ?? [0];
          return {
            data: from === 0 ? Array.from({ length: 1000 }, (_, i) => runRow(i)) : [runRow(1000)],
          };
        },
      }),
    );
    const input = await loadStatsInput(client, 'ostomate2', NOW);
    expect(input.runs).toHaveLength(1001);
    expect(queries.filter(isWindowQuery).map(rangeOf)).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it('puts the run before the window first and asks for coverage and results by run in chunks', async () => {
    const inWindow = Array.from({ length: 150 }, (_, i) => runRow(i));
    const { client, queries } = fakeClient(
      answering({
        runs_public: (query) =>
          isWindowQuery(query)
            ? { data: inWindow }
            : { data: [{ ...runRow(9999, '2026-06-30T00:00:00+00:00'), id: 'before' }] },
        coverage: (query) => ({
          data: (argsOf(query, 'in')[0]?.[1] as string[]).map((runId) => ({
            id: `c-${runId}`,
            module: 'shared',
            lines_covered: 1,
            lines_total: 2,
            lines_pct: null,
            reports: { run_id: runId },
          })),
        }),
      }),
    );
    const input = await loadStatsInput(client, 'ostomate2', NOW);
    expect(input.runs[0]?.id).toBe('before');
    expect(input.runs).toHaveLength(151);

    const coverageQueries = queries.filter((query) => query.table === 'coverage');
    expect(
      coverageQueries.map((query) => (argsOf(query, 'in')[0]?.[1] as string[]).length),
    ).toEqual([100, 50]);
    expect(argsOf(coverageQueries[0] as Query, 'in')[0]?.[0]).toBe('reports.run_id');
    expect(input.coverage).toHaveLength(150);
    // Coverage is read for the window only, never for the run before it.
    expect(input.coverage.some((row) => row.runId === 'before')).toBe(false);
  });

  it('reads results only for runs in the 30-day window', async () => {
    const { client, queries } = fakeClient(
      answering({
        runs_public: (query) =>
          isWindowQuery(query)
            ? {
                data: [
                  runRow(1, '2026-09-01T23:59:59+00:00'),
                  runRow(2, '2026-09-02T00:00:00+00:00'),
                ],
              }
            : { data: [] },
      }),
    );
    await loadStatsInput(client, 'ostomate2', NOW);
    const results = queries.filter((query) => query.table === 'results');
    expect(results.map((query) => argsOf(query, 'in'))).toEqual([
      [['reports.run_id', ['run-0002']]],
    ]);
  });

  it('refuses a slug with no project', async () => {
    const { client } = fakeClient(() => ({ data: null }));
    await expect(loadStatsInput(client, 'nope', NOW)).rejects.toThrow('project "nope" not found');
  });

  it('names the query that failed and the PostgREST error', async () => {
    const { client } = fakeClient(
      answering({ runs_public: () => ({ error: { code: '57014', message: 'canceled' } }) }),
    );
    await expect(loadStatsInput(client, 'ostomate2', NOW)).rejects.toThrow(
      'load runs: 57014 canceled',
    );

    const lookup = fakeClient(() => ({ error: { code: '42501', message: 'denied' } }));
    await expect(loadStatsInput(lookup.client, 'ostomate2', NOW)).rejects.toThrow(
      'look up project "ostomate2": 42501 denied',
    );
  });

  it('refuses a row it cannot read rather than guessing', async () => {
    const { client } = fakeClient(
      answering({ runs_public: () => ({ data: [{ ...runRow(1), source: 'import' }] }) }),
    );
    await expect(loadStatsInput(client, 'ostomate2', NOW)).rejects.toThrow(
      'load runs returned an unexpected row',
    );

    const badProject = fakeClient(() => ({ data: { id: 'p' } }));
    await expect(loadStatsInput(badProject.client, 'x', NOW)).rejects.toThrow(
      'project "x" returned an unexpected row',
    );
  });
});
