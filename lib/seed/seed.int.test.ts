import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

import { loadLanding, type Landing } from '../queries/landing.ts';
import { flakyTests } from '../stats/flaky.ts';
import { loadStatsInput } from '../stats/load.ts';
import { landingHeadline, type ProjectSummary } from '../stats/summary.ts';
import { passRateTrend } from '../stats/trends.ts';
import { timeToGreen } from '../stats/time-to-green.ts';
import { createPublicClient } from '../supabase/public.ts';
import { createSeedClient } from './local.ts';
import { planSeed, SEED_NOW, SEED_SLUGS } from './plan.ts';
import { seedDatabase } from './seed.ts';

// Spec section 16, "Seed data": the e2e database is committed fixtures sent through the real
// parsers, ingest_report and backfill_run. This file seeds local Supabase twice, once through
// seedDatabase and once through `npm run db:seed` itself, and checks what Phase 5 pages and
// stats will read.
//
// Isolation: the seed owns three real slugs (ostomate2, routeserve, testpulse) and deletes and
// re-creates only those. Every other integration file creates its own projects under random
// slugs and reads only those, so they can run alongside this one; this is the only file that
// touches the seed slugs. The landing-stats checks below live here for the same reason: they
// read the seed slugs, and in another file they would race this one's delete and re-seed.

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const NOW = new Date(SEED_NOW);
const DAY_MS = 86_400_000;
const SLUGS = [...SEED_SLUGS];
const PAGE = 1000;

type Row = Record<string, unknown>;

const failed = (what: string, error: PostgrestError): Error =>
  new Error(`${what}: ${error.code} ${error.message}`);

async function readAll(
  what: string,
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: PostgrestError | null }>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw failed(what, error);
    const batch = data as Row[];
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

const iso = (value: unknown): string => new Date(String(value)).toISOString();
const key = (...parts: unknown[]): string => parts.map(String).join(' ');
const omit = (row: Row, ...columns: string[]): Row =>
  Object.fromEntries(Object.entries(row).filter(([column]) => !columns.includes(column)));
type Keyed = Row & { key: string };
const byKey = (rows: Keyed[]): Keyed[] =>
  rows.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

/**
 * Everything the seed wrote for its projects, with generated values (row IDs, created_at and
 * the API key hash) replaced by natural keys, so two seeds can be compared row for row.
 */
