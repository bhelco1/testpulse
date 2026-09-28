import { describe, expect, it } from 'vitest';

import { at, countsCoverage, pctCoverage, run } from './records.test-support.ts';
import {
  landingHeadline,
  projectSummary,
  runsInLast30Days,
  type ProjectSummary,
  type ProjectSummaryInput,
  type SummaryProject,
} from './summary.ts';

// Spec section 11 headline tiles and section 13 project cards: total tests, pass rate, projects
// reporting, runs in last 30 days (default-branch CI runs only, decision 2026-09-28), median time
// to green and current green streaks; per project the latest run, its tests per layer with
// declared suites excluded, latest coverage against floors, green streak and reporting health.

const HOUR = 3_600_000;
const now = at('2026-10-05T12:00:00Z');

const project = (overrides: Partial<SummaryProject> = {}): SummaryProject => ({
  id: 'p1',
  slug: 'ostomate2',
  name: 'Ostomate 2.0',
  tagline: 'Tracker',
  visibility: 'public',
  defaultBranch: 'main',
  declaredSuites: [
    { name: 'Maestro E2E (Android)', layer: 'e2e', count: 7, status: 'runs_in_ci_not_reported' },
    { name: 'Maestro E2E (iOS)', layer: 'e2e', count: 5, status: 'runs_in_ci_not_reported' },
  ],
  coverageFloors: { shared: 91 },
  expectedCadenceDays: 8,
  ...overrides,
});

describe('runsInLast30Days', () => {
  const options = { defaultBranch: 'main', now };

  it('is 0 with no runs', () => {
    expect(runsInLast30Days([], options)).toBe(0);
  });

  it('counts default-branch CI runs from UTC midnight 29 days before today up to now', () => {
    // The window opens 2026-09-06T00:00Z (2026-10-05 minus 29 days). In: the opening instant,
    // a re-run attempt and now itself (3). Out: 1 ms before the window, 1 ms after now, a
    // backfilled run and a pull request run.
    const runs = [
      run('edge-out', '2026-09-05T23:59:59.999Z'),
      run('edge-in', '2026-09-06T00:00:00Z'),
      run('attempt-2', '2026-09-20T00:00:00Z', { runAttempt: 2 }),
      run('at-now', '2026-10-05T12:00:00Z'),
      run('future', '2026-10-05T12:00:00.001Z'),
      run('bf', '2026-10-01T00:00:00Z', { source: 'backfill' }),
      run('pr', '2026-10-01T00:00:00Z', { branch: 'feature/x' }),
    ];
    expect(runsInLast30Days(runs, options)).toBe(3);
  });
});

