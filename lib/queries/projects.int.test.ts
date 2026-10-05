import { createClient, type PostgrestSingleResponse } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readIntegrationEnv } from '../../tests/int/env.ts';
import { createPublicClient } from '../supabase/public.ts';
import { listPublicProjects } from './projects.ts';

// Spec sections 9 and 15: public pages read through the publishable-key client, so what they can
// see is exactly what RLS grants anon. This proves it for the client the pages will use.

const PERMISSION_DENIED = '42501';
const NOW = '2026-09-28T10:00:00.000Z';

function unwrap<T>(result: PostgrestSingleResponse<T>, what: string): T {
  if (result.error) {
    throw new Error(`${what}: ${result.error.code} ${result.error.message}`);
  }
  return result.data;
}

describe('the public read client against local Supabase (spec sections 9 and 15)', () => {
  const env = readIntegrationEnv();
  // Seeding writes tables anon cannot, so it uses the secret key directly, as rls.int.test.ts
  // does; lib/queries itself never sees it.
  const admin = createClient(env.url, env.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const client = createPublicClient();

  const suffix = randomUUID().slice(0, 8);
  const seeded: Record<'public' | 'private', { id: string; slug: string; runId: string }> = {
    public: { id: '', slug: '', runId: '' },
    private: { id: '', slug: '', runId: '' },
  };
  const resultIds: Record<'public' | 'private', string> = { public: '', private: '' };

  async function seed(visibility: 'public' | 'private') {
    const slug = `queries-${visibility}-${suffix}`;
    const project = unwrap(
      await admin
        .from('projects')
        .insert({
          slug,
          name: `Queries ${visibility}`,
          tagline: 'Seeded by the public read client integration test',
          description: 'Deleted at the end of the test run.',
          visibility,
          repo_url: `https://github.com/example/${slug}`,
          default_branch: 'main',
          dev_stack: [],
          test_stack: [],
          layer_rules: [{ default: 'unit' }],
          declared_suites: [],
          coverage_floors: {},
          api_key_hash: `hash-${slug}`,
          sort_order: 999,
        })
        .select('id')
        .single(),
      'insert project',
    );
    const run = unwrap(
      await admin
        .from('runs')
        .insert({
          project_id: project.id,
          ci_run_id: `ci-${suffix}`,
          run_attempt: 1,
          commit_sha: randomUUID().replace(/-/g, ''),
          branch: 'main',
          event: 'push',
          run_url: `https://github.com/example/${slug}/actions/runs/1`,
          started_at: NOW,
          finished_at: NOW,
          status: 'failed',
          total: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration_ms: 10,
          source: 'ci',
        })
        .select('id')
        .single(),
      'insert run',
    );
    const report = unwrap(
      await admin
        .from('reports')
        .insert({
          run_id: run.id,
          job: 'test',
          module: 'app',
          platform: 'node',
          format: 'junit',
          total: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration_ms: 10,
          started_at: NOW,
          finished_at: NOW,
          received_at: NOW,
        })
        .select('id')
        .single(),
      'insert report',
    );
    const test = unwrap(
      await admin
        .from('tests')
        .insert({
          project_id: project.id,
          test_key: `key-${slug}`,
          module: 'app',
          suite: 'suite',
          name: 'fails on purpose',
          layer: 'unit',
          first_seen_at: NOW,
          last_seen_at: NOW,
        })
        .select('id')
        .single(),
      'insert test',
    );
    const result = unwrap(
      await admin
        .from('results')
        .insert({ report_id: report.id, test_id: test.id, status: 'failed', duration_ms: 10 })
        .select('id')
        .single(),
      'insert result',
    );
    unwrap(
      await admin
        .from('result_failures')
        .insert({ result_id: result.id, message: `failed (${visibility})`, detail: 'at x' })
        .select('id')
        .single(),
      'insert result_failure',
    );

    seeded[visibility] = { id: project.id, slug, runId: run.id };
    resultIds[visibility] = result.id;
  }

  beforeAll(async () => {
    await seed('public');
    await seed('private');
  });

  afterAll(async () => {
    unwrap(
      await admin.from('projects').delete().like('slug', `queries-%-${suffix}`),
      'cleanup projects',
    );
  });

  it.each(['projects', 'runs'])('is refused direct access to %s', async (table) => {
    const result = await client.from(table).select('id').limit(1);

    expect(result.error?.code).toBe(PERMISSION_DENIED);
    expect(result.data).toBeNull();
  });

  it('reads projects_public and runs_public', async () => {
    const projects = unwrap(
      await client
        .from('projects_public')
        .select('id')
        .in('id', [seeded.public.id, seeded.private.id]),
      'select projects_public',
    );
    const runs = unwrap(
      await client
        .from('runs_public')
        .select('id')
        .in('id', [seeded.public.runId, seeded.private.runId]),
      'select runs_public',
    );

    expect(projects.map((row) => row.id).sort()).toEqual(
      [seeded.public.id, seeded.private.id].sort(),
    );
    expect(runs.map((row) => row.id).sort()).toEqual(
      [seeded.public.runId, seeded.private.runId].sort(),
    );
  });

  it('gets no failure text for a private project and gets it for a public one', async () => {
    const rows = unwrap(
      await client
        .from('result_failures')
        .select('result_id, message')
        .in('result_id', [resultIds.public, resultIds.private]),
      'select result_failures',
    );

    expect(rows).toEqual([{ result_id: resultIds.public, message: 'failed (public)' }]);
  });

  it('listPublicProjects returns both projects with repo_url hidden for the private one', async () => {
    const projects = (await listPublicProjects()).filter((project) =>
      project.slug.endsWith(`-${suffix}`),
    );

    expect(projects).toEqual([
      {
        id: seeded.private.id,
        slug: seeded.private.slug,
        name: 'Queries private',
        visibility: 'private',
        repoUrl: null,
      },
      {
        id: seeded.public.id,
        slug: seeded.public.slug,
        name: 'Queries public',
        visibility: 'public',
        repoUrl: `https://github.com/example/${seeded.public.slug}`,
      },
    ]);
  });
});
