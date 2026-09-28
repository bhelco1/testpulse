import type { Layer } from '../ingest/layer-rules.ts';
import type { PublicRun, StatsResult, StatsRun } from './input.ts';
import { byFinish, countsTowardCiOnlyStats, inWindow } from './rules.ts';
import type { TrendOptions } from './trends.ts';

// Spec section 11: "Total tests: Distinct tests rows seen in the latest default-branch run ...
// Same test on two platforms counts once here" and "Test pyramid: Count of distinct tests per
// layer in the latest default-branch run." The input is that run's results, one row per
// execution, skipped ones included: a skipped test was still seen in the run. Declared suites
// (5.8) never reach this function, so they are never in a total or a layer.

export interface TestLayerRow {
  readonly testId: string;
  readonly layer: Layer;
}

export interface TestCounts {
  readonly totalTests: number;
  readonly layers: Partial<Record<Layer, number>>;
}

export function testCounts(rows: readonly TestLayerRow[]): TestCounts {
  // A test's layer is resolved once, on its tests row (5.4), so every row of one test agrees.
  const layerOf = new Map<string, Layer>();
  for (const { testId, layer } of rows) layerOf.set(testId, layer);
  const layers: Partial<Record<Layer, number>> = {};
  for (const layer of layerOf.values()) layers[layer] = (layers[layer] ?? 0) + 1;
  return { totalTests: layerOf.size, layers };
}

// Spec section 11: "Test count per run: The "Total tests" measure for each default-branch run
// with source = ci, trended per run. Imported history is left out: it has no per-test rows. Not
// runs.total, which counts executions." Read as follows, and pinned by the tests:
// - A point per default-branch CI run in the window, oldest first by byFinish, counting the
//   distinct tests among its results, skipped ones included, as Total tests does.
// - An empty run has 0 tests. A run whose results were pruned (5.12) has no per-test rows left
//   to count, so it has no point rather than a false 0.

export type TestCountRun = StatsRun & Pick<PublicRun, 'resultsPrunedAt'>;

export interface TestCountPoint {
  readonly runId: string;
  readonly finishedAt: Date;
  readonly status: StatsRun['status'];
  readonly totalTests: number;
}

export function testCountTrend(
  runs: readonly TestCountRun[],
  results: readonly Pick<StatsResult, 'runId' | 'testId'>[],
  options: TrendOptions,
): TestCountPoint[] {
  const included = runs
    .filter(
      (run) =>
        run.resultsPrunedAt === null &&
        countsTowardCiOnlyStats(run, options.defaultBranch) &&
        inWindow(run.finishedAt, options.now, options.days),
    )
    .sort(byFinish);
  const testsOf = new Map<string, Set<string>>(included.map((run) => [run.id, new Set()]));
  for (const { runId, testId } of results) testsOf.get(runId)?.add(testId);
  return included.map((run) => ({
    runId: run.id,
    finishedAt: run.finishedAt,
    status: run.status,
    totalTests: testsOf.get(run.id)?.size ?? 0,
  }));
}
