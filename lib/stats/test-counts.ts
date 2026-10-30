import type { Layer } from '../ingest/layer-rules.ts';
import type { TestStatus } from '../parsers/types.ts';
import { combinedStatus } from '../results/run-results.ts';
import type { PublicRun, StatsResult, StatsRun } from './input.ts';
import { countsTowardCiOnlyStats, lastRuns, TREND_RUNS } from './rules.ts';
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

// Decision 2026-09-28 (section 19): the latest run's pass rate on the landing headline and the
// project card counts distinct tests, so it reads "{passed} of {total}" against Total tests.
// Each test's results combine as on the run page (combinedStatus): failed or error on any
// platform is failing, else passed on any is passed, else skipped. Skipped tests are left out of
// the rate and shown beside it.

export interface TestOutcomeRow {
  readonly testId: string;
  readonly status: TestStatus;
}

/** A latest-run result as the landing loader reads it: its test, layer and status. */
export interface LatestRunTest extends TestLayerRow, TestOutcomeRow {}

export interface TestOutcomes {
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
}

export function testOutcomes(rows: readonly TestOutcomeRow[]): TestOutcomes {
  const statusesOf = new Map<string, TestStatus[]>();
  for (const { testId, status } of rows) {
    statusesOf.set(testId, [...(statusesOf.get(testId) ?? []), status]);
  }
  const outcomes = { passed: 0, failed: 0, skipped: 0 };
  for (const statuses of statusesOf.values()) {
    const status = combinedStatus(statuses);
    if (status === 'passed') outcomes.passed += 1;
    else if (status === 'skipped') outcomes.skipped += 1;
    else outcomes.failed += 1;
  }
  return outcomes;
}

/** A run's distinct tests: its total and how each test came out (testOutcomes). */
export interface RunTests extends TestOutcomes {
  readonly total: number;
}

// Decision 2026-09-29 (section 19): the project page's run list counts each run's distinct
// tests, as the latest-run card does, not its executions (runs.total). A run with no results
// has none.
export function testOutcomesByRun(
  runIds: readonly string[],
  results: readonly Pick<StatsResult, 'runId' | 'testId' | 'status'>[],
): Map<string, RunTests> {
  const rowsOf = new Map<string, TestOutcomeRow[]>(runIds.map((id) => [id, []]));
  for (const { runId, testId, status } of results) rowsOf.get(runId)?.push({ testId, status });
  return new Map(
    [...rowsOf].map(([runId, rows]) => {
      const outcomes = testOutcomes(rows);
      return [runId, { total: outcomes.passed + outcomes.failed + outcomes.skipped, ...outcomes }];
    }),
  );
}

// Decision 2026-10-29 (section 19): the pages read these counts from the database rather than
// every result row. run_test_tallies (supabase/migrations/20261029120000_page_aggregates.sql)
// counts each run's distinct tests by layer and by the status combinedStatus gives them, and the
// functions below turn those tallies into what testCounts, testOutcomes and testOutcomesByRun
// return for the same results; the integration tests prove they agree.

/** A run's distinct tests of one layer and one combined status, as run_test_tallies counts them. */
export interface TestTally {
  readonly runId: string;
  readonly layer: Layer;
  readonly status: TestStatus;
  readonly tests: number;
}

/** testCounts from one run's tallies. */
export function talliedCounts(tallies: readonly TestTally[]): TestCounts {
  const layers: Partial<Record<Layer, number>> = {};
  let totalTests = 0;
  for (const { layer, tests } of tallies) {
    layers[layer] = (layers[layer] ?? 0) + tests;
    totalTests += tests;
  }
  return { totalTests, layers };
}

/** testOutcomes from one run's tallies: failed and error are both failing. */
export function talliedOutcomes(tallies: readonly TestTally[]): TestOutcomes {
  const outcomes = { passed: 0, failed: 0, skipped: 0 };
  for (const { status, tests } of tallies) {
    if (status === 'passed') outcomes.passed += tests;
    else if (status === 'skipped') outcomes.skipped += tests;
    else outcomes.failed += tests;
  }
  return outcomes;
}

/** testOutcomesByRun from the tallies of several runs; a run with none has no tests. */
export function talliedTestsByRun(
  runIds: readonly string[],
  tallies: readonly TestTally[],
): Map<string, RunTests> {
  const talliesOf = new Map<string, TestTally[]>(runIds.map((id) => [id, []]));
  for (const tally of tallies) talliesOf.get(tally.runId)?.push(tally);
  return new Map(
    [...talliesOf].map(([runId, ofRun]) => {
      const outcomes = talliedOutcomes(ofRun);
      return [runId, { total: outcomes.passed + outcomes.failed + outcomes.skipped, ...outcomes }];
    }),
  );
}

// Spec section 11: "Test count per run: The "Total tests" measure for each default-branch run
// with source = ci, trended per run. Imported history is left out: it has no per-test rows. Not
// runs.total, which counts executions." Read as follows, and pinned by the tests:
// - A point per default-branch CI run over the last 30 such runs, however old (decision
//   2026-09-29), oldest first by byFinish, counting the distinct tests among its results,
//   skipped ones included, as Total tests does.
// - An empty run has 0 tests. A run whose results were pruned (5.12) has no per-test rows left
//   to count, so its point has no value (null) rather than a false 0: it keeps its place among
//   the 30, and no older run is pulled in to fill it.

export type TestCountRun = StatsRun & Pick<PublicRun, 'resultsPrunedAt'>;

export interface TestCountPoint {
  readonly runId: string;
  readonly finishedAt: Date;
  readonly status: StatsRun['status'];
  /** Null for a run whose results were pruned. */
  readonly totalTests: number | null;
}

export function testCountTrend(
  runs: readonly TestCountRun[],
  results: readonly Pick<StatsResult, 'runId' | 'testId'>[],
  options: TrendOptions,
): TestCountPoint[] {
  const testsOf = new Map<string, Set<string>>();
  for (const { runId, testId } of results) {
    testsOf.set(runId, (testsOf.get(runId) ?? new Set()).add(testId));
  }
  return countTrend(runs, (runId) => testsOf.get(runId)?.size ?? 0, options);
}

/** testCountTrend from the database's tallies of each run's distinct tests. */
export function talliedCountTrend(
  runs: readonly TestCountRun[],
  tallies: readonly TestTally[],
  options: TrendOptions,
): TestCountPoint[] {
  const totals = new Map<string, number>();
  for (const { runId, tests } of tallies) totals.set(runId, (totals.get(runId) ?? 0) + tests);
  return countTrend(runs, (runId) => totals.get(runId) ?? 0, options);
}

function countTrend(
  runs: readonly TestCountRun[],
  testsIn: (runId: string) => number,
  options: TrendOptions,
): TestCountPoint[] {
  const included = lastRuns(
    runs,
    TREND_RUNS,
    (run) => countsTowardCiOnlyStats(run, options.defaultBranch),
    options.now,
  );
  return included.map((run) => ({
    runId: run.id,
    finishedAt: run.finishedAt,
    status: run.status,
    totalTests: run.resultsPrunedAt === null ? testsIn(run.id) : null,
  }));
}
