import type { StatsCoverage, StatsResult, StatsRun } from './input.ts';

// Hand-built records for the stats unit tests. Stats read stored rows, not tool output, so the
// real-fixture rule for parsers does not apply; the integration test covers real data.

export const at = (iso: string): Date => new Date(iso);

export function run(id: string, finishedAt: string, overrides: Partial<StatsRun> = {}): StatsRun {
  return {
    id,
    ciRunId: id,
    runAttempt: 1,
    commitSha: `sha-${id}`,
    branch: 'main',
    status: 'passed',
    passed: 10,
    failed: 0,
    skipped: 0,
    startedAt: at(finishedAt),
    finishedAt: at(finishedAt),
    source: 'ci',
    ...overrides,
  };
}

export const countsCoverage = (
  id: string,
  runId: string,
  module: string,
  covered: number,
  total: number,
): StatsCoverage => ({ id, runId, module, lines: { form: 'counts', covered, total } });

export const pctCoverage = (
  id: string,
  runId: string,
  module: string,
  pct: number,
): StatsCoverage => ({ id, runId, module, lines: { form: 'pct', pct } });

export const result = (
  id: string,
  runId: string,
  testId: string,
  status: StatsResult['status'],
  platform = 'jvm',
): StatsResult => ({ id, runId, testId, status, platform });
