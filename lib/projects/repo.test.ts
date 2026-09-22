import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { hashApiKey } from './keys.ts';
import { addProject, planSync, rotateProjectKey, syncProjects, toProjectRow } from './repo.ts';
import { parseProjectFile } from './schema.ts';

const file = parseProjectFile(
  [
    'slug: example',
    'name: Example',
    'tagline: A tagline.',
    'description: Some **markdown**.',
    'visibility: private',
    'repo_url: https://github.com/example/example',
    'default_branch: trunk',
    'dev_stack:',
    '  - category: API',
    '    items: [Express 5]',
    'test_stack:',
    '  - category: Runners',
    '    items: [Jest 30]',
    'layer_rules:',
    '  - match: { module: api, suite: "api/routes/**" }',
    '    layer: api',
    '  - default: unit',
    'name_normalization:',
    "  suite_prefixes: ['iosSimulatorArm64Test.']",
    "  name_suffixes: ['[iosSimulatorArm64]']",
    'declared_suites:',
    '  - name: Maestro',
    '    layer: e2e',
    '    count: 3',
    '    status: runs_in_ci_not_reported',
    'coverage_floors:',
    '  api: 80',
    'expected_cadence_days: 14',
    'sort_order: 5',
    'retention_days: 90',
  ].join('\n'),
  'projects/example.yaml',
);

describe('toProjectRow', () => {
  it('maps every YAML-owned column and nothing else', () => {
    expect(toProjectRow(file)).toEqual({
      slug: 'example',
      name: 'Example',
      tagline: 'A tagline.',
      description: 'Some **markdown**.',
      visibility: 'private',
      repo_url: 'https://github.com/example/example',
      default_branch: 'trunk',
      dev_stack: [{ category: 'API', items: ['Express 5'] }],
      test_stack: [{ category: 'Runners', items: ['Jest 30'] }],
      layer_rules: [
        { match: { module: 'api', suite: 'api/routes/**' }, layer: 'api' },
        { default: 'unit' },
      ],
      name_normalization: {
        suite_prefixes: ['iosSimulatorArm64Test.'],
        name_suffixes: ['[iosSimulatorArm64]'],
      },
      declared_suites: [
        { name: 'Maestro', layer: 'e2e', count: 3, status: 'runs_in_ci_not_reported' },
      ],
      coverage_floors: { api: 80 },
      expected_cadence_days: 14,
      sort_order: 5,
      retention_days: 90,
    });
  });

  it('never carries api_key_hash, so a sync cannot overwrite it', () => {
    expect(Object.keys(toProjectRow(file))).not.toContain('api_key_hash');
  });
});

describe('planSync (spec section 10)', () => {
  it('updates slugs with a row, skips slugs without one, and reports rows without a file', () => {
    expect(planSync(['b', 'a', 'new'], ['a', 'b', 'orphan'])).toEqual({
      updated: ['a', 'b'],
      skipped: ['new'],
      orphaned: ['orphan'],
    });
  });

  it('is empty on both sides when nothing exists yet', () => {
    expect(planSync([], [])).toEqual({ updated: [], skipped: [], orphaned: [] });
  });

  it('refuses two files that claim the same slug', () => {
    expect(() => planSync(['a', 'a'], ['a'])).toThrow(/duplicate.*"a"/);
  });
});

// A recording stand-in for the PostgREST query builder: each `from()` chain is one Query, and
// the test decides what the database answers. It proves what the repository sends and how it
// treats each answer; the integration test proves the same calls against real Postgres.
interface Query {
  readonly table: string;
  op?: 'insert' | 'select' | 'update';
  payload?: unknown;
  columns?: string;
  filters: [string, unknown][];
}

interface Answer {
  readonly data?: unknown;
  readonly error?: { code: string; message: string } | null;
}

