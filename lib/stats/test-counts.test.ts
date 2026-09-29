import { describe, expect, it } from 'vitest';

import { at, run } from './records.test-support.ts';
import {
  testCounts,
  testCountTrend,
  testOutcomes,
  type TestCountRun,
  type TestLayerRow,
} from './test-counts.ts';
import type { TrendOptions } from './trends.ts';

// Spec section 11: "Total tests: Distinct tests rows seen in the latest default-branch run ...
// Same test on two platforms counts once here" and "Test pyramid: Count of distinct tests per
// layer in the latest default-branch run." The rows are that run's results, one per execution.

const row = (testId: string, layer: TestLayerRow['layer']): TestLayerRow => ({ testId, layer });

// Decision 2026-09-28 (section 19): the latest run's pass rate on the headline tile and the
// project card counts distinct tests, as Total tests does. A test fails if it failed or errored
// on any platform; a test skipped everywhere is skipped and left out of the rate.
describe('testOutcomes', () => {
  const outcome = (testId: string, status: 'passed' | 'failed' | 'error' | 'skipped') => ({
    testId,
    status,
  });

  it('is all zeros for a run with no results', () => {
    expect(testOutcomes([])).toEqual({ passed: 0, failed: 0, skipped: 0 });
  });

  it('counts each test once, failing if it failed or errored on any platform', () => {
    // t1 passed on jvm and ios-sim: 1 passed. t2 passed on jvm, failed on ios-sim: 1 failed.
    // t3 errored on jvm, passed on ios-sim: 1 failed. t4 skipped on jvm, passed on ios-sim:
    // passed. t5 skipped on both: 1 skipped. t6 run five times in one report, all passed: 1
    // passed. 10 + 1 executions, 6 tests: passed 3 (t1, t4, t6), failed 2 (t2, t3), skipped 1.
    const rows = [
      outcome('t1', 'passed'),
      outcome('t1', 'passed'),
      outcome('t2', 'passed'),
      outcome('t2', 'failed'),
      outcome('t3', 'error'),
      outcome('t3', 'passed'),
      outcome('t4', 'skipped'),
      outcome('t4', 'passed'),
      outcome('t5', 'skipped'),
      outcome('t5', 'skipped'),
      ...Array.from({ length: 5 }, () => outcome('t6', 'passed')),
    ];
    expect(testOutcomes(rows)).toEqual({ passed: 3, failed: 2, skipped: 1 });
  });

  it('adds up to Total tests for the same rows', () => {
    const rows = [
      { testId: 't1', layer: 'unit' as const, status: 'passed' as const },
      { testId: 't1', layer: 'unit' as const, status: 'error' as const },
      { testId: 't2', layer: 'api' as const, status: 'skipped' as const },
      { testId: 't3', layer: 'api' as const, status: 'passed' as const },
    ];
    const { passed, failed, skipped } = testOutcomes(rows);
    // 1 + 1 + 1 = 3 = t1, t2, t3.
    expect([passed, failed, skipped]).toEqual([1, 1, 1]);
    expect(passed + failed + skipped).toBe(testCounts(rows).totalTests);
  });
});

describe('testCounts', () => {
  it('is 0 with no layers for a run with no results (an empty run, or none at all)', () => {
    expect(testCounts([])).toEqual({ totalTests: 0, layers: {} });
  });

  it('counts a test once however many platforms ran it', () => {
    // t1 on jvm and ios-sim, t2 on jvm: 3 executions, 2 tests, both unit.
    const rows = [row('t1', 'unit'), row('t1', 'unit'), row('t2', 'unit')];
    expect(testCounts(rows)).toEqual({ totalTests: 2, layers: { unit: 2 } });
  });

  it('counts distinct tests per layer, and the layers add up to the total', () => {
    // unit: t1, t2, t3 = 3; integration: t4 = 1 (run twice); visual: t5 = 1. 3 + 1 + 1 = 5.
    const rows = [
      row('t1', 'unit'),
      row('t2', 'unit'),
      row('t3', 'unit'),
      row('t4', 'integration'),
      row('t4', 'integration'),
      row('t5', 'visual'),
    ];
    expect(testCounts(rows)).toEqual({
      totalTests: 5,
      layers: { unit: 3, integration: 1, visual: 1 },
    });
  });

  it('counts a single test as 1', () => {
    expect(testCounts([row('only', 'e2e')])).toEqual({ totalTests: 1, layers: { e2e: 1 } });
  });
});