describe('projectSummary', () => {
  const input: ProjectSummaryInput = {
    project: project(),
    runs: [
      run('bf1', '2026-09-20T00:00:00Z', { source: 'backfill' }),
      run('c0', '2026-09-05T23:59:59.999Z'),
      run('c1', '2026-09-06T00:00:00Z', { status: 'failed', passed: 9, failed: 1 }),
      run('c2', '2026-09-06T02:00:00Z'),
      run('c3', '2026-10-01T00:00:00Z'),
      run('pr', '2026-10-04T00:00:00Z', { branch: 'feature/x', status: 'failed' }),
      run('c4', '2026-10-05T09:00:00Z', { passed: 190, failed: 0, skipped: 2 }),
    ],
    lastReportAt: at('2026-10-05T09:00:00Z'),
    // t1 ran on two platforms.
    latestRunTests: [
      { testId: 't1', layer: 'unit' },
      { testId: 't1', layer: 'unit' },
      { testId: 't2', layer: 'integration' },
    ],
    coverage: [
      pctCoverage('cv0', 'bf1', 'shared', 93.3),
      countsCoverage('cv1', 'c4', 'shared', 457, 490),
    ],
  };

  it('summarises a project from its runs, latest-run tests and coverage', () => {
    const summary = projectSummary(input, now);

    expect(summary.project).toBe(input.project);
    // c4 is the latest default-branch CI run: 190 / (190 + 0) = 1, skipped excluded.
    expect(summary.latestRun).toEqual({
      id: 'c4',
      status: 'passed',
      finishedAt: at('2026-10-05T09:00:00Z'),
      branch: 'main',
      commitSha: 'sha-c4',
      passed: 190,
      failed: 0,
      skipped: 2,
      passRate: 1,
    });
    // t1 and t2; the 12 declared Maestro flows are not added.
    expect(summary.totalTests).toBe(2);
    expect(summary.layers).toEqual({ unit: 1, integration: 1 });
    // c4's 457 / 490 = 93.2653...%, newer than the backfilled 93.3.
    expect(summary.coverage).toEqual([
      { module: 'shared', runId: 'c4', pct: (457 / 490) * 100, floor: 91, belowFloor: false },
    ]);
    // CI main in order: c0 P, c1 F, c2 P, c3 P, c4 P. Current 3, longest 3.
    expect(summary.greenStreak).toEqual({ current: 3, longest: 3 });
    // c1, c2, c3, c4; c0 finished 1 ms before the window, and bf1 and pr are not counted.
    expect(summary.runsInLast30Days).toBe(4);
    // c1 turned red after c0 and c2 recovered 2 hours later.
    expect(summary.timeToGreen).toMatchObject({ medianMs: 2 * HOUR, worstMs: 2 * HOUR });
    expect(summary.health).toEqual({
      daysSinceLastReport: 0,
      problems: [],
      marker: { health: 'healthy' },
    });
  });

  it('has no latest run, no tests and is not reporting before its first report', () => {
    const summary = projectSummary(
      { ...input, runs: [], lastReportAt: null, latestRunTests: [], coverage: [] },
      now,
    );
    expect(summary).toMatchObject({
      latestRun: null,
      totalTests: 0,
      layers: {},
      coverage: [],
      greenStreak: { current: 0, longest: 0 },
      runsInLast30Days: 0,
      timeToGreen: { recoveries: [], medianMs: null, worstMs: null, stillRed: null },
      health: { daysSinceLastReport: null, problems: [], marker: { health: 'not_reporting' } },
    });
  });

  it('has no pass rate when every test in the latest run was skipped', () => {
    const allSkipped = run('s', '2026-10-05T09:00:00Z', { passed: 0, failed: 0, skipped: 5 });
    const summary = projectSummary(
      {
        ...input,
        runs: [allSkipped],
        latestRunTests: [{ testId: 't1', layer: 'unit' }],
        coverage: [],
      },
      now,
    );
    // 0 / (0 + 0): no rate, and the 5 skipped still show.
    expect(summary.latestRun).toMatchObject({ passRate: null, skipped: 5 });
    expect(summary.totalTests).toBe(1);
  });

  it('flags a stale, empty, below-floor project', () => {
    const emptyRun = run('e', '2026-09-22T04:37:00.242Z', {
      status: 'empty',
      passed: 0,
      failed: 0,
    });
    const summary = projectSummary(
      {
        ...input,
        runs: [emptyRun],
        lastReportAt: at('2026-09-22T04:37:00.242Z'),
        latestRunTests: [],
        coverage: [countsCoverage('cv', 'e', 'shared', 45, 50)],
      },
      now,
    );
    // 13 whole days since 2026-09-22T04:37:00.242Z; 45 / 50 = 90% < 91.
    expect(summary.health).toEqual({
      daysSinceLastReport: 13,
      problems: ['stale', 'empty', 'below_floor'],
      marker: { health: 'stale', days: 13 },
    });
    expect(summary.latestRun).toMatchObject({ status: 'empty', passRate: null });
  });
});

