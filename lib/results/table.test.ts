import { describe, expect, it } from 'vitest';

import type { Layer } from '../ingest/layer-rules';
import type { TestStatus } from '../parsers/types';
import {
  filterResults,
  layersPresent,
  orderResults,
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

describe('platformMismatch', () => {
  it('names the passing and failing platforms when they disagree', () => {
    expect(
      platformMismatch([
        { platform: 'jvm', status: 'passed' },
        { platform: 'ios-sim', status: 'failed' },
      ]),
    ).toEqual({ passed: ['jvm'], failed: ['ios-sim'] });
  });

  it('counts error as failing', () => {
    expect(
      platformMismatch([
        { platform: 'jvm', status: 'error' },
        { platform: 'ios-sim', status: 'passed' },
      ]),
    ).toEqual({ passed: ['ios-sim'], failed: ['jvm'] });
  });

  it('is null when every platform agrees, or when the test ran on one platform', () => {
    expect(
      platformMismatch([
        { platform: 'jvm', status: 'passed' },
        { platform: 'ios-sim', status: 'passed' },
      ]),
    ).toBeNull();
    expect(
      platformMismatch([
        { platform: 'jvm', status: 'failed' },
        { platform: 'ios-sim', status: 'error' },
      ]),
    ).toBeNull();
    expect(platformMismatch([{ platform: 'node', status: 'failed' }])).toBeNull();
  });

  // The design draws only a pass against a fail; a skipped platform is not a mismatch it shows.
  it('ignores skipped platforms', () => {
    expect(
      platformMismatch([
        { platform: 'jvm', status: 'skipped' },
        { platform: 'ios-sim', status: 'failed' },
      ]),
    ).toBeNull();
  });
});
