import type { Layer } from '../ingest/layer-rules.ts';
import type { TestStatus } from '../parsers/types.ts';
import { orderResults, platformMismatch, type MismatchGroup } from './table.ts';

// The run page's results, one row per test (design/components.md, ResultsTable), from the rows
// a run's reports hold. Pure: the loader reads the rows, and row-level security has already
// decided which failure text is here (section 9). Read as follows, and pinned by the tests:
// - A test's results are grouped by report platform, platforms in the order of their reports'
//   job, module and platform, so the table and the history list them the same way every time.
// - Repeated results of one test on one platform in one run (a test name run several times in
//   one report) combine into one: the first of failed, error, passed, skipped, as the platform
//   mismatch sentence orders statuses, and the time spent across all of them.
// - A row's status combines its platforms the same way, so a test failing anywhere in the run
//   sorts and filters as failing. Platform mismatch (section 11) compares platforms, never the
//   repeats within one.

export interface RunResultInput {
  readonly resultId: string;
  readonly testId: string;
  readonly testKey: string;
  readonly module: string;
  readonly suite: string;
  readonly name: string;
  readonly layer: Layer;
  readonly status: TestStatus;
  readonly durationMs: number;
  readonly job: string;
  readonly platform: string;
}

export interface ResultFailure {
  readonly message: string;
  readonly detail: string;
}

/** One failed or error result's text, with that result's own status and time. */
export interface ResultFailureEntry extends ResultFailure {
  readonly status: TestStatus;
  readonly durationMs: number;
}

export interface PlatformOutcome {
  readonly platform: string;
  readonly status: TestStatus;
  readonly durationMs: number;
  /**
   * Failure text of this platform's failing results, one entry per result (design/data-map.md,
   * "Failure detail (several)"); none where RLS returned none.
   */
  readonly failures: readonly ResultFailureEntry[];
}

export interface RunTestRow {
  readonly testId: string;
  readonly testKey: string;
  readonly module: string;
  readonly suite: string;
  readonly name: string;
  readonly layer: Layer;
  readonly status: TestStatus;
  readonly flaky: boolean;
  readonly mismatch: MismatchGroup[] | null;
  readonly platforms: readonly PlatformOutcome[];
}

const SEVERITY: readonly TestStatus[] = ['failed', 'error', 'passed', 'skipped'];

/** The status several results of one test read as: failing first, then passed, then skipped. */
export function combinedStatus(statuses: readonly TestStatus[]): TestStatus {
  const found = SEVERITY.find((status) => statuses.includes(status));
  if (found === undefined) throw new Error('combinedStatus: no results to combine');
  return found;
}

// Code-unit order rather than localeCompare, so the order does not depend on the server locale.
const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export interface ReportPlatform {
  readonly job: string;
  readonly module: string;
  readonly platform: string;
}

/** Orders results by their report's job, then module, then platform. */
export const byReport = (a: ReportPlatform, b: ReportPlatform): number =>
  compareText(a.job, b.job) ||
  compareText(a.module, b.module) ||
  compareText(a.platform, b.platform);

/**
 * Groups one test's results in one run by platform, in report order. Each group keeps its
 * results, so a caller can combine anything else it carries.
 */
export function byPlatform<T extends ReportPlatform>(results: readonly T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const result of [...results].sort(byReport)) {
    groups.set(result.platform, [...(groups.get(result.platform) ?? []), result]);
  }
  return [...groups.entries()];
}

export function runTestRows(
  results: readonly RunResultInput[],
  failures: ReadonlyMap<string, ResultFailure>,
  flakyTestIds: ReadonlySet<string>,
): RunTestRow[] {
  const byTest = new Map<string, RunResultInput[]>();
  for (const result of results) {
    byTest.set(result.testId, [...(byTest.get(result.testId) ?? []), result]);
  }
  const rows = [...byTest.values()].flatMap((testResults): RunTestRow[] => {
    const [first] = testResults;
    if (first === undefined) return [];
    const platforms = byPlatform(testResults).map(([platform, group]): PlatformOutcome => ({
      platform,
      status: combinedStatus(group.map((result) => result.status)),
      durationMs: group.reduce((total, result) => total + result.durationMs, 0),
      failures: group.flatMap((result) => {
        const failure = failures.get(result.resultId);
        return failure === undefined
          ? []
          : [{ ...failure, status: result.status, durationMs: result.durationMs }];
      }),
    }));
    const row: RunTestRow = {
      testId: first.testId,
      testKey: first.testKey,
      module: first.module,
      suite: first.suite,
      name: first.name,
      layer: first.layer,
      status: combinedStatus(platforms.map((platform) => platform.status)),
      flaky: flakyTestIds.has(first.testId),
      mismatch: platformMismatch(platforms),
      platforms,
    };
    return [row];
  });
  return orderResults(rows);
}

/**
 * A row's time (design v7 item 2; components.md, ResultsTable "Time column"): the slowest
 * platform's, each platform's time already the sum of its repeated results (section 11, "Run
 * page"). A platform that skipped the test did not run it, so it has no time; with none left the
 * row has none, which the table prints as "—".
 */
export function rowDurationMs(platforms: readonly PlatformOutcome[]): number | null {
  const ran = platforms.filter((platform) => platform.status !== 'skipped');
  return ran.length === 0 ? null : Math.max(...ran.map((platform) => platform.durationMs));
}
