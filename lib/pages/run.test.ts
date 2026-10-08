import { describe, expect, it } from 'vitest';

import type { RunDetail } from '../queries/run.ts';
import type { PlatformOutcome, RunTestRow } from '../results/run-results.ts';
import { runPageView } from './run.ts';

// The run page's view of the loader's output (design/pages/Run Detail.dc.html, design/components.md
// ResultsTable, design/data-map.md "Run detail"). Pure: the page passes the loader's result and
// now. Figures are hand-computed from the fixtures below, which take the seed's shapes: Ostomate2's
// three JUnit reports and RouteServe's failing Jest report.

const NOW = new Date('2026-10-05T12:00:00.000Z');
const SHA = '0e2d0b4c1f9a7b3e5d6c8a9b0c1d2e3f4a5b6c7d';
const RUN_ID = '0b5a3c1e-6f0e-4d1c-9a55-3c2a1b0f9e77';

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
  // projects_public nulls both for a private project (section 9).
  repoUrl: null,
};

const report = (
  job: string,
  module: string,
  platform: string,
  counts: { total: number; passed: number; failed: number; skipped: number; durationMs: number },
  finishedAt: string,
  receivedAt: string = finishedAt,
) => ({
  job,
  module,
  platform,
  format: 'junit',
  ...counts,
  startedAt: new Date(finishedAt),
  finishedAt: new Date(finishedAt),
  receivedAt: new Date(receivedAt),
});

const outcome = (
  platform: string,
  status: PlatformOutcome['status'],
  durationMs: number,
  failures: PlatformOutcome['failures'] = [],
): PlatformOutcome => ({ platform, status, durationMs, failures });

const testRow = (
  name: string,
  platforms: PlatformOutcome[],
  extra: Partial<RunTestRow> = {},
): RunTestRow => ({
  testId: `id-${name}`,
  testKey: `${name}-key`,
  module: 'composeApp',
  suite: 'com.ostomate.app.ui.calendar.CalendarViewModelTest',
  name,
  layer: 'unit',
  status: 'passed',
  flaky: false,
  mismatch: null,
  platforms,
  ...extra,
});

// Ostomate2's latest run as seeded: 192 executions of 142 tests, all passed, 35,604 ms.
const PASSING: RunDetail = {
  project: OSTOMATE2,
  run: {
    id: RUN_ID,
    ciRunId: '36100000009',
    runAttempt: 1,
    title: 'Push to main',
    event: 'push',
    branch: 'main',
    commitSha: SHA,
    runUrl: 'https://github.com/bhelco1/Ostomate2/actions/runs/36100000009',
    startedAt: new Date('2026-10-05T09:25:47.312Z'),
    finishedAt: new Date('2026-10-05T09:26:36.000Z'),
    source: 'ci',
    status: 'passed',
    total: 192,
    passed: 192,
    failed: 0,
    skipped: 0,
    durationMs: 35_604,
    reports: 3,
    resultsPrunedAt: null,
    tests: { total: 142, passed: 142, failed: 0, skipped: 0 },
  },
  reports: [
    report(
      'android',
      'composeApp',
      'jvm',
      { total: 60, passed: 60, failed: 0, skipped: 0, durationMs: 17_746 },
      '2026-10-05T09:26:05.000Z',
    ),
    report(
      'android',
      'shared',
      'jvm',
      { total: 82, passed: 82, failed: 0, skipped: 0, durationMs: 17_747 },
      '2026-10-05T09:26:17.747Z',
    ),
    report(
      'ios',
      'composeApp',
      'ios-sim',
      { total: 50, passed: 50, failed: 0, skipped: 0, durationMs: 111 },
      '2026-10-05T09:26:36.000Z',
    ),
  ],
  results: [
    // 25 ms on the JVM and 3 ms on the simulator: the row reads the slower, 0.03 s (25 ms is
    // 0.025 s, which toFixed(2) prints as 0.03).
    testRow('addEventForDateLogsAtNoon', [
      outcome('jvm', 'passed', 25),
      outcome('ios-sim', 'passed', 3),
    ]),
    testRow('rendersMonthGrid', [outcome('jvm', 'passed', 2_840)], {
      suite: 'com.ostomate.app.ui.CalendarScreenshotTest',
      layer: 'visual',
    }),
  ],
};

