import type { TestStatus } from '../parsers/types.ts';
import { byPlatform, combinedStatus, type ReportPlatform } from '../results/run-results.ts';
import { runTitle } from '../runs/title.ts';
import { flakyPlatforms, flakyResultIds } from './flaky.ts';
import type { PublicRun, StatsResult } from './input.ts';
import { byFinish, countsTowardCiOnlyStats, inWindow, type WindowDays } from './rules.ts';

// One test's history (spec section 13, /p/[slug]/tests/[testKey]; design/data-map.md, Test
// history): the StatusTimeline's runs and the duration TrendChart. Read as follows, and pinned
// by the tests:
// - The timeline holds every run with a result for the test, on any branch, finished by now,
//   oldest first by byFinish. A run with no result on one of the test's platforms simply has no
//   entry for it; the timeline draws that as "not run".
// - Repeated results on one platform in one run combine as on the run page
//   (lib/results/run-results.ts): failing first, time summed.
// - A cell is flaky when any of its results is one side of a section 11 flip: a pass and a fail
//   on one commit and platform, in default-branch CI runs of the last 30 days. The test is flaky
//   when it has such a flip on any platform.
// - Duration per platform reads default-branch CI runs in the window, as suite duration does. A
//   skipped result took no time worth plotting, so it has no value, and a run with no value on
//   any platform has no point. A platform with no value in a run is null, so every series has a
//   value slot for every point.

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
}

export interface DurationByPlatform {
  readonly platforms: readonly string[];
  readonly points: readonly DurationByPlatformPoint[];
}

export interface TestHistory {
  /** Every platform the test has a result on, in report order. */
  readonly platforms: readonly string[];
  readonly runs: readonly HistoryRun[];
  readonly flaky: boolean;
  readonly flakyPlatforms: readonly string[];
  /**
   * The run the timeline opens on, as an index into runs: the latest with a failed or error
   * result on any platform, else the latest (section 19, 2026-09-28); null with no runs.
   */
  readonly initialRun: number | null;
  readonly duration: Readonly<Record<WindowDays, DurationByPlatform>>;
}

/** The platforms of several results, each once, in report order. */
function platformsOf(results: readonly HistoryResult[]): string[] {
  return byPlatform(results).map(([platform]) => platform);
}

const isFailing = (cell: HistoryCell): boolean =>
  cell.status === 'failed' || cell.status === 'error';

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

  const timeline = shown.flatMap((run): HistoryRun[] => {
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

  const byRun = new Map(shown.map((run) => [run.id, run]));
  const duration = (days: WindowDays): DurationByPlatform => {
    const counted = timeline.filter((entry) => {
      const run = byRun.get(entry.id);
      return (
        run !== undefined &&
        countsTowardCiOnlyStats(run, options.defaultBranch) &&
        inWindow(run.finishedAt, options.now, days)
      );
    });
    const platforms = platformsOf(
      kept.filter((result) => counted.some((c) => c.id === result.runId)),
    );
    const points = counted.flatMap((entry): DurationByPlatformPoint[] => {
      const durationsMs = platforms.map((platform) => {
        const cell = entry.results.find((result) => result.platform === platform);
        return cell === undefined || cell.status === 'skipped' ? null : cell.durationMs;
      });
      if (durationsMs.every((value) => value === null)) return [];
      return [{ runId: entry.id, finishedAt: entry.finishedAt, status: entry.status, durationsMs }];
    });
    return { platforms: points.length === 0 ? [] : platforms, points };
  };

  return {
    platforms: platformsOf(kept),
    runs: timeline,
    flaky: flaky !== undefined,
    flakyPlatforms: flaky?.platforms ?? [],
    initialRun: initialRun(timeline),
    duration: { 30: duration(30), 90: duration(90) },
  };
}
