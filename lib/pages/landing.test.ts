import { describe, expect, it } from 'vitest';

import type { Landing, LandingProject, RecentRun } from '../queries/landing.ts';
import type { LatestRunDetail } from '../queries/run-rows.ts';
import { landingHeadline, type LatestRunSummary } from '../stats/summary.ts';
import { landingView } from './landing.ts';

// The landing page's view of the loader's output (design/pages/Landing.dc.html,
// design/components.md, design/data-map.md "Landing"). Pure: the page passes the loader's result
// and now. The seed-shaped fixture below carries the hand-computed values the seed produces at
// SEED_NOW (lib/seed/seed.int.test.ts, "landing headline and project cards").

const NOW = new Date('2026-10-05T12:00:00.000Z');
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

const OSTOMATE_SHA = '0e2d0b4c1f9a7b3e5d6c8a9b0c1d2e3f4a5b6c7d';

const latest = (overrides: Partial<LatestRunSummary> = {}): LatestRunSummary => ({
  id: 'o-9',
  status: 'passed',
  finishedAt: ago(2 * HOUR + 33 * MINUTE + 42_253),
  branch: 'main',
  commitSha: OSTOMATE_SHA,
  passed: 142,
  failed: 0,
  skipped: 0,
  passRate: 1,
  ...overrides,
});

const report = (job: string, module: string, platform: string, total: number) => ({
  job,
  module,
  platform,
  format: 'junit',
  total,
  passed: total,
  failed: 0,
  skipped: 0,
  durationMs: 1_000,
  startedAt: NOW,
  finishedAt: NOW,
});

const OSTOMATE2: LandingProject = {
  project: {
    id: 'p1',
    slug: 'ostomate2',
    name: 'Ostomate 2.0',
    tagline: 'Local-first ostomy supply tracker.',
    visibility: 'public',
    defaultBranch: 'main',
    declaredSuites: [
      { name: 'Maestro E2E (Android)', layer: 'e2e', count: 7, status: 'runs_in_ci_not_reported' },
      { name: 'Maestro E2E (iOS)', layer: 'e2e', count: 5, status: 'runs_in_ci_not_reported' },
    ],
    coverageFloors: { shared: 91, composeApp: 93 },
    expectedCadenceDays: 8,
  },
  latestRun: latest(),
  totalTests: 142,
  layers: { unit: 103, integration: 29, visual: 10 },
  coverage: [
    { module: 'composeApp', runId: 'o-9', pct: (497 / 527) * 100, floor: 93, belowFloor: false },
    { module: 'shared', runId: 'o-9', pct: (457 / 490) * 100, floor: 91, belowFloor: false },
  ],
  greenStreak: { current: 8, longest: 8 },
  runsInLast30Days: 8,
  timeToGreen: { recoveries: [], medianMs: null, worstMs: null, stillRed: null },
  health: { daysSinceLastReport: 0, problems: [], marker: { health: 'healthy' } },
  latestRunDetail: {
    reports: [
      report('android', 'composeApp', 'jvm', 60),
      report('android', 'shared', 'jvm', 82),
      report('ios', 'composeApp', 'ios-sim', 50),
    ],
    failing: [],
    durationMs: 35_604,
  },
};

const ROUTESERVE_RED_MS = 226 * MINUTE + 4_588;