// RouteServe's latest run as seeded: 1,045 executions of 1,041 tests, one of them failing on
// node, 204,120 ms; the view holds no failure text (RLS returned none).
const PRIVATE_FAILED: RunDetail = {
  project: ROUTESERVE,
  run: {
    ...PASSING.run,
    ciRunId: '36200000011',
    title: 'Push to main',
    commitSha: '5f0a2c9',
    runUrl: null,
    status: 'failed',
    total: 1045,
    passed: 1044,
    failed: 1,
    skipped: 0,
    durationMs: 204_120,
    tests: { total: 1041, passed: 1040, failed: 1, skipped: 0 },
  },
  reports: [
    report(
      'test',
      'packages/shared',
      'node',
      { total: 79, passed: 78, failed: 1, skipped: 0, durationMs: 19_989 },
      '2026-10-05T08:13:55.000Z',
    ),
  ],
  results: [
    // Its one failing result: status and time, and no text, which RLS withheld.
    testRow(
      'assetCreateSchema accepts a minimal valid asset',
      [
        outcome('node', 'failed', 4, [
          { message: null, detail: null, status: 'failed', durationMs: 4 },
        ]),
      ],
      {
        module: 'packages/shared',
        suite: 'packages/shared/src/schemas/asset.test.ts',
        status: 'failed',
        flaky: true,
      },
    ),
  ],
};

describe('runPageView: a public passing run', () => {
  const view = runPageView(PASSING, NOW);

  it('titles the page and its breadcrumbs by the run', () => {
    expect(view.title).toBe('Push to main · Ostomate 2.0 · testpulse');
    expect(view.crumbs).toEqual({
      items: [
        { label: 'Overview', href: '/' },
        { label: 'Ostomate 2.0', href: '/p/ostomate2' },
      ],
      current: 'Run 36100000009',
    });
    expect(view.heading).toEqual({ text: 'Push to main', private: false });
  });

  it('dates the run relatively and states its status', () => {
    expect(view.status).toBe('passed');
    // Finished at 09:26:36, 2 h 33 min before now.
    expect(view.when).toEqual({
      text: '2 h ago',
      datetime: '2026-10-05T09:26:36.000Z',
      title: '5 Oct 2026, 09:26 UTC',
    });
  });

  it('gives branch, the commit linked in full, event, start and the CI run', () => {
    expect(view.meta).toEqual({
      branch: 'main',
      commit: { text: '0e2d0b4', href: `https://github.com/bhelco1/Ostomate2/commit/${SHA}` },
      event: 'push',
      started: {
        text: '5 Oct, 09:25 UTC',
        datetime: '2026-10-05T09:25:47.312Z',
        title: '5 Oct 2026, 09:25 UTC',
      },
      reports: '3',
      attempt: null,
      ciHref: 'https://github.com/bhelco1/Ostomate2/actions/runs/36100000009',
    });
  });

  // design/components.md, Run page: "Reports {n}" counts the run's reports (data-map.md); the
  // Attempt item appears only on a re-run, the heading staying the same for every attempt.
  it('counts the run’s reports, and gives the attempt only on a re-run', () => {
    const retried = runPageView({ ...PASSING, run: { ...PASSING.run, runAttempt: 2 } }, NOW);
    expect(retried.meta).toEqual(expect.objectContaining({ reports: '3', attempt: '2' }));
    expect(retried.heading.text).toBe('Push to main');
    const oneReport = runPageView({ ...PASSING, reports: PASSING.reports.slice(0, 1) }, NOW);
    expect(oneReport.meta.reports).toBe('1');
  });

  it('has no failed-run banner when the run passed', () => {
    expect(view.banner).toBeNull();
  });

  it('counts distinct tests in the tiles, not the 192 executions', () => {
    expect(view.tiles).toEqual({
      tests: '142',
      passed: '142',
      failed: '0',
      skipped: '0',
      duration: '35 s',
      failTone: false,
    });
  });

  it('lists each report with its status, results, tests, time received and duration', () => {
    expect(view.reports).toEqual([
      {
        key: 'android/composeApp/jvm',
        status: 'passed',
        passedShare: 100,
        failedShare: 0,
        skippedShare: 0,
        result: '60 passed',
        tests: '60',
        received: {
          text: '09:26:05',
          datetime: '2026-10-05T09:26:05.000Z',
          title: '5 Oct 2026, 09:26 UTC',
        },
        duration: '17 s',
      },
      expect.objectContaining({ key: 'android/shared/jvm', result: '82 passed', duration: '17 s' }),
      // 111 ms reads as the run durations do, in whole seconds rounded down.
      expect.objectContaining({ key: 'ios/composeApp/ios-sim', tests: '50', duration: '0 s' }),
    ]);
  });

  // data-map.md, Report breakdown: the time is received_at. A job that replays cached result
  // files carries the files' old times, so the receipt is the only true one (decision 2026-10-05).
  it('dates each report by when testpulse received it, not by its files', () => {
    const replayed = runPageView(
      {
        ...PASSING,
        reports: [
          report(
            'android',
            'shared',
            'jvm',
            { total: 82, passed: 82, failed: 0, skipped: 0, durationMs: 17_747 },
            '2026-10-04T15:29:17.747Z',
            '2026-10-05T10:40:12.000Z',
          ),
        ],
      },
      NOW,
    );
    expect(replayed.reports[0]?.received).toEqual({
      text: '10:40:12',
      datetime: '2026-10-05T10:40:12.000Z',
      title: '5 Oct 2026, 10:40 UTC',
    });
  });

  it('makes one results row per test, its time the slowest platform, linked to its history', () => {
    expect(view.results).toEqual({
      kind: 'rows',
      visibility: 'public',
      rows: [
        {
          key: 'addEventForDateLogsAtNoon-key',
          suite: 'com.ostomate.app.ui.calendar.CalendarViewModelTest',
          name: 'addEventForDateLogsAtNoon',
          status: 'passed',
          layer: 'unit',
          flaky: false,
          platforms: [
            { platform: 'jvm', status: 'passed' },
            { platform: 'ios-sim', status: 'passed' },
          ],
          time: '0.03 s',
          historyHref: '/p/ostomate2/tests/addEventForDateLogsAtNoon-key',
          failures: [],
        },
        expect.objectContaining({ name: 'rendersMonthGrid', layer: 'visual', time: '2.84 s' }),
      ],
    });
  });
});

