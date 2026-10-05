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
import { parseJunit } from '../parsers/index.ts';
import { hashApiKey } from '../projects/keys.ts';
import { addProject } from '../projects/repo.ts';
import { parseProjectFile } from '../projects/schema.ts';
import { createSecretClient } from '../supabase/server.ts';
import { RATE_LIMIT_PER_MINUTE } from './ingest.ts';
import { type ReportMeta } from './meta.ts';
import { normalizeReport } from './normalize.ts';
import { MAX_BODY_BYTES } from './parts.ts';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const readFixture = (relativePath: string): string =>
  readFileSync(`${repoRoot}fixtures/${relativePath}`, 'utf8');
const readSuiteDir = (relativeDir: string): string[] =>
  readdirSync(`${repoRoot}fixtures/${relativeDir}`)
    .filter((name) => name.endsWith('.xml'))
    .sort()
    .map((name) => readFixture(`${relativeDir}/${name}`));

const sharedJunit = readSuiteDir('ostomate2/junit/jvm/shared');
const composeAppJunit = readSuiteDir('ostomate2/junit/jvm/composeApp');
const composeAppIosJunit = readSuiteDir('ostomate2/junit/ios-sim/composeApp');
const playwrightJunit = readFixture('testpulse/junit/playwright-one-failure.xml');
const sharedJest = readFixture('routeserve/jest/shared.json');
const sharedJestOneFailure = readFixture('routeserve/jest/shared-one-failure.json');
const sharedJacoco = readFixture('ostomate2/jacoco/shared.xml');
const sharedIstanbul = readFixture('routeserve/istanbul/shared.json');

const ROUTESERVE_PREFIX = '/home/runner/work/routeserve/routeserve/';
const PROJECT_COLUMNS = 'id, slug, visibility';

function unwrap<T>(result: PostgrestSingleResponse<T>, what: string): T {
  if (result.error) {
    throw new Error(`${what}: ${result.error.code} ${result.error.message}`);
  }
  return result.data;
}

const countBy = (values: readonly string[]): Record<string, number> =>
  values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});

const iso = (value: unknown): string => new Date(String(value)).toISOString();

type Entry = [name: string, value: string | Blob, filename?: string];

const multipart = (...entries: Entry[]): FormData => {
  const data = new FormData();
  for (const [name, value, filename] of entries) {
    if (typeof value === 'string') data.append(name, value);
    else data.append(name, value, filename ?? name);
  }
  return data;
};

const files = (name: string, contents: readonly string[]): Entry[] =>
  contents.map((text, index): Entry => [name, new Blob([text]), `${name}-${index + 1}`]);

interface Posted {
  status: number;
  body: Record<string, unknown>;
}