// Spec section 11: "Test count per run: The "Total tests" measure for each default-branch run
// with source = ci, trended per run. Imported history is left out: it has no per-test rows. Not
// runs.total, which counts executions" (decision 2026-09-28).
describe('testCountTrend', () => {
  const now = at('2026-10-01T15:30:00Z');
  const options: TrendOptions = { defaultBranch: 'main', now, days: 30 };
  const counted = (
    id: string,
    finishedAt: string,
    overrides: Partial<TestCountRun> = {},
  ): TestCountRun => ({ ...run(id, finishedAt), resultsPrunedAt: null, ...overrides });
  const executed = (runId: string, ...testIds: string[]) =>
    testIds.map((testId) => ({ runId, testId }));

  it('has no points with no runs', () => {
    expect(testCountTrend([], [], options)).toEqual([]);
  });

  it('counts a single run’s distinct tests, not its executions', () => {
    // t1 on jvm and ios-sim, t2 on jvm: 3 executions (runs.total 3), 2 tests.
    const runs = [counted('only', '2026-09-30T10:00:00Z', { passed: 3 })];
    expect(testCountTrend(runs, executed('only', 't1', 't1', 't2'), options)).toEqual([
      { runId: 'only', finishedAt: at('2026-09-30T10:00:00Z'), status: 'passed', totalTests: 2 },
    ]);
  });

  it('counts skipped tests, which were seen in the run, and an all-skipped run has its count', () => {
    // The caller passes every result, skipped ones included, as for Total tests.
    const runs = [counted('skipped', '2026-09-30T10:00:00Z', { passed: 0, skipped: 2 })];
    expect(testCountTrend(runs, executed('skipped', 's1', 's2'), options)).toMatchObject([
      { runId: 'skipped', totalTests: 2 },
    ]);
  });

  it('gives an empty run 0 tests', () => {
    const runs = [counted('empty', '2026-09-30T10:00:00Z', { status: 'empty', passed: 0 })];
    expect(testCountTrend(runs, [], options)).toMatchObject([
      { runId: 'empty', status: 'empty', totalTests: 0 },
    ]);
  });

  it('keeps default-branch CI runs in the window, oldest first, one point each', () => {
    const runs = [
      counted('b', '2026-09-20T09:00:00Z'),
      counted('a', '2026-09-10T09:00:00Z'),
      counted('backfill', '2026-09-15T09:00:00Z', { source: 'backfill' }),
      counted('pull-request', '2026-09-16T09:00:00Z', { branch: 'feature/x' }),
      counted('too-old', '2026-09-01T23:59:59.999Z'),
      counted('future', '2026-10-01T15:30:00.001Z'),
    ];
    const results = [
      ...executed('a', 't1', 't2'),
      ...executed('b', 't1', 't2', 't3'),
      ...executed('pull-request', 't1', 't2', 't3', 't4'),
      ...executed('too-old', 't1'),
      ...executed('future', 't1'),
    ];
    // a: 2 tests; b: 3 tests.
    expect(
      testCountTrend(runs, results, options).map(({ runId, totalTests }) => [runId, totalTests]),
    ).toEqual([
      ['a', 2],
      ['b', 3],
    ]);
  });

  it('leaves out a run whose results were pruned, rather than plotting 0', () => {
    const runs = [
      counted('kept', '2026-09-20T09:00:00Z'),
      counted('pruned', '2026-09-21T09:00:00Z', { resultsPrunedAt: at('2026-09-30T00:00:00Z') }),
    ];
    expect(
      testCountTrend(runs, executed('kept', 't1'), options).map((point) => point.runId),
    ).toEqual(['kept']);
  });
});