async function snapshot(admin: SupabaseClient) {
  const projects = await readAll('projects', (from, to) =>
    admin.from('projects').select('*').in('slug', SLUGS).order('slug').range(from, to),
  );
  const slugOf = new Map(projects.map((row) => [row.id, row.slug]));
  const projectIds = [...slugOf.keys()];

  const runs = await readAll('runs', (from, to) =>
    admin.from('runs').select('*').in('project_id', projectIds).order('id').range(from, to),
  );
  const runKey = new Map(
    runs.map((row) => [row.id, key(slugOf.get(row.project_id), row.ci_run_id, row.run_attempt)]),
  );
  const reports = await readAll('reports', (from, to) =>
    admin
      .from('reports')
      .select('*')
      .in('run_id', [...runKey.keys()])
      .order('id')
      .range(from, to),
  );
  const reportKey = new Map(
    reports.map((row) => [row.id, key(runKey.get(row.run_id), row.job, row.module, row.platform)]),
  );
  const reportIds = [...reportKey.keys()];
  const coverage = await readAll('coverage', (from, to) =>
    admin.from('coverage').select('*').in('report_id', reportIds).order('id').range(from, to),
  );
  const tests = await readAll('tests', (from, to) =>
    admin.from('tests').select('*').in('project_id', projectIds).order('id').range(from, to),
  );
  const testKey = new Map(
    tests.map((row) => [row.id, key(slugOf.get(row.project_id), row.test_key)]),
  );
  const results = await readAll('results', (from, to) =>
    admin.from('results').select('*').in('report_id', reportIds).order('id').range(from, to),
  );
  const resultKey = new Map(
    results.map((row) => [row.id, key(reportKey.get(row.report_id), testKey.get(row.test_id))]),
  );
  const failures = await readAll('result_failures', (from, to) =>
    admin
      .from('result_failures')
      .select('result_id, message, detail, results!inner(report_id)')
      .in('results.report_id', reportIds)
      .order('id')
      .range(from, to),
  );
  const alerts = await readAll('alerts', (from, to) =>
    admin.from('alerts').select('*').in('project_id', projectIds).order('id').range(from, to),
  );

  // Timestamps are normalised because PostgREST prints them with an offset, not as JSON dates.
  const times = (row: Row, ...columns: string[]): Row =>
    Object.fromEntries(columns.map((column) => [column, iso(row[column])]));

  return {
    projects: projects.map((row) => omit(row, 'id', 'created_at', 'api_key_hash')),
    runs: byKey(
      runs.map((row) => ({
        ...omit(row, 'id', 'project_id', 'created_at'),
        ...times(row, 'started_at', 'finished_at'),
        key: String(runKey.get(row.id)),
      })),
    ),
    reports: byKey(
      reports.map((row) => ({
        ...omit(row, 'id', 'run_id', 'created_at'),
        ...times(row, 'started_at', 'finished_at'),
        key: String(reportKey.get(row.id)),
      })),
    ),
    coverage: byKey(
      coverage.map((row) => ({
        ...omit(row, 'id', 'report_id', 'created_at'),
        key: key(reportKey.get(row.report_id), row.format),
      })),
    ),
    tests: byKey(
      tests.map((row) => ({
        ...omit(row, 'id', 'project_id', 'created_at'),
        ...times(row, 'first_seen_at', 'last_seen_at'),
        key: String(testKey.get(row.id)),
      })),
    ),
    results: byKey(
      results.map((row) => ({
        ...omit(row, 'id', 'report_id', 'test_id', 'created_at'),
        key: String(resultKey.get(row.id)),
      })),
    ),
    failures: byKey(
      failures.map((row) => ({
        key: String(resultKey.get(row.result_id)),
        message: row.message,
        detail: row.detail,
      })),
    ),
    alerts: alerts.map((row) => ({
      ...omit(row, 'id', 'project_id', 'created_at'),
      slug: slugOf.get(row.project_id),
    })),
  };
}

type Snapshot = Awaited<ReturnType<typeof snapshot>>;

