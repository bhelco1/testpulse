import { describe, expect, it } from 'vitest';

import type { Layer } from '../ingest/layer-rules';
import type { TestStatus } from '../parsers/types';
import {
  filterResults,
  layersPresent,
  orderResults,
  mismatchSentence,
  platformMismatch,
  statusCounts,
  type TableResult,
} from './table';

const result = (
  suite: string,
  name: string,
  status: TestStatus,
  layer: Layer = 'unit',
): TableResult => ({ suite, name, status, layer });

// A run's results in arrival order, as the page would load them.
const RUN: TableResult[] = [
  result('com.ostomate.app.ui.home.HomeViewModelTest', 'showsDaysOfSupply', 'passed'),
  result(
    'com.ostomate.app.data.ChangeEventDaoTest',
    'insertsAndQueriesByDay',
    'passed',
    'integration',
  ),
  result('com.ostomate.app.ui.HomeScreenshotTest', 'rendersDarkMode', 'skipped', 'visual'),
  result('com.ostomate.app.ui.home.HomeViewModelTest', 'rendersToday', 'failed'),
  result('com.ostomate.app.domain.BackupSerializerTest', 'restoresBackup', 'error'),
  result('com.ostomate.app.data.ChangeEventDaoTest', 'deletesOlderThan', 'passed', 'integration'),
];

const names = (rows: readonly TableResult[]) => rows.map((row) => row.name);

describe('orderResults', () => {
  it('puts failed and error results first, then orders by suite, then by name', () => {
    expect(names(orderResults(RUN))).toEqual([
      // Failing: BackupSerializerTest sorts before HomeViewModelTest.
      'restoresBackup',
      'rendersToday',
      // The rest, by suite and then name: skipped is not a failure. Suites compare as words, so
      // "ui.home.HomeViewModelTest" comes before "ui.HomeScreenshotTest" (punctuation first).
      'deletesOlderThan',
      'insertsAndQueriesByDay',
      'showsDaysOfSupply',
      'rendersDarkMode',
    ]);
  });

  it('treats error exactly like failed, so the suite decides between them', () => {
    const rows = [result('b.Suite', 'x', 'failed'), result('a.Suite', 'y', 'error')];
    expect(names(orderResults(rows))).toEqual(['y', 'x']);
  });

  it('does not change the array it was given', () => {
    const before = names(RUN);
    orderResults(RUN);
    expect(names(RUN)).toEqual(before);
  });

  it('keeps the extra fields of each row', () => {
    const rows = [{ ...result('a', 'b', 'passed'), time: '0.08 s' }];
    expect(orderResults(rows)[0]?.time).toBe('0.08 s');
  });
});

describe('filterResults', () => {
  it('keeps every row for All and all layers', () => {
    expect(filterResults(RUN, { status: 'all', layer: 'all' })).toHaveLength(RUN.length);
  });

  it('keeps only the chosen status', () => {
    expect(names(filterResults(RUN, { status: 'failed', layer: 'all' }))).toEqual(['rendersToday']);
    expect(names(filterResults(RUN, { status: 'error', layer: 'all' }))).toEqual([
      'restoresBackup',
    ]);
    expect(names(filterResults(RUN, { status: 'skipped', layer: 'all' }))).toEqual([
      'rendersDarkMode',
    ]);
  });

  it('keeps only the chosen layer', () => {
    expect(names(filterResults(RUN, { status: 'all', layer: 'integration' }))).toEqual([
      'insertsAndQueriesByDay',
      'deletesOlderThan',
    ]);
  });

  it('applies status and layer together', () => {
    expect(filterResults(RUN, { status: 'failed', layer: 'integration' })).toEqual([]);
    expect(names(filterResults(RUN, { status: 'passed', layer: 'integration' }))).toEqual([
      'insertsAndQueriesByDay',
      'deletesOlderThan',
    ]);
  });
});

describe('statusCounts', () => {
  it('counts every status and the total', () => {
    expect(statusCounts(RUN)).toEqual({ all: 6, passed: 3, failed: 1, error: 1, skipped: 1 });
  });

  it('counts zero for statuses that are absent', () => {
    expect(statusCounts([])).toEqual({ all: 0, passed: 0, failed: 0, error: 0, skipped: 0 });
  });
});

describe('layersPresent', () => {
  it('lists each layer once, in section 8 order rather than arrival order', () => {
    expect(layersPresent(RUN)).toEqual(['unit', 'integration', 'visual']);
  });

  it('is empty for no results', () => {
    expect(layersPresent([])).toEqual([]);
  });
});

