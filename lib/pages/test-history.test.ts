import { describe, expect, it } from 'vitest';

import type { RunDetail } from '../queries/run.ts';
import type { TestHistoryPage } from '../queries/test-history.ts';
import type { HistoryCell, HistoryRun, TestHistory } from '../stats/test-history.ts';
import { testHistoryView } from './test-history.ts';

// The test history page's view of the loader's output (design/pages/Test History.dc.html,
// design/components.md StatusTimeline and TrendChart, design/data-map.md "Test history"). Pure:
// the page passes the loader's result and now. The histories below are written as
// lib/stats/test-history.ts returns them, in the seed's shapes; every expected figure is worked
// out by hand beside it.

const NOW = new Date('2026-10-05T12:00:00.000Z');
const KEY = 'a'.repeat(64);

const OSTOMATE2: RunDetail['project'] = {
  id: 'p1',
  slug: 'ostomate2',
  name: 'Ostomate 2.0',
  tagline: 'Local-first ostomy supply tracker.',
  visibility: 'public',
  defaultBranch: 'main',
  declaredSuites: [],
  coverageFloors: {},
  expectedCadenceDays: 8,
  description: 'Tracks supply changes.',
  repoUrl: 'https://github.com/bhelco1/Ostomate2',
  devStack: [],
  testStack: [],
};

const ROUTESERVE: RunDetail['project'] = {
  ...OSTOMATE2,
  id: 'p2',
  slug: 'routeserve',
  name: 'RouteServe',
  visibility: 'private',
  repoUrl: null,
};

const sha = (n: number) => `${String(n).repeat(7)}${'f'.repeat(33)}`;

const cell = (
  platform: string,
  status: HistoryCell['status'],
  durationMs: number,
  flaky = false,
): HistoryCell => ({ platform, status, durationMs, flaky });

function historyRun(
  id: string,
  finishedAt: string,
  results: readonly HistoryCell[],
  { n, event = 'push', branch = 'main' }: { n: number; event?: string; branch?: string },
): HistoryRun {
  return {
    id,
    title: event === 'pull_request' ? `Pull request from ${branch}` : `Push to ${branch}`,
    event,
    branch,
    commitSha: sha(n),
    runUrl: null,
    finishedAt: new Date(finishedAt),
    source: 'ci',
    status: results.some((c) => c.status === 'failed' || c.status === 'error')
      ? 'failed'
      : 'passed',
    results,
  };
}

const point = (run: HistoryRun, durationsMs: readonly (number | null)[]) => ({
  runId: run.id,
  finishedAt: run.finishedAt,
  status: run.status,
  durationsMs,
});

// Ostomate2's addEventForDateLogsAtNoon, reshaped: two platforms, a pull request that failed on
// the simulator, a push that errored on the JVM and did not run on the simulator, and a push
// that passed on the JVM and skipped on the simulator.
const R1 = historyRun(
  'r1',
  '2026-10-03T20:31:00Z',
  [cell('jvm', 'passed', 25), cell('ios-sim', 'passed', 3)],
  { n: 1 },
);
const R2 = historyRun(
  'r2',
  '2026-10-04T05:17:00Z',
  [cell('jvm', 'passed', 25), cell('ios-sim', 'failed', 630)],
  { n: 2, event: 'pull_request', branch: 'seed/pull-request' },
);
const R3 = historyRun('r3', '2026-10-05T09:26:36Z', [cell('jvm', 'error', 410)], { n: 3 });
const R4 = historyRun(
  'r4',
  '2026-10-05T10:00:00Z',
  [cell('jvm', 'passed', 30), cell('ios-sim', 'skipped', 0)],
  { n: 4 },
);

const TWO_PLATFORMS: TestHistory = {
  platforms: ['jvm', 'ios-sim'],
  runs: [R1, R2, R3, R4],
  flaky: false,
  flakyPlatforms: [],
  // r3 errored on the JVM: the latest failing run.
  initialRun: 2,
  // The last default-branch CI runs: the pull request is left out, g is a run in which the test
  // did not report (a gap on both platforms), and the skipped simulator result has no value.
  duration: {
    platforms: ['jvm', 'ios-sim'],
    points: [
      point(R1, [25, 3]),
      point(historyRun('g', '2026-10-04T12:00:00Z', [], { n: 9 }), [null, null]),
      point(R3, [410, null]),
      point(R4, [30, null]),
    ],
  },
};

const page = (
  project: RunDetail['project'],
  test: Partial<TestHistoryPage['test']>,
  history: TestHistory,
): TestHistoryPage => ({
  project,
  test: {
    testKey: KEY,
    module: 'composeApp',
    suite: 'com.ostomate.app.ui.calendar.CalendarViewModelTest',
    name: 'addEventForDateLogsAtNoon',
    layer: 'unit',
    firstSeenAt: new Date('2026-09-24T14:05:00Z'),
    lastSeenAt: new Date('2026-10-05T09:26:36Z'),
    ...test,
  },
  history,
});