describe('runPageView: a public failing run with several failures', () => {
  const failing: RunDetail = {
    ...PASSING,
    run: { ...PASSING.run, status: 'failed' },
    results: [
      testRow(
        'syncsOnReconnect',
        [
          outcome('jvm', 'error', 520, [
            { message: 'boom', detail: 'at Sync.kt:77', status: 'error', durationMs: 520 },
          ]),
          outcome('ios-sim', 'failed', 880, [
            { message: 'timed out', detail: 'at Timeout.kt:44', status: 'failed', durationMs: 880 },
          ]),
        ],
        { status: 'failed' },
      ),
      testRow(
        'skippedEverywhere',
        [outcome('jvm', 'skipped', 0), outcome('ios-sim', 'skipped', 0)],
        {
          status: 'skipped',
        },
      ),
    ],
  };
  const view = runPageView(failing, NOW);

  it('carries one failure block per failed result, in platform order, each with its own time', () => {
    const [sync, skipped] = view.results?.kind === 'rows' ? view.results.rows : [];
    expect(sync?.time).toBe('0.88 s');
    expect(sync?.failures).toEqual([
      {
        platform: 'jvm',
        status: 'error',
        duration: '0.52 s',
        message: 'boom',
        detail: 'at Sync.kt:77',
      },
      {
        platform: 'ios-sim',
        status: 'failed',
        duration: '0.88 s',
        message: 'timed out',
        detail: 'at Timeout.kt:44',
      },
    ]);
    // Skipped everywhere: no platform ran it, so it has no time.
    expect(skipped?.time).toBe('—');
  });

  it('tints the Failed tile for a failed run', () => {
    expect(view.tiles.failTone).toBe(true);
  });

  // components.md, Run page, and the Design System's failed-run banners (section 10).
  it('names the one failing test in the banner, with its module, layer and mismatch', () => {
    expect(view.banner).toEqual({
      title: '1 test failed: CalendarViewModelTest › syncsOnReconnect',
      body: 'In composeApp, Unit layer. Failed on ios-sim, errored on jvm in the same run.',
      action: 'Show failure',
      filter: 'failed',
    });
  });
});

