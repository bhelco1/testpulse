import { describe, expect, it } from 'vitest';

import type { ProjectPage, ProjectRunItem } from '../queries/project.ts';
import type { LatestRunSummary, ProjectSummary } from '../stats/summary.ts';
import { projectPageOptions, projectPageView, runListHref } from './project.ts';

// The project page's view of the loader's output (design/pages/Project Page.dc.html,
// design/components.md, design/data-map.md "Project"). Pure: the page passes the loader's result
// and now, and renders what comes back.

const NOW = new Date('2026-10-05T12:00:00.000Z');
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

const SHA = '0e2d0b4c1f9a7b3e5d6c8a9b0c1d2e3f4a5b6c7d';

const project: ProjectPage['project'] = {
  id: 'p1',
  slug: 'ostomate2',
  name: 'Ostomate 2.0',
  tagline: 'Local-first ostomy supply tracker.',
  visibility: 'public',
  defaultBranch: 'main',
  declaredSuites: [
    { name: 'Maestro E2E (Android)', layer: 'e2e', count: 7, status: 'runs_in_ci_not_reported' },
  ],
  coverageFloors: { shared: 91, composeApp: 93 },
  expectedCadenceDays: 8,
  description: 'Tracks supply changes.\nPredicts reorders.\n\n  Second paragraph.  \n\n\n',
  repoUrl: 'https://github.com/bhelco1/Ostomate2',
  devStack: [{ category: 'Mobile', items: ['Kotlin Multiplatform 2.3.21', 'Koin 4.2.1'] }],
  testStack: [{ category: 'E2E', items: ['Maestro 2.6.1'] }],
};

const LATEST: LatestRunSummary = {
  id: 'run-9',
  status: 'passed',
  finishedAt: ago(2 * HOUR + 34 * MINUTE),
  branch: 'main',
  commitSha: SHA,
  // Distinct tests (lib/stats/summary.ts), not the 192 executions.
  passed: 142,
  failed: 0,
  skipped: 0,
  passRate: 1,
};

const summary: ProjectSummary = {
  project,
  latestRun: LATEST,
  totalTests: 142,
  layers: { unit: 103, integration: 29, visual: 10 },
  coverage: [
    { module: 'composeApp', runId: 'run-9', pct: (497 / 527) * 100, floor: 93, belowFloor: false },
    { module: 'shared', runId: 'run-9', pct: (457 / 490) * 100, floor: 91, belowFloor: false },
    { module: 'extra', runId: 'run-9', pct: 50, floor: null, belowFloor: false },
  ],
  greenStreak: { current: 8, longest: 8 },
  runsInLast30Days: 8,
  timeToGreen: { recoveries: [], medianMs: null, worstMs: null, stillRed: null },
  health: { daysSinceLastReport: 0, problems: [], marker: { health: 'healthy' } },
};

const listed = (overrides: Partial<ProjectRunItem> = {}): ProjectRunItem => ({
  id: 'run-9',
  title: 'Push to main',
  event: 'push',
  branch: 'main',
  commitSha: SHA,
  runUrl: 'https://github.com/bhelco1/Ostomate2/actions/runs/9',
  startedAt: ago(2 * HOUR + 35 * MINUTE),
  finishedAt: ago(2 * HOUR + 34 * MINUTE),
  source: 'ci',
  status: 'passed',
  // Executions: 142 tests, 50 of them on two platforms.
  total: 192,
  passed: 192,
  failed: 0,
  skipped: 0,
  durationMs: 35_604,
  reports: 3,
  tests: { total: 142, passed: 142, failed: 0, skipped: 0 },
  ...overrides,
});

const windowRate = (passRate: number | null) => ({
  runs: 14,
  passed: 2388,
  failed: 0,
  skipped: 0,
  passRate,
});

const NO_TRENDS: ProjectPage['trends'] = {
  passRate: [],
  testCount: [],
  coverage: [],
  duration: [],
};

const LATEST_RUN: NonNullable<ProjectPage['latestRun']> = {
  reports: [
    report('android', 'shared', 'jvm', 82),
    report('android', 'composeApp', 'jvm', 60),
    report('ios', 'composeApp', 'ios-sim', 50),
  ],
  failing: [],
  durationMs: 35_604,
};

const page = (overrides: Partial<ProjectPage> = {}): ProjectPage => ({
  project,
  summary,
  lastReportAt: ago(2 * HOUR + 34 * MINUTE),
  latestRun: LATEST_RUN,
  trends: NO_TRENDS,
  windowPassRate: windowRate(1),
  recentRuns: [],
  flaky: { tests: [], totalTests: 142, flakeRate: 0 },
  runs: { branches: 'default', items: [listed()], hasMore: false },
  ...overrides,
});