describe('testHistoryView', () => {
  const view = testHistoryView(page(OSTOMATE2, {}, TWO_PLATFORMS), NOW);

  it('titles the page and its breadcrumbs by the test, its suite shortened', () => {
    expect(view.title).toBe('addEventForDateLogsAtNoon · Ostomate 2.0 · testpulse');
    expect(view.crumbs).toEqual({
      items: [
        { label: 'Overview', href: '/' },
        { label: 'Ostomate 2.0', href: '/p/ostomate2' },
      ],
      current: 'CalendarViewModelTest › addEventForDateLogsAtNoon',
    });
  });

  it('names the test, its full suite and its layer; not flaky', () => {
    expect(view.header).toEqual({
      name: 'addEventForDateLogsAtNoon',
      suite: 'com.ostomate.app.ui.calendar.CalendarViewModelTest',
      layer: 'Unit',
      flaky: false,
    });
  });

  it('gives the timeline every run, oldest first, timed per platform, opening on r3', () => {
    expect(view.timeline).toEqual({
      testName: 'addEventForDateLogsAtNoon',
      private: false,
      initialRun: 2,
      runs: [
        {
          title: 'Push to main',
          branch: 'main',
          sha: sha(1),
          // 39 h 29 min before now, two UTC calendar days back.
          when: {
            text: '2 days ago',
            datetime: '2026-10-03T20:31:00.000Z',
            title: '3 Oct 2026, 20:31 UTC',
          },
          href: '/p/ostomate2/runs/r1',
          // 25 ms and 3 ms, as the design prints a test's time.
          results: [
            { platform: 'jvm', status: 'passed', duration: '0.03 s' },
            { platform: 'ios-sim', status: 'passed', duration: '0.00 s' },
          ],
        },
        {
          title: 'Pull request from seed/pull-request',
          branch: 'seed/pull-request',
          sha: sha(2),
          // 30 h 43 min: past 24 hours and one calendar day back.
          when: {
            text: 'yesterday',
            datetime: '2026-10-04T05:17:00.000Z',
            title: '4 Oct 2026, 05:17 UTC',
          },
          href: '/p/ostomate2/runs/r2',
          results: [
            { platform: 'jvm', status: 'passed', duration: '0.03 s' },
            { platform: 'ios-sim', status: 'failed', duration: '0.63 s' },
          ],
        },
        {
          title: 'Push to main',
          branch: 'main',
          sha: sha(3),
          when: {
            text: '2 h ago',
            datetime: '2026-10-05T09:26:36.000Z',
            title: '5 Oct 2026, 09:26 UTC',
          },
          href: '/p/ostomate2/runs/r3',
          // No simulator result: the timeline draws "not run" there.
          results: [{ platform: 'jvm', status: 'error', duration: '0.41 s' }],
        },
        {
          title: 'Push to main',
          branch: 'main',
          sha: sha(4),
          when: {
            text: '2 h ago',
            datetime: '2026-10-05T10:00:00.000Z',
            title: '5 Oct 2026, 10:00 UTC',
          },
          href: '/p/ostomate2/runs/r4',
          results: [
            { platform: 'jvm', status: 'passed', duration: '0.03 s' },
            { platform: 'ios-sim', status: 'skipped', duration: '0.00 s' },
          ],
        },
      ],
    });
  });

  it('charts duration per platform, with a gap for g and r4 held back for its skip', () => {
    // r1, g and r3; the pull request r2 is not a default-branch run. g keeps its place as a gap
    // on both platforms, where the tooltip reads "Not run", which is true. r4's simulator skipped, and
    // whether a skipped result reads "Not run" or "Skipped" is undecided (design v8 item 17), so
    // its point is left out rather than printed as "Not run".
    expect(view.duration).toEqual({
      title: 'Duration',
      scope: 'Default branch · CI runs only (imported history has no durations)',
      series: [
        { name: 'jvm', values: [0.025, null, 0.41] },
        { name: 'ios-sim', values: [0.003, null, null] },
      ],
      // r3 errored on the JVM: its point, the third, is marked.
      marks: [{ index: 2, status: 'fail' }],
      format: 'sec',
      unit: 'run',
      // Min 3 ms, max 410 ms over the three points, gaps left out; no median with two series.
      caption: 'Between 0.00 s and 0.41 s over the last 3 runs.',
    });
  });
});

// RouteServe's flaky test, reshaped: one platform, a flip on commit 2 (failed, then passed on a
// second attempt), a skipped run, a real failure and a pass.
const F = [
  historyRun('f1', '2026-09-26T17:14:00Z', [cell('node', 'passed', 100)], { n: 1 }),
  historyRun('f2', '2026-09-29T13:07:00Z', [cell('node', 'failed', 250, true)], { n: 2 }),
  historyRun('f3', '2026-09-29T13:33:00Z', [cell('node', 'passed', 120, true)], { n: 2 }),
  historyRun('f4', '2026-10-01T10:22:00Z', [cell('node', 'skipped', 0)], { n: 4 }),
  historyRun('f5', '2026-10-02T09:57:00Z', [cell('node', 'failed', 300)], { n: 5 }),
  historyRun('f6', '2026-10-05T08:13:55Z', [cell('node', 'passed', 140)], { n: 6 }),
] as const;