async function post(
  key: string | null,
  body: FormData | string,
  headers: Record<string, string> = {},
): Promise<Posted> {
  const request = new Request('http://testpulse.local/api/v1/reports', {
    method: 'POST',
    body,
    headers: { ...(key === null ? {} : { authorization: `Bearer ${key}` }), ...headers },
  });
  const response = await POST(request);
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function rows(
  admin: SupabaseClient,
  table: string,
  columns: string,
  filter: [column: string, value: string],
): Promise<Array<Record<string, unknown>>> {
  // The column list is a runtime string, so supabase-js cannot type the rows; the tests read
  // them as plain records.
  const data: unknown = unwrap(
    await admin.from(table).select(columns).eq(filter[0], filter[1]),
    `select ${table}`,
  );
  return data as Array<Record<string, unknown>>;
}

describe('POST /api/v1/reports (spec section 6)', () => {
  const env = readIntegrationEnv();
  const admin = createSecretClient(process.env);
  const anon = createClient(env.url, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const suffix = randomUUID().slice(0, 8);
  const publicSlug = `ingest-public-${suffix}`;
  const privateSlug = `ingest-private-${suffix}`;
  // Keys live only in these variables and never appear in an assertion message.
  let publicKey: string;
  let privateKey: string;
  let publicId: string;
  let privateId: string;

  const meta = (overrides: Partial<ReportMeta> & { ci_run_id: string }): string =>
    JSON.stringify({
      job: 'android',
      module: 'shared',
      platform: 'jvm',
      commit_sha: '2ec580f377e52f0a1ae584661ff09b07821ea1e2',
      branch: 'main',
      event: 'push',
      run_url: 'https://github.com/bhelco1/Ostomate2/actions/runs/35644117162',
      ...overrides,
    });

  const runFor = async (projectId: string, ciRunId: string) => {
    const found = unwrap(
      await admin
        .from('runs')
        .select('id, status, total, passed, failed, skipped, duration_ms, started_at, finished_at')
        .eq('project_id', projectId)
        .eq('ci_run_id', ciRunId),
      'select run',
    );
    return found;
  };

  beforeAll(async () => {
    const ostomate2 = parseProjectFile(
      readFileSync(`${repoRoot}projects/ostomate2.yaml`, 'utf8'),
      'projects/ostomate2.yaml',
    );
    const routeserve = parseProjectFile(
      readFileSync(`${repoRoot}projects/routeserve.yaml`, 'utf8'),
      'projects/routeserve.yaml',
    );
    publicKey = await addProject(admin, { ...ostomate2, slug: publicSlug });
    privateKey = await addProject(admin, { ...routeserve, slug: privateSlug });
    const projects = unwrap(
      await admin.from('projects').select(PROJECT_COLUMNS).like('slug', `ingest-%-${suffix}`),
      'select projects',
    );
    const bySlug = new Map(projects.map((row) => [row.slug as string, row]));
    publicId = bySlug.get(publicSlug)?.id as string;
    privateId = bySlug.get(privateSlug)?.id as string;
    expect(bySlug.get(publicSlug)?.visibility).toBe('public');
    expect(bySlug.get(privateSlug)?.visibility).toBe('private');
  });

  afterAll(async () => {
    unwrap(
      await admin.from('projects').delete().like('slug', `ingest-%-${suffix}`),
      'cleanup projects',
    );
    unwrap(
      await admin
        .from('rate_limit_buckets')
        .delete()
        .in('api_key_hash', [hashApiKey(publicKey), hashApiKey(privateKey)]),
      'cleanup rate_limit_buckets',
    );
  });

  describe('authentication', () => {
    it('answers 401 with one body for a missing, malformed, and unknown key', async () => {
      const form = () =>
        multipart(['meta', meta({ ci_run_id: `${suffix}-auth` })], ...files('junit', sharedJunit));
      const missing = await post(null, form());
      const malformed = await post(null, form(), { authorization: `Basic ${publicKey}` });
      const unknown = await post(`tp_${'0'.repeat(43)}`, form());

      const expected = { status: 401, body: { error: 'missing or unknown API key' } };
      expect(missing).toEqual(expected);
      expect(malformed).toEqual(expected);
      expect(unknown).toEqual(expected);
      expect(await runFor(publicId, `${suffix}-auth`)).toEqual([]);
    });
  });

  describe('Ostomate2 JVM reports', () => {
    const ciRunId = `${suffix}-jvm`;
    let runId: string;
    let firstReportId: string;

    it('creates the run, report, tests and results for the shared module (201)', async () => {
      const response = await post(
        publicKey,
        multipart(['meta', meta({ ci_run_id: ciRunId })], ...files('junit', sharedJunit)),
      );

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        totals: { total: 82, passed: 82, failed: 0, skipped: 0 },
        run_status: 'passed',
      });
      runId = response.body.run_id as string;
      firstReportId = response.body.report_id as string;

      const [run] = await runFor(publicId, ciRunId);
      expect(run).toMatchObject({
        id: runId,
        status: 'passed',
        total: 82,
        passed: 82,
        failed: 0,
        skipped: 0,
      });

      const reports = await rows(
        admin,
        'reports',
        'id, job, module, platform, format, total, passed, failed, skipped, duration_ms, started_at, finished_at, received_at',
        ['run_id', runId],
      );
      const parsed = parseJunit(sharedJunit);
      expect(reports).toHaveLength(1);
      expect(reports[0]).toMatchObject({
        id: firstReportId,
        job: 'android',
        module: 'shared',
        platform: 'jvm',
        format: 'junit',
        total: 82,
        passed: 82,
        failed: 0,
        skipped: 0,
        duration_ms: parsed.durationMs,
      });
      // Dated by receipt (decision 2026-10-05): the report ends when it arrived and starts its
      // duration before that.
      const received = Date.parse(String(reports[0]?.received_at));
      const startedAt = new Date(received - parsed.durationMs).toISOString();
      expect(iso(reports[0]?.finished_at)).toBe(iso(reports[0]?.received_at));
      expect(iso(reports[0]?.started_at)).toBe(startedAt);
      expect(iso(run?.started_at)).toBe(startedAt);
      expect(iso(run?.finished_at)).toBe(iso(reports[0]?.received_at));

      const tests = await rows(admin, 'tests', 'id, layer, first_seen_at, last_seen_at', [
        'project_id',
        publicId,
      ]);
      expect(tests).toHaveLength(82);
      expect(countBy(tests.map((test) => String(test.layer)))).toEqual({
        unit: 53,
        integration: 29,
      });
      expect(iso(tests[0]?.first_seen_at)).toBe(startedAt);
      expect(iso(tests[0]?.last_seen_at)).toBe(startedAt);

      const results = await rows(admin, 'results', 'id, status', ['report_id', firstReportId]);
      expect(results).toHaveLength(82);
      expect(countBy(results.map((result) => String(result.status)))).toEqual({ passed: 82 });
    });

    it('replaces the report on a re-post of the same key (200) without duplicating rows', async () => {
      const response = await post(
        publicKey,
        multipart(['meta', meta({ ci_run_id: ciRunId })], ...files('junit', sharedJunit)),
      );

      expect(response.status).toBe(200);
      expect(response.body.run_id).toBe(runId);
      const reportId = response.body.report_id as string;
      // The old report row and its children are deleted; the replacement gets a new id.
      expect(reportId).not.toBe(firstReportId);
      expect(await rows(admin, 'results', 'id', ['report_id', firstReportId])).toEqual([]);

      expect(await rows(admin, 'reports', 'id', ['run_id', runId])).toHaveLength(1);
      expect(await rows(admin, 'results', 'id', ['report_id', reportId])).toHaveLength(82);
      expect(await rows(admin, 'tests', 'id', ['project_id', publicId])).toHaveLength(82);
      expect((await runFor(publicId, ciRunId))[0]).toMatchObject({ total: 82, status: 'passed' });
      firstReportId = reportId;
    });

    it('attaches a second module of the same CI run to the same run and sums the totals', async () => {
      const response = await post(
        publicKey,
        multipart(
          ['meta', meta({ ci_run_id: ciRunId, module: 'composeApp' })],
          ...files('junit', composeAppJunit),
        ),
      );

      expect(response.status).toBe(201);
      expect(response.body.run_id).toBe(runId);
      expect(response.body.totals).toEqual({ total: 60, passed: 60, failed: 0, skipped: 0 });

      const reports = await rows(admin, 'reports', 'module, duration_ms, started_at, finished_at', [
        'run_id',
        runId,
      ]);
      expect(reports).toHaveLength(2);
      const [run] = await runFor(publicId, ciRunId);
      expect(run).toMatchObject({
        status: 'passed',
        total: 142,
        passed: 142,
        failed: 0,
        skipped: 0,
        duration_ms: reports.reduce((sum, report) => sum + Number(report.duration_ms), 0),
      });
      const starts = reports.map((report) => iso(report.started_at)).sort();
      const finishes = reports.map((report) => iso(report.finished_at)).sort();
      expect(iso(run?.started_at)).toBe(starts[0]);
      expect(iso(run?.finished_at)).toBe(finishes[finishes.length - 1]);
      expect(await rows(admin, 'tests', 'id', ['project_id', publicId])).toHaveLength(142);
    });
  });

  // Decision 2026-10-05: reports.received_at is when testpulse took the report in, whatever
  // times its files carry. The captured fixtures date from September, so every post here is a
  // report whose files are older than its receipt, as a replayed Gradle cache's were.
  describe('receipt time (spec section 5.3)', () => {
    const ciRunId = `${suffix}-received`;

    const postShared = async () => {
      const before = Date.now();
      const response = await post(
        publicKey,
        multipart(['meta', meta({ ci_run_id: ciRunId })], ...files('junit', sharedJunit)),
      );
      const after = Date.now();
      const [report] = await rows(admin, 'reports', 'received_at, finished_at', [
        'id',
        String(response.body.report_id),
      ]);
      return { response, before, after, report };
    };

    it('stores when the report was received, not when its files say it finished', async () => {
      const { response, before, after, report } = await postShared();

      expect(response.status).toBe(201);
      const received = Date.parse(String(report?.received_at));
      expect(received).toBeGreaterThanOrEqual(before);
      expect(received).toBeLessThanOrEqual(after);
      // The files' own finish, a September instant, dates nothing: the report finished on arrival.
      const parsed = parseJunit(sharedJunit);
      const fileFinish = Date.parse(String(parsed.startedAt)) + parsed.durationMs;
      expect(received).toBeGreaterThan(fileFinish);
      expect(Date.parse(String(report?.finished_at))).toBe(received);
    });

    it('takes the latest receipt on a re-post of the same key, as the replaced report is new', async () => {
      const [first] = await rows(admin, 'reports', 'received_at', [
        'run_id',
        String((await runFor(publicId, ciRunId))[0]?.id),
      ]);
      const { response, before, report } = await postShared();

      expect(response.status).toBe(200);
      const received = Date.parse(String(report?.received_at));
      expect(received).toBeGreaterThanOrEqual(before);
      expect(received).toBeGreaterThan(Date.parse(String(first?.received_at)));
    });

    it('lets anon read received_at as it reads every reports column, public or private', async () => {
      const response = await post(
        privateKey,
        multipart(
          [
            'meta',
            meta({
              ci_run_id: ciRunId,
              job: 'test',
              module: 'packages/shared',
              platform: 'node',
              path_prefix: ROUTESERVE_PREFIX,
            }),
          ],
          ['jest', new Blob([sharedJest]), 'shared.json'],
        ),
      );
      expect(response.status).toBe(201);
      const publicRun = (await runFor(publicId, ciRunId))[0]?.id as string;
      const privateRun = response.body.run_id as string;

      const [publicReport] = await rows(admin, 'reports', 'received_at', ['run_id', publicRun]);
      const asAnon = unwrap(
        await anon
          .from('reports')
          .select('run_id, received_at')
          .in('run_id', [publicRun, privateRun])
          .order('run_id'),
        'anon select reports.received_at',
      );

      expect(asAnon).toHaveLength(2);
      for (const row of asAnon) expect(Date.parse(String(row.received_at))).not.toBeNaN();
      expect(asAnon.find((row) => row.run_id === publicRun)?.received_at).toBe(
        publicReport?.received_at,
      );
    });
  });

  // Decision 2026-10-05 (open question 6, option a): ingest_report dates each report by its
  // receipt, [received_at - duration_ms, received_at], whatever times the payload carries, and the
  // run spans its reports' earliest start to their latest finish. The payloads below carry file
  // times as the app deployed before this change sends them, 19 hours before the receipt, as
  // Ostomate2's replayed Gradle cache did.
  describe('report span by receipt (spec sections 5.2 and 5.3)', () => {
    const ciRunId = `${suffix}-span`;
    const HOUR_MS = 3_600_000;
    const parsedShared = parseJunit(sharedJunit);

    const replayed = (
      module: string,
      receivedAt: string,
      durationMs: number,
    ): Record<string, unknown> => {
      const payload = normalizeReport(
        {
          ci_run_id: ciRunId,
          run_attempt: 1,
          job: 'android',
          module,
          platform: 'jvm',
          commit_sha: '2ec580f',
          branch: 'main',
          event: 'push',
        },
        { id: publicId, layer_rules: [{ default: 'unit' }], name_normalization: {} },
        { format: 'junit', report: { ...parsedShared, durationMs } },
        [],
        new Date(receivedAt),
      );
      const fileStart = Date.parse(receivedAt) - 19 * HOUR_MS - durationMs;
      return {
        ...payload,
        report: {
          ...payload.report,
          started_at: new Date(fileStart).toISOString(),
          finished_at: new Date(fileStart + durationMs).toISOString(),
        },
      };
    };

    const ingest = async (payload: Record<string, unknown>) => {
      const result = await admin.rpc('ingest_report', { payload });
      if (result.error) throw new Error(`ingest_report: ${result.error.message}`);
      return result.data as { run_id: string; report_id: string };
    };

    const reportSpan = async (reportId: string) => {
      const [report] = await rows(admin, 'reports', 'started_at, finished_at, received_at', [
        'id',
        reportId,
      ]);
      return {
        started_at: iso(report?.started_at),
        finished_at: iso(report?.finished_at),
        received_at: iso(report?.received_at),
      };
    };

    const runSpan = async () => {
      const [run] = await runFor(publicId, ciRunId);
      return { started_at: iso(run?.started_at), finished_at: iso(run?.finished_at) };
    };

    it('dates a report by its receipt when its files are 19 hours older', async () => {
      const { report_id } = await ingest(replayed('span-a', '2026-10-05T12:00:00.000Z', 60_000));

      expect(await reportSpan(report_id)).toEqual({
        started_at: '2026-10-05T11:59:00.000Z',
        finished_at: '2026-10-05T12:00:00.000Z',
        received_at: '2026-10-05T12:00:00.000Z',
      });
      expect(await runSpan()).toEqual({
        started_at: '2026-10-05T11:59:00.000Z',
        finished_at: '2026-10-05T12:00:00.000Z',
      });
      // The tests were first seen in this report, so both of their dates are its start.
      const tests = await rows(admin, 'tests', 'first_seen_at, last_seen_at', ['module', 'span-a']);
      expect(tests).toHaveLength(parsedShared.tests.length);
      for (const test of tests) {
        expect(iso(test.first_seen_at)).toBe('2026-10-05T11:59:00.000Z');
        expect(iso(test.last_seen_at)).toBe('2026-10-05T11:59:00.000Z');
      }
    });

    it('starts the run at the earliest receipt minus duration across its reports', async () => {
      // Received a minute after span-a but ran ten minutes, so it started first.
      await ingest(replayed('span-b', '2026-10-05T12:01:00.000Z', 600_000));

      expect(await runSpan()).toEqual({
        started_at: '2026-10-05T11:51:00.000Z',
        finished_at: '2026-10-05T12:01:00.000Z',
      });
    });

    it("keeps the latest receipt's span when a report is re-posted", async () => {
      const { report_id } = await ingest(replayed('span-b', '2026-10-05T13:00:00.000Z', 600_000));

      expect(await reportSpan(report_id)).toEqual({
        started_at: '2026-10-05T12:50:00.000Z',
        finished_at: '2026-10-05T13:00:00.000Z',
        received_at: '2026-10-05T13:00:00.000Z',
      });
      expect(await runSpan()).toEqual({
        started_at: '2026-10-05T11:59:00.000Z',
        finished_at: '2026-10-05T13:00:00.000Z',
      });
    });

    it('refuses a duration that would start the report before the year 1, before writing', async () => {
      const payload = normalizeReport(
        {
          ci_run_id: ciRunId,
          run_attempt: 1,
          job: 'android',
          module: 'span-c',
          platform: 'jvm',
          commit_sha: '2ec580f',
          branch: 'main',
          event: 'push',
        },
        { id: publicId, layer_rules: [{ default: 'unit' }], name_normalization: {} },
        { format: 'junit', report: { ...parsedShared, durationMs: 2_000 } },
        [],
        new Date('0001-01-01T00:00:01.000Z'),
      );

      const result = await admin.rpc('ingest_report', { payload });

      expect(result.error?.message).toMatch(
        /^ingest_report: payload\.report\.duration_ms reaches back before the year 1/,
      );
      const reports = await rows(admin, 'reports', 'module', [
        'run_id',
        String((await runFor(publicId, ciRunId))[0]?.id),
      ]);
      expect(reports.map((report) => report.module).sort()).toEqual(['span-a', 'span-b']);
    });
  });

  describe('run metadata (spec section 6.4)', () => {
    const ciRunId = `${suffix}-url`;
    const runUrl = 'https://github.com/bhelco1/Ostomate2/actions/runs/35644117162';

    it('keeps run_url when a later report for the run omits it', async () => {
      const first = await post(
        publicKey,
        multipart(
          ['meta', meta({ ci_run_id: ciRunId, run_url: runUrl })],
          ...files('junit', sharedJunit),
        ),
      );
      expect(first.status).toBe(201);
      const withoutUrl = JSON.parse(
        meta({ ci_run_id: ciRunId, module: 'composeApp', branch: 'feature' }),
      ) as Record<string, unknown>;
      delete withoutUrl.run_url;
      const second = await post(
        publicKey,
        multipart(['meta', JSON.stringify(withoutUrl)], ...files('junit', composeAppJunit)),
      );
      expect(second.status).toBe(201);
      expect(second.body.run_id).toBe(first.body.run_id);

      const runs = await rows(admin, 'runs', 'run_url, branch', ['ci_run_id', ciRunId]);
      expect(runs).toEqual([{ run_url: runUrl, branch: 'feature' }]);
    });
  });

  describe('failures and visibility (spec section 9)', () => {
    const ciRunId = `${suffix}-e2e`;
    const e2eMeta = meta({
      ci_run_id: ciRunId,
      job: 'e2e',
      module: 'testpulse',
      platform: 'chromium',
    });

    it('marks the run failed and stores the failure message for a public project', async () => {
      const response = await post(
        publicKey,
        multipart(['meta', e2eMeta], ...files('junit', [playwrightJunit])),
      );

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        totals: { total: 3, passed: 1, failed: 1, skipped: 1 },
        run_status: 'failed',
      });
      expect((await runFor(publicId, ciRunId))[0]).toMatchObject({ status: 'failed', failed: 1 });

      const results = await rows(admin, 'results', 'id, status', [
        'report_id',
        response.body.report_id as string,
      ]);
      const failed = results.filter((result) => result.status === 'failed');
      expect(failed).toHaveLength(1);
      const failures = await rows(admin, 'result_failures', 'result_id, message, detail', [
        'result_id',
        String(failed[0]?.id),
      ]);
      expect(failures).toHaveLength(1);
      expect(String(failures[0]?.message)).toMatch(/expect\(received\)\.toBe\(expected\)/);
      expect(String(failures[0]?.detail)).toContain('zz-deliberate-failure.spec.ts');

      const asAnon = unwrap(
        await anon
          .from('result_failures')
          .select('result_id')
          .eq('result_id', String(failed[0]?.id)),
        'anon select result_failures',
      );
      expect(asAnon).toHaveLength(1);
    });

    it('stores the same failure for a private project but hides it from anon', async () => {
      const response = await post(
        privateKey,
        multipart(['meta', e2eMeta], ...files('junit', [playwrightJunit])),
      );

      expect(response.status).toBe(201);
      const results = await rows(admin, 'results', 'id, status', [
        'report_id',
        response.body.report_id as string,
      ]);
      const failed = results.filter((result) => result.status === 'failed');
      expect(failed).toHaveLength(1);
      const resultId = String(failed[0]?.id);

      expect(
        await rows(admin, 'result_failures', 'result_id', ['result_id', resultId]),
      ).toHaveLength(1);
      const asAnon = unwrap(
        await anon.from('result_failures').select('result_id').eq('result_id', resultId),
        'anon select result_failures',
      );
      expect(asAnon).toEqual([]);
    });
  });

  describe('routeserve Jest reports', () => {
    const ciRunId = `${suffix}-jest`;
    const jestMeta = (extra: Partial<ReportMeta> = {}) =>
      meta({
        ci_run_id: ciRunId,
        job: 'test',
        module: 'packages/shared',
        platform: 'node',
        path_prefix: ROUTESERVE_PREFIX,
        ...extra,
      });

    it('strips path_prefix so suites are repo-relative', async () => {
      const response = await post(
        privateKey,
        multipart(['meta', jestMeta()], ['jest', new Blob([sharedJest]), 'r.json']),
      );

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        totals: { total: 119, passed: 119, failed: 0, skipped: 0 },
        run_status: 'passed',
      });
      const tests = await rows(admin, 'tests', 'suite, module', ['project_id', privateId]);
      const suites = tests
        .filter((test) => test.module === 'packages/shared')
        .map((test) => String(test.suite));
      expect(suites).toHaveLength(119);
      expect(suites.every((suite) => suite.startsWith('packages/shared/'))).toBe(true);
      expect(suites.some((suite) => suite.includes(ROUTESERVE_PREFIX))).toBe(false);
    });

    it('turns the one-failure capture into a failed run with one failed result', async () => {
      const response = await post(
        privateKey,
        multipart(['meta', jestMeta()], ['jest', new Blob([sharedJestOneFailure]), 'r.json']),
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        totals: { total: 119, passed: 118, failed: 1, skipped: 0 },
        run_status: 'failed',
      });
      expect((await runFor(privateId, ciRunId))[0]).toMatchObject({ status: 'failed', failed: 1 });
    });
  });

  describe('coverage parts', () => {
    it('stores JaCoCo line and branch counters under the report module', async () => {
      const ciRunId = `${suffix}-cov-jacoco`;
      const response = await post(
        publicKey,
        multipart(['meta', meta({ ci_run_id: ciRunId })], ...files('junit', sharedJunit), [
          'jacoco',
          new Blob([sharedJacoco]),
          'jacocoHostTestReport.xml',
        ]),
      );

      expect(response.status).toBe(201);
      const coverage = await rows(
        admin,
        'coverage',
        'module, format, lines_covered, lines_total, branches_covered, branches_total',
        ['report_id', response.body.report_id as string],
      );
      expect(coverage).toEqual([
        {
          module: 'shared',
          format: 'jacoco',
          lines_covered: 457,
          lines_total: 490,
          branches_covered: 105,
          branches_total: 140,
        },
      ]);
    });

    it('stores an istanbul summary', async () => {
      const ciRunId = `${suffix}-cov-istanbul`;
      const response = await post(
        privateKey,
        multipart(
          [
            'meta',
            meta({
              ci_run_id: ciRunId,
              job: 'test',
              module: 'packages/shared',
              platform: 'node',
              path_prefix: ROUTESERVE_PREFIX,
            }),
          ],
          ['jest', new Blob([sharedJest]), 'r.json'],
          ['istanbul', new Blob([sharedIstanbul]), 'coverage-summary.json'],
        ),
      );

      expect(response.status).toBe(201);
      const coverage = await rows(
        admin,
        'coverage',
        'module, format, lines_covered, lines_total, branches_covered, branches_total',
        ['report_id', response.body.report_id as string],
      );
      expect(coverage).toEqual([
        {
          module: 'packages/shared',
          format: 'istanbul',
          lines_covered: 102,
          lines_total: 102,
          branches_covered: 5,
          branches_total: 5,
        },
      ]);
    });
  });

  describe('empty reports (spec sections 6.3 and 12)', () => {
    const ciRunId = `${suffix}-empty`;
    const emptyMeta = meta({
      ci_run_id: ciRunId,
      job: 'ios',
      module: 'shared',
      platform: 'ios-sim',
    });
    // A real Gradle file with every testcase removed: the wrapper Gradle emits when nothing ran.
    const emptySuite = (sharedJunit[0] ?? '').replace(/^\s*<testcase [^>]*\/>\n/gm, '');
    const openAlerts = async () =>
      unwrap(
        await admin
          .from('alerts')
          .select('id, kind, detail, resolved_at')
          .eq('project_id', publicId)
          .eq('kind', 'empty_run'),
        'select alerts',
      );

    it('stores a zero-test report with run status empty and opens an empty_run alert (422)', async () => {
      expect(emptySuite).not.toContain('<testcase');

      const response = await post(
        publicKey,
        multipart(['meta', emptyMeta], ...files('junit', [emptySuite])),
      );

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({
        totals: { total: 0, passed: 0, failed: 0, skipped: 0 },
        run_status: 'empty',
      });
      const reportId = response.body.report_id as string;
      expect(await rows(admin, 'reports', 'id, total', ['id', reportId])).toEqual([
        { id: reportId, total: 0 },
      ]);
      expect((await runFor(publicId, ciRunId))[0]).toMatchObject({ status: 'empty', total: 0 });

      const alerts = await openAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatchObject({
        resolved_at: null,
        detail: { job: 'ios', module: 'shared', platform: 'ios-sim', report_id: reportId },
      });
    });

    it('does not open a second alert when the empty report is re-posted', async () => {
      const response = await post(
        publicKey,
        multipart(['meta', emptyMeta], ...files('junit', [emptySuite])),
      );

      expect(response.status).toBe(422);
      expect(await openAlerts()).toHaveLength(1);
    });

    it('resolves the alert when a non-empty report arrives for the same key', async () => {
      const response = await post(
        publicKey,
        multipart(['meta', emptyMeta], ...files('junit', sharedJunit)),
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ run_status: 'passed', totals: { total: 82 } });
      const alerts = await openAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.resolved_at).not.toBeNull();
      expect((await runFor(publicId, ciRunId))[0]).toMatchObject({ status: 'passed', total: 82 });
    });
  });

  describe('validation (400)', () => {
    const ciRunId = `${suffix}-invalid`;

    it('names the part for malformed XML', async () => {
      const response = await post(
        publicKey,
        multipart(
          ['meta', meta({ ci_run_id: ciRunId })],
          ...files('junit', ['<testsuite name="x"><testcase']),
        ),
      );
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ part: 'junit' });
      expect(String(response.body.error)).toMatch(/^junit: /);
    });

    it('names the meta field that failed', async () => {
      const response = await post(
        publicKey,
        multipart(
          ['meta', meta({ ci_run_id: ciRunId, event: 'merge_group' as ReportMeta['event'] })],
          ...files('junit', sharedJunit),
        ),
      );
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ part: 'meta', field: 'event' });
    });

    it('rejects junit and jest together', async () => {
      const response = await post(
        publicKey,
        multipart(['meta', meta({ ci_run_id: ciRunId })], ...files('junit', sharedJunit), [
          'jest',
          new Blob([sharedJest]),
          'r.json',
        ]),
      );
      expect(response.status).toBe(400);
      expect(String(response.body.error)).toMatch(/junit.*jest|jest.*junit/);
    });

    it('rejects a body that is not multipart', async () => {
      const response = await post(publicKey, 'not a form', { 'content-type': 'text/plain' });
      expect(response).toEqual({ status: 400, body: { error: 'body is not multipart/form-data' } });
    });

    it('answers 400 naming junit and time for a test duration the results column cannot hold', async () => {
      const overflow =
        '<testsuite name="x" tests="1"><testcase classname="c" name="n" time="2200000"/></testsuite>';
      const response = await post(
        publicKey,
        multipart(['meta', meta({ ci_run_id: ciRunId })], ...files('junit', [overflow])),
      );
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ part: 'junit', field: 'time' });
      expect(String(response.body.error)).toMatch(/^junit: .*2,147,483,647 ms/);
    });

    it('answers 400 naming branch for a meta value Postgres could not store', async () => {
      const response = await post(
        publicKey,
        multipart(
          ['meta', meta({ ci_run_id: ciRunId, branch: 'a\u0000b' })],
          ...files('junit', sharedJunit),
        ),
      );
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ part: 'meta', field: 'branch' });
      expect(String(response.body.error)).toMatch(/^meta: branch: /);
    });

    it('writes nothing for any of them', async () => {
      expect(await runFor(publicId, ciRunId)).toEqual([]);
    });
  });

  describe('size and encoding (spec section 6.5)', () => {
    it('answers 413 when content-length exceeds 4 MB', async () => {
      const response = await post(
        publicKey,
        multipart(['meta', meta({ ci_run_id: `${suffix}-big` })], ...files('junit', sharedJunit)),
        { 'content-length': String(MAX_BODY_BYTES + 1) },
      );
      expect(response.status).toBe(413);
      expect(String(response.body.error)).toMatch(/limit is/);
    });

    it('answers 413 when the parts read exceed 4 MB and no content-length said so', async () => {
      const response = await post(
        publicKey,
        multipart(
          ['meta', meta({ ci_run_id: `${suffix}-parts` })],
          ['junit', new Blob([new Uint8Array(MAX_BODY_BYTES + 1)]), 'huge.xml'],
        ),
      );
      expect(response.status).toBe(413);
      expect(response.body).toMatchObject({ part: 'junit' });
      expect(String(response.body.error)).toMatch(/^junit: .*byte limit/);
      expect(await runFor(publicId, `${suffix}-parts`)).toEqual([]);
    });

    it('answers 415 for a gzip body until compression is supported', async () => {
      const response = await post(
        publicKey,
        multipart(['meta', meta({ ci_run_id: `${suffix}-gz` })], ...files('junit', sharedJunit)),
        { 'content-encoding': 'gzip' },
      );
      expect(response.status).toBe(415);
      expect(String(response.body.error)).toMatch(/gzip.*not yet accepted/);
    });
  });

  describe('rate limit (spec section 6.3)', () => {
    it('answers 429 once the key has made 60 requests in the minute', async () => {
      const hash = hashApiKey(publicKey);
      const minute = new Date(Math.floor(Date.now() / 60_000) * 60_000);
      const next = new Date(minute.getTime() + 60_000);
      // Fill this minute and the next so the request cannot slip into a fresh bucket. Earlier
      // cases already spent real requests in this minute, so the proof is 60 increments, not
      // a count of exactly 60.
      const filled = new Map<string, number>();
      for (const bucket of [minute, next]) {
        const counts = await Promise.all(
          Array.from({ length: RATE_LIMIT_PER_MINUTE }, () =>
            admin.rpc('rate_limit_hit', {
              p_api_key_hash: hash,
              p_minute: bucket.toISOString(),
            }),
          ),
        );
        expect(counts.map((result) => result.error)).toEqual(counts.map(() => null));
        const values = counts.map((result) => Number(result.data));
        const max = Math.max(...values);
        expect(max - Math.min(...values) + 1).toBe(RATE_LIMIT_PER_MINUTE);
        expect(max).toBeGreaterThanOrEqual(RATE_LIMIT_PER_MINUTE);
        filled.set(bucket.toISOString(), max);
      }

      const response = await post(
        publicKey,
        multipart(
          ['meta', meta({ ci_run_id: `${suffix}-limited` })],
          ...files('junit', sharedJunit),
        ),
      );

      expect(response.status).toBe(429);
      expect(response.body).toEqual({
        error: `rate limit exceeded: ${RATE_LIMIT_PER_MINUTE} requests per minute per key`,
      });
      expect(await runFor(publicId, `${suffix}-limited`)).toEqual([]);

      const buckets = unwrap(
        await admin
          .from('rate_limit_buckets')
          .select('minute, count')
          .eq('api_key_hash', hash)
          .gte('minute', minute.toISOString()),
        'select rate_limit_buckets',
      );
      // Exactly one bucket, the request's minute, moved past what the fill left in it.
      const increments = buckets.map(
        (bucket) => Number(bucket.count) - (filled.get(iso(bucket.minute)) ?? Number.NaN),
      );
      expect(increments.sort()).toEqual([0, 1]);
    });
  });

  describe('ingest_report atomicity', () => {
    const ciRunId = `${suffix}-atomic`;

    it('writes nothing when a later result is invalid', async () => {
      const payload = normalizeReport(
        {
          ci_run_id: ciRunId,
          run_attempt: 1,
          job: 'e2e',
          module: 'testpulse',
          platform: 'chromium',
          commit_sha: '2ec580f',
          branch: 'main',
          event: 'push',
        },
        { id: publicId, layer_rules: [{ default: 'e2e' }], name_normalization: {} },
        { format: 'junit', report: parseJunit([playwrightJunit]) },
        [],
        new Date('2026-09-22T12:00:00.000Z'),
      );
      const failedIndex = payload.tests.findIndex((test) => test.failure !== null);
      expect(failedIndex).toBeGreaterThan(0);
      // The visibility case already stored these tests; a receipt far in the future means a
      // write that slipped through would have to move last_seen_at, so "unchanged" is a real check.
      const before = unwrap(
        await admin
          .from('tests')
          .select('test_key, last_seen_at')
          .eq('project_id', publicId)
          .in(
            'test_key',
            payload.tests.map((test) => test.test_key),
          ),
        'select tests',
      );
      expect(before).toHaveLength(payload.tests.length);
      const broken = {
        ...payload,
        received_at: '2030-01-01T00:01:00.000Z',
        tests: payload.tests.map((test, index) =>
          index === failedIndex
            ? { ...test, failure: { message: 'x'.repeat(2001), detail: '' } }
            : test,
        ),
      };

      const result = await admin.rpc('ingest_report', { payload: broken });

      expect(result.error?.message).toMatch(
        new RegExp(`tests\\[${failedIndex}\\]\\.failure\\.message must be at most 2000`),
      );
      expect(await runFor(publicId, ciRunId)).toEqual([]);
      const after = unwrap(
        await admin
          .from('tests')
          .select('test_key, last_seen_at')
          .eq('project_id', publicId)
          .in(
            'test_key',
            payload.tests.map((test) => test.test_key),
          ),
        'select tests',
      );
      expect(after).toEqual(before);
    });

    it('refuses coverage whose covered count exceeds its total before writing', async () => {
      const payload = normalizeReport(
        {
          ci_run_id: `${ciRunId}-cov`,
          run_attempt: 1,
          job: 'android',
          module: 'shared',
          platform: 'jvm',
          commit_sha: '2ec580f',
          branch: 'main',
          event: 'push',
        },
        { id: publicId, layer_rules: [{ default: 'unit' }], name_normalization: {} },
        { format: 'junit', report: parseJunit(sharedJunit) },
        [],
        new Date('2026-09-22T12:00:00.000Z'),
      );
      const broken = {
        ...payload,
        coverage: [
          {
            module: 'shared',
            format: 'jacoco',
            lines_covered: 11,
            lines_total: 10,
            branches_covered: null,
            branches_total: null,
          },
        ],
      };

      const result = await admin.rpc('ingest_report', { payload: broken });

      expect(result.error?.message).toMatch(/coverage\[0\]\.lines_covered exceeds lines_total/);
      expect(await runFor(publicId, `${ciRunId}-cov`)).toEqual([]);
    });

    it.each<[string, Record<string, unknown>, RegExp]>([
      ['an empty payload', {}, /payload/],
      [
        'a missing run block',
        {
          project_id: '00000000-0000-4000-8000-000000000000',
          received_at: '2026-09-22T12:00:00.000Z',
        },
        /payload\.run must be an object/,
      ],
      [
        'a bad event',
        {
          project_id: '00000000-0000-4000-8000-000000000000',
          received_at: '2026-09-22T12:00:00.000Z',
          run: {
            ci_run_id: 'x',
            run_attempt: 1,
            commit_sha: 'abc1234',
            branch: 'main',
            event: 'merge_group',
            run_url: null,
          },
          report: {},
          tests: [],
          coverage: [],
        },
        /event/,
      ],
    ])('raises a clear message for %s', async (_label, payload, message) => {
      const result = await admin.rpc('ingest_report', { payload });
      expect(result.error?.message).toMatch(message);
    });
  });

  describe('validation helpers by direct RPC', () => {
    it.each([
      'now',
      'today',
      'tomorrow',
      'yesterday',
      'epoch',
      'infinity',
      '-infinity',
      'allballs',
    ])('ingest_timestamp refuses %s, which reads the clock or is not finite', async (value) => {
      const result = await admin.rpc('ingest_timestamp', {
        obj: { t: value },
        key: 't',
        path: 'p',
      });
      expect(result.error?.message).toMatch(/^ingest_report: p\.t must be an ISO 8601 timestamp/);
    });

    it('ingest_timestamp reads the form Date.toISOString writes', async () => {
      const result = await admin.rpc('ingest_timestamp', {
        obj: { t: '2026-09-22T12:00:00.000Z' },
        key: 't',
        path: 'p',
      });
      expect(result.error).toBeNull();
      expect(iso(result.data)).toBe('2026-09-22T12:00:00.000Z');
    });

    it.each<[string, number]>([
      ['one above the maximum', 2_147_483_648],
      ['one below the minimum', -1],
      ['a fraction', 1.5],
    ])('ingest_int refuses %s with a message naming both bounds', async (_label, value) => {
      const result = await admin.rpc('ingest_int', {
        obj: { n: value },
        key: 'n',
        path: 'p',
        minimum: 0,
        maximum: 2_147_483_647,
      });
      expect(result.error?.message).toMatch(
        /^ingest_report: p\.n must be an integer between 0 and 2147483647, got/,
      );
    });

    it('ingest_text refuses a value over its cap and names the field', async () => {
      const result = await admin.rpc('ingest_text', {
        obj: { s: 'x'.repeat(101) },
        key: 's',
        path: 'p',
        max_length: 100,
      });
      expect(result.error?.message).toMatch(
        /^ingest_report: p\.s must be at most 100 characters, got 101/,
      );
    });

    it('ingest_report names project_id when it is not a UUID', async () => {
      const result = await admin.rpc('ingest_report', {
        payload: { project_id: 'not-a-uuid', received_at: '2026-09-22T12:00:00.000Z' },
      });
      expect(result.error?.message).toMatch(/^ingest_report: payload\.project_id must be a UUID/);
    });
  });

  describe('cleanup', () => {
    it('removes the throwaway projects, everything they own, and their rate-limit buckets', async () => {
      const hashes = [hashApiKey(publicKey), hashApiKey(privateKey)];
      unwrap(
        await admin.from('projects').delete().in('id', [publicId, privateId]),
        'delete projects',
      );
      unwrap(
        await admin.from('rate_limit_buckets').delete().in('api_key_hash', hashes),
        'delete rate_limit_buckets',
      );

      const remaining = {
        runs: unwrap(
          await admin.from('runs').select('id').in('project_id', [publicId, privateId]),
          'runs',
        ),
        tests: unwrap(
          await admin.from('tests').select('id').in('project_id', [publicId, privateId]),
          'tests',
        ),
        alerts: unwrap(
          await admin.from('alerts').select('id').in('project_id', [publicId, privateId]),
          'alerts',
        ),
        buckets: unwrap(
          await admin.from('rate_limit_buckets').select('minute').in('api_key_hash', hashes),
          'rate_limit_buckets',
        ),
      };
      expect(remaining).toEqual({ runs: [], tests: [], alerts: [], buckets: [] });
    });
  });
});