function report(job: string, module: string, platform: string, total: number) {
  return {
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
  };
}

const privateProject = {
  ...project,
  slug: 'routeserve',
  name: 'RouteServe',
  visibility: 'private' as const,
  repoUrl: null,
};

describe('projectPageView', () => {
  it('titles the document after the project, as the Not found page is titled', () => {
    expect(projectPageView(page(), NOW).title).toBe('Ostomate 2.0 · testpulse');
  });

  it('carries the project’s name, tagline and description as plain paragraphs', () => {
    const view = projectPageView(page(), NOW);

    expect(view.hero).toMatchObject({
      name: 'Ostomate 2.0',
      private: false,
      tagline: 'Local-first ostomy supply tracker.',
      paragraphs: ['Tracks supply changes.\nPredicts reorders.', 'Second paragraph.'],
      repoUrl: 'https://github.com/bhelco1/Ostomate2',
    });
  });

  it('marks a private project, with no repository link', () => {
    const view = projectPageView(page({ project: privateProject }), NOW);

    expect(view.hero).toMatchObject({ private: true, repoUrl: null });
  });

  it('pairs a healthy marker with when the last report arrived', () => {
    expect(projectPageView(page(), NOW).hero).toMatchObject({
      health: { health: 'healthy' },
      // 09:26 UTC, 2 h 34 min before now.
      healthDetail: [
        'Last report ',
        { text: '2 h ago', datetime: '2026-10-05T09:26:00.000Z', title: '5 Oct 2026, 09:26 UTC' },
      ],
      stale: null,
    });
  });

  it('dates a stale project and expects its next report after its cadence', () => {
    const lastReportAt = new Date('2026-09-22T04:37:00Z');
    const stale = page({
      lastReportAt,
      summary: {
        ...summary,
        health: {
          daysSinceLastReport: 13,
          problems: ['stale'],
          marker: { health: 'stale', days: 13 },
        },
      },
    });

    expect(projectPageView(stale, NOW).hero).toMatchObject({
      health: { health: 'stale', days: 13 },
      healthDetail: ['Expected every 8 days'],
      stale: {
        title: 'Ostomate 2.0 hasn’t reported in 13 days',
        // 2026-09-22 + 8 days = 2026-09-30; one date format everywhere, "22 Sep" (design v7).
        body: [
          'The weekly scheduled run should have posted by ',
          { text: '30 Sep', datetime: '2026-09-30T04:37:00.000Z', title: '30 Sep 2026, 04:37 UTC' },
          '. Its CI may be failing silently. Everything below is from the last report, ',
          { text: '22 Sep', datetime: '2026-09-22T04:37:00.000Z', title: '22 Sep 2026, 04:37 UTC' },
          '.',
        ],
      },
    });
  });

  it('says one day when a project is a day past due', () => {
    const view = projectPageView(
      page({
        summary: {
          ...summary,
          health: {
            daysSinceLastReport: 1,
            problems: ['stale'],
            marker: { health: 'stale', days: 1 },
          },
        },
        project: { ...project, expectedCadenceDays: 1 },
        lastReportAt: ago(DAY + HOUR),
      }),
      NOW,
    );

    expect(view.hero.stale?.title).toBe('Ostomate 2.0 hasn’t reported in 1 day');
    expect(view.hero.healthDetail).toEqual(['Expected every 1 day']);
  });

  it.each(['empty', 'below_floor', 'not_reporting'] as const)(
    'gives the %s marker no detail, which the design draws for healthy and stale only',
    (health) => {
      const view = projectPageView(
        page({
          summary: {
            ...summary,
            health: { daysSinceLastReport: 0, problems: [], marker: { health } },
          },
        }),
        NOW,
      );
      expect(view.hero).toMatchObject({ health: { health }, healthDetail: null, stale: null });
    },
  );

  describe('latest run card', () => {
    it('leads a passed run with its test count and the tests’ statuses', () => {
      const card = projectPageView(page(), NOW).latestRun;

      expect(card).toEqual({
        status: 'passed',
        when: expect.objectContaining({ text: '2 h ago' }),
        branch: 'main',
        sha: '0e2d0b4',
        href: '/p/ostomate2/runs/run-9',
        figure: '142',
        figureTone: 'ink',
        line: 'tests · 142 passed · 0 failed · 0 skipped · 36 s',
        failing: null,
        passRate30: '100%',
        recovery: { greenStreak: summary.greenStreak, timeToGreen: summary.timeToGreen },
      });
    });

    it('leads a failed run with its failed count and names the first failing test', () => {
      const failedPage = page({
        summary: {
          ...summary,
          latestRun: { ...LATEST, status: 'failed', passed: 1040, failed: 1 },
          totalTests: 1041,
        },
        latestRun: {
          ...LATEST_RUN,
          durationMs: 204_120,
          failing: [
            {
              testKey: 'k1',
              suite: 'packages/shared/src/schemas/asset.test.ts',
              name: 'assetCreateSchema accepts a minimal valid asset',
              platform: 'node',
              status: 'failed',
            },
            { testKey: 'k2', suite: 'z', name: 'later', platform: 'node', status: 'error' },
          ],
        },
        windowPassRate: windowRate(10_446 / 10_450),
      });

      expect(projectPageView(failedPage, NOW).latestRun).toMatchObject({
        status: 'failed',
        figure: '1',
        figureTone: 'fail',
        line: 'failed · 1,040 of 1,041 passed · 204 s',
        failing: {
          short: 'asset.test.ts › assetCreateSchema accepts a minimal valid asset',
          full: 'packages/shared/src/schemas/asset.test.ts › assetCreateSchema accepts a minimal valid asset',
          platform: 'node',
          href: '/p/ostomate2/runs/run-9',
        },
        // 99.96% rounds down to 99.9%: a failing window never reads 100% (decision 2026-09-29).
        passRate30: '99.9%',
      });
    });

    it('says test in the singular at one', () => {
      const one = page({
        summary: { ...summary, totalTests: 1, latestRun: { ...LATEST, passed: 1 } },
      });

      expect(projectPageView(one, NOW).latestRun?.line).toBe(
        'test · 1 passed · 0 failed · 0 skipped · 36 s',
      );
    });

    it('shows a pass rate to one decimal place', () => {
      const view = projectPageView(page({ windowPassRate: windowRate(0.999) }), NOW);
      expect(view.latestRun?.passRate30).toBe('99.9%');
    });

    it('never shows a failing window as 100%', () => {
      // RouteServe's seeded 30 days: 10,446 of 10,450 is 99.96%.
      const rate = 10_446 / 10_450;
      const view = projectPageView(page({ windowPassRate: windowRate(rate) }), NOW);
      expect(view.latestRun?.passRate30).toBe('99.9%');
    });

    it('has no pass rate when the 30 days hold nothing passed or failed', () => {
      const view = projectPageView(page({ windowPassRate: windowRate(null) }), NOW);
      expect(view.latestRun?.passRate30).toBeNull();
    });

    it('cuts a public SHA to 7 characters; a private one arrives cut', () => {
      const view = projectPageView(
        page({
          project: privateProject,
          summary: { ...summary, latestRun: { ...LATEST, commitSha: 'c238574' } },
        }),
        NOW,
      );
      expect(view.latestRun?.sha).toBe('c238574');
    });

    it('dates the latest run instead of timing it when the project is stale', () => {
      const view = projectPageView(
        page({
          summary: {
            ...summary,
            latestRun: { ...LATEST, finishedAt: new Date('2026-09-22T04:40:00Z') },
            health: {
              daysSinceLastReport: 13,
              problems: ['stale'],
              marker: { health: 'stale', days: 13 },
            },
          },
        }),
        NOW,
      );
      expect(view.latestRun?.when).toEqual({
        text: '22 Sep',
        datetime: '2026-09-22T04:40:00.000Z',
        title: '22 Sep 2026, 04:40 UTC',
      });
    });

    it('holds back the figure of an empty run, which the project page does not draw', () => {
      const view = projectPageView(
        page({
          summary: {
            ...summary,
            totalTests: 0,
            latestRun: { ...LATEST, status: 'empty', passed: 0 },
          },
        }),
        NOW,
      );
      expect(view.latestRun).toMatchObject({
        status: 'empty',
        figure: null,
        line: null,
        failing: null,
      });
    });

    it('is absent before the project’s first run', () => {
      const view = projectPageView(
        page({ summary: { ...summary, latestRun: null }, latestRun: null }),
        NOW,
      );
      expect(view.latestRun).toBeNull();
    });
  });

  it('groups the stacks by category, marking a test tool that stands for a declared suite', () => {
    const view = projectPageView(page(), NOW);

    expect(view.built).toEqual([
      {
        category: 'Mobile',
        items: [{ name: 'Kotlin Multiplatform 2.3.21' }, { name: 'Koin 4.2.1' }],
      },
    ]);
    // Design v7 item 8: "Maestro 2.6.1" matches "Maestro E2E (Android)", the version ignored and
    // still shown. A dev-stack tool is never marked, whatever its name.
    expect(view.tested).toEqual([
      {
        category: 'E2E',
        items: [{ name: 'Maestro 2.6.1', declaredStatus: 'runs_in_ci_not_reported' }],
      },
    ]);
  });

  it('leaves a test tool with no matching suite a plain tag', () => {
    const view = projectPageView(
      page({ project: { ...project, testStack: [{ category: 'Runners', items: ['JUnit4'] }] } }),
      NOW,
    );
    expect(view.tested).toEqual([{ category: 'Runners', items: [{ name: 'JUnit4' }] }]);
  });

  it('builds the pyramid from the latest run’s layers, with declared suites beside it', () => {
    const view = projectPageView(page(), NOW);

    expect(view.pyramid).toEqual({
      layers: [
        { label: 'Unit', count: 103, tone: 1 },
        { label: 'Integration', count: 29, tone: 3 },
        { label: 'Visual', count: 10, tone: 2 },
      ],
      declared: project.declaredSuites,
      total: 142,
    });
    expect(view.declared).toBe(project.declaredSuites);
  });

  it('lists coverage against floors, a module with no floor included with none (v8 item 15)', () => {
    expect(projectPageView(page(), NOW).coverage).toEqual([
      { module: 'composeApp', pct: (497 / 527) * 100, floor: 93 },
      { module: 'shared', pct: (457 / 490) * 100, floor: 91 },
      { module: 'extra', pct: 50, floor: null },
    ]);
  });

  it('keys the latest run’s reports by job, module and platform', () => {
    expect(projectPageView(page(), NOW).reports).toEqual([
      { key: 'android/shared/jvm', total: '82' },
      { key: 'android/composeApp/jvm', total: '60' },
      { key: 'ios/composeApp/ios-sim', total: '50' },
    ]);
  });

  describe('run list', () => {
    it('maps each run to a feed row on the project’s run page', () => {
      const view = projectPageView(page(), NOW);

      expect(view.runs).toEqual({
        branches: 'default',
        items: [
          {
            id: 'run-9',
            href: '/p/ostomate2/runs/run-9',
            project: 'Ostomate 2.0',
            branch: 'main',
            sha: '0e2d0b4',
            when: expect.objectContaining({ text: '2 h ago' }),
            visibility: 'public',
            title: 'Push to main',
            status: 'passed',
            // Distinct tests, not the 192 executions (decision 2026-09-29).
            total: 142,
            duration: '36 s',
          },
        ],
        branchHrefs: { default: '/p/ostomate2', all: '/p/ostomate2?branches=all' },
        loadMoreHref: null,
      });
    });

    it('counts a failed run’s failures and an empty run’s reports', () => {
      const view = projectPageView(
        page({
          runs: {
            branches: 'all',
            hasMore: true,
            items: [
              listed({
                id: 'f',
                status: 'failed',
                passed: 1044,
                failed: 1,
                total: 1045,
                tests: { total: 1041, passed: 1040, failed: 1, skipped: 0 },
              }),
              listed({
                id: 'e',
                status: 'empty',
                total: 0,
                passed: 0,
                reports: 3,
                tests: { total: 0, passed: 0, failed: 0, skipped: 0 },
              }),
            ],
          },
        }),
        NOW,
      );

      expect(view.runs.items).toEqual([
        expect.objectContaining({
          id: 'f',
          status: 'failed',
          failed: 1,
          passed: 1040,
          total: 1041,
        }),
        expect.objectContaining({ id: 'e', status: 'empty', reports: 3 }),
      ]);
      // Two shown and 20 more.
      expect(view.runs.loadMoreHref).toBe('/p/ostomate2?branches=all&runs=22');
    });

    it('shows a pruned run with no test count, its duration in its place (v7 item 16)', () => {
      const view = projectPageView(
        page({
          runs: {
            branches: 'default',
            hasMore: false,
            items: [listed({ status: 'failed', passed: 191, failed: 1, total: 192, tests: null })],
          },
        }),
        NOW,
      );

      expect(view.runs.items[0]).toMatchObject({
        status: 'failed',
        pruned: true,
        duration: '36 s',
      });
      expect(view.runs.items[0]).not.toHaveProperty('total');
      expect(view.runs.items[0]).not.toHaveProperty('failed');
    });

    it('titles no row of a private project', () => {
      const view = projectPageView(page({ project: privateProject }), NOW);

      expect(view.runs.items[0]).not.toHaveProperty('title');
      expect(view.runs.items[0]).toMatchObject({
        visibility: 'private',
        href: '/p/routeserve/runs/run-9',
      });
    });
  });

  describe('flaky list', () => {
    const flakyPage = (failures: { failed: number; runs: number }, commits = 2) =>
      page({
        flaky: {
          totalTests: 1041,
          flakeRate: 1 / 1041,
          tests: [
            {
              testKey: 'key-1',
              module: 'packages/shared',
              suite: 'packages/shared/src/schemas/asset.test.ts',
              name: 'assetCreateSchema accepts a minimal valid asset',
              layer: 'unit',
              platforms: ['node', 'ios-sim'],
              failures,
              commits,
            },
          ],
        },
      });

    it('lists flaky tests with their rate, layer and the platforms they flipped on', () => {
      expect(projectPageView(flakyPage({ failed: 4, runs: 10 }), NOW).flaky).toEqual([
        {
          testKey: 'key-1',
          name: 'assetCreateSchema accepts a minimal valid asset',
          suite: 'packages/shared/src/schemas/asset.test.ts',
          rate: 'Failed 4 of last 10 runs',
          layer: 'Unit',
          platforms: 'node, ios-sim',
          href: '/p/ostomate2/tests/key-1',
        },
      ]);
    });

    it('says run in the singular at one, and reads 40 as the design draws it', () => {
      expect(projectPageView(flakyPage({ failed: 1, runs: 1 }), NOW).flaky[0]?.rate).toBe(
        'Failed 1 of last 1 run',
      );
      expect(projectPageView(flakyPage({ failed: 2, runs: 40 }), NOW).flaky[0]?.rate).toBe(
        'Failed 2 of last 40 runs',
      );
    });

    // Design v9 item 12 (components.md StatusTimeline, "Flaky list rate"): a test flaky in the 30
    // days that failed in none of its last runs says how many commits it flipped on instead.
    it('says the commits it flipped on when it failed in none of its last runs', () => {
      expect(projectPageView(flakyPage({ failed: 0, runs: 40 }), NOW).flaky[0]?.rate).toBe(
        'Flipped on 2 commits in 30 days',
      );
      expect(projectPageView(flakyPage({ failed: 0, runs: 3 }, 1), NOW).flaky[0]?.rate).toBe(
        'Flipped on 1 commit in 30 days',
      );
    });
  });

  describe('history', () => {
    const passRatePoint = (
      i: number,
      status: 'passed' | 'failed' | 'empty',
      passed: number,
      failed: number,
    ): ProjectPage['trends']['passRate'][number] => ({
      runId: `r${i}`,
      finishedAt: ago((30 - i) * DAY),
      source: 'ci',
      status,
      passed,
      failed,
      skipped: 0,
      passRate: passed + failed === 0 ? null : passed / (passed + failed),
    });
    const countPoint = (
      i: number,
      totalTests: number | null,
      status: 'passed' | 'failed' | 'empty' = 'passed',
    ): ProjectPage['trends']['testCount'][number] => ({
      runId: `r${i}`,
      finishedAt: ago((30 - i) * DAY),
      status,
      totalTests,
    });
    const durationPoint = (
      i: number,
      durationMs: number,
      status: 'passed' | 'failed' | 'empty' = 'passed',
    ): ProjectPage['trends']['duration'][number] => ({
      runId: `r${i}`,
      finishedAt: ago((30 - i) * DAY),
      status,
      durationMs,
    });
    // RouteServe's ten seeded CI runs on main: P F P P F P F P P F.
    const RED = [1, 4, 6, 9];
    // Each chart's table: every run's finish time and its run page (design v9 items 1 and 2).
    const tableOf = (indices: readonly number[]) => ({
      whens: indices.map((i) => ago((30 - i) * DAY).toISOString()),
      hrefs: indices.map((i) => `/p/ostomate2/runs/r${i}`),
      nowYear: 2026,
    });
    const statusOf = (i: number) => (RED.includes(i) ? 'failed' : 'passed');
    const TEN = Array.from({ length: 10 }, (_, i) => i);
    const [GREEN_MS, RED_MS] = [206_735, 204_120];
    const routeserveTrends: ProjectPage['trends'] = {
      passRate: TEN.map((i) =>
        RED.includes(i) ? passRatePoint(i, 'failed', 1044, 1) : passRatePoint(i, 'passed', 1045, 0),
      ),
      testCount: TEN.map((i) => countPoint(i, 1041, statusOf(i))),
      coverage: [],
      duration: TEN.map((i) => durationPoint(i, RED.includes(i) ? RED_MS : GREEN_MS, statusOf(i))),
    };
    const marks = RED.map((index) => ({ index, status: 'fail' }));

    it('draws pass rate, tests per run and duration, with no coverage chart without coverage', () => {
      const { charts } = projectPageView(page({ trends: routeserveTrends }), NOW).history;
      expect(charts.map((chart) => [chart.title, chart.scope])).toEqual([
        ['Pass rate', 'Default branch · last 30 runs · CI and imported history'],
        ['Tests per run', 'Default branch · last 30 CI runs'],
        ['Run duration', 'Default branch · last 30 CI runs (imported history has no durations)'],
      ]);
    });

    // Design v8 item 3, as the v9 Project Page draws it: one coverage chart per module, in
    // module-key order, between tests per run and run duration, each against its own floor.
    describe('coverage', () => {
      const coveragePoint = (
        i: number,
        linesPct: number | null,
        source: 'ci' | 'backfill' = 'ci',
        status: 'passed' | 'failed' | 'empty' = 'passed',
      ): ProjectPage['trends']['coverage'][number]['points'][number] => ({
        runId: `r${i}`,
        finishedAt: ago((30 - i) * DAY),
        source,
        status,
        form: linesPct === null ? null : source === 'ci' ? 'counts' : 'pct',
        linesPct,
      });
      const trends: ProjectPage['trends'] = {
        ...NO_TRENDS,
        coverage: [
          {
            module: 'composeApp',
            points: [
              coveragePoint(0, 93.6, 'backfill'),
              coveragePoint(1, 94.31, 'backfill'),
              coveragePoint(2, null, 'ci', 'empty'),
            ],
          },
          {
            module: 'extra',
            points: [coveragePoint(0, 40), coveragePoint(1, 50), coveragePoint(2, 45)],
          },
          {
            module: 'shared',
            points: [
              coveragePoint(0, 93.2, 'backfill'),
              coveragePoint(1, 92.95, 'ci', 'failed'),
              coveragePoint(2, 90.4, 'ci'),
            ],
          },
        ],
      };
      const charts = () => projectPageView(page({ trends }), NOW).history.charts;

      it('charts each module in module-key order, between tests per run and duration', () => {
        expect(charts().map((chart) => chart.title)).toEqual([
          'Pass rate',
          'Tests per run',
          'Line coverage, composeApp',
          'Line coverage, extra',
          'Line coverage, shared',
          'Run duration',
        ]);
      });

      it('plots a module’s line coverage against its floor, imported history unlinked', () => {
        expect(charts()[4]).toEqual({
          title: 'Line coverage, shared',
          scope: 'Default branch · last 30 runs · CI and imported history',
          series: [{ name: 'shared', values: [93.2, 92.95, 90.4] }],
          floor: 91,
          marks: [{ index: 1, status: 'fail' }],
          format: 'pct',
          unit: 'run',
          caption: 'Fell from 93.2% to 90.4% over 3 runs; below its 91% floor.',
          whens: [0, 1, 2].map((i) => ago((30 - i) * DAY).toISOString()),
          hrefs: [null, '/p/ostomate2/runs/r1', '/p/ostomate2/runs/r2'],
          nowYear: 2026,
        });
      });

      it('leaves a run without the module a gap, saying so when the latest run had no tests', () => {
        expect(charts()[2]).toMatchObject({
          series: [{ name: 'composeApp', values: [93.6, 94.31, null] }],
          floor: 93,
          marks: [{ index: 2, status: 'empty' }],
          caption:
            'Rose from 93.6% to 94.3% over 2 runs; above its 93% floor. The latest run had no tests.',
        });
      });

      it('draws a module with no floor without one, and says nothing of a floor', () => {
        const extra = charts()[3];
        expect(extra).toMatchObject({ caption: 'Rose from 40.0% to 45.0% over 3 runs.' });
        expect(extra && 'floor' in extra).toBe(false);
      });
    });

    it('plots each run’s pass rate as a percentage, marking the failed runs', () => {
      const [passRate] = projectPageView(page({ trends: routeserveTrends }), NOW).history.charts;
      expect(passRate).toEqual({
        title: 'Pass rate',
        scope: 'Default branch · last 30 runs · CI and imported history',
        series: [
          {
            name: 'Pass rate',
            values: TEN.map((i) => (RED.includes(i) ? (1044 / 1045) * 100 : 100)),
          },
        ],
        marks,
        format: 'pct',
        unit: 'run',
        // 1,044 of 1,045 is 99.90%, rounded down to a tenth.
        caption: '99.9% on the latest run. 4 of the last 10 runs failed.',
        ...tableOf(TEN),
      });
    });

    it('says every run passed when none failed', () => {
      const trends = {
        ...NO_TRENDS,
        passRate: Array.from({ length: 21 }, (_, i) => passRatePoint(i, 'passed', 142, 0)),
      };
      const [passRate] = projectPageView(page({ trends }), NOW).history.charts;
      expect(passRate).toMatchObject({ marks: [], caption: 'All 21 runs passed.' });
    });

    // Design v8 item 34 and v9 item 11 (components.md TrendChart, "Captions with gaps").
    it('leaves a gap and an empty mark for a run with no rate, counting only runs with one', () => {
      const trends = {
        ...NO_TRENDS,
        passRate: [
          passRatePoint(0, 'passed', 5, 0),
          passRatePoint(1, 'empty', 0, 0),
          passRatePoint(2, 'passed', 5, 0),
        ],
      };
      const [passRate] = projectPageView(page({ trends }), NOW).history.charts;
      expect(passRate).toMatchObject({
        series: [{ name: 'Pass rate', values: [100, null, 100] }],
        marks: [{ index: 1, status: 'empty' }],
        caption: 'All 2 runs passed.',
      });
    });

    it('says why the latest run has no rate: no tests, or every test skipped', () => {
      const ending = (status: 'empty' | 'passed') => ({
        ...NO_TRENDS,
        passRate: [
          passRatePoint(0, 'passed', 5, 0),
          passRatePoint(1, 'passed', 5, 0),
          passRatePoint(2, status, 0, 0),
        ],
      });
      const captionOf = (status: 'empty' | 'passed') =>
        projectPageView(page({ trends: ending(status) }), NOW).history.charts[0]?.caption;
      expect(captionOf('empty')).toBe('All 2 runs passed. The latest run had no tests.');
      expect(captionOf('passed')).toBe(
        'All 2 runs passed. The latest run’s tests were all skipped.',
      );
    });

    it('counts tests per run, marking the failed runs', () => {
      const [, tests] = projectPageView(page({ trends: routeserveTrends }), NOW).history.charts;
      expect(tests).toEqual({
        title: 'Tests per run',
        scope: 'Default branch · last 30 CI runs',
        series: [{ name: 'Tests', values: TEN.map(() => 1041) }],
        marks,
        format: 'int',
        unit: 'run',
        caption: 'Held at 1,041 for the last 10 runs.',
        ...tableOf(TEN),
      });
    });

    it('leaves a pruned run a gap in tests per run, counting only runs with a count', () => {
      const trends = {
        ...NO_TRENDS,
        testCount: [countPoint(0, 140), countPoint(1, null), countPoint(2, 142)],
      };
      const [, tests] = projectPageView(page({ trends }), NOW).history.charts;
      expect(tests).toMatchObject({
        series: [{ name: 'Tests', values: [140, null, 142] }],
        caption: 'Grew from 140 to 142 over the last 2 runs.',
      });
    });

    it('plots each run’s duration in seconds with its range and median', () => {
      const [, , duration] = projectPageView(page({ trends: routeserveTrends }), NOW).history
        .charts;
      expect(duration).toEqual({
        title: 'Run duration',
        scope: 'Default branch · last 30 CI runs (imported history has no durations)',
        series: [
          { name: 'Duration', values: TEN.map((i) => (RED.includes(i) ? 204.12 : 206.735)) },
        ],
        marks,
        format: 'dur',
        unit: 'run',
        // 6 green runs of 206.7 s and 4 red of 204.1 s: the median is the mean of two green.
        caption: 'Between 204 s and 207 s over the last 10 runs. Median 207 s.',
        ...tableOf(TEN),
      });
    });

    // Imported history has no run page (design v9 item 2, data-map.md "Chart tables").
    it('links each pass-rate run to its page, except imported history', () => {
      const trends = {
        ...NO_TRENDS,
        passRate: [
          { ...passRatePoint(0, 'passed', 8, 0), source: 'backfill' as const },
          passRatePoint(1, 'passed', 142, 0),
        ],
      };
      const [passRate] = projectPageView(page({ trends }), NOW).history.charts;
      expect(passRate).toMatchObject({ hrefs: [null, '/p/ostomate2/runs/r1'] });
    });

    it('marks an empty run on every chart', () => {
      const trends: ProjectPage['trends'] = {
        passRate: [passRatePoint(0, 'passed', 1, 0), passRatePoint(1, 'empty', 0, 0)],
        testCount: [countPoint(0, 1), countPoint(1, 0, 'empty')],
        coverage: [],
        duration: [durationPoint(0, 1_000), durationPoint(1, 300, 'empty')],
      };
      const { charts } = projectPageView(page({ trends }), NOW).history;
      expect(charts.map((chart) => ('marks' in chart ? chart.marks : undefined))).toEqual([
        [{ index: 1, status: 'empty' }],
        [{ index: 1, status: 'empty' }],
        [{ index: 1, status: 'empty' }],
      ]);
    });

    it('gives each chart no points before the first run', () => {
      const { charts } = projectPageView(page(), NOW).history;
      expect(
        charts.map((chart) => ('series' in chart ? chart.series[0]?.values : undefined)),
      ).toEqual([[], [], []]);
    });

    const stripRun = (
      i: number,
      status: 'passed' | 'failed' | 'empty',
    ): ProjectPage['recentRuns'][number] => ({
      id: `s${i}`,
      ciRunId: `s${i}`,
      runAttempt: 1,
      commitSha: `${i}`.padStart(40, 'a'),
      branch: 'main',
      status,
      passed: 1,
      failed: 0,
      skipped: 0,
      startedAt: ago((10 - i) * DAY),
      finishedAt: ago((10 - i) * DAY),
      source: 'ci',
      event: i === 0 ? 'schedule' : 'push',
      runUrl: null,
      total: 1,
      durationMs: 1_000,
      resultsPrunedAt: null,
    });

    it('lays the last 40 CI runs out as the strip, oldest first, named for the default branch', () => {
      const runs = [stripRun(0, 'passed'), stripRun(1, 'failed'), stripRun(2, 'empty')];
      const { strip } = projectPageView(page({ recentRuns: runs }), NOW).history;
      expect(strip).toEqual({
        defaultBranch: 'main',
        runs: [
          {
            title: 'Scheduled run',
            branch: 'main',
            sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0',
            when: expect.objectContaining({ text: '1 week ago' }),
            href: '/p/ostomate2/runs/s0',
            status: 'passed',
          },
          expect.objectContaining({ title: 'Push to main', status: 'failed' }),
          expect.objectContaining({ href: '/p/ostomate2/runs/s2', status: 'empty' }),
        ],
        // components.md StatusTimeline, "Runs strip note" (design v8 item 33), zero counts left
        // out, over every run the server read (owner decision 2026-09-30).
        note: '1 passed, 1 failed, 1 empty.',
      });
    });

    it('notes a mix of runs, leaving out the statuses no run had', () => {
      const noteOf = (statuses: readonly ('passed' | 'failed' | 'empty')[]) =>
        projectPageView(page({ recentRuns: statuses.map((st, i) => stripRun(i, st)) }), NOW).history
          .strip.note;
      expect(noteOf(['passed', 'failed', 'passed'])).toBe('2 passed, 1 failed.');
      expect(noteOf(['empty', 'passed'])).toBe('1 passed, 1 empty.');
      expect(noteOf(['failed', 'failed'])).toBe('2 failed.');
      expect(noteOf(['empty', 'failed', 'empty'])).toBe('1 failed, 2 empty.');
    });

    // The note counts every run the server read, not the cells that fit (owner decision
    // 2026-09-30): 40 runs read "39 passed, 1 failed." at every width, 390 px included.
    it('counts all 40 runs the server read', () => {
      const runs = Array.from({ length: 40 }, (_, i) => stripRun(i, i === 7 ? 'failed' : 'passed'));
      expect(projectPageView(page({ recentRuns: runs }), NOW).history.strip.note).toBe(
        '39 passed, 1 failed.',
      );
    });

    it('notes when every run in the strip passed', () => {
      const runs = Array.from({ length: 8 }, (_, i) => stripRun(i, 'passed'));
      expect(projectPageView(page({ recentRuns: runs }), NOW).history.strip.note).toBe(
        'All 8 passed.',
      );
    });

    // Design v8 item 33 as v9 item 15 words it; counts cover every run, computed on the server
    // (owner decision 2026-09-30).
    it('reads "1 run, {status}." for a single run', () => {
      const noteOf = (status: 'passed' | 'failed' | 'empty') =>
        projectPageView(page({ recentRuns: [stripRun(0, status)] }), NOW).history.strip.note;
      expect(noteOf('passed')).toBe('1 run, passed.');
      expect(noteOf('failed')).toBe('1 run, failed.');
      expect(noteOf('empty')).toBe('1 run, empty.');
    });

    // Design v9 item 12 (Design System section 11): "No CI runs yet", with the note hidden;
    // imported history alone does not fill the strip.
    it('is the "No CI runs yet" strip, with no note, before the first CI run', () => {
      expect(projectPageView(page(), NOW).history.strip).toEqual({
        runs: [],
        defaultBranch: 'main',
        note: null,
      });
    });
  });
});