describe('runPageView: the failed-run banner', () => {
  const failingRow = (
    name: string,
    status: 'failed' | 'error',
    platforms: PlatformOutcome[],
    extra: Partial<RunTestRow> = {},
  ) => testRow(name, platforms, { status, ...extra });
  const failedRun = (results: RunTestRow[]): RunDetail => ({
    ...PASSING,
    run: { ...PASSING.run, status: 'failed' },
    results,
  });

  it('several tests, failed and errored: counts each, lists their modules and platforms', () => {
    const view = runPageView(
      failedRun([
        failingRow('a', 'failed', [outcome('jvm', 'failed', 10), outcome('ios-sim', 'failed', 9)]),
        failingRow('b', 'failed', [outcome('jvm', 'failed', 10)], { module: 'shared' }),
        failingRow('c', 'error', [outcome('jvm', 'error', 10)], { module: 'shared' }),
        testRow('d', [outcome('jvm', 'passed', 10)], { module: 'iosApp' }),
      ]),
      NOW,
    );
    expect(view.banner).toEqual({
      title: '2 failed, 1 errored',
      body: 'In composeApp and shared. On ios-sim and jvm.',
      action: 'Show failures',
      filter: 'failed',
    });
  });

  it('several failed: "{f} tests failed"', () => {
    const view = runPageView(
      failedRun([
        failingRow('a', 'failed', [outcome('jvm', 'failed', 10)]),
        failingRow('b', 'failed', [outcome('jvm', 'failed', 10)]),
        failingRow('c', 'failed', [outcome('jvm', 'failed', 10)]),
      ]),
      NOW,
    );
    expect(view.banner).toMatchObject({
      title: '3 tests failed',
      body: 'In composeApp. On jvm.',
      action: 'Show failures',
    });
  });

  it('only errors: "{e} tests errored", and the button filters to Error', () => {
    const view = runPageView(
      failedRun([
        failingRow('a', 'error', [outcome('jvm', 'error', 10)]),
        failingRow('b', 'error', [outcome('ios-sim', 'error', 10)]),
      ]),
      NOW,
    );
    expect(view.banner).toMatchObject({ title: '2 tests errored', filter: 'error' });
  });

  it('one errored test: "1 test errored: {short suite} › {name}"', () => {
    const view = runPageView(
      failedRun([failingRow('migratesSchema', 'error', [outcome('jvm', 'error', 310)])]),
      NOW,
    );
    expect(view.banner).toEqual({
      title: '1 test errored: CalendarViewModelTest › migratesSchema',
      body: 'In composeApp, Unit layer.',
      action: 'Show failure',
      filter: 'error',
    });
  });

  it('none for a pruned failed run, whose failing tests are no longer known', () => {
    const view = runPageView(
      {
        ...PASSING,
        run: {
          ...PASSING.run,
          status: 'failed',
          resultsPrunedAt: new Date('2026-04-01T03:00:00Z'),
          tests: null,
        },
        results: null,
      },
      NOW,
    );
    expect(view.banner).toBeNull();
  });
});

