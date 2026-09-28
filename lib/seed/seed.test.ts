import { fileURLToPath } from 'node:url';

import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import type { IngestPayload } from '../ingest/normalize.ts';
import { planSeed, SEED_NOW, type SeedPlan } from './plan.ts';
import { describeSeed, seedDatabase } from './seed.ts';

// The writer against a recording fake: what it sends, in what order, and when it stops. The
// integration test runs the same function against local Supabase.

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const plan = planSeed(new Date(SEED_NOW));

const IDS: Record<string, string> = {
  ostomate2: '00000000-0000-4000-8000-000000000001',
  routeserve: '00000000-0000-4000-8000-000000000002',
  testpulse: '00000000-0000-4000-8000-000000000003',
};

type Call =
  | { kind: 'delete'; slugs: unknown }
  | { kind: 'insert'; row: Record<string, unknown> }
  | { kind: 'select'; columns: string }
  | { kind: 'lookup'; slug: string }
  | { kind: 'rpc'; fn: string; payload: Record<string, unknown> };

interface Fake {
  readonly client: SupabaseClient;
  readonly calls: Call[];
}

function fakeClient(options: { failIngestAt?: number } = {}): Fake {
  const calls: Call[] = [];
  const inserted: Array<Record<string, unknown>> = [];
  let ingests = 0;
  const ok = <T>(data: T) => Promise.resolve({ data, error: null });
  const client = {
    from: (table: string) => {
      expect(table).toBe('projects');
      return {
        delete: () => ({
          in: (column: string, slugs: unknown) => {
            expect(column).toBe('slug');
            calls.push({ kind: 'delete', slugs });
            return ok(null);
          },
        }),
        insert: (row: Record<string, unknown>) => {
          calls.push({ kind: 'insert', row });
          inserted.push(row);
          return ok(null);
        },
        select: (columns: string) => ({
          in: (column: string, slugs: string[]) => {
            expect(column).toBe('slug');
            calls.push({ kind: 'select', columns });
            return ok(
              inserted
                .filter((row) => slugs.includes(String(row.slug)))
                .map((row) => ({ ...row, id: IDS[String(row.slug)] })),
            );
          },
          eq: (column: string, slug: string) => ({
            maybeSingle: () => {
              expect(column).toBe('slug');
              calls.push({ kind: 'lookup', slug });
              return ok({ id: IDS[slug], default_branch: 'main' });
            },
          }),
        }),
      };
    },
    rpc: (fn: string, args: { payload: Record<string, unknown> }) => {
      calls.push({ kind: 'rpc', fn, payload: args.payload });
      if (fn === 'backfill_run') {
        return ok({ inserted: true, run_id: 'r', status: 'passed' });
      }
      ingests += 1;
      if (ingests === options.failIngestAt) {
        return Promise.resolve({
          data: null,
          error: { code: 'P0001', message: 'ingest_report: payload.report.job is empty' },
        });
      }
      const payload = args.payload as unknown as IngestPayload;
      return ok({
        run_id: `run-${payload.run.ci_run_id}`,
        report_id: `report-${ingests}`,
        replaced: false,
        totals: {
          total: payload.report.total,
          passed: payload.report.passed,
          failed: payload.report.failed,
          skipped: payload.report.skipped,
        },
        run_status: payload.report.failed > 0 ? 'failed' : 'passed',
      });
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

const ingested = (calls: readonly Call[]): IngestPayload[] =>
  calls.flatMap((call) =>
    call.kind === 'rpc' && call.fn === 'ingest_report'
      ? [call.payload as unknown as IngestPayload]
      : [],
  );

describe('seedDatabase', () => {
  it('replaces only the seed projects, registers them from their files, then backfills and ingests', async () => {
    const { client, calls } = fakeClient();
    await seedDatabase(client, plan, repoRoot);

    expect(calls[0]).toEqual({ kind: 'delete', slugs: ['ostomate2', 'routeserve', 'testpulse'] });
    const inserts = calls.flatMap((call) => (call.kind === 'insert' ? [call.row] : []));
    expect(inserts.map((row) => [row.slug, row.visibility])).toEqual([
      ['ostomate2', 'public'],
      ['routeserve', 'private'],
      ['testpulse', 'public'],
    ]);
    // addProject stores only the hash of a fresh key; the key itself goes nowhere.
    expect(inserts.every((row) => /^[0-9a-f]{64}$/.test(String(row.api_key_hash)))).toBe(true);

    const kinds = calls.map((call) => (call.kind === 'rpc' ? call.fn : call.kind));
    const firstIngest = kinds.indexOf('ingest_report');
    expect(kinds.slice(0, 4)).toEqual(['delete', 'insert', 'insert', 'insert']);
    expect(kinds.lastIndexOf('backfill_run')).toBeLessThan(firstIngest);
    expect(kinds.filter((kind) => kind === 'backfill_run')).toHaveLength(13);
    expect(kinds.filter((kind) => kind === 'ingest_report')).toHaveLength(61);
  });

  it('backfills the captured Ostomate2 history into the Ostomate2 project', async () => {
    const { client, calls } = fakeClient();
    await seedDatabase(client, plan, repoRoot);
    const backfilled = calls.flatMap((call) =>
      call.kind === 'rpc' && call.fn === 'backfill_run' ? [call.payload] : [],
    );
    expect(new Set(backfilled.map((payload) => payload.project_id))).toEqual(
      new Set([IDS.ostomate2]),
    );
    expect(backfilled[0]).toMatchObject({ ci_run_id: '29279945808', branch: 'main' });
  });

  it('sends each planned report once, in plan order, at its run start, with the fixture results', async () => {
    const { client, calls } = fakeClient();
    await seedDatabase(client, plan, repoRoot);
    const payloads = ingested(calls);

    const expected = plan.runs.flatMap((run) =>
      run.reports.map((report) => ({
        project_id: IDS[run.slug],
        ci_run_id: run.ciRunId,
        run_attempt: run.runAttempt,
        commit_sha: run.commitSha,
        branch: run.branch,
        event: run.event,
        run_url: run.runUrl,
        job: report.job,
        module: report.module,
        platform: report.platform,
        started_at: run.startedAt,
      })),
    );
    expect(
      payloads.map((payload) => ({
        project_id: payload.project_id,
        ...payload.run,
        job: payload.report.job,
        module: payload.report.module,
        platform: payload.report.platform,
        started_at: payload.report.started_at,
      })),
    ).toEqual(expected);

    // Counts as the fixtures README records them for each captured file.
    const totals = new Map(
      payloads.map((payload) => [
        `${payload.report.module} ${payload.report.platform} ${payload.report.failed}`,
        [
          payload.report.total,
          payload.report.passed,
          payload.report.failed,
          payload.report.skipped,
        ],
      ]),
    );
    expect(Object.fromEntries(totals)).toEqual({
      'shared jvm 0': [82, 82, 0, 0],
      'composeApp jvm 0': [60, 60, 0, 0],
      'composeApp ios-sim 0': [50, 50, 0, 0],
      'apps/backend node 0': [498, 498, 0, 0],
      'apps/mobile node 0': [428, 428, 0, 0],
      'packages/shared node 0': [119, 119, 0, 0],
      'packages/shared node 1': [119, 118, 1, 0],
      'e2e chromium 1': [3, 1, 1, 1],
    });
  });

  it('strips the runner path from routeserve suites and the platform stamp from iOS names', async () => {
    const { client, calls } = fakeClient();
    await seedDatabase(client, plan, repoRoot);
    const payloads = ingested(calls);
    const suites = payloads.flatMap((payload) => payload.tests.map((test) => test.suite));
    expect(suites.some((suite) => suite.startsWith('/home/runner/'))).toBe(false);
    expect(suites.some((suite) => suite.startsWith('iosSimulatorArm64Test.'))).toBe(false);
  });

  it('carries the captured failure text for the public and the private failure', async () => {
    const { client, calls } = fakeClient();
    await seedDatabase(client, plan, repoRoot);
    const failures = ingested(calls).flatMap((payload) =>
      payload.tests.flatMap((test) =>
        test.failure === null ? [] : [[payload.run.ci_run_id, test.failure.message]],
      ),
    );
    const testpulseRun = plan.runs.find((run) => run.slug === 'testpulse');
    expect(failures).toContainEqual([
      testpulseRun?.ciRunId,
      'expect(received).toBe(expected) // Object.is equality',
    ]);
    const routeserveFailures = failures.filter(([id]) =>
      plan.runs.some((run) => run.slug === 'routeserve' && run.ciRunId === id),
    );
    expect(routeserveFailures).toHaveLength(4);
  });

  it('attaches coverage only where the plan names a coverage file', async () => {
    const { client, calls } = fakeClient();
    await seedDatabase(client, plan, repoRoot);
    const withCoverage = ingested(calls).filter((payload) => payload.coverage.length > 0);
    expect(withCoverage).toHaveLength(9 * 2 + 11 * 3 - 4);
    expect(withCoverage.find((payload) => payload.report.module === 'shared')?.coverage).toEqual([
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

  it('reads and parses every fixture before it writes anything', async () => {
    const { client, calls } = fakeClient();
    const broken: SeedPlan = {
      ...plan,
      runs: [
        ...plan.runs,
        {
          ...(plan.runs[0] as SeedPlan['runs'][number]),
          reports: [
            {
              job: 'android',
              module: 'shared',
              platform: 'jvm',
              results: { format: 'junit', source: 'fixtures/ostomate2/jacoco/shared.xml' },
              coverage: null,
            },
          ],
        },
      ],
    };
    await expect(seedDatabase(client, broken, repoRoot)).rejects.toThrow(
      'fixtures/ostomate2/jacoco/shared.xml',
    );
    expect(calls).toEqual([]);
  });

  it('stops at the first refused report and names it', async () => {
    const { client, calls } = fakeClient({ failIngestAt: 2 });
    // The second report in plan order: testpulse's run is the oldest, then Ostomate2's first.
    await expect(seedDatabase(client, plan, repoRoot)).rejects.toThrow(
      'ingest_report for run 36100000001 attempt 1 (android/shared/jvm): P0001 ' +
        'ingest_report: payload.report.job is empty',
    );
    expect(ingested(calls)).toHaveLength(2);
  });

  it('summarises what it wrote per project', async () => {
    const { client } = fakeClient();
    const summary = await seedDatabase(client, plan, repoRoot);
    expect(summary).toEqual({
      now: SEED_NOW,
      projects: [
        { slug: 'ostomate2', visibility: 'public', ciRuns: 9, reports: 27, backfilledRuns: 13 },
        { slug: 'routeserve', visibility: 'private', ciRuns: 11, reports: 33, backfilledRuns: 0 },
        { slug: 'testpulse', visibility: 'public', ciRuns: 1, reports: 1, backfilledRuns: 0 },
      ],
    });
    expect(describeSeed(summary)).toBe(
      [
        `Seeded local Supabase for now = ${SEED_NOW} (set TESTPULSE_FIXED_NOW to the same value).`,
        '  ostomate2 (public): 9 CI runs, 27 reports, 13 backfilled runs',
        '  routeserve (private): 11 CI runs, 33 reports, 0 backfilled runs',
        '  testpulse (public): 1 CI run, 1 report, 0 backfilled runs',
        'API keys were issued and discarded; run project:rotate-key <slug> to post by hand.',
      ].join('\n'),
    );
  });
});
