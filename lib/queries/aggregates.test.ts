import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  loadFlakyFailures,
  loadFlakyTests,
  loadReportCounts,
  loadTestTallies,
} from './aggregates.ts';
import { argsOf, fakeClient, rpcArgs, type Query } from './fake-client.test-support.ts';

// The database functions the pages ask for their counts (decision 2026-10-29): how the loaders
// call them and read their rows, and what the migration declares about each. What the functions
// answer, and that anon gets nothing section 9 hides, is proven against local Supabase in
// lib/queries/aggregates.int.test.ts and lib/seed/seed.int.test.ts.

const NOW = new Date('2026-10-05T12:00:00Z');
const WINDOW = { p_since: '2026-09-06T00:00:00.000Z', p_until: '2026-10-05T12:00:00.000Z' };

const answeringWith = (data: unknown) => fakeClient(() => ({ data }));
const only = (queries: readonly Query[]): Query => {
  expect(queries).toHaveLength(1);
  return queries[0] as Query;
};

describe('loadTestTallies', () => {
  it('asks run_test_tallies once for the distinct runs, ordered by its key, a page at a time', async () => {
    const { client, queries } = answeringWith([
      { run_id: 'r1', layer: 'unit', status: 'error', tests: 2 },
    ]);

    const tallies = await loadTestTallies(client, ['r1', 'r2', 'r1']);

    expect(tallies).toEqual([{ runId: 'r1', layer: 'unit', status: 'error', tests: 2 }]);
    const query = only(queries);
    expect(query.table).toBe('rpc:run_test_tallies');
    expect(rpcArgs(query)).toEqual({ p_run_ids: ['r1', 'r2'] });
    expect(argsOf(query, 'order')).toEqual([['run_id'], ['layer'], ['status']]);
    expect(argsOf(query, 'range')).toEqual([[0, 999]]);
  });

  it('asks nothing for no runs', async () => {
    const { client, queries } = answeringWith([]);
    expect(await loadTestTallies(client, [])).toEqual([]);
    expect(queries).toEqual([]);
  });

  it.each([
    ['an unknown layer', { run_id: 'r1', layer: 'smoke', status: 'passed', tests: 1 }],
    ['a count of none', { run_id: 'r1', layer: 'unit', status: 'passed', tests: 0 }],
  ])('refuses a row with %s rather than casting it', async (_, row) => {
    const { client } = answeringWith([row]);
    await expect(loadTestTallies(client, ['r1'])).rejects.toThrow(
      'count the runs’ tests returned an unexpected row',
    );
  });

  it('reports a database error with its code', async () => {
    const { client } = fakeClient(() => ({ error: { code: '57014', message: 'canceled' } }));
    await expect(loadTestTallies(client, ['r1'])).rejects.toThrow(
      'count the runs’ tests: 57014 canceled',
    );
  });
});

describe('loadReportCounts', () => {
  it('maps each run to its reports from run_report_counts', async () => {
    const { client, queries } = answeringWith([
      { run_id: 'r1', reports: 3 },
      { run_id: 'r2', reports: 1 },
    ]);

    const counts = await loadReportCounts(client, ['r1', 'r2', 'r3']);

    expect([...counts]).toEqual([
      ['r1', 3],
      ['r2', 1],
    ]);
    const query = only(queries);
    expect(query.table).toBe('rpc:run_report_counts');
    expect(rpcArgs(query)).toEqual({ p_run_ids: ['r1', 'r2', 'r3'] });
    expect(argsOf(query, 'order')).toEqual([['run_id']]);
  });

  it('asks nothing for no runs', async () => {
    const { client, queries } = answeringWith([]);
    expect(await loadReportCounts(client, [])).toEqual(new Map());
    expect(queries).toEqual([]);
  });
});

describe('loadFlakyTests', () => {
  it('asks flaky_tests about the 30 UTC days up to now', async () => {
    const { client, queries } = answeringWith([
      { test_id: 't1', platforms: ['ios-sim', 'jvm'], commits: 2 },
    ]);

    const flaky = await loadFlakyTests(client, 'project-1', NOW);

    expect(flaky).toEqual([{ testId: 't1', platforms: ['ios-sim', 'jvm'], commits: 2 }]);
    const query = only(queries);
    expect(query.table).toBe('rpc:flaky_tests');
    // 2026-10-05 minus 29 days is 2026-09-06, the window's first day.
    expect(rpcArgs(query)).toEqual({ p_project_id: 'project-1', ...WINDOW });
    expect(argsOf(query, 'order')).toEqual([['test_id']]);
  });

  it('refuses a flaky test with no platform rather than casting it', async () => {
    const { client } = answeringWith([{ test_id: 't1', platforms: [], commits: 1 }]);
    await expect(loadFlakyTests(client, 'project-1', NOW)).rejects.toThrow(
      'find the flaky tests returned an unexpected row',
    );
  });
});