describe('runPageView: a private failing run', () => {
  const view = runPageView(PRIVATE_FAILED, NOW);

  it('heads the page "Run {id}" with a lock, and titles it the same way', () => {
    expect(view.heading).toEqual({ text: 'Run 36200000011', private: true });
    expect(view.title).toBe('Run 36200000011 · RouteServe · testpulse');
  });

  it('shows the commit cut to 7 characters and unlinked, and no CI link', () => {
    expect(view.meta.commit).toEqual({ text: '5f0a2c9', href: null });
    expect(view.meta.ciHref).toBeNull();
  });

  it('counts 1,041 distinct tests, 1 failed', () => {
    expect(view.tiles).toMatchObject({
      tests: '1,041',
      passed: '1,040',
      failed: '1',
      skipped: '0',
      duration: '3m 24s',
      failTone: true,
    });
  });

  it('draws the failing report’s bar and "{n} failed · {passed} passed"', () => {
    expect(view.reports).toEqual([
      expect.objectContaining({
        key: 'test/packages/shared/node',
        status: 'failed',
        passedShare: (78 / 79) * 100,
        failedShare: (1 / 79) * 100,
        skippedShare: 0,
        result: '1 failed · 78 passed',
        tests: '79',
        duration: '19 s',
      }),
    ]);
  });

  // Design v8 item 18 and v9 item 12: a private project's failure heads are shown, since
  // platform, status and time are not failure text (section 9); the text itself never is.
  it('keeps the failing row, flaky, its failure a head with no text', () => {
    expect(view.results).toMatchObject({ kind: 'rows', visibility: 'private' });
    const [row] = view.results?.kind === 'rows' ? view.results.rows : [];
    expect(row).toMatchObject({
      name: 'assetCreateSchema accepts a minimal valid asset',
      status: 'failed',
      flaky: true,
      time: '4 ms',
      failures: [
        { platform: 'node', status: 'failed', duration: '4 ms', message: null, detail: null },
      ],
      historyHref: '/p/routeserve/tests/assetCreateSchema accepts a minimal valid asset-key',
    });
  });

  it('heads each failing platform with its bare key, status and time, and no text', () => {
    const twoPlatforms: RunDetail = {
      ...PRIVATE_FAILED,
      results: [
        testRow(
          'returns 409 when job overlaps',
          [
            outcome('node', 'failed', 420, [
              { message: null, detail: null, status: 'failed', durationMs: 420 },
            ]),
            outcome('node-24', 'error', 610, [
              { message: null, detail: null, status: 'error', durationMs: 610 },
            ]),
          ],
          { status: 'failed', module: 'apps/backend', layer: 'api' },
        ),
      ],
    };
    const results = runPageView(twoPlatforms, NOW).results;
    const [row] = results?.kind === 'rows' ? results.rows : [];
    expect(row?.failures).toEqual([
      { platform: 'node', status: 'failed', duration: '0.42 s', message: null, detail: null },
      { platform: 'node-24', status: 'error', duration: '0.61 s', message: null, detail: null },
    ]);
  });

  it('says in the banner which test failed, where, and that its text is hidden', () => {
    expect(view.banner).toEqual({
      title: '1 test failed: asset.test.ts › assetCreateSchema accepts a minimal valid asset',
      body:
        'In packages/shared, Unit layer. This repository is private, so failure messages and ' +
        'stack traces are hidden.',
      action: 'Show failure',
      filter: 'failed',
    });
  });

  it('never carries failure text for a private project, even if some reached it', () => {
    const leaked: RunDetail = {
      ...PRIVATE_FAILED,
      results: [
        testRow(
          'x',
          [
            outcome('node', 'failed', 4, [
              { message: 'secret', detail: 'at secret.ts:1', status: 'failed', durationMs: 4 },
            ]),
          ],
          { status: 'failed' },
        ),
      ],
      run: {
        ...PRIVATE_FAILED.run,
        commitSha: SHA,
        runUrl: 'https://github.com/x/y/actions/runs/1',
      },
      project: { ...ROUTESERVE, repoUrl: 'https://github.com/bhelco1/routeserve' },
    };
    const leakedView = runPageView(leaked, NOW);
    const [leakedRow] = leakedView.results?.kind === 'rows' ? leakedView.results.rows : [];
    expect(leakedRow?.failures).toEqual([
      { platform: 'node', status: 'failed', duration: '4 ms', message: null, detail: null },
    ]);
    expect(JSON.stringify(leakedView)).not.toContain('secret');
    expect(JSON.stringify(leakedView)).not.toContain('github.com');
    expect(leakedView.meta.commit).toEqual({ text: '0e2d0b4', href: null });
  });
});