const ROUTESERVE: LandingProject = {
  project: {
    id: 'p2',
    slug: 'routeserve',
    name: 'RouteServe',
    tagline: 'Field-service CRM.',
    visibility: 'private',
    defaultBranch: 'main',
    declaredSuites: [
      { name: 'Maestro E2E · iOS', layer: 'e2e', count: 13, status: 'authored_not_executed' },
    ],
    coverageFloors: { 'apps/backend': 80, 'apps/mobile': 80, 'packages/shared': 80 },
    expectedCadenceDays: 8,
  },
  // runs_public cuts a private project's SHA to 7 characters (section 9).
  latestRun: latest({
    id: 'r-11',
    status: 'failed',
    finishedAt: ago(ROUTESERVE_RED_MS),
    commitSha: 'c238574',
    passed: 1040,
    failed: 1,
    passRate: 1040 / 1041,
  }),
  totalTests: 1041,
  layers: { unit: 607, component: 165, api: 269 },
  coverage: [
    {
      module: 'apps/backend',
      runId: 'r-11',
      pct: (1862 / 1968) * 100,
      floor: 80,
      belowFloor: false,
    },
    {
      module: 'apps/mobile',
      runId: 'r-11',
      pct: (1496 / 1551) * 100,
      floor: 80,
      belowFloor: false,
    },
    { module: 'packages/shared', runId: 'r-10', pct: 100, floor: 80, belowFloor: false },
  ],
  greenStreak: { current: 0, longest: 2 },
  runsInLast30Days: 10,
  timeToGreen: {
    recoveries: [],
    medianMs: 44 * MINUTE,
    worstMs: 247 * MINUTE,
    stillRed: {
      failedRunId: 'r-11',
      failedAt: ago(ROUTESERVE_RED_MS),
      elapsedMs: ROUTESERVE_RED_MS,
    },
  },
  health: { daysSinceLastReport: 0, problems: [], marker: { health: 'healthy' } },
  latestRunDetail: {
    reports: [
      report('test', 'apps/backend', 'node', 498),
      report('test', 'apps/mobile', 'node', 428),
      report('test', 'packages/shared', 'node', 119),
    ],
    failing: [
      {
        testKey: 'k1',
        suite: 'packages/shared/src/schemas/asset.test.ts',
        name: 'assetCreateSchema accepts a minimal valid asset',
        platform: 'node',
        status: 'failed',
      },
    ],
    durationMs: 204_120,
  },
};

const TESTPULSE_RED_MS = 13 * DAY + 7 * HOUR + 22 * MINUTE + 59_758;

const TESTPULSE: LandingProject = {
  project: {
    id: 'p3',
    slug: 'testpulse',
    name: 'testpulse',
    tagline: 'This dashboard.',
    visibility: 'public',
    defaultBranch: 'main',
    declaredSuites: [],
    coverageFloors: {},
    expectedCadenceDays: 8,
  },
  latestRun: latest({
    id: 't-1',
    status: 'failed',
    finishedAt: ago(TESTPULSE_RED_MS),
    commitSha: 'feedfacefeedfacefeedfacefeedfacefeedface',
    passed: 1,
    failed: 1,
    skipped: 1,
    passRate: 0.5,
  }),
  totalTests: 3,
  layers: { e2e: 3 },
  coverage: [],
  greenStreak: { current: 0, longest: 0 },
  runsInLast30Days: 1,
  timeToGreen: {
    recoveries: [],
    medianMs: null,
    worstMs: null,
    stillRed: { failedRunId: 't-1', failedAt: ago(TESTPULSE_RED_MS), elapsedMs: TESTPULSE_RED_MS },
  },
  health: { daysSinceLastReport: 13, problems: ['stale'], marker: { health: 'stale', days: 13 } },
  latestRunDetail: {
    reports: [report('e2e', 'testpulse', 'chromium', 3)],
    failing: [
      {
        testKey: 'k2',
        suite: 'tests/e2e/harness/failing.spec.ts',
        name: 'fails on purpose',
        platform: 'chromium',
        status: 'failed',
      },
    ],
    durationMs: 4_321,
  },
};

const recent = (overrides: Partial<RecentRun> & Pick<RecentRun, 'id' | 'project'>): RecentRun => ({
  title: 'Push to main',
  event: 'push',
  branch: 'main',
  commitSha: OSTOMATE_SHA,
  runUrl: null,
  startedAt: ago(3 * HOUR),
  finishedAt: ago(2 * HOUR + 33 * MINUTE),
  source: 'ci',
  status: 'passed',
  total: 192,
  passed: 192,
  failed: 0,
  skipped: 0,
  durationMs: 35_604,
  reports: 3,
  tests: { total: 142, passed: 142, failed: 0, skipped: 0 },
  ...overrides,
});

const PUBLIC = { slug: 'ostomate2', name: 'Ostomate 2.0', visibility: 'public' } as const;
const PRIVATE = { slug: 'routeserve', name: 'RouteServe', visibility: 'private' } as const;

