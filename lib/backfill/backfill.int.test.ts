import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  createClient,
  type PostgrestSingleResponse,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { POST } from '../../app/api/v1/reports/route.ts';
import { readIntegrationEnv } from '../../tests/int/env.ts';
import { hashApiKey } from '../projects/keys.ts';
import { addProject } from '../projects/repo.ts';
import { parseProjectFile } from '../projects/schema.ts';
import { createSecretClient } from '../supabase/server.ts';
import { toOstomate2BackfillRuns } from './ostomate2-history.ts';
import { findBackfillTarget, writeBackfill } from './write.ts';

// Spec section 17, Phase 4: the captured Ostomate2 history written through backfill_run.

// Postgres SQLSTATE codes as surfaced by PostgREST.
const PERMISSION_DENIED = '42501';
const CHECK_VIOLATION = '23514';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const fixture = (relativePath: string): string =>
  readFileSync(`${repoRoot}fixtures/${relativePath}`, 'utf8');
const history = (): unknown => JSON.parse(fixture('ostomate2/history/history.json'));
const sharedJunit = readdirSync(`${repoRoot}fixtures/ostomate2/junit/jvm/shared`)
  .filter((name) => name.endsWith('.xml'))
  .sort()
  .map((name) => fixture(`ostomate2/junit/jvm/shared/${name}`));
const sharedJacoco = fixture('ostomate2/jacoco/shared.xml');

// The live CI run the JUnit and JaCoCo fixtures came from; it is also a main entry in the
// history, so it is where a backfill meets a run CI already reported.
const CI_RUN_ID = '35644117162';
const CI_META = {
  ci_run_id: CI_RUN_ID,
  job: 'android',
  module: 'shared',
  platform: 'jvm',
  commit_sha: '2ec580f377e52f0a1ae584661ff09b07821ea1e2',
  branch: 'main',
  event: 'push',
  run_url: `https://github.com/bhelco1/Ostomate2/actions/runs/${CI_RUN_ID}`,
};

const FIRST_RUN_ID = '29279945808';
const LAST_RUN_ID = '35776037304';

function unwrap<T>(result: PostgrestSingleResponse<T>, what: string): T {
  if (result.error) {
    throw new Error(`${what}: ${result.error.code} ${result.error.message}`);
  }
  return result.data;
}

const iso = (value: unknown): string => new Date(String(value)).toISOString();

type Row = Record<string, unknown>;