describe('landingHeadline', () => {
  // A summary with only what the headline reads set by the test.
  const summary = (
    slug: string,
    overrides: {
      latestRun?: {
        passed: number;
        failed: number;
        skipped: number;
        status?: 'passed' | 'failed' | 'empty';
      } | null;
      totalTests?: number;
      runsInLast30Days?: number;
      recoveriesMs?: number[];
      current?: number;
      health?: ProjectSummary['health'];
    } = {},
  ): ProjectSummary => {
    const latest =
      overrides.latestRun === undefined
        ? { passed: 1, failed: 0, skipped: 0 }
        : overrides.latestRun;
    return {
      project: project({ id: `id-${slug}`, slug, name: slug }),
      latestRun:
        latest === null
          ? null
          : {
              id: `run-${slug}`,
              status: latest.status ?? (latest.failed > 0 ? 'failed' : 'passed'),
              finishedAt: at('2026-10-05T09:00:00Z'),
              branch: 'main',
              commitSha: 'abcdef0',
              passed: latest.passed,
              failed: latest.failed,
              skipped: latest.skipped,
              passRate: null,
            },
      totalTests: overrides.totalTests ?? 0,
      layers: {},
      coverage: [],
      greenStreak: { current: overrides.current ?? 0, longest: overrides.current ?? 0 },
      runsInLast30Days: overrides.runsInLast30Days ?? 0,
      timeToGreen: {
        recoveries: (overrides.recoveriesMs ?? []).map((elapsedMs, index) => ({
          failedRunId: `${slug}-f${index}`,
          failedAt: at('2026-10-01T00:00:00Z'),
          greenRunId: `${slug}-g${index}`,
          greenAt: new Date(at('2026-10-01T00:00:00Z').getTime() + elapsedMs),
          elapsedMs,
        })),
        medianMs: null,
        worstMs: null,
        stillRed: null,
      },
      health: overrides.health ?? {
        daysSinceLastReport: 0,
        problems: [],
        marker: { health: 'healthy' },
      },
    };
  };

  it('is all zeros and no rates with no projects', () => {
    expect(landingHeadline([])).toEqual({
      totalTests: 0,
      passRate: { passed: 0, failed: 0, skipped: 0, rate: null, counted: [] },
      emptyLatestRuns: [],
      projectsReporting: { reporting: 0, registered: 0, silent: [], notReporting: [] },
      runsInLast30Days: { total: 0, byProject: [] },
      medianTimeToGreenMs: null,
      greenStreaks: [],
    });
  });

  it('combines the latest runs of every project', () => {
    const headline = landingHeadline([
      summary('a', {
        latestRun: { passed: 190, failed: 2, skipped: 3 },
        totalTests: 150,
        runsInLast30Days: 18,
        recoveriesMs: [1 * HOUR, 3 * HOUR],
        current: 0,
      }),
      summary('b', {
        latestRun: { passed: 10, failed: 0, skipped: 0 },
        totalTests: 10,
        runsInLast30Days: 6,
        recoveriesMs: [2 * HOUR, 10 * HOUR],
        current: 41,
        health: {
          daysSinceLastReport: 12,
          problems: ['stale'],
          marker: { health: 'stale', days: 12 },
        },
      }),
      summary('c', {
        latestRun: { passed: 0, failed: 0, skipped: 0, status: 'empty' },
        runsInLast30Days: 1,
        health: { daysSinceLastReport: 1, problems: ['empty'], marker: { health: 'empty' } },
      }),
      summary('d', {
        latestRun: null,
        health: { daysSinceLastReport: null, problems: [], marker: { health: 'not_reporting' } },
      }),
      summary('e', {
        latestRun: { passed: 0, failed: 0, skipped: 5 },
        totalTests: 5,
        runsInLast30Days: 2,
        current: 2,
        health: {
          daysSinceLastReport: 0,
          problems: ['below_floor'],
          marker: { health: 'below_floor' },
        },
      }),
    ]);

    // 150 + 10 + 0 (empty) + 0 (none) + 5.
    expect(headline.totalTests).toBe(165);
    // Pooled over the latest runs: (190 + 10 + 0) / (190 + 2 + 10 + 0 + 0) = 200 / 202,
    // not the mean of each run's rate ((190/192 + 10/10) / 2). Skipped 3 + 0 + 0 + 5 = 8.
    // c and e passed and failed nothing, so only a and b are counted.
    expect(headline.passRate).toEqual({
      passed: 200,
      failed: 2,
      skipped: 8,
      rate: 200 / 202,
      counted: ['a', 'b'],
    });
    expect(headline.emptyLatestRuns).toEqual(['c']);
    // a, c (empty, but reporting) and e (below floor, but reporting); b is silent 12 days and
    // d has never reported. 3 of 5.
    expect(headline.projectsReporting).toEqual({
      reporting: 3,
      registered: 5,
      silent: [{ slug: 'b', days: 12 }],
      notReporting: ['d'],
    });
    // 18 + 6 + 1 + 0 + 2.
    expect(headline.runsInLast30Days).toEqual({
      total: 27,
      byProject: [
        { slug: 'a', runs: 18 },
        { slug: 'b', runs: 6 },
        { slug: 'c', runs: 1 },
        { slug: 'd', runs: 0 },
        { slug: 'e', runs: 2 },
      ],
    });
    // Every project's recoveries pooled: 1, 2, 3, 10 hours; even count, so (2 + 3) / 2 = 2.5 h.
    // The median of each project's median would be (2 + 6) / 2 = 4 h.
    expect(headline.medianTimeToGreenMs).toBe(2.5 * HOUR);
    expect(headline.greenStreaks).toEqual([
      { slug: 'a', current: 0 },
      { slug: 'b', current: 41 },
      { slug: 'c', current: 0 },
      { slug: 'd', current: 0 },
      { slug: 'e', current: 2 },
    ]);
  });

  it('has a single project’s numbers when there is one', () => {
    const headline = landingHeadline([
      summary('only', {
        latestRun: { passed: 1044, failed: 1, skipped: 0 },
        totalTests: 1041,
        runsInLast30Days: 10,
        recoveriesMs: [44 * 60_000],
      }),
    ]);
    // 1044 / 1045.
    expect(headline).toMatchObject({
      totalTests: 1041,
      passRate: { passed: 1044, failed: 1, rate: 1044 / 1045, counted: ['only'] },
      projectsReporting: { reporting: 1, registered: 1 },
      runsInLast30Days: { total: 10 },
      medianTimeToGreenMs: 44 * 60_000,
    });
  });

  it('has no pass rate when every latest run skipped everything', () => {
    const headline = landingHeadline([
      summary('a', { latestRun: { passed: 0, failed: 0, skipped: 4 } }),
      summary('b', { latestRun: { passed: 0, failed: 0, skipped: 1 } }),
    ]);
    expect(headline.passRate).toEqual({
      passed: 0,
      failed: 0,
      skipped: 5,
      rate: null,
      counted: [],
    });
  });
});