const landingOf = (
  projects: readonly LandingProject[],
  recentRuns: readonly RecentRun[] = [],
): Landing => ({ projects, headline: landingHeadline(projects), recentRuns });

const SEEDED = landingOf(
  [OSTOMATE2, ROUTESERVE, TESTPULSE],
  [
    recent({ id: 'o-9', project: PUBLIC }),
    recent({
      id: 'r-11',
      project: PRIVATE,
      commitSha: 'c238574',
      status: 'failed',
      finishedAt: ago(ROUTESERVE_RED_MS),
      total: 1045,
      passed: 1044,
      failed: 1,
      tests: { total: 1041, passed: 1040, failed: 1, skipped: 0 },
    }),
    recent({
      id: 'o-8',
      project: PUBLIC,
      event: 'schedule',
      title: 'Scheduled run',
      finishedAt: ago(DAY + HOUR),
    }),
  ],
);

const tile = (view: ReturnType<typeof landingView>, label: string) =>
  view.tiles.find((candidate) => candidate.label === label);

describe('landingView at the seed', () => {
  const view = landingView(SEEDED, NOW);

  it('leads with the portfolio’s distinct tests: 142 + 1,041 + 3', () => {
    expect(view.heroTotal).toBe('1,186');
  });

  it('shows the four portfolio tiles in the design’s order', () => {
    expect(view.tiles.map((candidate) => candidate.label)).toEqual([
      'Pass rate',
      'Projects reporting',
      'Runs in last 30 days',
      'Projects passing',
    ]);
  });

  it('reads the pass rate in distinct tests, rounded down, with the skipped count', () => {
    // (142 + 1,040 + 1) / (142 + 1,040 + 1 + 0 + 1 + 1) = 1,183 / 1,185 = 99.831...%.
    expect(tile(view, 'Pass rate')).toEqual({
      label: 'Pass rate',
      value: '99.8%',
      sub: '1,183 of 1,185 · 1 skipped, excluded',
    });
  });

  it('counts 2 of 3 projects reporting and names the silent one', () => {
    expect(tile(view, 'Projects reporting')).toEqual({
      label: 'Projects reporting',
      value: '2 of 3',
      attention: { icon: 'stale', text: 'testpulse silent 13 days' },
    });
  });

  it('counts 19 runs in the last 30 days, per project', () => {
    expect(tile(view, 'Runs in last 30 days')).toEqual({
      label: 'Runs in last 30 days',
      value: '19',
      sub: 'Ostomate 2.0 8 · RouteServe 10 · testpulse 1',
    });
  });

  it('lists the red projects, longest red first', () => {
    expect(tile(view, 'Projects passing')).toEqual({
      label: 'Projects passing',
      value: '1 of 3',
      sub: 'Red: testpulse 13d 7h · RouteServe 3h 46m',
      fail: true,
    });
  });

  it('gives Ostomate2 a passed card with its run, layers, coverage, reports and declared suites', () => {
    const [card] = view.cards;
    expect(card).toEqual({
      project: {
        name: 'Ostomate 2.0',
        tagline: 'Local-first ostomy supply tracker.',
        visibility: 'public',
        href: '/p/ostomate2',
      },
      latestRun: {
        status: 'passed',
        when: expect.objectContaining({ text: '2 h ago' }),
        branch: 'main',
        sha: OSTOMATE_SHA,
        href: '/p/ostomate2/runs/o-9',
        total: 142,
        failed: 0,
        skipped: 0,
        duration: '36 s',
      },
      layers: [
        { label: 'Unit', count: 103, tone: 1 },
        { label: 'Integration', count: 29, tone: 3 },
        { label: 'Visual', count: 10, tone: 2 },
      ],
      coverage: [
        { module: 'composeApp', pct: (497 / 527) * 100, floor: 93 },
        { module: 'shared', pct: (457 / 490) * 100, floor: 91 },
      ],
      reports: [
        { key: 'android/composeApp/jvm', total: 60 },
        { key: 'android/shared/jvm', total: 82 },
        { key: 'ios/composeApp/ios-sim', total: 50 },
      ],
      declared: OSTOMATE2.project.declaredSuites,
      health: { health: 'healthy' },
      failing: [],
    });
  });

  it('gives RouteServe a private failed card with its failing test and 7-character SHA', () => {
    const card = view.cards[1];
    expect(card?.project.visibility).toBe('private');
    expect(card?.latestRun).toEqual({
      status: 'failed',
      when: expect.objectContaining({ text: '3 h ago' }),
      branch: 'main',
      sha: 'c238574',
      href: '/p/routeserve/runs/r-11',
      total: 1041,
      failed: 1,
      skipped: 0,
      duration: '204 s',
    });
    expect(card?.failing).toEqual([
      {
        suite: 'packages/shared/src/schemas/asset.test.ts',
        name: 'assetCreateSchema accepts a minimal valid asset',
        platform: 'node',
      },
    ]);
  });

  it('gives testpulse a stale failed card: 3 tests, 1 skipped, no coverage rows', () => {
    const card = view.cards[2];
    expect(card?.latestRun).toMatchObject({
      status: 'failed',
      // 13 days 7 hours back is 13 UTC days: a week, in v7's wording.
      when: {
        text: '1 week ago',
        datetime: '2026-09-22T04:37:00.242Z',
        title: '22 Sep 2026, 04:37 UTC',
      },
      total: 3,
      failed: 1,
      skipped: 1,
      duration: '4 s',
    });
    expect(card?.health).toEqual({ health: 'stale', days: 13 });
    expect(card?.coverage).toEqual([]);
    expect(card?.layers).toEqual([{ label: 'E2E', count: 3, tone: 3 }]);
  });

  it('feeds the recent runs in distinct tests, a private run untitled', () => {
    expect(view.recentRuns).toEqual([
      {
        id: 'o-9',
        href: '/p/ostomate2/runs/o-9',
        project: 'Ostomate 2.0',
        branch: 'main',
        sha: '0e2d0b4',
        when: expect.objectContaining({ text: '2 h ago' }),
        visibility: 'public',
        title: 'Push to main',
        status: 'passed',
        total: 142,
        duration: '36 s',
      },
      {
        id: 'r-11',
        href: '/p/routeserve/runs/r-11',
        project: 'RouteServe',
        branch: 'main',
        sha: 'c238574',
        when: expect.objectContaining({ text: '3 h ago' }),
        visibility: 'private',
        status: 'failed',
        failed: 1,
        passed: 1040,
        total: 1041,
      },
      expect.objectContaining({
        id: 'o-8',
        title: 'Scheduled run',
        when: expect.objectContaining({ text: 'yesterday' }),
      }),
    ]);
  });
});

