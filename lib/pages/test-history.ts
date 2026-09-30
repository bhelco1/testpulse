import type {
  PlatformResult,
  ResultsTimelineRun,
} from '../../components/StatusTimeline/StatusTimeline';
import type { TrendMark } from '../../components/TrendChart/TrendChart';
import { durationCaption, TREND_SCOPE } from '../charts/captions';
import { formatTestTime, relativeLabel } from '../copy/time';
import { LAYER_LABEL } from '../design/layers';
import type { TestHistoryPage } from '../queries/test-history';
import { shortSuite } from '../results/short-suite';
import type { DurationByPlatform, HistoryCell, HistoryRun } from '../stats/test-history';
import { runHref } from './feed';
import type { HistoryChart } from './project';

// The test history page, /p/[slug]/tests/[testKey], as its components take it
// (design/pages/Test History.dc.html, design/components.md StatusTimeline and TrendChart,
// design/data-map.md "Test history"). Pure: the page passes the loader's result and now. Parts the
// design leaves undefined are left out rather than guessed (docs/spec.md section 13.6).

export interface TestHistoryView {
  readonly title: string;
  readonly crumbs: {
    readonly items: readonly { readonly label: string; readonly href: string }[];
    /** "{short suite} › {name}", as the mock's breadcrumb draws it. */
    readonly current: string;
  };
  readonly header: {
    readonly name: string;
    readonly suite: string;
    readonly layer: string;
    readonly flaky: boolean;
  };
  /** Null when the test has no results left to show, which the design does not draw. */
  readonly timeline: {
    readonly testName: string;
    readonly runs: readonly ResultsTimelineRun[];
    readonly initialRun: number;
    readonly private: boolean;
  } | null;
  /** Null when no default-branch CI run has a value: "No runs yet" would be false here. */
  readonly duration: HistoryChart | null;
}

const projectHref = (slug: string) => `/p/${encodeURIComponent(slug)}`;

// One test's time, as the design writes it: "0.41 s" (tp-charts.js, a test's duration).

// A flaky cell draws as Flaky, whichever side of the flip it was (components.md StatusTimeline).
const cellResult = (cell: HistoryCell): PlatformResult => ({
  platform: cell.platform,
  status: cell.flaky ? 'flaky' : cell.status,
  duration: formatTestTime(cell.durationMs),
});

const isFailing = (cell: HistoryCell) =>
  !cell.flaky && (cell.status === 'failed' || cell.status === 'error');

function durationChart(
  trend: DurationByPlatform,
  runs: ReadonlyMap<string, HistoryRun>,
): HistoryChart | null {
  // A run where the test was skipped on a platform would read "Not run" there; whether a skipped
  // result reads "Not run" or "Skipped" is undecided (design v8 item 17), so the run's point is
  // held back rather than assert either (13.6).
  // A run in which the test did not report has no cells: a gap on every platform, which the
  // chart's "Not run" states truly.
  const points = trend.points.flatMap((point) => {
    const cells = runs.get(point.runId)?.results ?? [];
    const skipped = cells.some(
      (cell) => cell.status === 'skipped' && trend.platforms.includes(cell.platform),
    );
    return skipped ? [] : [{ point, cells }];
  });
  const series = trend.platforms
    .map((name, slot) => ({
      name,
      values: points.map(({ point }) => {
        const ms = point.durationsMs[slot];
        return ms === null || ms === undefined ? null : ms / 1000;
      }),
    }))
    .filter((s) => s.values.some((value) => value !== null));
  if (points.length === 0 || series.length === 0) return null;

  // A point is marked where the test failed or errored. The mock also marks a flaky run, in
  // amber, which TrendChart can only name "Run empty": held back (13.6).
  const marks = points.flatMap(({ cells }, index): TrendMark[] =>
    cells.some(isFailing) ? [{ index, status: 'fail' }] : [],
  );
  return {
    title: 'Duration',
    scope: TREND_SCOPE.testDuration,
    series,
    marks,
    format: 'sec',
    unit: 'run',
    caption: durationCaption(
      series.map((s) => s.values),
      'sec',
    ),
  };
}

/** The page's title, which its head reads without the rest of the page (lib/queries/heads). */
export const testHistoryTitle = (
  project: { readonly name: string },
  test: { readonly name: string },
) => `${test.name} · ${project.name} · testpulse`;

export function testHistoryView(page: TestHistoryPage, now: Date): TestHistoryView {
  const { project, test, history } = page;
  const slug = project.slug;
  return {
    title: testHistoryTitle(project, test),
    crumbs: {
      items: [
        { label: 'Overview', href: '/' },
        { label: project.name, href: projectHref(slug) },
      ],
      current: `${shortSuite(test.suite)} › ${test.name}`,
    },
    header: {
      name: test.name,
      suite: test.suite,
      layer: LAYER_LABEL[test.layer],
      flaky: history.flaky,
    },
    timeline:
      history.initialRun === null
        ? null
        : {
            testName: test.name,
            private: project.visibility === 'private',
            initialRun: history.initialRun,
            runs: history.runs.map((run) => ({
              title: run.title,
              branch: run.branch,
              sha: run.commitSha,
              when: relativeLabel(run.finishedAt, now),
              href: runHref(slug, run.id),
              results: run.results.map(cellResult),
            })),
          },
    duration: durationChart(history.duration, new Map(history.runs.map((run) => [run.id, run]))),
  };
}
