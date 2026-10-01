import type { TestStatus } from '../parsers/types.ts';
import { byPlatform, combinedStatus, type ReportPlatform } from '../results/run-results.ts';
import { runTitle } from '../runs/title.ts';
import { flakyPlatforms, flakyResultIds } from './flaky.ts';
import type { PublicRun, StatsResult } from './input.ts';
import { byFinish, countsTowardCiOnlyStats, lastRuns, TREND_RUNS } from './rules.ts';

// One test's history (spec section 13, /p/[slug]/tests/[testKey]; design/data-map.md, Test
// history): the StatusTimeline's runs and the duration TrendChart. Read as follows, and pinned
// by the tests:
// - The timeline holds the last 40 runs with a result for the test, on any branch, finished by
//   now, oldest first by byFinish: the strip's runs, which its tiles count (components.md, Test
//   history page). A run with no result on one of the test's platforms simply has no entry for
//   it; the timeline draws that as "not run".
// - Repeated results on one platform in one run combine as on the run page
//   (lib/results/run-results.ts): failing first, time summed.
// - A cell is flaky when any of its results is one side of a section 11 flip: a pass and a fail
//   on one commit and platform, in default-branch CI runs of the last 30 days. The test is flaky
//   when it has such a flip on any platform.
// - Duration per platform covers the last 30 default-branch CI runs, however old, as the project
//   page's charts do (section 11, "Windows"): the runs given may include ones where the test has
//   no result, which the loader reads for this. A skipped result took no time worth plotting, so
//   it has no value; a platform with no value in a run is null, and a run with no value on any
//   platform keeps its place as a gap, so no older run is pulled in to fill it. Each point keeps
//   the cell its value came from, so the chart can say "Skipped" and mark a failed or flaky run.

export interface HistoryResult extends ReportPlatform {
  readonly id: string;
  readonly runId: string;
  readonly status: TestStatus;
  readonly durationMs: number;
}

export interface HistoryOptions {
  readonly defaultBranch: string;
  readonly now: Date;
}

export interface HistoryCell {
  readonly platform: string;
  readonly status: TestStatus;
  readonly durationMs: number;
  readonly flaky: boolean;
}

export interface HistoryRun {
  readonly id: string;
  readonly title: string;
  readonly event: string;
  readonly branch: string;
  readonly commitSha: string;
  readonly runUrl: string | null;
  readonly finishedAt: Date;
  readonly source: PublicRun['source'];
  readonly status: PublicRun['status'];
  readonly results: readonly HistoryCell[];
}

export interface DurationByPlatformPoint {
  readonly runId: string;
  readonly finishedAt: Date;
  readonly status: PublicRun['status'];
  /** One slot per platform of the trend, in its order; null where there is no value. */
  readonly durationsMs: readonly (number | null)[];
  /** The cell behind each slot; null where the test has no result on that platform. */
  readonly cells: readonly (HistoryCell | null)[];
}

export interface DurationByPlatform {
  readonly platforms: readonly string[];
  readonly points: readonly DurationByPlatformPoint[];
  /** Each platform's median over the points with a value; null where it has none. */
  readonly medianMs: readonly (number | null)[];
}

export interface TestHistory {
  /** Every platform the test has a result on, in report order. */
  readonly platforms: readonly string[];
  readonly runs: readonly HistoryRun[];
  readonly flaky: boolean;
  readonly flakyPlatforms: readonly string[];
  /** Commits it both passed and failed on, on one platform, in 30 days: the Flaky tile. */
  readonly flakyCommits: number;
  /**
   * Runs among runs in which it failed or errored on any platform, a flip's failing side
   * included, as the flaky list counts them: the Failed tile.
   */
  readonly failedRuns: number;
  /** The platforms it failed or errored on among runs, in report order. */
  readonly failedPlatforms: readonly string[];
  /**
   * Runs among runs whose platforms reported different statuses, and the latest of them as an
   * index into runs: the mismatch headline.
   */
  readonly mismatch: { readonly runs: number; readonly latest: number | null };
  /**
   * The run the timeline opens on, as an index into runs: the latest with a failed or error
   * result on any platform that is not flaky, else the latest (section 19, 2026-09-28 and
   * 2026-09-29); null with no runs.
   */
  readonly initialRun: number | null;
  readonly duration: DurationByPlatform;
}

/** The platforms of several results, each once, in report order. */
function platformsOf(results: readonly HistoryResult[]): string[] {
  return byPlatform(results).map(([platform]) => platform);
}