// Spec 5.4, 7 and 11: Kotlin Multiplatform stamps its iOS simulator target into both the suite
// and the test name, so the same composeApp test arrives twice per CI run. Without the
// project's name_normalization it becomes two `tests` rows and the iOS copy misses every layer
// glob; with it, one identity and one layer, whichever platform reported it.
describe('Kotlin Multiplatform name normalization', () => {
  const admin = createSecretClient(process.env);

  const suffix = randomUUID().slice(0, 8);
  const normalizingSlug = `norm-on-${suffix}`;
  const plainSlug = `norm-off-${suffix}`;
  const slugPattern = `norm-o%-${suffix}`;
  const ciRunId = `${suffix}-kmp`;
  // Keys live only in these variables and never appear in an assertion message.
  let normalizingKey: string;
  let plainKey: string;
  let normalizingId: string;
  let plainId: string;
  let normalizingRunId: string;
  let plainRunId: string;

  const meta = (job: string, platform: string): string =>
    JSON.stringify({
      ci_run_id: ciRunId,
      job,
      module: 'composeApp',
      platform,
      commit_sha: '2ec580f377e52f0a1ae584661ff09b07821ea1e2',
      branch: 'main',
      event: 'push',
    });

  const postBothPlatforms = async (key: string): Promise<string> => {
    const jvm = await post(
      key,
      multipart(['meta', meta('android', 'jvm')], ...files('junit', composeAppJunit)),
    );
    const ios = await post(
      key,
      multipart(['meta', meta('ios', 'ios-sim')], ...files('junit', composeAppIosJunit)),
    );

    expect([jvm.status, ios.status]).toEqual([201, 201]);
    expect(jvm.body).toMatchObject({ totals: { total: 60, passed: 60, failed: 0, skipped: 0 } });
    expect(ios.body).toMatchObject({ totals: { total: 50, passed: 50, failed: 0, skipped: 0 } });
    // One CI run, two jobs: the second post joins the first run rather than opening its own.
    expect(ios.body.run_id).toBe(jvm.body.run_id);
    return jvm.body.run_id as string;
  };

  const testIdsOfReport = async (reportId: string): Promise<Set<string>> => {
    const results = await rows(admin, 'results', 'test_id', ['report_id', reportId]);
    return new Set(results.map((result) => String(result.test_id)));
  };

  const reportsByPlatform = async (runId: string): Promise<Map<string, string>> => {
    const reports = await rows(admin, 'reports', 'id, platform, total', ['run_id', runId]);
    expect(reports).toHaveLength(2);
    return new Map(reports.map((report) => [String(report.platform), String(report.id)]));
  };

  beforeAll(async () => {
    const ostomate2 = parseProjectFile(
      readFileSync(`${repoRoot}projects/ostomate2.yaml`, 'utf8'),
      'projects/ostomate2.yaml',
    );
    normalizingKey = await addProject(admin, { ...ostomate2, slug: normalizingSlug });
    plainKey = await addProject(admin, { ...ostomate2, slug: plainSlug, name_normalization: {} });
    const projects = unwrap(
      await admin.from('projects').select('id, slug').like('slug', slugPattern),
      'select projects',
    );
    const bySlug = new Map(projects.map((row) => [row.slug as string, row.id as string]));
    normalizingId = bySlug.get(normalizingSlug) as string;
    plainId = bySlug.get(plainSlug) as string;

    normalizingRunId = await postBothPlatforms(normalizingKey);
    plainRunId = await postBothPlatforms(plainKey);
  });

  afterAll(async () => {
    unwrap(await admin.from('projects').delete().like('slug', slugPattern), 'cleanup projects');
    unwrap(
      await admin
        .from('rate_limit_buckets')
        .delete()
        .in('api_key_hash', [hashApiKey(normalizingKey), hashApiKey(plainKey)]),
      'cleanup rate_limit_buckets',
    );
  });

  it('records 110 executions across the two reports of one run', async () => {
    const run = unwrap(
      await admin
        .from('runs')
        .select('id, status, total, passed, failed, skipped')
        .eq('id', normalizingRunId)
        .single(),
      'select run',
    );
    const byPlatform = await reportsByPlatform(normalizingRunId);

    expect(run).toMatchObject({
      status: 'passed',
      total: 110,
      passed: 110,
      failed: 0,
      skipped: 0,
    });
    expect([...byPlatform.keys()].sort()).toEqual(['ios-sim', 'jvm']);
  });

  it('keeps 60 distinct tests rows, none carrying the platform in its identity', async () => {
    const tests = await rows(admin, 'tests', 'id, suite, name', ['project_id', normalizingId]);

    expect(tests).toHaveLength(60);
    for (const test of tests) {
      expect(String(test.suite)).not.toContain('iosSimulatorArm64');
      expect(String(test.name)).not.toContain('iosSimulatorArm64');
    }
  });

  it('resolves the layers from the normalized suites: unit 50, visual 10', async () => {
    const tests = await rows(admin, 'tests', 'layer', ['project_id', normalizingId]);

    expect(countBy(tests.map((test) => String(test.layer)))).toEqual({ unit: 50, visual: 10 });
  });

  it('links every iOS result to the tests row its JVM counterpart created', async () => {
    const byPlatform = await reportsByPlatform(normalizingRunId);
    const jvmTestIds = await testIdsOfReport(byPlatform.get('jvm') as string);
    const iosTestIds = await testIdsOfReport(byPlatform.get('ios-sim') as string);

    expect(jvmTestIds.size).toBe(60);
    expect(iosTestIds.size).toBe(50);
    for (const testId of iosTestIds) {
      expect(jvmTestIds).toContain(testId);
    }
  });

  it('leaves a project without normalization exactly as it was: 110 rows, unit 100', async () => {
    const run = unwrap(
      await admin.from('runs').select('total').eq('id', plainRunId).single(),
      'select run',
    );
    const tests = await rows(admin, 'tests', 'id, layer', ['project_id', plainId]);
    const byPlatform = await reportsByPlatform(plainRunId);
    const jvmTestIds = await testIdsOfReport(byPlatform.get('jvm') as string);
    const iosTestIds = await testIdsOfReport(byPlatform.get('ios-sim') as string);

    expect(run).toMatchObject({ total: 110 });
    expect(tests).toHaveLength(110);
    expect(countBy(tests.map((test) => String(test.layer)))).toEqual({ unit: 100, visual: 10 });
    for (const testId of iosTestIds) {
      expect(jvmTestIds).not.toContain(testId);
    }
  });
});