describe('loadFlakyFailures', () => {
  it('asks flaky_failures about the given tests, with the same window', async () => {
    const { client, queries } = answeringWith([{ test_id: 't1', failed: 1, runs: 40 }]);

    const failures = await loadFlakyFailures(client, 'project-1', NOW, ['t1', 't1']);

    expect(failures).toEqual([{ testId: 't1', failed: 1, runs: 40 }]);
    const query = only(queries);
    expect(query.table).toBe('rpc:flaky_failures');
    expect(rpcArgs(query)).toEqual({ p_project_id: 'project-1', ...WINDOW, p_test_ids: ['t1'] });
  });

  it('asks nothing for no tests', async () => {
    const { client, queries } = answeringWith([]);
    expect(await loadFlakyFailures(client, 'project-1', NOW, [])).toEqual([]);
    expect(queries).toEqual([]);
  });
});

// What the migration declares for each function, which no query result shows: each only reads,
// runs as its caller so row-level security and the views decide what anon sees, resolves no name
// through a search path, never reads failure text, and is executable by the API roles only.
describe('the page aggregates migration', () => {
  const sql = readFileSync(
    new URL('../../supabase/migrations/20261029120000_page_aggregates.sql', import.meta.url),
    'utf8',
  );
  const code = sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
  const functions = [...code.matchAll(/create function (public\.\w+)\(([\s\S]*?)\$\$;/g)].map(
    ([body, name]) => ({ name: name ?? '', body }),
  );
  const SIGNATURES = [
    'public.run_test_tallies(uuid[])',
    'public.run_report_counts(uuid[])',
    'public.flaky_tests(uuid, timestamptz, timestamptz)',
    'public.flaky_failures(uuid, timestamptz, timestamptz, uuid[])',
  ];

  it('creates the four functions and changes no table, policy or view', () => {
    expect(functions.map(({ name }) => name)).toEqual([
      'public.run_test_tallies',
      'public.run_report_counts',
      'public.flaky_tests',
      'public.flaky_failures',
    ]);
    expect(code).not.toMatch(/\b(alter|drop|policy|insert|update|delete|truncate)\b/i);
    expect(code).not.toMatch(/create (table|view|index)/i);
  });

  it.each([
    'public.run_test_tallies',
    'public.run_report_counts',
    'public.flaky_tests',
    'public.flaky_failures',
  ])('declares %s stable, security invoker, with an empty search_path', (name) => {
    const body = functions.find((fn) => fn.name === name)?.body ?? '';
    expect(body).toMatch(/\blanguage sql\s+stable\s+security invoker\s+set search_path = ''/);
    expect(body).not.toMatch(/security definer/);
    expect(body).not.toMatch(/result_failures/);
  });

  it.each([
    'public.run_test_tallies',
    'public.run_report_counts',
    'public.flaky_tests',
    'public.flaky_failures',
  ])('names only qualified tables and its own subqueries in %s', (name) => {
    const body = functions.find((fn) => fn.name === name)?.body ?? '';
    const own = new Set(
      [...body.matchAll(/(?:with|,)\s+(\w+) as \(/g)].map(([, cte]) => cte as string),
    );
    const sources = [...body.matchAll(/\b(?:from|join)\s+([\w.]+|\()/g)].map(
      ([, source]) => source as string,
    );
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      const qualified = source.startsWith('public.') || source === '(' || own.has(source);
      expect({ source, qualified }).toEqual({ source, qualified: true });
    }
  });

  it('takes execute from PUBLIC and grants it to anon, authenticated and service_role only', () => {
    const revoke =
      /revoke execute on function\s+([\s\S]*?)\s+from public, anon, authenticated;/.exec(code);
    const grant =
      /grant execute on function\s+([\s\S]*?)\s+to anon, authenticated, service_role;/.exec(code);
    const listed = (match: RegExpExecArray | null) =>
      (match?.[1] ?? '').split(/,\s*\n\s*/).map((signature) => signature.trim());
    expect(listed(revoke)).toEqual(SIGNATURES);
    expect(listed(grant)).toEqual(SIGNATURES);
    expect(code.match(/\bgrant\b/gi)).toHaveLength(1);
  });
});
