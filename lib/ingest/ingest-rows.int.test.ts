import { createHash, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { PostgrestSingleResponse, SupabaseClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';

import {
  type NormalizedReport,
  parseIstanbulSummary,
  parseJacoco,
  parseJestJson,
  parseJunit,
} from '../parsers/index.ts';
import { addProject } from '../projects/repo.ts';
import { parseProjectFile } from '../projects/schema.ts';
import { createSecretClient } from '../supabase/server.ts';
import type { ReportMeta } from './meta.ts';
import { type CoverageInput, normalizeReport, type ReportFormat } from './normalize.ts';

// What ingest_report writes for every committed fixture, pinned as a golden file. The file was
// written by the per-test loop of 20261012182451_count_drop_executed_tests.sql, before the
// set-based version replaced it, so this test passing on the set-based version proves the two
// write the same rows: runs, reports, tests, results, failures, coverage and alerts, and the
// same answer, for a first post and for its replacement (spec 5.3).
//
// Row ids and created_at are the database's own and differ on every run, so ids are replaced
// by what they point at (a result by its test_key) and created_at is left out. Results are
// compared as a sorted multiset: a test can appear twice in one report. Each table's rows are
// kept as a SHA-256 of their canonical JSON with their count beside it, so the golden file stays
// small; the failures, the part a reader most wants to see, are kept in full.

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const fixturePath = (path: string): string => `${repoRoot}fixtures/${path}`;
const readFixture = (path: string): string => readFileSync(fixturePath(path), 'utf8');
const readDir = (dir: string): string[] =>
  readdirSync(fixturePath(dir))
    .filter((name) => name.endsWith('.xml'))
    .sort()
    .map((name) => readFixture(`${dir}/${name}`));

const RECEIVED_AT = new Date('2026-11-18T12:00:00.000Z');
const REPLACED_AT = new Date('2026-11-18T12:05:00.000Z');
const ROUTESERVE_PREFIX = '/home/runner/work/routeserve/routeserve/';
const PAGE = 1000;

type Source = 'ostomate2' | 'routeserve' | 'testpulse' | 'atpr';

interface FixtureReport {
  /** The fixture path, which names its golden entry. */
  readonly name: string;
  readonly source: Source;
  readonly meta: Pick<ReportMeta, 'job' | 'module' | 'platform'> & { path_prefix?: string };
  readonly format: ReportFormat;
  readonly parse: () => NormalizedReport;
  readonly coverage: readonly CoverageInput[];
}

const junitDir = (dir: string) => () => parseJunit(readDir(dir));
const junitFile = (file: string) => () => parseJunit([readFixture(file)]);
const jacoco = (file: string): CoverageInput => ({
  format: 'jacoco',
  coverage: parseJacoco(readFixture(file)),
});
const istanbul = (file: string): CoverageInput => ({
  format: 'istanbul',
  coverage: parseIstanbulSummary(readFixture(file)),
});

// Every result file under fixtures/, each in the report its CI posts it in (fixtures/README.md),
// with the coverage file that travels with it.
const REPORTS: readonly FixtureReport[] = [
  {
    name: 'ostomate2/junit/jvm/shared',
    source: 'ostomate2',
    meta: { job: 'android', module: 'shared', platform: 'jvm' },
    format: 'junit',
    parse: junitDir('ostomate2/junit/jvm/shared'),
    coverage: [jacoco('ostomate2/jacoco/shared.xml')],
  },
  {
    name: 'ostomate2/junit/jvm/composeApp',
    source: 'ostomate2',
    meta: { job: 'android', module: 'composeApp', platform: 'jvm' },
    format: 'junit',
    parse: junitDir('ostomate2/junit/jvm/composeApp'),
    coverage: [jacoco('ostomate2/jacoco/composeApp.xml')],
  },
  {
    name: 'ostomate2/junit/ios-sim/composeApp',
    source: 'ostomate2',
    meta: { job: 'ios', module: 'composeApp', platform: 'ios-sim' },
    format: 'junit',
    parse: junitDir('ostomate2/junit/ios-sim/composeApp'),
    coverage: [],
  },
  {
    name: 'ostomate2/junit/android-emulator/e2e',
    source: 'ostomate2',
    meta: { job: 'android-e2e', module: 'e2e', platform: 'android-emulator' },
    format: 'junit',
    parse: junitDir('ostomate2/junit/android-emulator/e2e'),
    coverage: [],
  },
  {
    name: 'ostomate2/junit/ios-sim/e2e',
    source: 'ostomate2',
    meta: { job: 'ios-e2e', module: 'e2e', platform: 'ios-sim' },
    format: 'junit',
    parse: junitDir('ostomate2/junit/ios-sim/e2e'),
    coverage: [],
  },
  {
    name: 'ostomate2/junit/maestro-2.11.0/android-emulator/e2e',
    source: 'ostomate2',
    meta: { job: 'android-e2e-maestro', module: 'e2e', platform: 'android-emulator' },
    format: 'junit',
    parse: junitDir('ostomate2/junit/maestro-2.11.0/android-emulator/e2e'),
    coverage: [],
  },
  {
    name: 'ostomate2/junit/maestro-2.11.0/ios-sim/e2e',
    source: 'ostomate2',
    meta: { job: 'ios-e2e-maestro', module: 'e2e', platform: 'ios-sim' },
    format: 'junit',
    parse: junitDir('ostomate2/junit/maestro-2.11.0/ios-sim/e2e'),
    coverage: [],
  },
  ...(['backend', 'mobile', 'shared'] as const).map((module): FixtureReport => ({
    name: `routeserve/jest/${module}.json`,
    source: 'routeserve',
    meta: { job: 'test', module, platform: 'node', path_prefix: ROUTESERVE_PREFIX },
    format: 'jest-json',
    parse: () =>
      parseJestJson(readFixture(`routeserve/jest/${module}.json`), {
        pathPrefix: ROUTESERVE_PREFIX,
      }),
    coverage: [istanbul(`routeserve/istanbul/${module}.json`)],
  })),
  {
    name: 'routeserve/jest/shared-one-failure.json',
    source: 'routeserve',
    meta: { job: 'test-failure', module: 'shared', platform: 'node' },
    format: 'jest-json',
    parse: () =>
      parseJestJson(readFixture('routeserve/jest/shared-one-failure.json'), {
        pathPrefix: ROUTESERVE_PREFIX,
      }),
    coverage: [],
  },
  {
    name: 'testpulse/junit/vitest-unit.xml',
    source: 'testpulse',
    meta: { job: 'checks', module: 'unit', platform: 'node' },
    format: 'junit',
    parse: junitFile('testpulse/junit/vitest-unit.xml'),
    coverage: [istanbul('testpulse/istanbul/unit.json')],
  },
  ...(
    [
      ['vitest-integration.xml', 'integration', 'integration', 'node'],
      ['vitest-one-failure.xml', 'checks-failure', 'unit', 'node'],
      ['playwright-e2e.xml', 'e2e', 'e2e', 'chromium'],
      ['playwright-one-failure.xml', 'e2e-failure', 'e2e', 'chromium'],
    ] as const
  ).map(([file, job, module, platform]): FixtureReport => ({
    name: `testpulse/junit/${file}`,
    source: 'testpulse',
    meta: { job, module, platform },
    format: 'junit',
    parse: junitFile(`testpulse/junit/${file}`),
    coverage: [],
  })),
  {
    name: 'atpr/junit/vitest.xml',
    source: 'atpr',
    meta: { job: 'test', module: 'atpr', platform: 'node' },
    format: 'junit',
    parse: junitFile('atpr/junit/vitest.xml'),
    coverage: [],
  },
];

function unwrap<T>(result: PostgrestSingleResponse<T>, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.code} ${result.error.message}`);
  return result.data;
}

type Row = Record<string, unknown>;

/** Every row a query matches, a page at a time: the API answers at most 1,000 rows. */
async function allRows(
  page: (from: number, to: number) => PromiseLike<PostgrestSingleResponse<Row[]>>,
  what: string,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const batch = unwrap(await page(from, from + PAGE - 1), what);
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, inner: unknown) =>
    inner !== null && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner as Row).sort(([a], [b]) => a.localeCompare(b)))
      : inner,
  );

const digest = (rows: readonly unknown[]) => ({
  count: rows.length,
  sha256: createHash('sha256').update(canonical(rows)).digest('hex'),
});

const sortRows = <T>(rows: readonly T[]): T[] =>
  [...rows].sort((a, b) => canonical(a).localeCompare(canonical(b)));

const without = (row: Row, ...keys: string[]): Row =>
  Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key)));

const iso = (value: unknown): string => new Date(String(value)).toISOString();

describe('ingest_report rows on every committed fixture (golden, taken from the per-test loop)', () => {
  const admin: SupabaseClient = createSecretClient(process.env);
  const suffix = randomUUID().slice(0, 8);
  let created = 0;

  afterAll(async () => {
    unwrap(await admin.from('projects').delete().like('slug', `rows-%-${suffix}`), 'cleanup');
  });

  /** A project of its own per fixture, from the real project file, so no report sees another. */
  async function project(source: Source) {
    created += 1;
    const file = parseProjectFile(
      readFileSync(`${repoRoot}projects/${source}.yaml`, 'utf8'),
      `projects/${source}.yaml`,
    );
    const slug = `rows-${String(created)}-${suffix}`;
    await addProject(admin, { ...file, slug });
    return unwrap(
      await admin
        .from('projects')
        .select('id, layer_rules, name_normalization')
        .eq('slug', slug)
        .single(),
      'select project',
    ) as { id: string; layer_rules: unknown; name_normalization: unknown };
  }

  /** The rows ingest_report wrote for one run, with ids replaced by what they point at. */
  async function written(projectId: string, runId: string, reportId: string) {
    const run = unwrap(await admin.from('runs').select('*').eq('id', runId).single(), 'run');
    const reports = unwrap(
      await admin.from('reports').select('*').eq('run_id', runId),
      'reports',
    ) as Row[];
    const tests = await allRows(
      (from, to) =>
        admin
          .from('tests')
          .select('*')
          .eq('project_id', projectId)
          .order('test_key')
          .range(from, to),
      'tests',
    );
    const results = await allRows(
      (from, to) =>
        admin
          .from('results')
          .select('id, status, duration_ms, tests(test_key), result_failures(message, detail)')
          .eq('report_id', reportId)
          .order('id')
          .range(from, to),
      'results',
    );
    const coverage = unwrap(
      await admin.from('coverage').select('*').eq('report_id', reportId),
      'coverage',
    ) as Row[];
    const alerts = unwrap(
      await admin.from('alerts').select('*').eq('project_id', projectId),
      'alerts',
    ) as Row[];

    const resultRows = sortRows(
      results.map((row) => {
        const test = row.tests as { test_key: string };
        const failure = row.result_failures as { message: string; detail: string | null } | null;
        return {
          test_key: test.test_key,
          status: row.status,
          duration_ms: row.duration_ms,
          failure,
        };
      }),
    );
    const failures = resultRows.filter((row) => row.failure !== null);
    const timestamps = (row: Row, ...keys: string[]): Row => ({
      ...row,
      ...Object.fromEntries(keys.map((key) => [key, row[key] === null ? null : iso(row[key])])),
    });
    return {
      run: timestamps(
        without(run as Row, 'id', 'created_at', 'project_id'),
        'started_at',
        'finished_at',
      ),
      reports: sortRows(
        reports.map((row) =>
          timestamps(
            without(row, 'id', 'created_at', 'run_id'),
            'started_at',
            'finished_at',
            'received_at',
          ),
        ),
      ),
      tests: digest(
        tests.map((row) =>
          timestamps(
            without(row, 'id', 'created_at', 'project_id'),
            'first_seen_at',
            'last_seen_at',
          ),
        ),
      ),
      results: digest(resultRows),
      result_failures: {
        count: failures.length,
        rows: failures.map((row) => ({
          test_key: row.test_key,
          status: row.status,
          message: row.failure?.message,
          detail_sha256: createHash('sha256')
            .update(row.failure?.detail ?? '')
            .digest('hex'),
        })),
      },
      coverage: sortRows(coverage.map((row) => without(row, 'id', 'created_at', 'report_id'))),
      alerts: sortRows(
        alerts.map((row) => ({
          kind: row.kind,
          opened_at: iso(row.opened_at),
          resolved_at: row.resolved_at === null ? null : iso(row.resolved_at),
          detail_keys: Object.keys(row.detail as Row).sort(),
        })),
      ),
    };
  }

  it.each(REPORTS.map((report) => [report.name, report] as const))(
    'writes the pinned rows for %s',
    async (name, report) => {
      const target = await project(report.source);
      const meta: ReportMeta = {
        ...report.meta,
        ci_run_id: `rows-${name}`,
        run_attempt: 1,
        commit_sha: '2ec580f377e52f0a1ae584661ff09b07821ea1e2',
        branch: 'main',
        event: 'push',
      };
      const results = { format: report.format, report: report.parse() };
      const first = normalizeReport(meta, target, results, report.coverage, RECEIVED_AT);
      const again = normalizeReport(meta, target, results, report.coverage, REPLACED_AT);

      const created = unwrap(
        await admin.rpc('ingest_report', { payload: first }),
        'first post',
      ) as Row;
      const afterFirst = await written(
        target.id,
        created.run_id as string,
        created.report_id as string,
      );
      const replaced = unwrap(
        await admin.rpc('ingest_report', { payload: again }),
        'replacement',
      ) as Row;
      const afterReplace = await written(
        target.id,
        replaced.run_id as string,
        replaced.report_id as string,
      );

      const answer = (row: Row) => without(row, 'run_id', 'report_id');
      expect(replaced.run_id).toBe(created.run_id);
      expect(replaced.report_id).not.toBe(created.report_id);
      const golden = {
        answers: { first: answer(created), replaced: answer(replaced) },
        after_first: afterFirst,
        after_replace: afterReplace,
      };
      await expect(`${JSON.stringify(golden, null, 2)}\n`).toMatchFileSnapshot(
        `./__golden__/ingest-rows/${name.replaceAll('/', '__')}.json`,
      );
    },
  );
});
