import { describe, expect, it } from 'vitest';

import { combinedStatus, runTestRows, type RunResultInput } from './run-results.ts';

// The run page's results, one row per test (design/components.md, ResultsTable): each test's
// results across the run's report platforms, with section 11's per-run platform mismatch and
// flaky flag, and failure text where row-level security returned it (section 9).

const result = (
  resultId: string,
  testId: string,
  platform: string,
  status: RunResultInput['status'],
  overrides: Partial<RunResultInput> = {},
): RunResultInput => ({
  resultId,
  testId,
  testKey: `key-${testId}`,
  module: 'composeApp',
  suite: 'com.ostomate.app.HomeViewModelTest',
  name: testId,
  layer: 'unit',
  status,
  durationMs: 100,
  job: platform === 'jvm' ? 'android' : 'ios',
  platform,
  ...overrides,
});

describe('combinedStatus', () => {
  it('puts failing first: failed, then error, then passed, then skipped', () => {
    expect(combinedStatus(['passed', 'skipped', 'failed', 'error'])).toBe('failed');
    expect(combinedStatus(['passed', 'error', 'skipped'])).toBe('error');
    expect(combinedStatus(['skipped', 'passed'])).toBe('passed');
    expect(combinedStatus(['skipped'])).toBe('skipped');
  });

  it('refuses an empty list rather than inventing a status', () => {
    expect(() => combinedStatus([])).toThrow('no results');
  });
});

describe('runTestRows', () => {
  it('has no rows for a run with no results', () => {
    expect(runTestRows([], new Map(), new Set())).toEqual([]);
  });

  it('makes one row per test with each platform’s result, in report order', () => {
    // android/composeApp/jvm sorts before ios/composeApp/ios-sim, so the JVM comes first.
    const rows = runTestRows(
      [
        result('r2', 't1', 'ios-sim', 'passed', { durationMs: 630 }),
        result('r1', 't1', 'jvm', 'passed', { durationMs: 410 }),
      ],
      new Map(),
      new Set(),
    );
    expect(rows).toEqual([
      {
        testId: 't1',
        testKey: 'key-t1',
        module: 'composeApp',
        suite: 'com.ostomate.app.HomeViewModelTest',
        name: 't1',
        layer: 'unit',
        status: 'passed',
        flaky: false,
        mismatch: null,
        platforms: [
          { platform: 'jvm', status: 'passed', durationMs: 410, failures: [] },
          { platform: 'ios-sim', status: 'passed', durationMs: 630, failures: [] },
        ],
      },
    ]);
  });

  it('reports a platform mismatch and takes the failing status for the row', () => {
    const [row] = runTestRows(
      [result('r1', 't1', 'jvm', 'passed'), result('r2', 't1', 'ios-sim', 'failed')],
      new Map([['r2', { message: 'expected 3', detail: 'at HomeViewModelTest.kt:42' }]]),
      new Set(),
    );
    expect(row).toMatchObject({
      status: 'failed',
      mismatch: [
        { status: 'failed', platforms: ['ios-sim'] },
        { status: 'passed', platforms: ['jvm'] },
      ],
      platforms: [
        { platform: 'jvm', status: 'passed', failures: [] },
        {
          platform: 'ios-sim',
          status: 'failed',
          failures: [{ message: 'expected 3', detail: 'at HomeViewModelTest.kt:42' }],
        },
      ],
    });
  });

  it('counts failed on one platform and skipped on another as a mismatch', () => {
    const [row] = runTestRows(
      [result('r1', 't1', 'jvm', 'skipped'), result('r2', 't1', 'ios-sim', 'failed')],
      new Map(),
      new Set(),
    );
    expect(row?.mismatch).toEqual([
      { status: 'failed', platforms: ['ios-sim'] },
      { status: 'skipped', platforms: ['jvm'] },
    ]);
  });

  it('combines repeated results of one test on one platform, which is no mismatch', () => {
    // routeserve's apps/mobile capture runs one test name five times in one report: one row,
    // one platform, the time spent across all five (5 x 20 = 100 ms).
    const repeated = [1, 2, 3, 4, 5].map((n) =>
      result(`r${n}`, 't1', 'node', 'passed', { job: 'test', durationMs: 20 }),
    );
    const [row] = runTestRows(repeated, new Map(), new Set());
    expect(row).toMatchObject({
      status: 'passed',
      mismatch: null,
      platforms: [{ platform: 'node', status: 'passed', durationMs: 100, failures: [] }],
    });
  });

  it('has no failure text where none was returned, as for a private project', () => {
    const [row] = runTestRows([result('r1', 't1', 'node', 'failed')], new Map(), new Set());
    expect(row?.platforms).toEqual([
      { platform: 'node', status: 'failed', durationMs: 100, failures: [] },
    ]);
  });

  it('flags a test the caller found flaky', () => {
    const rows = runTestRows(
      [result('r1', 't1', 'jvm', 'passed'), result('r2', 't2', 'jvm', 'passed')],
      new Map(),
      new Set(['t2']),
    );
    expect(rows.map((row) => [row.testId, row.flaky])).toEqual([
      ['t1', false],
      ['t2', true],
    ]);
  });

  it('orders failures first, then by suite, then by name', () => {
    const rows = runTestRows(
      [
        result('r1', 'b', 'jvm', 'passed', { suite: 'A' }),
        result('r2', 'a', 'jvm', 'passed', { suite: 'B' }),
        result('r3', 'c', 'jvm', 'error', { suite: 'Z' }),
        result('r4', 'a2', 'jvm', 'passed', { suite: 'A', name: 'a' }),
      ],
      new Map(),
      new Set(),
    );
    expect(rows.map((row) => row.testId)).toEqual(['c', 'a2', 'b', 'a']);
  });
});