// Failing is failed or error on any platform; a flaky cell draws as Flaky, so the failing side of
// a flip does not count (design v6 item 7, components.md StatusTimeline).
const isFailing = (cell: HistoryCell): boolean =>
  !cell.flaky && (cell.status === 'failed' || cell.status === 'error');

const STRIP_RUNS = 40;

const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  // Both middle entries exist: sorted has at least one value.
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

const failedOrErrored = (cell: HistoryCell): boolean =>
  cell.status === 'failed' || cell.status === 'error';

// A platform mismatch, as the run page's results table has it: statuses that differ across the
// platforms the test reported on in one run.
const isMismatch = (run: HistoryRun): boolean =>
  new Set(run.results.map((cell) => cell.status)).size > 1;

function initialRun(runs: readonly HistoryRun[]): number | null {
  if (runs.length === 0) return null;
  const failing = runs.findLastIndex((run) => run.results.some(isFailing));
  return failing === -1 ? runs.length - 1 : failing;
}

export function testHistory(
  runs: readonly PublicRun[],
  results: readonly HistoryResult[],
  options: HistoryOptions,
): TestHistory {
  const shown = runs
    .filter((run) => run.finishedAt.getTime() <= options.now.getTime())
    .sort(byFinish);
  const shownIds = new Set(shown.map((run) => run.id));
  const kept = results.filter((result) => shownIds.has(result.runId));

  const asStats: StatsResult[] = kept.map((result) => ({
    id: result.id,
    runId: result.runId,
    testId: 'this test',
    status: result.status,
    platform: result.platform,
  }));
  const flakyIds = flakyResultIds(shown, asStats, options);
  const [flaky] = flakyPlatforms(shown, asStats, options);

  const resultsOf = new Map<string, HistoryResult[]>();
  for (const result of kept) {
    resultsOf.set(result.runId, [...(resultsOf.get(result.runId) ?? []), result]);
  }

  const everyRun = shown.flatMap((run): HistoryRun[] => {
    const runResults = resultsOf.get(run.id) ?? [];
    if (runResults.length === 0) return [];
    return [
      {
        id: run.id,
        title: runTitle(run.event, run.branch),
        event: run.event,
        branch: run.branch,
        commitSha: run.commitSha,
        runUrl: run.runUrl,
        finishedAt: run.finishedAt,
        source: run.source,
        status: run.status,
        results: byPlatform(runResults).map(([platform, group]) => ({
          platform,
          status: combinedStatus(group.map((result) => result.status)),
          durationMs: group.reduce((total, result) => total + result.durationMs, 0),
          flaky: group.some((result) => flakyIds.has(result.id)),
        })),
      },
    ];
  });

  const timeline = everyRun.slice(-STRIP_RUNS);

  const counted = lastRuns(
    shown,
    TREND_RUNS,
    (run) => countsTowardCiOnlyStats(run, options.defaultBranch),
    options.now,
  );
  const countedIds = new Set(counted.map((run) => run.id));
  const chartPlatforms = platformsOf(kept.filter((result) => countedIds.has(result.runId)));
  const cellsOf = new Map(everyRun.map((entry) => [entry.id, entry.results]));
  const points = counted.map((run): DurationByPlatformPoint => {
    const cells = chartPlatforms.map(
      (platform) => cellsOf.get(run.id)?.find((result) => result.platform === platform) ?? null,
    );
    return {
      runId: run.id,
      finishedAt: run.finishedAt,
      status: run.status,
      durationsMs: cells.map((cell) =>
        cell === null || cell.status === 'skipped' ? null : cell.durationMs,
      ),
      cells,
    };
  });
  const duration: DurationByPlatform =
    counted.length === 0
      ? { platforms: [], points: [], medianMs: [] }
      : {
          platforms: chartPlatforms,
          points,
          medianMs: chartPlatforms.map((_, slot) =>
            median(points.flatMap((point) => point.durationsMs[slot] ?? [])),
          ),
        };

  const failing = timeline.filter((run) => run.results.some(failedOrErrored));
  const failingPlatforms = new Set(
    failing.flatMap((run) => run.results.filter(failedOrErrored).map((cell) => cell.platform)),
  );
  const mismatched = timeline.flatMap((run, index) => (isMismatch(run) ? [index] : []));

  return {
    platforms: platformsOf(kept),
    runs: timeline,
    flaky: flaky !== undefined,
    flakyPlatforms: flaky?.platforms ?? [],
    flakyCommits: flaky?.commits ?? 0,
    initialRun: initialRun(timeline),
    failedRuns: failing.length,
    failedPlatforms: platformsOf(kept).filter((platform) => failingPlatforms.has(platform)),
    mismatch: { runs: mismatched.length, latest: mismatched.at(-1) ?? null },
    duration,
  };
}
