import type { Layer } from '../ingest/layer-rules.ts';

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