describe('backfill_run with the captured Ostomate2 history (spec section 17, Phase 4)', () => {
  const env = readIntegrationEnv();
  const admin = createSecretClient(process.env);
  const anon = createClient(env.url, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let authenticated: SupabaseClient;
  let userId: string | undefined;

  const suffix = randomUUID().slice(0, 8);
  const backfillSlug = `backfill-public-${suffix}`;
  const ciSlug = `backfill-ci-${suffix}`;
  let backfillProjectId: string;
  let ciProjectId: string;
  // Lives only in this variable and never appears in an assertion message.
  let ciKey: string;

  const runs = toOstomate2BackfillRuns(history(), 'main');

  const runsOf = async (projectId: string): Promise<Row[]> =>
    unwrap(
      await admin
        .from('runs')
        .select(
          'id, ci_run_id, run_attempt, commit_sha, branch, event, run_url, started_at, ' +
            'finished_at, status, total, passed, failed, skipped, duration_ms, source',
        )
        .eq('project_id', projectId)
        .order('started_at'),
      'select runs',
    ) as unknown as Row[];

  const reportsOf = async (runIds: readonly string[]): Promise<Row[]> =>
    unwrap(
      await admin
        .from('reports')
        .select(
          'id, run_id, job, module, platform, format, total, passed, failed, skipped, ' +
            'duration_ms, started_at, finished_at',
        )
        .in('run_id', runIds)
        .order('id'),
      'select reports',
    ) as unknown as Row[];

  const coverageOf = async (reportIds: readonly string[]): Promise<Row[]> =>
    unwrap(
      await admin
        .from('coverage')
        .select('id, report_id, module, format, lines_covered, lines_total, lines_pct')
        .in('report_id', reportIds)
        .order('id'),
      'select coverage',
    ) as unknown as Row[];

  const snapshot = async (projectId: string) => {
    const projectRuns = await runsOf(projectId);
    const reports = await reportsOf(projectRuns.map((run) => String(run.id)));
    const coverage = await coverageOf(reports.map((report) => String(report.id)));
    return { runs: projectRuns, reports, coverage };
  };

  const runByCiId = (rows: readonly Row[], ciRunId: string): Row => {
    const run = rows.find((row) => row.ci_run_id === ciRunId);
    if (run === undefined) throw new Error(`no run ${ciRunId}`);
    return run;
  };

  beforeAll(async () => {
    const ostomate2 = parseProjectFile(
      readFileSync(`${repoRoot}projects/ostomate2.yaml`, 'utf8'),
      'projects/ostomate2.yaml',
    );
    await addProject(admin, { ...ostomate2, slug: backfillSlug });
    ciKey = await addProject(admin, { ...ostomate2, slug: ciSlug });
    backfillProjectId = (await findBackfillTarget(admin, backfillSlug)).id;
    ciProjectId = (await findBackfillTarget(admin, ciSlug)).id;

    const email = `backfill-${suffix}@example.test`;
    const password = randomUUID();
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw new Error(`create user: ${created.error.message}`);
    userId = created.data.user.id;
    // A separate sign-in client so the anon client above never carries a session.
    const signIn = createClient(env.url, env.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const session = await signIn.auth.signInWithPassword({ email, password });
    if (session.error || !session.data.session) {
      throw new Error(`sign in: ${session.error?.message ?? 'no session returned'}`);
    }
    authenticated = createClient(env.url, env.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${session.data.session.access_token}` } },
    });
  });

  afterAll(async () => {
    unwrap(
      await admin.from('projects').delete().like('slug', `backfill-%-${suffix}`),
      'cleanup projects',
    );
    if (ciKey !== undefined) {
      unwrap(
        await admin.from('rate_limit_buckets').delete().eq('api_key_hash', hashApiKey(ciKey)),
        'cleanup rate_limit_buckets',
      );
    }
    if (userId !== undefined) {
      const deleted = await admin.auth.admin.deleteUser(userId);
      if (deleted.error) throw new Error(`cleanup user: ${deleted.error.message}`);
    }
  });

  describe('a first import', () => {
    it('inserts the 13 main runs as source backfill, with 26 reports and 26 coverage rows', async () => {
      const target = await findBackfillTarget(admin, backfillSlug);
      expect(target.defaultBranch).toBe('main');

      const summary = await writeBackfill(
        admin,
        target.id,
        toOstomate2BackfillRuns(history(), target.defaultBranch),
      );
      expect(summary).toEqual({ inserted: 13, skippedExistingCi: 0, skippedExistingBackfill: 0 });

      const stored = await snapshot(backfillProjectId);
      expect(stored.runs).toHaveLength(13);
      expect(
        stored.runs.every(
          (run) =>
            run.source === 'backfill' &&
            run.status === 'passed' &&
            run.branch === 'main' &&
            run.event === 'push' &&
            run.run_attempt === 1 &&
            run.duration_ms === 0,
        ),
      ).toBe(true);
      expect(stored.runs.map((run) => run.ci_run_id)).toEqual(runs.map((run) => run.ci_run_id));
      expect(stored.reports).toHaveLength(26);
      expect(stored.coverage).toHaveLength(26);
      expect(
        stored.coverage.every(
          (row) =>
            typeof row.lines_pct === 'number' &&
            row.lines_covered === null &&
            row.lines_total === null &&
            row.format === 'jacoco',
        ),
      ).toBe(true);
    });

    it('rolls the first and last runs up from their two reports', async () => {
      const stored = await snapshot(backfillProjectId);
      const first = runByCiId(stored.runs, FIRST_RUN_ID);
      const last = runByCiId(stored.runs, LAST_RUN_ID);

      expect(first).toMatchObject({
        commit_sha: 'a132513e34ebbe832cc62fc5a62f3e999658e820',
        run_url: `https://github.com/bhelco1/Ostomate2/actions/runs/${FIRST_RUN_ID}`,
        status: 'passed',
        total: 126,
        passed: 126,
        failed: 0,
        skipped: 0,
      });
      expect(iso(first.started_at)).toBe('2026-07-13T20:10:42.000Z');
      expect(iso(first.finished_at)).toBe('2026-07-13T20:10:42.000Z');
      expect(last).toMatchObject({ status: 'passed', total: 142, passed: 142, failed: 0 });

      const summarise = (runId: unknown) => {
        const reports = stored.reports.filter((report) => report.run_id === runId);
        return reports
          .map((report) => {
            const coverage = stored.coverage.filter((row) => row.report_id === report.id);
            return [
              report.job,
              report.module,
              report.platform,
              report.format,
              report.total,
              report.passed,
              report.duration_ms,
              coverage.map((row) => row.lines_pct),
            ];
          })
          .sort((a, b) => String(a[1]).localeCompare(String(b[1])));
      };
      expect(summarise(first.id)).toEqual([
        ['android', 'composeApp', 'jvm', 'junit', 47, 47, 0, [93.6]],
        ['android', 'shared', 'jvm', 'junit', 79, 79, 0, [93.2]],
      ]);
      expect(summarise(last.id)).toEqual([
        ['android', 'composeApp', 'jvm', 'junit', 60, 60, 0, [94.3]],
        ['android', 'shared', 'jvm', 'junit', 82, 82, 0, [93.3]],
      ]);
    });

    it('opens no alerts', async () => {
      const alerts = unwrap(
        await admin.from('alerts').select('id').eq('project_id', backfillProjectId),
        'select alerts',
      );
      expect(alerts).toEqual([]);
    });
  });

  describe('running it again', () => {
    it('inserts nothing and leaves every row as it was', async () => {
      const before = await snapshot(backfillProjectId);
      const summary = await writeBackfill(admin, backfillProjectId, runs);
      expect(summary).toEqual({ inserted: 0, skippedExistingCi: 0, skippedExistingBackfill: 13 });
      expect(await snapshot(backfillProjectId)).toEqual(before);
    });
  });

  describe('a run CI already reported', () => {
    it('is left exactly as ingest_report stored it, and the other 12 are imported', async () => {
      const form = new FormData();
      form.append('meta', JSON.stringify(CI_META));
      sharedJunit.forEach((text, index) =>
        form.append('junit', new Blob([text]), `junit-${index}`),
      );
      form.append('jacoco', new Blob([sharedJacoco]), 'jacoco.xml');
      const response = await POST(
        new Request('http://testpulse.local/api/v1/reports', {
          method: 'POST',
          body: form,
          headers: { authorization: `Bearer ${ciKey}` },
        }),
      );
      expect(response.status).toBe(201);

      const before = await snapshot(ciProjectId);
      expect(before.runs).toHaveLength(1);
      expect(before.runs[0]).toMatchObject({ ci_run_id: CI_RUN_ID, source: 'ci', total: 82 });
      // ingest_report still writes the count form.
      expect(before.coverage).toEqual([
        expect.objectContaining({ lines_covered: 457, lines_total: 490, lines_pct: null }),
      ]);

      const summary = await writeBackfill(admin, ciProjectId, runs);
      expect(summary).toEqual({ inserted: 12, skippedExistingCi: 1, skippedExistingBackfill: 0 });

      const after = await snapshot(ciProjectId);
      expect(after.runs).toHaveLength(13);
      const ciRun = runByCiId(after.runs, CI_RUN_ID);
      expect(ciRun).toEqual(before.runs[0]);
      expect(after.reports.filter((report) => report.run_id === ciRun.id)).toEqual(before.reports);
      const ciReportIds = new Set(before.reports.map((report) => report.id));
      expect(after.coverage.filter((row) => ciReportIds.has(row.report_id))).toEqual(
        before.coverage,
      );
      expect(after.runs.filter((run) => run.source === 'backfill')).toHaveLength(12);
    });
  });

  describe('backfill_run validation', () => {
    const payloadFor = (projectId: string, index = 0) => {
      const run = runs[index];
      if (run === undefined) throw new Error(`no run ${index}`);
      return { project_id: projectId, ...run, ci_run_id: `${suffix}-${index}` };
    };

    it.each([
      [
        'a report whose counts do not add up',
        (p: Row) => ({ ...p, reports: [{ ...(p.reports as Row[])[0], passed: 1 }] }),
        /^backfill_run: payload\.reports\[0\]\.total must equal passed \+ failed \+ skipped$/,
      ],
      [
        'a helper-checked field, reported under backfill_run',
        (p: Row) => ({ ...p, branch: 'x'.repeat(256) }),
        /^backfill_run: payload\.branch must be at most 255 characters, got 256$/,
      ],
      [
        'a coverage percentage above 100',
        (p: Row) => ({
          ...p,
          reports: [{ ...(p.reports as Row[])[0], coverage: { format: 'jacoco', lines_pct: 101 } }],
        }),
        /^backfill_run: payload\.reports\[0\]\.coverage\.lines_pct must be between 0 and 100/,
      ],
      [
        'two reports under one key',
        (p: Row) => ({
          ...p,
          reports: [(p.reports as Row[])[0], (p.reports as Row[])[0]],
        }),
        /^backfill_run: payload\.reports has two reports for the same job, module and platform$/,
      ],
      ['no reports', (p: Row) => ({ ...p, reports: [] }), /payload\.reports must hold 1 to 50/],
      [
        'a project that does not exist',
        (p: Row) => ({ ...p, project_id: randomUUID() }),
        /^backfill_run: project [0-9a-f-]{36} does not exist$/,
      ],
      [
        'a SHA that is not hexadecimal',
        (p: Row) => ({ ...p, commit_sha: 'not-a-sha' }),
        /^backfill_run: payload\.commit_sha must be 7 to 40 hexadecimal characters$/,
      ],
    ])('refuses %s and writes nothing', async (_, mutate, message) => {
      const payload = mutate(payloadFor(backfillProjectId) as unknown as Row);
      const result = await admin.rpc('backfill_run', { payload });
      expect(result.error?.message).toMatch(message);
      const stored = unwrap(
        await admin.from('runs').select('id').eq('ci_run_id', `${suffix}-0`),
        'select runs',
      );
      expect(stored).toEqual([]);
    });

    // numeric(5, 2) would round it silently to 93.26; a recorded value is stored as is or refused.
    it('refuses a third decimal on a percentage', async () => {
      const payload = payloadFor(backfillProjectId, 1);
      const [first, second] = payload.reports;
      const result = await admin.rpc('backfill_run', {
        payload: {
          ...payload,
          reports: [{ ...first, coverage: { format: 'jacoco', lines_pct: 93.255 } }, second],
        },
      });
      expect(result.error?.message).toMatch(
        /^backfill_run: payload\.reports\[0\]\.coverage\.lines_pct must be between 0 and 100 with at most two decimals, got 93\.255$/,
      );
    });
  });

  describe('coverage forms', () => {
    let reportId: string;

    beforeAll(async () => {
      const stored = await snapshot(backfillProjectId);
      reportId = String(stored.reports[0]?.id);
    });

    it.each([
      ['both counts and a percentage', { lines_covered: 1, lines_total: 2, lines_pct: 50 }],
      ['neither', { lines_covered: null, lines_total: null, lines_pct: null }],
      ['a percentage and only one count', { lines_covered: 1, lines_total: null, lines_pct: 50 }],
      ['a percentage above 100', { lines_covered: null, lines_total: null, lines_pct: 100.5 }],
    ])('refuses a row with %s', async (_, columns) => {
      const result = await admin
        .from('coverage')
        .insert({ report_id: reportId, module: 'shared', format: 'jacoco', ...columns });
      expect(result.error?.code).toBe(CHECK_VIOLATION);
    });
  });

  describe('access', () => {
    it('refuses backfill_run to anon and authenticated', async () => {
      for (const client of [anon, authenticated]) {
        const result = await client.rpc('backfill_run', {
          payload: { project_id: backfillProjectId, ...runs[0], ci_run_id: `${suffix}-anon` },
        });
        expect(result.error?.code).toBe(PERMISSION_DENIED);
      }
      const stored = unwrap(
        await admin.from('runs').select('id').eq('ci_run_id', `${suffix}-anon`),
        'select runs',
      );
      expect(stored).toEqual([]);
    });

    it('lets anon read the backfilled runs through runs_public, marked as backfill', async () => {
      const visible = unwrap(
        await anon
          .from('runs_public')
          .select('ci_run_id, commit_sha, run_url, source, total')
          .eq('project_id', backfillProjectId),
        'anon select runs_public',
      );
      expect(visible).toHaveLength(13);
      expect(visible.every((run) => run.source === 'backfill')).toBe(true);
      expect(visible.find((run) => run.ci_run_id === FIRST_RUN_ID)).toEqual({
        ci_run_id: FIRST_RUN_ID,
        commit_sha: 'a132513e34ebbe832cc62fc5a62f3e999658e820',
        run_url: `https://github.com/bhelco1/Ostomate2/actions/runs/${FIRST_RUN_ID}`,
        source: 'backfill',
        total: 126,
      });
    });

    it('lets anon read backfilled coverage percentages, as it reads all coverage', async () => {
      const stored = await snapshot(backfillProjectId);
      const first = runByCiId(stored.runs, FIRST_RUN_ID);
      const reportIds = stored.reports
        .filter((report) => report.run_id === first.id)
        .map((report) => String(report.id));
      const visible = unwrap(
        await anon
          .from('coverage')
          .select('module, lines_pct, lines_covered, lines_total')
          .in('report_id', reportIds)
          .order('module'),
        'anon select coverage',
      );
      expect(visible).toEqual([
        { module: 'composeApp', lines_pct: 93.6, lines_covered: null, lines_total: null },
        { module: 'shared', lines_pct: 93.2, lines_covered: null, lines_total: null },
      ]);
    });
  });
});