// Design v4 items 45 and 46: any difference across platforms in one run is a mismatch. Groups run
// failed, errored, passed, skipped; platforms keep data order inside a group.
describe('platformMismatch', () => {
  it('groups failing platforms first, then passed', () => {
    expect(
      platformMismatch([
        { platform: 'jvm', status: 'passed' },
        { platform: 'ios-sim', status: 'failed' },
      ]),
    ).toEqual([
      { status: 'failed', platforms: ['ios-sim'] },
      { status: 'passed', platforms: ['jvm'] },
    ]);
  });

  it('counts a skipped platform against a failing one as a mismatch', () => {
    expect(
      platformMismatch([
        { platform: 'jvm', status: 'skipped' },
        { platform: 'ios-sim', status: 'failed' },
      ]),
    ).toEqual([
      { status: 'failed', platforms: ['ios-sim'] },
      { status: 'skipped', platforms: ['jvm'] },
    ]);
  });

  it('counts passed against skipped as a mismatch too', () => {
    expect(
      platformMismatch([
        { platform: 'jvm', status: 'skipped' },
        { platform: 'ios-sim', status: 'passed' },
      ]),
    ).toEqual([
      { status: 'passed', platforms: ['ios-sim'] },
      { status: 'skipped', platforms: ['jvm'] },
    ]);
  });

  it('keeps error as its own group, after failed', () => {
    expect(
      platformMismatch([
        { platform: 'jvm', status: 'error' },
        { platform: 'ios-sim', status: 'failed' },
        { platform: 'node', status: 'passed' },
      ]),
    ).toEqual([
      { status: 'failed', platforms: ['ios-sim'] },
      { status: 'error', platforms: ['jvm'] },
      { status: 'passed', platforms: ['node'] },
    ]);
  });

  it('keeps data order inside a group', () => {
    expect(
      platformMismatch([
        { platform: 'jvm', status: 'passed' },
        { platform: 'ios-sim', status: 'failed' },
        { platform: 'android', status: 'passed' },
        { platform: 'chromium', status: 'failed' },
      ]),
    ).toEqual([
      { status: 'failed', platforms: ['ios-sim', 'chromium'] },
      { status: 'passed', platforms: ['jvm', 'android'] },
    ]);
  });

  it('is null when every platform agrees, or when the test ran on one platform', () => {
    expect(
      platformMismatch([
        { platform: 'jvm', status: 'passed' },
        { platform: 'ios-sim', status: 'passed' },
      ]),
    ).toBeNull();
    expect(platformMismatch([{ platform: 'node', status: 'failed' }])).toBeNull();
    expect(platformMismatch([])).toBeNull();
  });
});

// Design v5 item 8: the two examples components.md adds, built from the platforms' statuses.
describe('platformMismatch and mismatchSentence together', () => {
  it('reads "Failed on ios-sim, errored on jvm in the same run."', () => {
    const groups = platformMismatch([
      { platform: 'jvm', status: 'error' },
      { platform: 'ios-sim', status: 'failed' },
    ]);
    expect(groups && mismatchSentence(groups)).toBe(
      'Failed on ios-sim, errored on jvm in the same run.',
    );
  });

  it('reads "Passed on jvm, skipped on ios-sim in the same run."', () => {
    const groups = platformMismatch([
      { platform: 'ios-sim', status: 'skipped' },
      { platform: 'jvm', status: 'passed' },
    ]);
    expect(groups && mismatchSentence(groups)).toBe(
      'Passed on jvm, skipped on ios-sim in the same run.',
    );
  });
});

describe('mismatchSentence', () => {
  it('reads failing platforms first: "Failed on ios-sim, passed on jvm in the same run."', () => {
    expect(
      mismatchSentence([
        { status: 'failed', platforms: ['ios-sim'] },
        { status: 'passed', platforms: ['jvm'] },
      ]),
    ).toBe('Failed on ios-sim, passed on jvm in the same run.');
  });

  it('names a skipped platform: "Failed on ios-sim, skipped on jvm in the same run."', () => {
    expect(
      mismatchSentence([
        { status: 'failed', platforms: ['ios-sim'] },
        { status: 'skipped', platforms: ['jvm'] },
      ]),
    ).toBe('Failed on ios-sim, skipped on jvm in the same run.');
  });

  it('reads error as "errored on" and joins a group’s platforms with ", "', () => {
    expect(
      mismatchSentence([
        { status: 'failed', platforms: ['ios-sim'] },
        { status: 'error', platforms: ['jvm', 'android'] },
        { status: 'passed', platforms: ['node'] },
      ]),
    ).toBe('Failed on ios-sim, errored on jvm, android, passed on node in the same run.');
    expect(
      mismatchSentence([
        { status: 'error', platforms: ['jvm'] },
        { status: 'passed', platforms: ['node'] },
      ]),
    ).toBe('Errored on jvm, passed on node in the same run.');
  });
});