const FLAKY: TestHistory = {
  platforms: ['node'],
  runs: F,
  flaky: true,
  flakyPlatforms: ['node'],
  // f5 is the latest failure that is not one side of a flip.
  initialRun: 4,
  duration: {
    platforms: ['node'],
    // f4 skipped on its only platform: the loader gives it no point.
    points: [
      point(F[0], [100]),
      point(F[1], [250]),
      point(F[2], [120]),
      point(F[3], [null]),
      point(F[4], [300]),
      point(F[5], [140]),
    ],
  },
};

describe('testHistoryView, a private project’s flaky test', () => {
  const view = testHistoryView(
    page(
      ROUTESERVE,
      {
        module: 'packages/shared',
        suite: 'packages/shared/src/schemas/asset.test.ts',
        name: 'assetCreateSchema accepts a minimal valid asset',
      },
      FLAKY,
    ),
    NOW,
  );

  it('shortens a path suite to its file and marks the test flaky', () => {
    expect(view.crumbs.current).toBe(
      'asset.test.ts › assetCreateSchema accepts a minimal valid asset',
    );
    expect(view.header).toMatchObject({ layer: 'Unit', flaky: true });
  });

  it('draws both sides of the flip as Flaky, untitles the runs and opens on f5', () => {
    expect(view.timeline?.private).toBe(true);
    expect(view.timeline?.initialRun).toBe(4);
    expect(view.timeline?.runs.map((run) => run.results.map((r) => r.status))).toEqual([
      ['passed'],
      ['flaky'],
      ['flaky'],
      ['skipped'],
      ['failed'],
      ['passed'],
    ]);
    expect(view.timeline?.runs.map((run) => run.href)).toEqual(
      ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'].map((id) => `/p/routeserve/runs/${id}`),
    );
  });

  it('marks only the failure that is not flaky, and gives the single-series median', () => {
    expect(view.duration?.series).toEqual([{ name: 'node', values: [0.1, 0.25, 0.12, 0.3, 0.14] }]);
    // f2's failing side of the flip would be an amber mark in the mock, which TrendChart can only
    // name "Run empty"; it is held back. f5 (index 3) failed.
    expect(view.duration?.marks).toEqual([{ index: 3, status: 'fail' }]);
    // Sorted: 0.10, 0.12, 0.14, 0.25, 0.30: min 0.10, max 0.30, median 0.14.
    expect(view.duration?.caption).toBe(
      'Between 0.10 s and 0.30 s over the last 5 runs. Median 0.14 s.',
    );
  });
});

describe('testHistoryView, undrawn states held back', () => {
  it('draws no duration chart when no default-branch CI run has a value', () => {
    const onlyPullRequest = historyRun('p1', '2026-10-04T05:17:00Z', [cell('jvm', 'passed', 25)], {
      n: 1,
      event: 'pull_request',
      branch: 'feature',
    });
    const view = testHistoryView(
      page(
        OSTOMATE2,
        {},
        {
          platforms: ['jvm'],
          runs: [onlyPullRequest],
          flaky: false,
          flakyPlatforms: [],
          initialRun: 0,
          duration: { platforms: [], points: [] },
        },
      ),
      NOW,
    );
    // "No runs yet" would be false beside a timeline with a run.
    expect(view.duration).toBeNull();
    expect(view.timeline?.runs).toHaveLength(1);
  });

  it('draws no chart when every point was held back, and no timeline with no runs', () => {
    const skippedOnly: TestHistory = {
      ...TWO_PLATFORMS,
      runs: [R4],
      initialRun: 0,
      duration: { platforms: ['jvm', 'ios-sim'], points: [point(R4, [30, null])] },
    };
    expect(testHistoryView(page(OSTOMATE2, {}, skippedOnly), NOW).duration).toBeNull();

    const none = testHistoryView(
      page(
        OSTOMATE2,
        {},
        {
          platforms: [],
          runs: [],
          flaky: false,
          flakyPlatforms: [],
          initialRun: null,
          duration: { platforms: [], points: [] },
        },
      ),
      NOW,
    );
    expect(none.timeline).toBeNull();
    expect(none.duration).toBeNull();
  });

  it('keeps a platform with a value somewhere, and drops one left with none', () => {
    // Two points; the simulator's only value was in the held-back point.
    const R5 = historyRun('r5', '2026-10-05T11:00:00Z', [cell('jvm', 'passed', 40)], { n: 5 });
    const history: TestHistory = {
      ...TWO_PLATFORMS,
      runs: [R4, R5],
      initialRun: 1,
      duration: {
        platforms: ['jvm', 'ios-sim'],
        points: [point(R4, [30, null]), point(R5, [40, null])],
      },
    };
    const onePoint = testHistoryView(page(OSTOMATE2, {}, history), NOW).duration;
    expect(onePoint?.series).toEqual([{ name: 'jvm', values: [0.04] }]);
    // One point: the chart's one-run text stands in for a caption.
    expect(onePoint?.caption).toBeNull();
  });
});