describe('projectPageOptions', () => {
  it.each([
    [{}, { branches: 'default', runLimit: undefined }],
    [{ branches: 'all' }, { branches: 'all', runLimit: undefined }],
    [{ branches: 'nope' }, { branches: 'default', runLimit: undefined }],
    [{ branches: ['all', 'default'] }, { branches: 'all', runLimit: undefined }],
    [{ runs: '30' }, { branches: 'default', runLimit: 30 }],
    [{ runs: 'lots' }, { branches: 'default', runLimit: undefined }],
    [{ runs: ['50', '10'] }, { branches: 'default', runLimit: 50 }],
  ])('reads %j as %j', (params, expected) => {
    expect(projectPageOptions(params)).toEqual(expected);
  });
});

describe('runListHref', () => {
  it.each([
    [{ branches: 'default', limit: 10 }, '/p/ostomate2'],
    [{ branches: 'all', limit: 10 }, '/p/ostomate2?branches=all'],
    [{ branches: 'default', limit: 30 }, '/p/ostomate2?runs=30'],
    [{ branches: 'all', limit: 30 }, '/p/ostomate2?branches=all&runs=30'],
  ] as const)('writes %j as %s', (list, href) => {
    expect(runListHref('ostomate2', list)).toBe(href);
  });
});