describe('landingView tiles in other states', () => {
  const allPassing = landingOf([
    OSTOMATE2,
    {
      ...ROUTESERVE,
      latestRun: latest({ id: 'r-12', passed: 1041 }),
      timeToGreen: { ...ROUTESERVE.timeToGreen, stillRed: null },
    },
  ]);

  it('reads “Latest runs” when nothing failed, as the design’s healthy state does', () => {
    expect(tile(landingView(allPassing, NOW), 'Pass rate')).toEqual({
      label: 'Pass rate',
      value: '100%',
      sub: 'Latest runs · 0 skipped, excluded',
    });
  });

  it('shows projects reporting as a bare count when none is silent, with no sub-line', () => {
    expect(tile(landingView(allPassing, NOW), 'Projects reporting')).toEqual({
      label: 'Projects reporting',
      value: '2',
    });
    expect(tile(landingView(allPassing, NOW), 'Projects passing')).toEqual({
      label: 'Projects passing',
      value: '2 of 2',
      sub: 'Latest default-branch runs',
      fail: false,
    });
  });

  it('never rounds a failing pass rate up to 100%', () => {
    const nearly = landingOf([
      { ...ROUTESERVE, latestRun: latest({ passed: 9_999, failed: 1, passRate: 0.9999 }) },
    ]);
    expect(tile(landingView(nearly, NOW), 'Pass rate')).toMatchObject({
      value: '99.9%',
      sub: '9,999 of 10,000 · 0 skipped, excluded',
    });
  });

  it('names the one project counted when another’s latest run is empty', () => {
    const empty = landingOf([
      {
        ...OSTOMATE2,
        latestRun: latest({ status: 'empty', passed: 0, passRate: null }),
        totalTests: 0,
        health: { daysSinceLastReport: 0, problems: ['empty'], marker: { health: 'empty' } },
      },
      allPassing.projects[1] as LandingProject,
    ]);
    expect(tile(landingView(empty, NOW), 'Pass rate')).toEqual({
      label: 'Pass rate',
      value: '100%',
      sub: 'RouteServe only · 0 skipped, excluded',
    });
  });

  it('holds back what the design does not draw', () => {
    const silent = (project: LandingProject, days: number): LandingProject => ({
      ...project,
      health: { daysSinceLastReport: days, problems: ['stale'], marker: { health: 'stale', days } },
    });
    // Two silent projects: the value follows the one-silent rule; the sub-line is not drawn.
    expect(
      tile(
        landingView(landingOf([silent(OSTOMATE2, 9), silent(TESTPULSE, 13)]), NOW),
        'Projects reporting',
      ),
    ).toEqual({
      label: 'Projects reporting',
      value: '0 of 2',
    });
    // A registered project that has never reported: the tile's denominator is not defined.
    const unreported: LandingProject = {
      ...TESTPULSE,
      latestRun: null,
      totalTests: 0,
      layers: {},
      health: { daysSinceLastReport: null, problems: [], marker: { health: 'not_reporting' } },
      latestRunDetail: null,
    };
    expect(
      tile(landingView(landingOf([OSTOMATE2, unreported]), NOW), 'Projects reporting'),
    ).toBeUndefined();
    // Nothing passed or failed anywhere: there is no rate, and no drawn tile for it.
    expect(tile(landingView(landingOf([unreported]), NOW), 'Pass rate')).toBeUndefined();
    // Two failing and one uncounted project: the sub-line's lead is not drawn.
    const emptyRun: LandingProject = {
      ...TESTPULSE,
      latestRun: latest({ id: 't-2', status: 'empty', passed: 0, passRate: null }),
    };
    expect(
      tile(landingView(landingOf([OSTOMATE2, ROUTESERVE, emptyRun]), NOW), 'Pass rate'),
    ).toEqual({
      label: 'Pass rate',
      value: '99.9%',
    });
  });

  it('shows 0 runs per project before any run, and a card with no run', () => {
    const unreported: LandingProject = {
      ...TESTPULSE,
      latestRun: null,
      totalTests: 0,
      layers: {},
      runsInLast30Days: 0,
      latestRunDetail: null,
    };
    const view = landingView(landingOf([unreported]), NOW);
    expect(tile(view, 'Runs in last 30 days')).toEqual({
      label: 'Runs in last 30 days',
      value: '0',
      sub: 'testpulse 0',
    });
    expect(view.cards[0]).toMatchObject({ latestRun: null, reports: [], failing: [] });
    expect(view.heroTotal).toBe('0');
  });

  it('leaves out a module with no floor, as the project page does', () => {
    const extra: LandingProject = {
      ...OSTOMATE2,
      coverage: [
        ...OSTOMATE2.coverage,
        { module: 'extra', runId: 'o-9', pct: 50, floor: null, belowFloor: false },
      ],
    };
    expect(
      landingView(landingOf([extra]), NOW).cards[0]?.coverage.map((row) => row.module),
    ).toEqual(['composeApp', 'shared']);
  });

  it('keeps an empty or stale card’s own wording to the card component', () => {
    const detail: LatestRunDetail = {
      reports: [report('e2e', 'testpulse', 'chromium', 0)],
      failing: [],
      durationMs: 0,
    };
    const empty: LandingProject = {
      ...TESTPULSE,
      latestRun: latest({ id: 't-3', status: 'empty', passed: 0, passRate: null }),
      latestRunDetail: detail,
    };
    expect(landingView(landingOf([empty]), NOW).cards[0]?.latestRun).toMatchObject({
      status: 'empty',
      when: expect.objectContaining({ text: '2 h ago' }),
    });
  });
});
