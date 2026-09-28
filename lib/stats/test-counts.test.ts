import { describe, expect, it } from 'vitest';

import { testCounts, type TestLayerRow } from './test-counts.ts';

// Spec section 11: "Total tests: Distinct tests rows seen in the latest default-branch run ...
// Same test on two platforms counts once here" and "Test pyramid: Count of distinct tests per
// layer in the latest default-branch run." The rows are that run's results, one per execution.

const row = (testId: string, layer: TestLayerRow['layer']): TestLayerRow => ({ testId, layer });

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
