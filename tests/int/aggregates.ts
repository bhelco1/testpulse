import { z } from 'zod';

import { LayerSchema } from '../../lib/ingest/layer-rules.ts';
import {
  loadFlakyFailures,
  loadFlakyTests,
  loadReportCounts,
  loadTestTallies,
} from '../../lib/queries/aggregates.ts';
import {
  flakyFailures,
  flakyPlatforms,
  flakyTests,
  talliedFlakyTests,
} from '../../lib/stats/flaky.ts';
import {
  PUBLIC_RUN_COLUMNS,
  PublicRunRowSchema,
  RESULT_COLUMNS,
  ResultRowSchema,
} from '../../lib/stats/input.ts';
import { readAll, readByRunIds } from '../../lib/stats/load.ts';
import {
  talliedCountTrend,
  talliedCounts,
  talliedTestsByRun,
  testCountTrend,
  testCounts,
  testOutcomesByRun,
} from '../../lib/stats/test-counts.ts';
import type { PublicClient } from '../../lib/supabase/public.ts';

// Parity between the database functions of the page aggregates migration (decision 2026-10-29)
// and the TypeScript stats they replace on the pages: the same project, read as the caller reads
// it, computed both ways. `expected` is lib/stats over every run of the project and the result
// rows of every run not pruned, the way the loaders computed it before; `actual` is the database's answer, through the loaders'
// own calls in lib/queries/aggregates.ts. Every test of the project is asked about, flaky or not,
// so flaky_failures is compared on tests that fail without flipping as well.

const TestRowSchema = z.object({ id: z.string().min(1), layer: LayerSchema });
const ReportRowSchema = z.object({ run_id: z.string().min(1) });

export interface Parity {
  readonly expected: unknown;
  readonly actual: unknown;
  /** How much the comparison covered, so a test can show it was not vacuous. */
  readonly seen: { runs: number; results: number; flaky: number; failing: number };
}

export async function aggregateParity(
  client: PublicClient,
  project: { readonly id: string; readonly defaultBranch: string },
  now: Date,
): Promise<Parity> {
  const options = { defaultBranch: project.defaultBranch, now };
  const runs = await readAll('parity runs', PublicRunRowSchema, (from, to) =>
    client
      .from('runs_public')
      .select(PUBLIC_RUN_COLUMNS)
      .eq('project_id', project.id)
      .order('id')
      .range(from, to),
  );
  const runIds = runs.map((run) => run.id);
  // The loaders never read a pruned run's results: one part way through pruning has some left.
  const countedIds = runs.filter((run) => run.resultsPrunedAt === null).map((run) => run.id);
  const results = await readByRunIds(
    'parity results',
    ResultRowSchema,
    countedIds,
    (ids, from, to) =>
      client
        .from('results')
        .select(RESULT_COLUMNS)
        .in('reports.run_id', [...ids])
        .order('id')
        .range(from, to),
  );
  const tests = await readAll('parity tests', TestRowSchema, (from, to) =>
    client
      .from('tests')
      .select('id, layer')
      .eq('project_id', project.id)
      .order('id')
      .range(from, to),
  );
  const reports = await readByRunIds('parity reports', ReportRowSchema, runIds, (ids, from, to) =>
    client
      .from('reports')
      .select('run_id')
      .in('run_id', [...ids])
      .order('id')
      .range(from, to),
  );
  const layers = new Map(tests.map((test) => [test.id, test.layer]));
  const layerOf = (testId: string) => {
    const layer = layers.get(testId);
    if (layer === undefined) throw new Error(`result of unknown test ${testId}`);
    return layer;
  };
  const testIds = tests.map((test) => test.id).sort();

  const flakyIds = flakyTests(runs, results, options).flakyTestIds;
  const tallies = await loadTestTallies(client, countedIds);
  const reportCounts = new Map<string, number>();
  for (const { run_id: runId } of reports) {
    reportCounts.set(runId, (reportCounts.get(runId) ?? 0) + 1);
  }

  const perRun = (count: (runId: string) => unknown, ids: readonly string[] = countedIds) =>
    Object.fromEntries([...ids].sort().map((runId) => [runId, count(runId)]));
  const sqlFlaky = await loadFlakyTests(client, project.id, now);

  return {
    expected: {
      flakyPlatforms: flakyPlatforms(runs, results, options),
      flakyTests: flakyTests(runs, results, options),
      flakyFailures: flakyFailures(runs, results, testIds, options),
      testsByRun: perRun((runId) => testOutcomesByRun(countedIds, results).get(runId)),
      countsByRun: perRun((runId) =>
        testCounts(
          results
            .filter((result) => result.runId === runId)
            .map((result) => ({ testId: result.testId, layer: layerOf(result.testId) })),
        ),
      ),
      countTrend: testCountTrend(runs, results, options),
      reportsByRun: perRun((runId) => reportCounts.get(runId) ?? 0, runIds),
    },
    actual: {
      flakyPlatforms: sqlFlaky,
      flakyTests: talliedFlakyTests(
        runs,
        sqlFlaky.map((test) => test.testId),
        tallies,
        options,
      ),
      flakyFailures: await loadFlakyFailures(client, project.id, now, testIds),
      testsByRun: perRun((runId) => talliedTestsByRun(countedIds, tallies).get(runId)),
      countsByRun: perRun((runId) =>
        talliedCounts(tallies.filter((tally) => tally.runId === runId)),
      ),
      countTrend: talliedCountTrend(runs, tallies, options),
      reportsByRun: await loadReportCounts(client, runIds).then((counts) =>
        perRun((runId) => counts.get(runId) ?? 0, runIds),
      ),
    },
    seen: {
      runs: runs.length,
      results: results.length,
      flaky: flakyIds.length,
      failing: results.filter((result) => result.status === 'failed' || result.status === 'error')
        .length,
    },
  };
}