const fakeClient = (
  answer: (query: Query) => Answer,
): { client: SupabaseClient; queries: Query[] } => {
  const queries: Query[] = [];
  const builder = (query: Query) => {
    const chain = {
      insert(payload: unknown) {
        query.op = 'insert';
        query.payload = payload;
        return chain;
      },
      update(payload: unknown) {
        query.op = 'update';
        query.payload = payload;
        return chain;
      },
      select(columns: string) {
        query.op ??= 'select';
        query.columns = columns;
        return chain;
      },
      eq(column: string, value: unknown) {
        query.filters.push([column, value]);
        return chain;
      },
      then(resolve: (value: Answer) => void) {
        const { data = null, error = null } = answer(query);
        resolve({ data, error });
      },
    };
    return chain;
  };
  const client = {
    from(table: string) {
      const query: Query = { table, filters: [] };
      queries.push(query);
      return builder(query);
    },
  };
  return { client: client as unknown as SupabaseClient, queries };
};

const ok: Answer = { data: null, error: null };
const UNIQUE_VIOLATION = {
  code: '23505',
  message: 'duplicate key value violates unique constraint',
};
const OUTAGE = { code: '57P01', message: 'terminating connection due to administrator command' };

describe('addProject', () => {
  it('inserts the row plus the hash of the key it returns, and selects nothing back', async () => {
    const { client, queries } = fakeClient(() => ok);

    const key = await addProject(client, file);

    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatchObject({ table: 'projects', op: 'insert', filters: [] });
    expect(queries[0]?.columns).toBeUndefined();
    expect(queries[0]?.payload).toEqual({ ...toProjectRow(file), api_key_hash: hashApiKey(key) });
  });

  it('turns a unique violation into an "already exists" error naming the slug', async () => {
    const { client } = fakeClient(() => ({ error: UNIQUE_VIOLATION }));

    await expect(addProject(client, file)).rejects.toThrow(/"example" already exists/);
  });

  it('surfaces any other database error with its code', async () => {
    const { client } = fakeClient(() => ({ error: OUTAGE }));

    await expect(addProject(client, file)).rejects.toThrow(/insert project "example": 57P01/);
  });
});

describe('syncProjects', () => {
  const renamed = { ...file, name: 'Renamed' };
  const other = { ...file, slug: 'other' };

  it('lists slugs, then updates only the slugs that have a row, without api_key_hash', async () => {
    const { client, queries } = fakeClient((query) =>
      query.op === 'select' ? { data: [{ slug: 'example' }, { slug: 'orphan' }] } : ok,
    );

    const summary = await syncProjects(client, [other, renamed]);

    expect(summary).toEqual({ updated: ['example'], skipped: ['other'], orphaned: ['orphan'] });
    expect(queries).toHaveLength(2);
    expect(queries[0]).toMatchObject({ table: 'projects', op: 'select', columns: 'slug' });
    expect(queries[1]).toMatchObject({
      table: 'projects',
      op: 'update',
      payload: toProjectRow(renamed),
      filters: [['slug', 'example']],
    });
    expect(Object.keys(queries[1]?.payload as object)).not.toContain('api_key_hash');
  });

  it('fails before writing when the slug list cannot be read', async () => {
    const { client, queries } = fakeClient(() => ({ error: OUTAGE }));

    await expect(syncProjects(client, [file])).rejects.toThrow(/list projects: 57P01/);
    expect(queries.map((query) => query.op)).toEqual(['select']);
  });

  it('stops at the first update that fails', async () => {
    const { client } = fakeClient((query) =>
      query.op === 'select' ? { data: [{ slug: 'example' }] } : { error: OUTAGE },
    );

    await expect(syncProjects(client, [file])).rejects.toThrow(/update project "example": 57P01/);
  });
});

describe('rotateProjectKey', () => {
  it('writes only the new hash for that slug and returns the matching key', async () => {
    const { client, queries } = fakeClient(() => ({ data: [{ slug: 'example' }] }));

    const key = await rotateProjectKey(client, 'example');

    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatchObject({
      table: 'projects',
      op: 'update',
      payload: { api_key_hash: hashApiKey(key) },
      filters: [['slug', 'example']],
      columns: 'slug',
    });
  });

  it('fails when no row has the slug', async () => {
    const { client } = fakeClient(() => ({ data: [] }));

    await expect(rotateProjectKey(client, 'missing')).rejects.toThrow(/"missing" not found/);
  });

  it('surfaces a database error with its code', async () => {
    const { client } = fakeClient(() => ({ error: OUTAGE }));

    await expect(rotateProjectKey(client, 'example')).rejects.toThrow(
      /rotate key for "example": 57P01/,
    );
  });
});
