import {
  createClient,
  type PostgrestSingleResponse,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readIntegrationEnv } from '../../tests/int/env.ts';

// Postgres SQLSTATE codes as surfaced by PostgREST.
const PERMISSION_DENIED = '42501';
const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';

function unwrap<T>(result: PostgrestSingleResponse<T>, what: string): T {
  if (result.error) {
    throw new Error(`${what}: ${result.error.code} ${result.error.message}`);
  }
  return result.data;
}

interface SeededProject {
  id: string;
  slug: string;
  repoUrl: string;
  runId: string;
  commitSha: string;
  runUrl: string;
  reportId: string;
  testId: string;
  resultId: string;
  alertId: string;
}

const NOW = '2026-09-21T10:00:00.000Z';
const LATER = '2026-09-21T10:05:00.000Z';

async function seedProject(
  admin: SupabaseClient,
  visibility: 'public' | 'private',
  suffix: string,
): Promise<SeededProject> {
  const slug = `rls-${visibility}-${suffix}`;
  const repoUrl = `https://github.com/example/${slug}`;
  const commitSha = randomUUID().replace(/-/g, '');
  const runUrl = `https://github.com/example/${slug}/actions/runs/1`;

  const project = unwrap(
    await admin
      .from('projects')
      .insert({
        slug,
        name: `RLS ${visibility}`,
        tagline: 'Seeded by the RLS integration test',
        description: 'Deleted at the end of the test run.',
        visibility,
        repo_url: repoUrl,
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
        commit_sha: commitSha,
        branch: 'main',
        event: 'push',
        run_url: runUrl,
        started_at: NOW,
        finished_at: LATER,
        status: 'failed',
        total: 1,
        passed: 0,
        failed: 1,
        skipped: 0,
        duration_ms: 1200,
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
        duration_ms: 1200,
        started_at: NOW,
        finished_at: LATER,
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
      .insert({ report_id: report.id, test_id: test.id, status: 'failed', duration_ms: 1200 })
      .select('id')
      .single(),
    'insert result',
  );

  unwrap(
    await admin
      .from('result_failures')
      .insert({
        result_id: result.id,
        message: `expected true, got false (${visibility})`,
        detail: 'at suite.test (suite.ts:1:1)',
      })
      .select('id')
      .single(),
    'insert result_failure',
  );

  unwrap(
    await admin
      .from('coverage')
      .insert({
        report_id: report.id,
        module: 'app',
        format: 'istanbul',
        lines_covered: 90,
        lines_total: 100,
      })
      .select('id')
      .single(),
    'insert coverage',
  );

  const alert = unwrap(
    await admin
      .from('alerts')
      .insert({ project_id: project.id, kind: 'empty_run', detail: {}, opened_at: NOW })
      .select('id')
      .single(),
    'insert alert',
  );

  return {
    id: project.id,
    slug,
    repoUrl,
    runId: run.id,
    commitSha,
    runUrl,
    reportId: report.id,
    testId: test.id,
    resultId: result.id,
    alertId: alert.id,
  };
}

describe('schema and row-level security (spec sections 5 and 9)', () => {
  const env = readIntegrationEnv();
  const admin = createClient(env.url, env.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon = createClient(env.url, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const suffix = randomUUID().slice(0, 8);
  const userEmail = `rls-${suffix}@example.test`;
  const userPassword = randomUUID();
  let publicProject: SeededProject;
  let privateProject: SeededProject;
  let trackedLinkId: string;
  let visitId: string;
  let userId: string;
  let authenticated: SupabaseClient;

  beforeAll(async () => {
    publicProject = await seedProject(admin, 'public', suffix);
    privateProject = await seedProject(admin, 'private', suffix);

    const link = unwrap(
      await admin
        .from('tracked_links')
        .insert({
          token: suffix.padEnd(12, 'x'),
          company: 'Example Co',
          role: 'Head of Quality',
          lead_project_slug: publicProject.slug,
        })
        .select('id')
        .single(),
      'insert tracked_link',
    );
    trackedLinkId = link.id;

    const visit = unwrap(
      await admin
        .from('visits')
        .insert({
          tracked_link_id: trackedLinkId,
          session_id: `session-${suffix}`,
          path: '/',
          entered_at: NOW,
          user_agent_class: 'browser',
          ip_hash: `ip-${suffix}`,
        })
        .select('id')
        .single(),
      'insert visit',
    );
    visitId = visit.id;

    const created = await admin.auth.admin.createUser({
      email: userEmail,
      password: userPassword,
      email_confirm: true,
    });
    if (created.error) {
      throw new Error(`create user: ${created.error.message}`);
    }
    userId = created.data.user.id;

    // A separate sign-in client so the anon client above never carries a session.
    const signIn = createClient(env.url, env.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const session = await signIn.auth.signInWithPassword({
      email: userEmail,
      password: userPassword,
    });
    if (session.error || !session.data.session) {
      throw new Error(`sign in: ${session.error?.message ?? 'no session returned'}`);
    }
    authenticated = createClient(env.url, env.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${session.data.session.access_token}` } },
    });
  });

  afterAll(async () => {
    // Safety net if seeding or the cleanup tests did not finish; deleting nothing is fine,
    // but a failed delete must be visible, not swallowed.
    unwrap(
      await admin.from('projects').delete().like('slug', `rls-%-${suffix}`),
      'cleanup projects',
    );
    unwrap(
      await admin.from('tracked_links').delete().eq('token', suffix.padEnd(12, 'x')),
      'cleanup tracked_links',
    );
    unwrap(
      await admin.from('visits').delete().eq('session_id', `session-${suffix}`),
      'cleanup visits',
    );
    if (userId) {
      const deleted = await admin.auth.admin.deleteUser(userId);
      if (deleted.error) {
        throw new Error(`cleanup user: ${deleted.error.message}`);
      }
    }
  });

  describe('as anon', () => {
    it('reads result_failures only for public projects', async () => {
      const rows = unwrap(
        await anon
          .from('result_failures')
          .select('result_id, message')
          .in('result_id', [publicProject.resultId, privateProject.resultId]),
        'anon select result_failures',
      );

      expect(rows).toEqual([
        { result_id: publicProject.resultId, message: 'expected true, got false (public)' },
      ]);
    });

    it('is refused direct access to projects and runs', async () => {
      const projects = await anon.from('projects').select('id').eq('id', publicProject.id);
      expect(projects.error?.code).toBe(PERMISSION_DENIED);
      expect(projects.data).toBeNull();

      const runs = await anon.from('runs').select('id').eq('id', publicProject.runId);
      expect(runs.error?.code).toBe(PERMISSION_DENIED);
      expect(runs.data).toBeNull();
    });

    it('reads projects_public without api_key_hash and with repo_url hidden for private projects', async () => {
      const rows = unwrap(
        await anon
          .from('projects_public')
          .select('*')
          .in('id', [publicProject.id, privateProject.id])
          .order('slug'),
        'anon select projects_public',
      );

      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row).not.toHaveProperty('api_key_hash');
      }
      const byId = new Map(rows.map((row) => [row.id, row]));
      expect(byId.get(publicProject.id)).toMatchObject({
        slug: publicProject.slug,
        visibility: 'public',
        repo_url: publicProject.repoUrl,
      });
      expect(byId.get(privateProject.id)).toMatchObject({
        slug: privateProject.slug,
        visibility: 'private',
        repo_url: null,
      });
    });

    it('reads runs_public with run_url hidden and commit_sha truncated for private projects', async () => {
      const rows = unwrap(
        await anon
          .from('runs_public')
          .select('id, commit_sha, run_url')
          .in('id', [publicProject.runId, privateProject.runId]),
        'anon select runs_public',
      );

      expect(rows).toHaveLength(2);
      const byId = new Map(rows.map((row) => [row.id, row]));
      expect(byId.get(publicProject.runId)).toEqual({
        id: publicProject.runId,
        commit_sha: publicProject.commitSha,
        run_url: publicProject.runUrl,
      });
      expect(byId.get(privateProject.runId)).toEqual({
        id: privateProject.runId,
        commit_sha: privateProject.commitSha.slice(0, 7),
        run_url: null,
      });
    });

    it.each(['tracked_links', 'visits', 'alerts', 'heartbeats', 'rate_limit_buckets'])(
      'is refused all access to %s',
      async (table) => {
        const result = await anon.from(table).select('*').limit(1);
        expect(result.error?.code).toBe(PERMISSION_DENIED);
        expect(result.data).toBeNull();
      },
    );

    it('cannot insert into reports', async () => {
      const result = await anon.from('reports').insert({
        run_id: publicProject.runId,
        job: 'anon',
        module: 'anon',
        platform: 'node',
        format: 'junit',
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration_ms: 0,
        started_at: NOW,
        finished_at: NOW,
      });
      expect(result.error?.code).toBe(PERMISSION_DENIED);
    });

    it('cannot write through the public views', async () => {
      const inserted = await anon.from('projects_public').insert({
        slug: `rls-anon-${suffix}`,
        name: 'Should not exist',
        tagline: '',
        description: '',
        visibility: 'public',
        default_branch: 'main',
      });
      expect(inserted.error?.code).toBe(PERMISSION_DENIED);

      const updated = await anon
        .from('projects_public')
        .update({ name: 'Renamed by anon' })
        .eq('id', publicProject.id);
      expect(updated.error?.code).toBe(PERMISSION_DENIED);

      const deleted = await anon.from('projects_public').delete().eq('id', publicProject.id);
      expect(deleted.error?.code).toBe(PERMISSION_DENIED);
    });
  });

  describe('as authenticated', () => {
    // Nothing is granted to authenticated yet, so every table and both views refuse outright
    // (permission denied) rather than returning an empty, policy-filtered result.
    it.each([
      'projects',
      'runs',
      'reports',
      'tests',
      'results',
      'result_failures',
      'coverage',
      'alerts',
      'tracked_links',
      'visits',
      'heartbeats',
      'rate_limit_buckets',
      'projects_public',
      'runs_public',
    ])('is refused select on %s', async (relation) => {
      const result = await authenticated.from(relation).select('*').limit(1);
      expect(result.error?.code).toBe(PERMISSION_DENIED);
      expect(result.data).toBeNull();
    });

    it('cannot insert into heartbeats', async () => {
      const result = await authenticated.from('heartbeats').insert({ note: 'not allowed' });
      expect(result.error?.code).toBe(PERMISSION_DENIED);
    });
  });

  describe('constraints', () => {
    it('rejects a duplicate (project_id, ci_run_id, run_attempt) run', async () => {
      const result = await admin.from('runs').insert({
        project_id: publicProject.id,
        ci_run_id: `ci-${suffix}`,
        run_attempt: 1,
        commit_sha: 'abc',
        branch: 'main',
        event: 'push',
        started_at: NOW,
        finished_at: LATER,
        status: 'passed',
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration_ms: 0,
        source: 'ci',
      });
      expect(result.error?.code).toBe(UNIQUE_VIOLATION);
    });

    it('rejects a duplicate (run_id, job, module, platform) report', async () => {
      const result = await admin.from('reports').insert({
        run_id: publicProject.runId,
        job: 'test',
        module: 'app',
        platform: 'node',
        format: 'junit',
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration_ms: 0,
        started_at: NOW,
        finished_at: LATER,
      });
      expect(result.error?.code).toBe(UNIQUE_VIOLATION);
    });

    it('rejects a run status outside passed, failed, empty', async () => {
      const result = await admin.from('runs').insert({
        project_id: publicProject.id,
        ci_run_id: `ci-bad-status-${suffix}`,
        run_attempt: 1,
        commit_sha: 'abc',
        branch: 'main',
        event: 'push',
        started_at: NOW,
        finished_at: LATER,
        status: 'green',
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration_ms: 0,
        source: 'ci',
      });
      expect(result.error?.code).toBe(CHECK_VIOLATION);
    });

    it('rejects a project visibility outside public, private', async () => {
      const result = await admin.from('projects').insert({
        slug: `rls-bad-visibility-${suffix}`,
        name: 'Bad visibility',
        tagline: '',
        description: '',
        visibility: 'internal',
        default_branch: 'main',
        dev_stack: [],
        test_stack: [],
        layer_rules: [],
        declared_suites: [],
        coverage_floors: {},
        api_key_hash: `hash-bad-${suffix}`,
        sort_order: 999,
      });
      expect(result.error?.code).toBe(CHECK_VIOLATION);
    });
  });

  describe('cleanup', () => {
    it('deleting a project cascades to everything it owns', async () => {
      const projectIds = [publicProject.id, privateProject.id];
      const runIds = [publicProject.runId, privateProject.runId];
      const reportIds = [publicProject.reportId, privateProject.reportId];
      const resultIds = [publicProject.resultId, privateProject.resultId];

      unwrap(
        await admin.from('projects').delete().in('id', projectIds).select('id'),
        'delete projects',
      );

      const remaining = {
        runs: unwrap(await admin.from('runs').select('id').in('id', runIds), 'runs'),
        reports: unwrap(await admin.from('reports').select('id').in('id', reportIds), 'reports'),
        tests: unwrap(await admin.from('tests').select('id').in('project_id', projectIds), 'tests'),
        results: unwrap(
          await admin.from('results').select('id').in('report_id', reportIds),
          'results',
        ),
        result_failures: unwrap(
          await admin.from('result_failures').select('id').in('result_id', resultIds),
          'result_failures',
        ),
        coverage: unwrap(
          await admin.from('coverage').select('id').in('report_id', reportIds),
          'coverage',
        ),
        alerts: unwrap(
          await admin.from('alerts').select('id').in('project_id', projectIds),
          'alerts',
        ),
      };

      expect(remaining).toEqual({
        runs: [],
        reports: [],
        tests: [],
        results: [],
        result_failures: [],
        coverage: [],
        alerts: [],
      });
    });

    it('deleting a tracked link keeps its visits and detaches them', async () => {
      unwrap(
        await admin.from('tracked_links').delete().eq('id', trackedLinkId).select('id'),
        'delete tracked_link',
      );
      const visits = unwrap(
        await admin.from('visits').select('id, tracked_link_id').eq('id', visitId),
        'visits',
      );
      expect(visits).toEqual([{ id: visitId, tracked_link_id: null }]);
    });
  });
});