describe('the e2e seed against local Supabase (spec section 16)', () => {
  const admin = createSeedClient(process.env);
  const anon = createPublicClient();
  let first: Snapshot;
  let second: Snapshot;
  let script: { status: number | null; stdout: string; stderr: string };

  const runsOf = (slug: string, source?: string) =>
    second.runs.filter(
      (run) => run.key.startsWith(`${slug} `) && (source === undefined || run.source === source),
    );

  const runIdsOf = async (slug: string): Promise<string[]> => {
    const { data, error } = await admin
      .from('runs')
      .select('id, projects!inner(slug)')
      .eq('projects.slug', slug);
    if (error) throw failed(`runs of ${slug}`, error);
    return data.map((row) => String(row.id));
  };

  // Scoped to the seed's own runs: other integration files ingest failures in parallel.
  const anonFailures = async (runIds: readonly string[]): Promise<Row[]> => {
    expect(runIds.length).toBeGreaterThan(0);
    const { data, error } = await anon
      .from('result_failures')
      .select('message, results!inner(reports!inner(run_id))')
      .in('results.reports.run_id', [...runIds]);
    if (error) throw failed('anon result_failures', error);
    return data as Row[];
  };

  beforeAll(async () => {
    await seedDatabase(admin, planSeed(NOW), repoRoot);
    first = await snapshot(admin);

    const result = spawnSync(process.execPath, ['scripts/seed.ts'], {
      cwd: repoRoot,
      env: process.env,
      encoding: 'utf8',
    });
    script = { status: result.status, stdout: result.stdout, stderr: result.stderr };
    second = await snapshot(admin);
  }, 180_000);

  it('runs as npm run db:seed, prints a summary and never an API key', () => {
    expect(script.status, script.stderr).toBe(0);
    expect(script.stdout).toContain(`Seeded local Supabase for now = ${SEED_NOW}`);
    expect(script.stdout).not.toMatch(/tp_[A-Za-z0-9_-]{43}/);
    expect(script.stderr).toBe('');
  });

  it('writes identical data every time: only row IDs, created_at and key hashes differ', () => {
    expect(second).toEqual(first);
    // Not two empty snapshots: 9 x 192 + 11 x 1045 + 3 results, 4 private and 1 public failure.
    expect(second.results).toHaveLength(13_226);
    expect(second.failures).toHaveLength(5);
    expect(second.tests.length).toBeGreaterThan(1_000);
  });

  it('registers the three projects, as anon sees them', async () => {
    const { data, error } = await anon
      .from('projects_public')
      .select('slug, visibility, repo_url')
      .in('slug', SLUGS)
      .order('slug');
    if (error) throw failed('projects_public', error);
    expect(data).toEqual([
      { slug: 'ostomate2', visibility: 'public', repo_url: 'https://github.com/bhelco1/Ostomate2' },
      { slug: 'routeserve', visibility: 'private', repo_url: null },
      { slug: 'testpulse', visibility: 'public', repo_url: 'https://github.com/bhelco1/testpulse' },
    ]);
    expect(second.projects.map((project) => project.declared_suites)).toEqual([
      expect.arrayContaining([expect.objectContaining({ status: 'runs_in_ci_not_reported' })]),
      expect.arrayContaining([expect.objectContaining({ status: 'authored_not_executed' })]),
      [],
    ]);
  });

  it('stores the planned runs per project and source, with their statuses', () => {
    const statuses = (slug: string, source: string) =>
      runsOf(slug, source).reduce<Record<string, number>>((counts, run) => {
        const status = String(run.status);
        counts[status] = (counts[status] ?? 0) + 1;
        return counts;
      }, {});
    expect(statuses('ostomate2', 'ci')).toEqual({ passed: 9 });
    expect(statuses('ostomate2', 'backfill')).toEqual({ passed: 13 });
    expect(statuses('routeserve', 'ci')).toEqual({ passed: 7, failed: 4 });
    expect(statuses('routeserve', 'backfill')).toEqual({});
    expect(statuses('testpulse', 'ci')).toEqual({ failed: 1 });
    expect(second.alerts).toEqual([]);
  });

  it('counts each Ostomate2 test once across the JVM and the iOS simulator', () => {
    const ostomate2Tests = second.tests.filter((test) => test.key.startsWith('ostomate2 '));
    expect(ostomate2Tests).toHaveLength(142);
    const run = runsOf('ostomate2', 'ci').at(-1);
    expect(run).toMatchObject({ total: 192, passed: 192, failed: 0 });
  });

  it('shows anon the failure text of the public project', async () => {
    const testpulse = second.projects.find((project) => project.slug === 'testpulse');
    expect(testpulse?.visibility).toBe('public');
    const data = await anonFailures(await runIdsOf('testpulse'));
    expect(data.map((row) => row.message)).toEqual([
      'expect(received).toBe(expected) // Object.is equality',
    ]);
  });

  it('hides the private project failure text from anon while it exists', async () => {
    const routeserveFailures = second.failures.filter((row) => row.key.startsWith('routeserve '));
    expect(routeserveFailures).toHaveLength(4);
    expect(await anonFailures(await runIdsOf('routeserve'))).toEqual([]);
  });

  it('imports the Ostomate2 history as backfill runs with percentage coverage', () => {
    const backfilled = runsOf('ostomate2', 'backfill');
    expect(backfilled).toHaveLength(13);
    expect(backfilled.every((run) => run.duration_ms === 0 && run.branch === 'main')).toBe(true);
    const keys = new Set(backfilled.map((run) => run.key));
    const pct = second.coverage.filter((row) =>
      [...keys].some((runKey) => row.key.startsWith(`${runKey} `)),
    );
    expect(pct).toHaveLength(26);
    expect(pct.every((row) => row.lines_pct !== null && row.lines_covered === null)).toBe(true);
  });

  it('stores count-form coverage from JaCoCo and istanbul on CI runs', () => {
    const counts = second.coverage.filter((row) => row.lines_covered !== null);
    const formats = counts.reduce<Record<string, number>>((tally, row) => {
      const format = String(row.format);
      tally[format] = (tally[format] ?? 0) + 1;
      return tally;
    }, {});
    expect(formats).toEqual({ jacoco: 18, istanbul: 29 });
  });

  it('places every run inside the 90 days before now, CI runs in the last 30', () => {
    for (const run of second.runs) {
      const finished = Date.parse(String(run.finished_at));
      expect(finished, run.key).toBeLessThanOrEqual(NOW.getTime());
      expect(finished, run.key).toBeGreaterThan(NOW.getTime() - 90 * DAY_MS);
      if (run.source === 'ci') {
        expect(finished, run.key).toBeGreaterThan(NOW.getTime() - 30 * DAY_MS);
      }
    }
  });

  it('leaves testpulse stale and the reporting projects fresh at now', () => {
    const lastFinish = (slug: string) =>
      Math.max(...runsOf(slug).map((run) => Date.parse(String(run.finished_at))));
    const cadence = (slug: string) =>
      Number(second.projects.find((project) => project.slug === slug)?.expected_cadence_days);
    expect(NOW.getTime() - lastFinish('testpulse')).toBeGreaterThan(cadence('testpulse') * DAY_MS);
    expect(NOW.getTime() - lastFinish('ostomate2')).toBeLessThan(DAY_MS);
    expect(NOW.getTime() - lastFinish('routeserve')).toBeLessThan(DAY_MS);
  });

  it('gives the section 11 stats something to find, read as anon at now', async () => {
    const routeserve = await loadStatsInput(anon, 'routeserve', NOW);
    const options = { defaultBranch: routeserve.defaultBranch, now: NOW };
    const green = timeToGreen(routeserve.runs, options);
    expect(green.recoveries).toHaveLength(3);
    expect(green.stillRed).not.toBeNull();
    const flaky = flakyTests(routeserve.runs, routeserve.results, options);
    expect(flaky.flakyTestIds).toHaveLength(1);
    // Distinct tests, not executions: apps/mobile's capture runs one test name five times, so
    // its 428 executions are 424 tests (498 + 424 + 119).
    expect(flaky.totalTests).toBe(1041);

    const ostomate2 = await loadStatsInput(anon, 'ostomate2', NOW);
    const passRate = passRateTrend(ostomate2.runs, {
      defaultBranch: ostomate2.defaultBranch,
      now: NOW,
      days: 90,
    });
    expect(passRate.runs.filter((point) => point.source === 'backfill')).toHaveLength(13);
    expect(passRate.runs.filter((point) => point.source === 'ci')).toHaveLength(8);
  });

  describe('landing headline and project cards at SEED_NOW, read as anon (spec sections 11, 13)', () => {
    const MINUTE = 60_000;
    let landing: Landing;
    let seeded: ProjectSummary[];
    const card = (slug: string): ProjectSummary => {
      const found = seeded.find((summary) => summary.project.slug === slug);
      if (found === undefined) throw new Error(`no summary for ${slug}`);
      return found;
    };

    beforeAll(async () => {
      landing = await loadLanding(anon, NOW);
      // Other integration files add projects under random slugs while this runs, so the
      // headline is recomputed over the seed's three alone; landing.headline is the same
      // function over every project.
      seeded = landing.projects.filter((summary) =>
        (SLUGS as readonly string[]).includes(summary.project.slug),
      );
    });

    it('loads the three seed projects in dashboard order', () => {
      expect(seeded.map((summary) => summary.project.slug)).toEqual(SLUGS);
    });

    it('takes each latest run from the default branch and CI, with its pass rate', () => {
      // Ostomate2 2026-10-05 09:26 push: 192 / (192 + 0) = 1.
      expect(card('ostomate2').latestRun).toMatchObject({
        status: 'passed',
        finishedAt: new Date('2026-10-05T09:26:17.747Z'),
        branch: 'main',
        passed: 192,
        failed: 0,
        skipped: 0,
        passRate: 1,
      });
      // routeserve 2026-10-05 08:12 push with the shared failure: 1044 / (1044 + 1).
      expect(card('routeserve').latestRun).toMatchObject({
        status: 'failed',
        finishedAt: new Date('2026-10-05T08:13:55.412Z'),
        passed: 1044,
        failed: 1,
        skipped: 0,
        passRate: 1044 / 1045,
      });
      // testpulse's one run: 1 passed, 1 failed, 1 skipped; 1 / (1 + 1) = 0.5.
      expect(card('testpulse').latestRun).toMatchObject({
        status: 'failed',
        passed: 1,
        failed: 1,
        skipped: 1,
        passRate: 0.5,
      });
    });

    it('shows a private project its counts, with the commit cut to 7 characters by runs_public', () => {
      expect(card('routeserve').project.visibility).toBe('private');
      expect(card('routeserve').latestRun?.commitSha).toMatch(/^[0-9a-f]{7}$/);
      expect(card('ostomate2').latestRun?.commitSha).toMatch(/^[0-9a-f]{40}$/);
    });

    it('counts distinct tests per layer in the latest run, declared suites excluded', () => {
      // Ostomate2: 82 shared + 60 composeApp on the JVM; the 50 iOS executions are composeApp
      // tests already counted. 103 unit + 29 integration + 10 visual = 142. The 7 + 5 declared
      // Maestro flows are not added.
      expect(card('ostomate2')).toMatchObject({
        totalTests: 142,
        layers: { unit: 103, integration: 29, visual: 10 },
      });
      expect(card('ostomate2').project.declaredSuites.map((suite) => suite.count)).toEqual([7, 5]);
      // routeserve: 1045 executions, 1041 tests (apps/mobile runs one name five times).
      // 607 unit + 165 component + 269 api = 1041; the 13 declared flows are not added.
      expect(card('routeserve')).toMatchObject({
        totalTests: 1041,
        layers: { unit: 607, component: 165, api: 269 },
      });
      // testpulse: 3 Playwright tests, the skipped one included.
      expect(card('testpulse')).toMatchObject({ totalTests: 3, layers: { e2e: 3 } });
    });

    it('takes each module’s latest coverage, walking back past a report that had none', () => {
      expect(card('ostomate2').coverage).toEqual([
        // 497 / 527 = 94.307...% against 93; 457 / 490 = 93.265...% against 91.
        expect.objectContaining({ module: 'composeApp', pct: (497 / 527) * 100, floor: 93 }),
        expect.objectContaining({ module: 'shared', pct: (457 / 490) * 100, floor: 91 }),
      ]);
      // The latest routeserve run posted packages/shared without coverage, so its 102 / 102
      // comes from the 2026-10-04 run.
      const routeserve = card('routeserve').coverage;
      expect(routeserve).toEqual([
        expect.objectContaining({ module: 'apps/backend', pct: (1862 / 1968) * 100, floor: 80 }),
        expect.objectContaining({ module: 'apps/mobile', pct: (1496 / 1551) * 100, floor: 80 }),
        expect.objectContaining({ module: 'packages/shared', pct: 100, floor: 80 }),
      ]);
      expect(routeserve[2]?.runId).not.toBe(card('routeserve').latestRun?.id);
      expect(seeded.flatMap((summary) => summary.coverage).some((c) => c.belowFloor)).toBe(false);
      expect(card('testpulse').coverage).toEqual([]);
    });

    it('counts green streaks, runs in 30 days and time to green on default-branch CI runs', () => {
      // Ostomate2: 8 main runs, all passed (the ninth is a pull request).
      expect(card('ostomate2')).toMatchObject({
        greenStreak: { current: 8, longest: 8 },
        runsInLast30Days: 8,
        timeToGreen: { medianMs: null, stillRed: null },
      });
      // routeserve main: P | F P P | F(1) P(2) | F P P | F. Longest 2, current 0. 10 main runs.
      // Recoveries, finish to finish (every run lasts 1 min 55.412 s): 15:30 to 16:14 = 44 min,
      // 13:05 to 13:31 = 26 min, 09:55 to 14:02 = 4 h 7 min. Median 44 min, worst 247 min.
      // Red since 08:13:55.412 today: 3 h 46 min 4.588 s at 12:00.
      expect(card('routeserve')).toMatchObject({
        greenStreak: { current: 0, longest: 2 },
        runsInLast30Days: 10,
        timeToGreen: {
          medianMs: 44 * MINUTE,
          worstMs: 247 * MINUTE,
          stillRed: { elapsedMs: 226 * MINUTE + 4_588 },
        },
      });
      expect(card('routeserve').timeToGreen.recoveries.map((r) => r.elapsedMs)).toEqual([
        44 * MINUTE,
        26 * MINUTE,
        247 * MINUTE,
      ]);
      // testpulse: one failed run, never green, and no passed run before it to turn red from.
      expect(card('testpulse')).toMatchObject({
        greenStreak: { current: 0, longest: 0 },
        runsInLast30Days: 1,
        timeToGreen: { recoveries: [], stillRed: null },
      });
    });

    it('derives health from public data: testpulse stale 13 days, the others healthy', () => {
      // 2026-09-22T04:37:00.242Z to 2026-10-05T12:00Z is 13 days 7 h 23 min: 13 > 8.
      expect(card('testpulse').health).toEqual({
        daysSinceLastReport: 13,
        problems: ['stale'],
        marker: { health: 'stale', days: 13 },
      });
      for (const slug of ['ostomate2', 'routeserve']) {
        expect(card(slug).health, slug).toEqual({
          daysSinceLastReport: 0,
          problems: [],
          marker: { health: 'healthy' },
        });
      }
    });

    it('combines the three into the headline tiles', () => {
      expect(landingHeadline(seeded)).toEqual({
        // 142 + 1041 + 3.
        totalTests: 1186,
        // (192 + 1044 + 1) / (192 + 1044 + 1 + 0 + 1 + 1) = 1237 / 1239; skipped 0 + 0 + 1.
        passRate: {
          passed: 1237,
          failed: 2,
          skipped: 1,
          rate: 1237 / 1239,
          counted: ['ostomate2', 'routeserve', 'testpulse'],
        },
        emptyLatestRuns: [],
        projectsReporting: {
          reporting: 2,
          registered: 3,
          silent: [{ slug: 'testpulse', days: 13 }],
          notReporting: [],
        },
        // 8 + 10 + 1.
        runsInLast30Days: {
          total: 19,
          byProject: [
            { slug: 'ostomate2', runs: 8 },
            { slug: 'routeserve', runs: 10 },
            { slug: 'testpulse', runs: 1 },
          ],
        },
        // Only routeserve recovered: 26, 44, 247 min; median 44 min.
        medianTimeToGreenMs: 44 * MINUTE,
        greenStreaks: [
          { slug: 'ostomate2', current: 8 },
          { slug: 'routeserve', current: 0 },
          { slug: 'testpulse', current: 0 },
        ],
      });
    });
  });
});
