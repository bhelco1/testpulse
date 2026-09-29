import { describe, expect, it } from 'vitest';

import type { ProjectPage } from '../queries/project.ts';
import type { ListedRun } from '../queries/run-rows.ts';
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

const listed = (overrides: Partial<ListedRun> = {}): ListedRun => ({
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
  total: 192,
  passed: 192,
  failed: 0,
  skipped: 0,
  durationMs: 35_604,
  reports: 3,
  ...overrides,
});

const windowRate = (passRate: number | null) => ({
  runs: 14,
  passed: 2388,
  failed: 0,
  skipped: 0,
  passRate,
});

const trends = (passRate: number | null): ProjectPage['trends'][30] => ({
  passRate: { runs: [], days: [] },
  windowPassRate: windowRate(passRate),
  runCount: [],
  coverage: [],
  duration: [],
  testCount: [],
});

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
  trends: { 30: trends(1), 90: trends(1) },
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
      healthDetail: 'Last report 2 hours ago',
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
      healthDetail: 'Expected every 8 days',
      stale: {
        title: 'Ostomate 2.0 hasn’t reported in 13 days',
        // 2026-09-22 + 8 days = 2026-09-30.
        body:
          'The weekly scheduled run should have posted by Sep 30. Its CI may be failing ' +
          'silently. Everything below is from the last report, Sep 22.',
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
    expect(view.hero.healthDetail).toBe('Expected every 1 day');
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
        when: '2 hours ago',
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
        trends: { 30: trends(10_446 / 10_450), 90: trends(1) },
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
        // 99.96% rounds to 100% at the one decimal the site shows rates at.
        passRate30: '100%',
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
      const view = projectPageView(page({ trends: { 30: trends(0.999), 90: trends(1) } }), NOW);
      expect(view.latestRun?.passRate30).toBe('99.9%');
    });

    it('has no pass rate when the 30 days hold nothing passed or failed', () => {
      const view = projectPageView(page({ trends: { 30: trends(null), 90: trends(1) } }), NOW);
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
      expect(view.latestRun?.when).toBe('Sep 22');
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

  it('groups the stacks by category, with no declared-suite status (pending design)', () => {
    const view = projectPageView(page(), NOW);

    expect(view.built).toEqual([
      {
        category: 'Mobile',
        items: [{ name: 'Kotlin Multiplatform 2.3.21' }, { name: 'Koin 4.2.1' }],
      },
    ]);
    expect(view.tested).toEqual([{ category: 'E2E', items: [{ name: 'Maestro 2.6.1' }] }]);
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

  it('lists coverage against floors, leaving out a module that has no floor', () => {
    expect(projectPageView(page(), NOW).coverage).toEqual([
      { module: 'composeApp', pct: (497 / 527) * 100, floor: 93 },
      { module: 'shared', pct: (457 / 490) * 100, floor: 91 },
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
            when: '2 hours ago',
            visibility: 'public',
            title: 'Push to main',
            status: 'passed',
            total: 192,
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
              listed({ id: 'f', status: 'failed', passed: 1044, failed: 1, total: 1045 }),
              listed({ id: 'e', status: 'empty', total: 0, passed: 0, reports: 3 }),
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
          passed: 1044,
          total: 1045,
        }),
        expect.objectContaining({ id: 'e', status: 'empty', reports: 3 }),
      ]);
      // Two shown and 20 more.
      expect(view.runs.loadMoreHref).toBe('/p/ostomate2?branches=all&runs=22');
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

  it('lists flaky tests with their layer and the platforms they flipped on', () => {
    const view = projectPageView(
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
            },
          ],
        },
      }),
      NOW,
    );

    expect(view.flaky).toEqual([
      {
        testKey: 'key-1',
        name: 'assetCreateSchema accepts a minimal valid asset',
        suite: 'packages/shared/src/schemas/asset.test.ts',
        layer: 'Unit',
        platforms: 'node, ios-sim',
        href: '/p/ostomate2/tests/key-1',
      },
    ]);
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