describe('runPageView: pruned, empty and skipped', () => {
  it('a pruned run: the retention note with the run’s own totals and the date it was pruned', () => {
    const pruned: RunDetail = {
      ...PASSING,
      run: { ...PASSING.run, resultsPrunedAt: new Date('2026-09-01T03:00:00Z'), tests: null },
      results: null,
    };
    const view = runPageView(pruned, NOW);
    expect(view.results).toEqual({
      kind: 'pruned',
      totals: { total: 192, passed: 192, failed: 0 },
      // components.md, Run page: "Pruned on {date}" in the one date format (v8 item 31).
      prunedOn: {
        text: '1 Sep',
        datetime: '2026-09-01T03:00:00.000Z',
        title: '1 Sep 2026, 03:00 UTC',
      },
    });
    // With no per-test rows left, the tiles read the run's executions too.
    expect(view.tiles).toMatchObject({ tests: '192', passed: '192', failed: '0', skipped: '0' });
  });

  it('a run pruned in another year carries the year', () => {
    const pruned: RunDetail = {
      ...PASSING,
      run: { ...PASSING.run, resultsPrunedAt: new Date('2027-03-23T03:00:00Z'), tests: null },
      results: null,
    };
    expect(runPageView(pruned, NOW).results).toMatchObject({ prunedOn: { text: '23 Mar 2027' } });
  });

  const emptyRun = (reports: RunDetail['reports']): RunDetail => ({
    ...PASSING,
    run: {
      ...PASSING.run,
      status: 'empty',
      total: 0,
      passed: 0,
      tests: { total: 0, passed: 0, failed: 0, skipped: 0 },
      reports: reports.length,
    },
    reports,
    results: [],
  });
  const noTests = (job: string, module: string, platform: string) =>
    report(
      job,
      module,
      platform,
      { total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 0 },
      '2026-10-05T09:26:17.747Z',
    );

  // components.md, Run page, and the Design System's "RESULTS · empty run".
  it('an empty run: Results says how many reports arrived with no test cases, and no banner', () => {
    const view = runPageView(
      emptyRun([
        noTests('android', 'shared', 'jvm'),
        noTests('android', 'composeApp', 'jvm'),
        noTests('ios', 'composeApp', 'ios-sim'),
      ]),
      NOW,
    );
    expect(view.status).toBe('empty');
    expect(view.banner).toBeNull();
    expect(view.results).toEqual({
      kind: 'empty',
      body: '3 reports arrived, but none held any test cases.',
    });
  });

  it('an empty run of one report: "1 report arrived, but it held no test cases."', () => {
    const view = runPageView(emptyRun([noTests('android', 'shared', 'jvm')]), NOW);
    expect(view.results).toEqual({
      kind: 'empty',
      body: '1 report arrived, but it held no test cases.',
    });
  });

  // v8 item 27: Empty status, a dashed track, "No tests in this report", tests "0", time "—".
  it('a report with no test cases reads Empty', () => {
    const view = runPageView(emptyRun([noTests('android', 'shared', 'jvm')]), NOW);
    expect(view.reports).toEqual([
      {
        key: 'android/shared/jvm',
        status: 'empty',
        passedShare: 0,
        failedShare: 0,
        skippedShare: 0,
        result: 'No tests in this report',
        tests: '0',
        received: {
          text: '09:26:17',
          datetime: '2026-10-05T09:26:17.747Z',
          title: '5 Oct 2026, 09:26 UTC',
        },
        duration: '—',
      },
    ]);
  });

  // v8 item 26: the bar runs passed, failed, skipped; zero parts are left out of the line.
  it('a report with skipped tests: its share is drawn and counted in the line', () => {
    const skipping = (counts: { passed: number; failed: number; skipped: number }): RunDetail => ({
      ...PASSING,
      reports: [
        report(
          'e2e',
          'tests',
          'chromium',
          { total: counts.passed + counts.failed + counts.skipped, ...counts, durationMs: 4_200 },
          '2026-09-22T12:00:00.000Z',
        ),
      ],
    });
    expect(runPageView(skipping({ passed: 1, failed: 1, skipped: 1 }), NOW).reports).toEqual([
      expect.objectContaining({
        status: 'failed',
        passedShare: (1 / 3) * 100,
        failedShare: (1 / 3) * 100,
        skippedShare: (1 / 3) * 100,
        result: '1 failed · 1 passed · 1 skipped',
      }),
    ]);
    expect(runPageView(skipping({ passed: 54, failed: 0, skipped: 6 }), NOW).reports).toEqual([
      expect.objectContaining({ status: 'passed', result: '54 passed · 6 skipped' }),
    ]);
    expect(runPageView(skipping({ passed: 0, failed: 0, skipped: 5 }), NOW).reports).toEqual([
      expect.objectContaining({ status: 'passed', result: '5 skipped', skippedShare: 100 }),
    ]);
  });

  it('a public project with no repository: the commit is unlinked', () => {
    const view = runPageView({ ...PASSING, project: { ...OSTOMATE2, repoUrl: null } }, NOW);
    expect(view.meta.commit).toEqual({ text: '0e2d0b4', href: null });
  });
});
