import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

import { testKey } from '../ingest/normalize.ts';
import { loadLanding, type Landing, type LandingProject } from '../queries/landing.ts';
import { landingView } from '../pages/landing.ts';
import { loadProjectPage, type ProjectPage } from '../queries/project.ts';
import { loadRunDetail } from '../queries/run.ts';
import { loadTestHistory } from '../queries/test-history.ts';
import { projectsPassingTile } from '../copy/projects-passing.ts';
import { flakyTests } from '../stats/flaky.ts';
import { loadStatsInput } from '../stats/load.ts';
import { landingHeadline } from '../stats/summary.ts';
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
    let seeded: LandingProject[];
    const card = (slug: string): LandingProject => {
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

    it('takes each latest run from the default branch and CI, with its pass rate in distinct tests', () => {
      // Ostomate2 2026-10-05 09:26 push: 192 executions, all passed, of 142 tests (the 50 iOS
      // executions are composeApp tests also run on the JVM). 142 / (142 + 0) = 1.
      expect(card('ostomate2').latestRun).toMatchObject({
        status: 'passed',
        finishedAt: new Date('2026-10-05T09:26:17.747Z'),
        branch: 'main',
        passed: 142,
        failed: 0,
        skipped: 0,
        passRate: 1,
      });
      // routeserve 2026-10-05 08:12 push with the shared failure: 1045 executions of 1041 tests
      // (backend 498, mobile 428 executions of 424 tests, one name run five times and passing
      // each time, shared-one-failure 118 passed + 1 failed). 1040 / (1040 + 1).
      expect(card('routeserve').latestRun).toMatchObject({
        status: 'failed',
        finishedAt: new Date('2026-10-05T08:13:55.412Z'),
        passed: 1040,
        failed: 1,
        skipped: 0,
        passRate: 1040 / 1041,
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

    it('gives each card its own green streaks, runs in 30 days and time to green', () => {
      // Ostomate2: 8 main runs, all passed (the ninth is a pull request). Never red, so no
      // recoveries: median and worst are null, not 0.
      expect(card('ostomate2')).toMatchObject({
        greenStreak: { current: 8, longest: 8 },
        runsInLast30Days: 8,
        timeToGreen: { recoveries: [], medianMs: null, worstMs: null, stillRed: null },
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
      // testpulse: one failed run, never green. No passed run before it to turn red from, so
      // no recoveries: median and worst are null. It has never passed, so it is red from that
      // run (decision 2026-09-28): 2026-09-22T04:37:00.242Z to 2026-10-05T12:00Z is 13 days,
      // 7 h, 22 min and 59.758 s.
      expect(card('testpulse')).toMatchObject({
        greenStreak: { current: 0, longest: 0 },
        runsInLast30Days: 1,
        timeToGreen: {
          recoveries: [],
          medianMs: null,
          worstMs: null,
          stillRed: {
            failedAt: new Date('2026-09-22T04:37:00.242Z'),
            elapsedMs: 13 * DAY_MS + 7 * 60 * MINUTE + 22 * MINUTE + 59_758,
          },
        },
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

    it('combines the three into the headline tiles, with no time to green or green streak', () => {
      expect(landingHeadline(seeded)).toEqual({
        // 142 + 1041 + 3.
        totalTests: 1186,
        // Distinct tests: (142 + 1040 + 1) / (142 + 1040 + 1 + 0 + 1 + 1) = 1183 / 1185;
        // skipped 0 + 0 + 1. Passed, failed and skipped add up to the 1186 total.
        passRate: {
          passed: 1183,
          failed: 2,
          skipped: 1,
          rate: 1183 / 1185,
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
        // All three have a CI run on main; only Ostomate2's latest passed. testpulse has been
        // red 13 d 7 h (never passed), routeserve 3 h 46 min: longest first.
        projectsPassing: {
          passing: 1,
          withRun: 3,
          red: [
            {
              slug: 'testpulse',
              name: 'testpulse',
              elapsedMs: 13 * DAY_MS + 7 * 60 * MINUTE + 22 * MINUTE + 59_758,
            },
            { slug: 'routeserve', name: 'RouteServe', elapsedMs: 226 * MINUTE + 4_588 },
          ],
          lastRunEmpty: [],
        },
      });
      expect(projectsPassingTile(landingHeadline(seeded).projectsPassing)).toEqual({
        label: 'Projects passing',
        value: '1 of 3',
        sub: 'Red: testpulse 13d 7h · RouteServe 3h 46m',
        fail: true,
      });
    });
    it('gives each card its latest run’s reports, failing tests and duration', () => {
      expect(card('ostomate2').latestRunDetail).toMatchObject({
        reports: [
          { job: 'android', module: 'composeApp', platform: 'jvm', total: 60 },
          { job: 'android', module: 'shared', platform: 'jvm', total: 82 },
          { job: 'ios', module: 'composeApp', platform: 'ios-sim', total: 50 },
        ],
        failing: [],
        // The three JUnit files' testsuite times: 17,746 + 17,747 + 111.
        durationMs: 35_604,
      });
      // A private project's failing test is named on its card (section 9: names are public).
      expect(card('routeserve').latestRunDetail).toMatchObject({
        reports: [
          { module: 'apps/backend', total: 498 },
          { module: 'apps/mobile', total: 428 },
          { module: 'packages/shared', total: 119 },
        ],
        failing: [
          {
            suite: 'packages/shared/src/schemas/asset.test.ts',
            name: 'assetCreateSchema accepts a minimal valid asset',
            platform: 'node',
            status: 'failed',
          },
        ],
        durationMs: 115_412 + 68_719 + 19_989,
      });
      expect(card('testpulse').latestRunDetail?.failing).toHaveLength(1);
    });

    // Every other integration file dates its runs before 2026-10-04 or after SEED_NOW, so the
    // three newest default-branch CI runs at SEED_NOW are the seed's.
    it('feeds the 3 newest default-branch CI runs across projects, in distinct tests', () => {
      expect(
        landing.recentRuns.map((run) => ({
          slug: run.project.slug,
          title: run.title,
          status: run.status,
          finishedAt: run.finishedAt,
          reports: run.reports,
          tests: run.tests,
        })),
      ).toEqual([
        {
          slug: 'ostomate2',
          title: 'Push to main',
          status: 'passed',
          finishedAt: new Date('2026-10-05T09:26:17.747Z'),
          reports: 3,
          tests: { total: 142, passed: 142, failed: 0, skipped: 0 },
        },
        {
          slug: 'routeserve',
          title: 'Push to main',
          status: 'failed',
          finishedAt: new Date('2026-10-05T08:13:55.412Z'),
          reports: 3,
          tests: { total: 1041, passed: 1040, failed: 1, skipped: 0 },
        },
        {
          // The 2026-10-04 06:43 scheduled run: green, every report of the green fixtures.
          slug: 'routeserve',
          title: 'Scheduled run',
          status: 'passed',
          finishedAt: new Date('2026-10-04T06:44:55.412Z'),
          reports: 3,
          tests: { total: 1041, passed: 1041, failed: 0, skipped: 0 },
        },
      ]);
      // runs_public cuts a private project's SHA to 7 characters.
      expect(landing.recentRuns.map((run) => run.commitSha.length)).toEqual([40, 7, 7]);
    });

    it('maps to the landing page’s tiles as the seed’s hand-computed values read', () => {
      const view = landingView(
        { projects: seeded, headline: landingHeadline(seeded), recentRuns: landing.recentRuns },
        NOW,
      );
      expect(view.heroTotal).toBe('1,186');
      expect(view.tiles).toEqual([
        // 1,183 / 1,185 = 99.83%, rounded down.
        { label: 'Pass rate', value: '99.8%', sub: '1,183 of 1,185 · 1 skipped, excluded' },
        {
          label: 'Projects reporting',
          value: '2 of 3',
          attention: { icon: 'stale', text: 'testpulse silent 13 days' },
        },
        {
          label: 'Runs in last 30 days',
          value: '19',
          sub: 'Ostomate 2.0 8 · RouteServe 10 · testpulse 1',
        },
        {
          label: 'Projects passing',
          value: '1 of 3',
          sub: 'Red: testpulse 13d 7h · RouteServe 3h 46m',
          fail: true,
        },
      ]);
    });
  });

  describe('project, run and test pages at SEED_NOW, read as anon (spec sections 9, 11, 13)', () => {
    const ROUTESERVE_TEST = {
      module: 'packages/shared',
      suite: 'packages/shared/src/schemas/asset.test.ts',
      name: 'assetCreateSchema accepts a minimal valid asset',
    };
    const OSTOMATE2_TEST = {
      module: 'composeApp',
      suite: 'com.ostomate.app.ui.calendar.CalendarViewModelTest',
      name: 'addEventForDateLogsAtNoon',
    };
    // Every seeded CI run of a project reports the same fixtures, so every run's duration is the
    // sum of the same report durations, each what its file records: a JUnit report is the sum
    // of its testsuite time attributes, a Jest report the sum of endTime - startTime per file.
    const OSTOMATE2_RUN_MS = 17_746 + 17_747 + 111; // composeApp jvm, shared jvm, ios-sim
    const ROUTESERVE_GREEN_MS = 115_412 + 68_719 + 22_604; // backend, mobile, shared
    const ROUTESERVE_RED_MS = 115_412 + 68_719 + 19_989; // shared-one-failure.json
    let ostomate2: ProjectPage;
    let routeserve: ProjectPage;

    const load = async (slug: string, options = {}): Promise<ProjectPage> => {
      const page = await loadProjectPage(slug, options, anon, NOW);
      if (page === null) throw new Error(`no project page for ${slug}`);
      return page;
    };

    beforeAll(async () => {
      ostomate2 = await load('ostomate2');
      routeserve = await load('routeserve');
    });

    it('finds no page for a slug that is not registered', async () => {
      expect(await loadProjectPage('not-a-project', {}, anon, NOW)).toBeNull();
    });

    it('carries each project’s own fields, a private one without its repository link', () => {
      expect(ostomate2.project).toMatchObject({
        visibility: 'public',
        repoUrl: 'https://github.com/bhelco1/Ostomate2',
      });
      expect(ostomate2.project.devStack.map((group) => group.category)).toEqual([
        'Mobile',
        'Platforms',
        'Services',
        'Delivery',
      ]);
      expect(ostomate2.project.testStack.map((group) => group.category)).toEqual([
        'Runners',
        'Property',
        'Visual',
        'Coverage',
        'E2E',
      ]);
      expect(
        ostomate2.project.declaredSuites.map((suite) => [suite.name, suite.count, suite.status]),
      ).toEqual([
        ['Maestro E2E (Android)', 7, 'runs_in_ci_not_reported'],
        ['Maestro E2E (iOS)', 5, 'runs_in_ci_not_reported'],
      ]);
      expect(routeserve.project).toMatchObject({ visibility: 'private', repoUrl: null });
    });

    it('summarises the latest run as the landing card does', () => {
      // The same numbers as the landing checks above: 142 tests (103 + 29 + 10), 8 and 8.
      expect(ostomate2.summary).toMatchObject({
        totalTests: 142,
        layers: { unit: 103, integration: 29, visual: 10 },
        greenStreak: { current: 8, longest: 8 },
        health: { marker: { health: 'healthy' } },
      });
      expect(routeserve.summary).toMatchObject({
        totalTests: 1041,
        latestRun: { status: 'failed' },
        greenStreak: { current: 0, longest: 2 },
        timeToGreen: { medianMs: 44 * 60_000, worstMs: 247 * 60_000 },
      });
    });

    it('lists the latest run’s reports and its failing test', () => {
      expect(
        ostomate2.latestRun?.reports.map((r) => [
          r.job,
          r.module,
          r.platform,
          r.total,
          r.durationMs,
        ]),
      ).toEqual([
        ['android', 'composeApp', 'jvm', 60, 17_746],
        ['android', 'shared', 'jvm', 82, 17_747],
        ['ios', 'composeApp', 'ios-sim', 50, 111],
      ]);
      expect(ostomate2.latestRun?.failing).toEqual([]);
      expect(routeserve.latestRun?.reports.map((r) => [r.module, r.total, r.durationMs])).toEqual([
        ['apps/backend', 498, 115_412],
        ['apps/mobile', 428, 68_719],
        ['packages/shared', 119, 19_989],
      ]);
      expect(routeserve.latestRun?.failing).toEqual([
        {
          testKey: testKey(ROUTESERVE_TEST.module, ROUTESERVE_TEST.suite, ROUTESERVE_TEST.name),
          suite: ROUTESERVE_TEST.suite,
          name: ROUTESERVE_TEST.name,
          platform: 'node',
          status: 'failed',
        },
      ]);
    });

    it('trends Ostomate2 over CI and imported history, and duration and test count over CI', () => {
      // 30 days from 2026-09-06: 6 imported runs (3 on 09-21, 3 on 09-22) and 8 CI runs on main.
      const month = ostomate2.trends[30];
      expect(month.passRate.runs.map((point) => point.source)).toEqual([
        ...Array<string>(6).fill('backfill'),
        ...Array<string>(8).fill('ci'),
      ]);
      // 6 x 142 + 8 x 192 = 852 + 1536 = 2388 passed, none failed.
      expect(month.windowPassRate).toEqual({
        runs: 14,
        passed: 2388,
        failed: 0,
        skipped: 0,
        passRate: 1,
      });
      expect(month.runCount.filter((day) => day.runs > 0)).toEqual([
        { day: '2026-09-21', runs: 3 },
        { day: '2026-09-22', runs: 3 },
        { day: '2026-09-24', runs: 1 },
        { day: '2026-09-25', runs: 1 },
        { day: '2026-09-27', runs: 1 },
        { day: '2026-09-29', runs: 1 },
        { day: '2026-10-01', runs: 1 },
        { day: '2026-10-02', runs: 1 },
        { day: '2026-10-04', runs: 1 },
        { day: '2026-10-05', runs: 1 },
      ]);
      expect(month.coverage.map(({ module, points }) => [module, points.length])).toEqual([
        ['composeApp', 14],
        ['shared', 14],
      ]);
      expect(month.coverage[1]?.points.at(-1)?.linesPct).toBe((457 / 490) * 100);
      // The imported runs have no durations and no per-test rows: 8 CI points each.
      expect(month.duration.map((point) => point.durationMs)).toEqual(
        Array<number>(8).fill(OSTOMATE2_RUN_MS),
      );
      expect(month.testCount.map((point) => point.totalTests)).toEqual(Array<number>(8).fill(142));

      // 90 days from 2026-07-08 hold all 13 imported runs: 126 + 3 x 129 + 3 x 139 + 6 x 142
      // = 1782 passed, and 1536 from CI.
      expect(ostomate2.trends[90].windowPassRate).toMatchObject({ runs: 21, passed: 3318 });
    });

    it('trends routeserve over its ten CI runs on main, red four times', () => {
      const month = routeserve.trends[30];
      // P F P P F P(attempt 2) F P P F, each run 1 min 55 s of reports summed.
      const [G, R] = [ROUTESERVE_GREEN_MS, ROUTESERVE_RED_MS];
      expect(month.duration.map((point) => point.durationMs)).toEqual([
        G,
        R,
        G,
        G,
        R,
        G,
        R,
        G,
        G,
        R,
      ]);
      expect(month.duration.filter((point) => point.status === 'failed')).toHaveLength(4);
      // 1041 tests every run: 498 + 424 + 119, apps/mobile running one name five times.
      expect(month.testCount.map((point) => point.totalTests)).toEqual(
        Array<number>(10).fill(1041),
      );
      // 6 x 1045 + 4 x 1044 = 10446 passed, 4 failed.
      expect(month.windowPassRate).toEqual({
        runs: 10,
        passed: 10_446,
        failed: 4,
        skipped: 0,
        passRate: 10_446 / 10_450,
      });
    });

    it('lists routeserve’s one flaky test, which failed and passed on one commit', () => {
      expect(routeserve.flaky).toEqual({
        tests: [
          {
            testKey: testKey(ROUTESERVE_TEST.module, ROUTESERVE_TEST.suite, ROUTESERVE_TEST.name),
            ...ROUTESERVE_TEST,
            layer: 'unit',
            platforms: ['node'],
          },
        ],
        totalTests: 1041,
        flakeRate: 1 / 1041,
      });
      expect(ostomate2.flaky).toEqual({ tests: [], totalTests: 142, flakeRate: 0 });
    });

    it('lists CI runs newest first, the default branch unless asked for all', async () => {
      expect(ostomate2.runs.hasMore).toBe(false);
      expect(ostomate2.runs.items.map((run) => run.title)).toEqual([
        'Push to main',
        'Scheduled run',
        'Push to main',
        'Manual run',
        'Push to main',
        'Scheduled run',
        'Push to main',
        'Push to main',
      ]);
      expect(ostomate2.runs.items[0]).toMatchObject({
        total: 192,
        durationMs: OSTOMATE2_RUN_MS,
        reports: 3,
        runUrl: 'https://github.com/bhelco1/Ostomate2/actions/runs/36100000009',
      });
      // Each row counts distinct tests (decision 2026-09-29): 192 executions are 142 tests.
      expect(ostomate2.runs.items.map((run) => run.tests)).toEqual(
        Array(8).fill({ total: 142, passed: 142, failed: 0, skipped: 0 }),
      );
      const all = await load('ostomate2', { branches: 'all' });
      expect(all.runs.items).toHaveLength(9);
      expect(all.runs.items[5]?.title).toBe('Pull request from seed/pull-request');
      // The pull request run is not a default-branch run, so its results are read for the list.
      expect(all.runs.items[5]?.tests).toEqual({ total: 142, passed: 142, failed: 0, skipped: 0 });

      // routeserve: 10 runs on main fit the first 10; all 11 do not.
      expect(routeserve.runs).toMatchObject({ branches: 'default', hasMore: false });
      expect(routeserve.runs.items).toHaveLength(10);
      expect((await load('routeserve', { branches: 'all' })).runs).toMatchObject({
        hasMore: true,
      });
      expect(routeserve.runs.items[0]).toMatchObject({ status: 'failed', runUrl: null });
      // 1044 of 1045 executions passed, but distinct tests are 1040 of 1041 (apps/mobile runs one
      // name five times), as the latest-run card reads.
      expect(routeserve.runs.items[0]).toMatchObject({ passed: 1044, failed: 1, total: 1045 });
      expect(routeserve.runs.items[0]?.tests).toEqual({
        total: 1041,
        passed: 1040,
        failed: 1,
        skipped: 0,
      });
    });

    it('loads a public run with its per-test rows on both platforms', async () => {
      const runId = ostomate2.summary.latestRun?.id ?? '';
      const detail = await loadRunDetail('ostomate2', runId, anon, NOW);
      expect(detail?.run).toMatchObject({
        title: 'Push to main',
        status: 'passed',
        total: 192,
        durationMs: OSTOMATE2_RUN_MS,
        reports: 3,
        resultsPrunedAt: null,
      });
      expect(detail?.run.commitSha).toMatch(/^[0-9a-f]{40}$/);
      // 192 executions are 142 tests; the 50 composeApp tests on the simulator also ran on the
      // JVM, and passed on both, so no row has a mismatch.
      expect(detail?.results).toHaveLength(142);
      const platformCounts = (detail?.results ?? []).map((row) => row.platforms.length);
      expect(platformCounts.filter((count) => count === 2)).toHaveLength(50);
      expect(
        detail?.results?.every((row) => row.status === 'passed' && row.mismatch === null),
      ).toBe(true);
      // A run of another project is not this project's.
      expect(await loadRunDetail('routeserve', runId, anon, NOW)).toBeNull();
    });

    it('shows a public project’s failure text, which RLS allows', async () => {
      const [testpulseRun] = await runIdsOf('testpulse');
      const detail = await loadRunDetail('testpulse', testpulseRun ?? '', anon, NOW);
      expect(detail?.results?.map((row) => row.status)).toEqual(['failed', 'passed', 'skipped']);
      expect(detail?.results?.[0]?.platforms[0]?.failures[0]?.message).toBe(
        'expect(received).toBe(expected) // Object.is equality',
      );
    });

    it('loads a test’s history on both platforms', async () => {
      const key = testKey(OSTOMATE2_TEST.module, OSTOMATE2_TEST.suite, OSTOMATE2_TEST.name);
      const page = await loadTestHistory('ostomate2', key, anon, NOW);
      expect(page?.test).toMatchObject({ ...OSTOMATE2_TEST, layer: 'unit', testKey: key });
      expect(page?.history.platforms).toEqual(['jvm', 'ios-sim']);
      // 8 runs on main and the pull request; 25 ms on the JVM and 3 ms on the simulator, as the
      // two JUnit files record them.
      expect(page?.history.runs).toHaveLength(9);
      expect(
        page?.history.runs.every(
          (run) =>
            JSON.stringify(
              run.results.map((cell) => [cell.platform, cell.status, cell.durationMs]),
            ) ===
            JSON.stringify([
              ['jvm', 'passed', 25],
              ['ios-sim', 'passed', 3],
            ]),
        ),
      ).toBe(true);
      expect(page?.history.duration[30].points.map((point) => point.durationsMs)).toEqual(
        Array.from({ length: 8 }, () => [25, 3]),
      );
      expect(page?.history.flaky).toBe(false);
      // Never failed: it opens on the latest of its 9 runs.
      expect(page?.history.initialRun).toBe(8);
    });

    it('loads the flaky test’s history with the flip marked on both of its cells', async () => {
      const key = testKey(ROUTESERVE_TEST.module, ROUTESERVE_TEST.suite, ROUTESERVE_TEST.name);
      const page = await loadTestHistory('routeserve', key, anon, NOW);
      expect(page?.history.runs.map((run) => run.results[0]?.status)).toEqual([
        'passed',
        'failed',
        'passed',
        'passed',
        'failed',
        'passed',
        'passed',
        'failed',
        'passed',
        'passed',
        'failed',
      ]);
      // The failed first attempt and the passing second attempt of one commit.
      expect(page?.history.runs.map((run) => run.results[0]?.flaky)).toEqual([
        false,
        false,
        false,
        false,
        true,
        true,
        false,
        false,
        false,
        false,
        false,
      ]);
      expect(page?.history.runs[6]?.title).toBe('Pull request from seed/pull-request');
      // It opens on the latest failing run, the 11th: red at SEED_NOW.
      expect(page?.history).toMatchObject({
        flaky: true,
        flakyPlatforms: ['node'],
        initialRun: 10,
      });
      // 1 ms passing, 2 ms failing, as the two Jest files record it; the pull request is left out.
      expect(page?.history.duration[30].points.map((point) => point.durationsMs[0])).toEqual([
        1, 2, 1, 1, 2, 1, 2, 1, 1, 2,
      ]);
      expect(await loadTestHistory('ostomate2', key, anon, NOW)).toBeNull();
    });

    describe('a private project’s pages hold no failure text, repository links or full SHAs', () => {
      let hidden: string[];
      let latestRunId: string;

      // The same string as it would appear inside a JSON document, so escaping cannot hide it.
      const asJson = (value: string): string => JSON.stringify(value).slice(1, -1);
      const expectNoneOf = (output: unknown) => {
        const serialized = JSON.stringify(output);
        expect(serialized.length).toBeGreaterThan(100);
        for (const value of hidden) expect(serialized).not.toContain(asJson(value));
      };

      beforeAll(async () => {
        latestRunId = routeserve.summary.latestRun?.id ?? '';
        // Positive control: read with the secret key, the values exist and are not empty, so
        // their absence below is RLS and the views at work, not missing data.
        const failures = await admin
          .from('result_failures')
          .select('message, detail, results!inner(reports!inner(run_id))')
          .in('results.reports.run_id', await runIdsOf('routeserve'));
        if (failures.error) throw failed('secret result_failures', failures.error);
        const runs = await admin
          .from('runs')
          .select('commit_sha, run_url, projects!inner(slug)')
          .eq('projects.slug', 'routeserve');
        if (runs.error) throw failed('secret runs', runs.error);

        expect(failures.data).toHaveLength(4);
        const detailLines = failures.data.flatMap((row) =>
          String(row.detail)
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length >= 12),
        );
        expect(detailLines.length).toBeGreaterThan(0);
        expect(runs.data).toHaveLength(11);
        expect(runs.data.every((row) => /^[0-9a-f]{40}$/.test(String(row.commit_sha)))).toBe(true);
        expect(
          runs.data.every((row) => String(row.run_url).startsWith('https://github.com/')),
        ).toBe(true);
        hidden = [
          ...new Set([
            ...failures.data.flatMap((row) => [String(row.message), String(row.detail)]),
            ...detailLines,
            ...runs.data.flatMap((row) => [String(row.commit_sha), String(row.run_url)]),
            'github.com/bhelco1/routeserve',
          ]),
        ];
        expect(hidden.every((value) => value.length > 0)).toBe(true);
      });

      it('in the run page of its failed latest run, which still shows the failing row', async () => {
        const detail = await loadRunDetail('routeserve', latestRunId, anon, NOW);
        expect(detail?.run).toMatchObject({ status: 'failed', runUrl: null });
        expect(detail?.run.commitSha).toMatch(/^[0-9a-f]{7}$/);
        expect(detail?.results).toHaveLength(1041);
        expect(detail?.results?.[0]).toMatchObject({
          ...ROUTESERVE_TEST,
          status: 'failed',
          platforms: [{ platform: 'node', status: 'failed', failures: [] }],
        });
        expectNoneOf(detail);
      });

      it('in the project page', () => {
        expectNoneOf(routeserve);
      });

      it('in the failing test’s history', async () => {
        const key = testKey(ROUTESERVE_TEST.module, ROUTESERVE_TEST.suite, ROUTESERVE_TEST.name);
        const page = await loadTestHistory('routeserve', key, anon, NOW);
        expect(page?.history.runs).toHaveLength(11);
        expectNoneOf(page);
      });
    });
  });
});
