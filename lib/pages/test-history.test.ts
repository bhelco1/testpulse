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

// A duration point as lib/stats/test-history.ts gives it: each platform's value (none where it
// skipped or did not run) and the cell behind it.
const point = (run: HistoryRun, platforms: readonly string[]) => {
  const cells = platforms.map((p) => run.results.find((c) => c.platform === p) ?? null);
  return {
    runId: run.id,
    finishedAt: run.finishedAt,
    status: run.status,
    durationsMs: cells.map((c) => (c === null || c.status === 'skipped' ? null : c.durationMs)),
    cells,
  };
};

const NO_TILES = {
  flakyCommits: 0,
  failedRuns: 0,
  failedPlatforms: [],
  mismatch: { runs: 0, latest: null },
} as const;

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
  flakyCommits: 0,
  // r3 errored on the JVM: the latest failing run.
  initialRun: 2,
  // r2 failed on the simulator only and r4 skipped there: two runs whose platforms disagree, r4
  // the latest. r3 ran on the JVM alone.
  failedRuns: 2,
  failedPlatforms: ['jvm', 'ios-sim'],
  mismatch: { runs: 2, latest: 3 },
  // The last default-branch CI runs: the pull request is left out, g is a run in which the test
  // did not report (a gap on both platforms), and the skipped simulator result has no value.
  duration: {
    platforms: ['jvm', 'ios-sim'],
    points: [
      point(R1, ['jvm', 'ios-sim']),
      point(historyRun('g', '2026-10-04T12:00:00Z', [], { n: 9 }), ['jvm', 'ios-sim']),
      point(R3, ['jvm', 'ios-sim']),
      point(R4, ['jvm', 'ios-sim']),
    ],
    // jvm: 25, 410, 30 → 30. ios-sim: 3 alone.
    medianMs: [30, 3],
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

  // components.md, Test history page: "Header tags: module · layer · Flaky pill · mismatch
  // headline · New pill" (design v9 items 10 and 16).
  it('names the test, its full suite, module and layer, with the mismatch headline', () => {
    expect(view.header).toEqual({
      name: 'addEventForDateLogsAtNoon',
      suite: 'com.ostomate.app.ui.calendar.CalendarViewModelTest',
      module: 'composeApp',
      layer: 'Unit',
      flaky: false,
      // r4 is the latest run whose platforms disagree: passed on the JVM, skipped on the
      // simulator, 2 h before now.
      mismatch: {
        text: 'Platform mismatch in 2 runs',
        run: 'Push to main',
        when: {
          text: '2 h ago',
          datetime: '2026-10-05T10:00:00.000Z',
          title: '5 Oct 2026, 10:00 UTC',
        },
      },
      // First seen 24 Sep, 11 days before now: not new.
      firstSeen: null,
    });
  });

  // components.md: "Tiles (over the strip's runs: the last 40 CI runs with a result for this
  // test; platform keys verbatim)" (design v8 item 40, v9 item 5).
  it('tiles the runs, failures, flips and median time over the strip', () => {
    expect(view.tiles).toEqual([
      {
        label: 'Runs',
        value: '4',
        // The oldest run, r1, on 3 Oct.
        sub: [
          'since ',
          { text: '3 Oct', datetime: '2026-10-03T20:31:00.000Z', title: '3 Oct 2026, 20:31 UTC' },
        ],
        tone: 'ink',
      },
      { label: 'Failed', value: '2', sub: ['2 runs · jvm, ios-sim'], tone: 'fail' },
      { label: 'Flaky', value: '0', sub: ['none in 30 days'], tone: 'ink' },
      // The JVM's median, 30 ms, as a test's time reads; the simulator's 3 ms beside it.
      { label: 'Median time', value: '0.03 s', sub: ['jvm · ios-sim 0.00 s'], tone: 'ink' },
    ]);
  });

  // components.md: "Strip note: 'Oldest on the left' ... one run 'One run so far'" (v9 item 9).
  it('notes that the oldest run is on the left', () => {
    expect(view.stripNote).toBe('Oldest on the left');
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

  // Design v9 item 18: the project's last 30 default-branch CI runs, each a point; a run where a
  // platform skipped reads "Skipped" there and one where it has no result "Not run".
  it('charts duration per platform at every run, a skip named as one, each run linked', () => {
    // r1, g, r3 and r4; the pull request r2 is not a default-branch run. g keeps its place as a
    // gap on both platforms ("Not run"); r4's simulator skipped. The caption counts only the runs
    // with a value (design v8 item 34), so g is not among its 3.
    expect(view.duration).toEqual({
      title: 'Duration',
      scope: 'Default branch · last 30 CI runs (imported history has no durations)',
      series: [
        { name: 'jvm', values: [0.025, null, 0.41, 0.03], gapLabels: [null, null, null, null] },
        {
          name: 'ios-sim',
          values: [0.003, null, null, null],
          gapLabels: [null, null, null, 'Skipped'],
        },
      ],
      // r3 errored on the JVM: its point, the third, is marked there.
      marks: [{ index: 2, status: 'fail', series: 0 }],
      format: 'sec',
      unit: 'run',
      // Min 3 ms, max 410 ms over the points, gaps left out; no median with two series.
      caption: 'Between 3 ms and 0.41 s over the last 3 runs.',
      whens: [
        '2026-10-03T20:31:00.000Z',
        '2026-10-04T12:00:00.000Z',
        '2026-10-05T09:26:36.000Z',
        '2026-10-05T10:00:00.000Z',
      ],
      hrefs: ['r1', 'g', 'r3', 'r4'].map((id) => `/p/ostomate2/runs/${id}`),
      nowYear: 2026,
    });
  });

  // components.md TrendChart, "Marks" (design v9 item 13): one per run, failed or error over
  // flaky, on the series of the platform that produced it.
  it('marks a failure on the platform that failed, over a flip on another', () => {
    const P1 = historyRun(
      'p1',
      '2026-10-05T10:30:00Z',
      [cell('jvm', 'passed', 30, true), cell('ios-sim', 'failed', 60)],
      { n: 7 },
    );
    const P2 = historyRun(
      'p2',
      '2026-10-05T11:00:00Z',
      [cell('jvm', 'passed', 31), cell('ios-sim', 'passed', 62, true)],
      { n: 8 },
    );
    const marked = testHistoryView(
      page(
        OSTOMATE2,
        {},
        {
          ...TWO_PLATFORMS,
          runs: [P1, P2],
          initialRun: 0,
          duration: {
            platforms: ['jvm', 'ios-sim'],
            points: [point(P1, ['jvm', 'ios-sim']), point(P2, ['jvm', 'ios-sim'])],
            medianMs: [30.5, 61],
          },
        },
      ),
      NOW,
    );
    expect(marked.duration?.marks).toEqual([
      { index: 0, status: 'fail', series: 1 },
      { index: 1, status: 'flaky', series: 1 },
    ]);
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
  flakyCommits: 1,
  // f5 is the latest failure that is not one side of a flip.
  initialRun: 4,
  // f2, the flip's failing side, and f5.
  failedRuns: 2,
  failedPlatforms: ['node'],
  mismatch: { runs: 0, latest: null },
  duration: {
    platforms: ['node'],
    // f4 skipped on its only platform: a gap that reads "Skipped".
    points: F.map((run) => point(run, ['node'])),
    // 100, 120, 140, 250, 300 → 140.
    medianMs: [140],
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
    expect(view.header).toMatchObject({
      module: 'packages/shared',
      layer: 'Unit',
      flaky: true,
      mismatch: null,
    });
  });

  it('tiles two failed runs, one flipped commit, and the one platform’s median', () => {
    expect(view.tiles?.slice(1)).toEqual([
      { label: 'Failed', value: '2', sub: ['2 runs · node'], tone: 'fail' },
      { label: 'Flaky', value: '1', sub: ['commit in 30 days · node'], tone: 'attn' },
      { label: 'Median time', value: '0.14 s', sub: ['last 30 CI runs'], tone: 'ink' },
    ]);
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

  it('marks both sides of the flip with the flaky diamond and the failure as failed', () => {
    expect(view.duration?.series).toEqual([
      {
        name: 'node',
        values: [0.1, 0.25, 0.12, null, 0.3, 0.14],
        gapLabels: [null, null, null, 'Skipped', null, null],
      },
    ]);
    // f2 and f3 are the flip's two sides (v9 item 13: "flaky runs marked with the flaky
    // diamond"); f5 failed.
    expect(view.duration?.marks).toEqual([
      { index: 1, status: 'flaky', series: 0 },
      { index: 2, status: 'flaky', series: 0 },
      { index: 4, status: 'fail', series: 0 },
    ]);
    // Sorted: 0.10, 0.12, 0.14, 0.25, 0.30: min 0.10, max 0.30, median 0.14.
    expect(view.duration?.caption).toBe(
      'Between 0.10 s and 0.30 s over the last 5 runs. Median 0.14 s.',
    );
  });
});

const EMPTY: TestHistory = {
  platforms: [],
  runs: [],
  flaky: false,
  flakyPlatforms: [],
  initialRun: null,
  ...NO_TILES,
  duration: { platforms: [], points: [], medianMs: [] },
};

describe('testHistoryView, new and one-run tests', () => {
  const ONLY = historyRun('n1', '2026-10-05T11:56:00Z', [cell('jvm', 'passed', 410)], { n: 1 });
  const ONE_RUN: TestHistory = {
    ...EMPTY,
    platforms: ['jvm'],
    runs: [ONLY],
    initialRun: 0,
    duration: { platforms: ['jvm'], points: [point(ONLY, ['jvm'])], medianMs: [410] },
  };

  // components.md: "New pill: from tests.first_seen_at (kept through pruning), shown when it is
  // within the last 7 days: 'New · first seen {relative time}'" (design v9 item 10).
  it('says a test first seen within 7 days is new, and when', () => {
    const view = testHistoryView(
      page(OSTOMATE2, { firstSeenAt: new Date('2026-10-05T11:56:00Z') }, ONE_RUN),
      NOW,
    );
    expect(view.header.firstSeen).toEqual({
      text: '4 min ago',
      datetime: '2026-10-05T11:56:00.000Z',
      title: '5 Oct 2026, 11:56 UTC',
    });
  });

  // Days are UTC calendar days, as relative time counts them (components.md, "Relative time"),
  // so the pill never reads "1 week ago".
  it('stops calling it new 7 UTC days after the day it was first seen', () => {
    const at = (firstSeenAt: string) =>
      testHistoryView(page(OSTOMATE2, { firstSeenAt: new Date(firstSeenAt) }, ONE_RUN), NOW).header
        .firstSeen;
    expect(at('2026-09-29T00:00:00Z')?.text).toBe('6 days ago');
    expect(at('2026-09-28T23:59:59Z')).toBeNull();
  });

  it('notes "One run so far" for one run, with tiles for that run', () => {
    const view = testHistoryView(page(OSTOMATE2, {}, ONE_RUN), NOW);
    expect(view.stripNote).toBe('One run so far');
    expect(view.tiles).toEqual([
      {
        label: 'Runs',
        value: '1',
        sub: [
          'since ',
          { text: '5 Oct', datetime: '2026-10-05T11:56:00.000Z', title: '5 Oct 2026, 11:56 UTC' },
        ],
        tone: 'ink',
      },
      { label: 'Failed', value: '0', sub: ['on any platform'], tone: 'ink' },
      { label: 'Flaky', value: '0', sub: ['none in 30 days'], tone: 'ink' },
      { label: 'Median time', value: '0.41 s', sub: ['last 30 CI runs'], tone: 'ink' },
    ]);
  });

  it('says a single mismatched run in the singular', () => {
    const MIXED = historyRun(
      'm1',
      '2026-10-04T05:17:00Z',
      [cell('jvm', 'passed', 25), cell('ios-sim', 'failed', 630)],
      { n: 2, event: 'pull_request', branch: 'fix-today-count' },
    );
    const view = testHistoryView(
      page(
        OSTOMATE2,
        {},
        { ...ONE_RUN, runs: [MIXED], initialRun: 0, mismatch: { runs: 1, latest: 0 } },
      ),
      NOW,
    );
    expect(view.header.mismatch).toMatchObject({
      text: 'Platform mismatch in 1 run',
      run: 'Pull request from fix-today-count',
      when: { text: 'yesterday' },
    });
  });

  // A private project's runs are untitled everywhere on the page (decision 2026-09-29): the
  // headline names the run as the timeline does.
  it('names a private project’s mismatched run "Private repository"', () => {
    const MIXED = historyRun(
      'm1',
      '2026-10-04T05:17:00Z',
      [cell('node', 'passed', 25), cell('ios-sim', 'failed', 630)],
      { n: 2 },
    );
    const view = testHistoryView(
      page(
        ROUTESERVE,
        {},
        { ...ONE_RUN, runs: [MIXED], initialRun: 0, mismatch: { runs: 1, latest: 0 } },
      ),
      NOW,
    );
    expect(view.header.mismatch?.run).toBe('Private repository');
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
      page(OSTOMATE2, {}, { ...EMPTY, platforms: ['jvm'], runs: [onlyPullRequest], initialRun: 0 }),
      NOW,
    );
    // "No runs yet" would be false beside a timeline with a run.
    expect(view.duration).toBeNull();
    expect(view.timeline?.runs).toHaveLength(1);
    // With no default-branch CI run there is no median to give, so that tile is held back.
    expect(view.tiles?.map((tile) => tile.label)).toEqual(['Runs', 'Failed', 'Flaky']);
  });

  it('draws no chart when every run skipped, and no timeline or tiles with no runs', () => {
    const skippedOnly: TestHistory = {
      ...TWO_PLATFORMS,
      runs: [R4],
      initialRun: 0,
      duration: {
        platforms: ['ios-sim'],
        points: [point(R4, ['ios-sim'])],
        medianMs: [null],
      },
    };
    const skipped = testHistoryView(page(OSTOMATE2, {}, skippedOnly), NOW);
    expect(skipped.duration).toBeNull();
    expect(skipped.tiles?.map((tile) => tile.label)).toEqual(['Runs', 'Failed', 'Flaky']);

    const none = testHistoryView(page(OSTOMATE2, {}, EMPTY), NOW);
    expect(none.timeline).toBeNull();
    expect(none.duration).toBeNull();
    expect(none.tiles).toBeNull();
    expect(none.stripNote).toBeNull();
  });

  it('keeps a platform with a value somewhere, and drops one left with none', () => {
    // Two points; the simulator skipped in one and did not run in the other.
    const R5 = historyRun('r5', '2026-10-05T11:00:00Z', [cell('jvm', 'passed', 40)], { n: 5 });
    const history: TestHistory = {
      ...TWO_PLATFORMS,
      runs: [R4, R5],
      initialRun: 1,
      duration: {
        platforms: ['jvm', 'ios-sim'],
        points: [point(R4, ['jvm', 'ios-sim']), point(R5, ['jvm', 'ios-sim'])],
        medianMs: [35, null],
      },
    };
    const view = testHistoryView(page(OSTOMATE2, {}, history), NOW);
    expect(view.duration?.series).toEqual([
      { name: 'jvm', values: [0.03, 0.04], gapLabels: [null, null] },
    ]);
    // The simulator has no median, so the tile names the JVM's alone.
    expect(view.tiles?.at(-1)).toEqual({
      label: 'Median time',
      value: '0.04 s',
      sub: ['last 30 CI runs'],
      tone: 'ink',
    });
  });
});
