import type {
  PlatformResult,
  ResultsTimelineRun,
} from '../../components/StatusTimeline/StatusTimeline';
import type { TrendMark } from '../../components/TrendChart/TrendChart';
import { durationCaption, TREND_SCOPE } from '../charts/captions';
import { formatCount, qty } from '../copy/count';
import {
  dateLabel,
  formatTestTime,
  relativeLabel,
  type TimedText,
  type TimeLabel,
} from '../copy/time';
import { LAYER_LABEL } from '../design/layers';
import type { TestHistoryPage } from '../queries/test-history';
import { shortSuite } from '../results/short-suite';
import type { DurationByPlatform, HistoryCell } from '../stats/test-history';
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
    /** The report's module, as stored on the test (tests.module). */
    readonly module: string;
    readonly layer: string;
    readonly flaky: boolean;
    /** "Platform mismatch in {k} run(s)", then the latest such run and when; none without one. */
    readonly mismatch: {
      readonly text: string;
      readonly run: string;
      readonly when: TimeLabel;
    } | null;
    /** "New · first seen {when}" within 7 days of tests.first_seen_at; null after. */
    readonly firstSeen: TimeLabel | null;
  };
  /** Runs, Failed, Flaky and Median time over the strip; null with no runs to count. */
  readonly tiles: readonly HistoryTile[] | null;
  /** "Oldest on the left", or "One run so far"; null with no runs. */
  readonly stripNote: string | null;
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

export interface HistoryTile {
  readonly label: string;
  readonly value: string;
  readonly sub: TimedText;
  readonly tone: 'ink' | 'fail' | 'attn';
}

const projectHref = (slug: string) => `/p/${encodeURIComponent(slug)}`;
const DAY_MS = 86_400_000;
// "New" for 7 UTC calendar days, today the first (components.md: "Days" are UTC calendar days).
const NEW_FOR_DAYS = 7;
const utcDayNumber = (instant: Date) => Math.floor(instant.getTime() / DAY_MS);
// The timeline's and run list's stand-in for a private project's run title (RunFeedRow).
const PRIVATE_TITLE = 'Private repository';

// One test's time, as the design writes it: "0.41 s" (tp-charts.js, a test's duration).

// A flaky cell draws as Flaky, whichever side of the flip it was (components.md StatusTimeline).
const cellResult = (cell: HistoryCell): PlatformResult => ({
  platform: cell.platform,
  status: cell.flaky ? 'flaky' : cell.status,
  duration: formatTestTime(cell.durationMs),
});

const isFailing = (cell: HistoryCell) =>
  !cell.flaky && (cell.status === 'failed' || cell.status === 'error');

// Design v9 item 13: one mark per run, failed or error over flaky, on the series of the first
// platform (in data order) that produced it.
function markOf(
  cells: readonly (HistoryCell | null)[],
  index: number,
  seriesOf: ReadonlyMap<number, number>,
): TrendMark | null {
  const pick = (status: TrendMark['status'], match: (cell: HistoryCell) => boolean) => {
    const slot = cells.findIndex((cell) => cell !== null && match(cell));
    const series = seriesOf.get(slot);
    return slot === -1 ? null : { index, status, series: series ?? 0 };
  };
  return pick('fail', isFailing) ?? pick('flaky', (cell) => cell.flaky);
}

function durationChart(trend: DurationByPlatform, slug: string, now: Date): HistoryChart | null {
  // Every one of the last 30 default-branch CI runs is a point (v9 item 18). A run where the
  // test skipped on a platform reads "Skipped" there; one where it has no result, "Not run".
  const slots = trend.platforms
    .map((name, slot) => ({
      name,
      slot,
      values: trend.points.map((point) => {
        const ms = point.durationsMs[slot];
        return ms === null || ms === undefined ? null : ms / 1000;
      }),
      gapLabels: trend.points.map((point) =>
        point.cells[slot]?.status === 'skipped' ? 'Skipped' : null,
      ),
    }))
    // A platform with no value in any of the runs has no line to draw.
    .filter((s) => s.values.some((value) => value !== null));
  if (trend.points.length === 0 || slots.length === 0) return null;
  const series = slots.map(({ name, values, gapLabels }) => ({ name, values, gapLabels }));
  const seriesOf = new Map(slots.map(({ slot }, index) => [slot, index]));

  return {
    title: 'Duration',
    scope: TREND_SCOPE.testDuration,
    series,
    marks: trend.points.flatMap((point, index) => markOf(point.cells, index, seriesOf) ?? []),
    format: 'sec',
    unit: 'run',
    caption: durationCaption(
      series.map((s) => s.values),
      'sec',
    ),
    // Every point is a CI run, so each has a run page (design v9 items 1 and 2).
    whens: trend.points.map((point) => point.finishedAt.toISOString()),
    hrefs: trend.points.map((point) => runHref(slug, point.runId)),
    nowYear: now.getUTCFullYear(),
  };
}

// components.md, Test history page, "Tiles" (design v8 item 40): over the strip's runs, platform
// keys verbatim; the median over the duration chart's runs.
function tiles(page: TestHistoryPage, now: Date): HistoryTile[] | null {
  const { history } = page;
  const [oldest] = history.runs;
  if (oldest === undefined) return null;
  const inOrder = (platforms: readonly string[]) =>
    history.platforms.filter((platform) => platforms.includes(platform));
  const { failedRuns, flakyCommits } = history;
  const flakyPlatforms = inOrder(history.flakyPlatforms).join(', ');
  const result: HistoryTile[] = [
    {
      label: 'Runs',
      value: formatCount(history.runs.length),
      sub: ['since ', dateLabel(oldest.finishedAt, now)],
      tone: 'ink',
    },
    {
      label: 'Failed',
      value: formatCount(failedRuns),
      sub: [
        failedRuns === 0
          ? 'on any platform'
          : `${qty(failedRuns, 'run')} · ${history.failedPlatforms.join(', ')}`,
      ],
      tone: failedRuns === 0 ? 'ink' : 'fail',
    },
    {
      label: 'Flaky',
      value: formatCount(flakyCommits),
      sub: [
        flakyCommits === 0
          ? 'none in 30 days'
          : `${flakyCommits === 1 ? 'commit' : 'commits'} in 30 days · ${flakyPlatforms}`,
      ],
      tone: flakyCommits === 0 ? 'ink' : 'attn',
    },
  ];
  // The first platform's median, others beside it; a platform with no value in the 30 runs has
  // none to give, and without the first's the tile is held back.
  const medians = history.duration.platforms.flatMap((platform, slot) => {
    const ms = history.duration.medianMs[slot];
    return ms === null || ms === undefined ? [] : [{ platform, ms }];
  });
  const [first, ...others] = medians;
  if (first !== undefined && first.platform === history.duration.platforms[0]) {
    result.push({
      label: 'Median time',
      value: formatTestTime(first.ms),
      sub: [
        others.length === 0
          ? 'last 30 CI runs'
          : [first.platform, ...others.map((o) => `${o.platform} ${formatTestTime(o.ms)}`)].join(
              ' · ',
            ),
      ],
      tone: 'ink',
    });
  }
  return result;
}

/** The page's title, which its head reads without the rest of the page (lib/queries/heads). */
export const testHistoryTitle = (
  project: { readonly name: string },
  test: { readonly name: string },
) => `${test.name} · ${project.name} · testpulse`;

export function testHistoryView(page: TestHistoryPage, now: Date): TestHistoryView {
  const { project, test, history } = page;
  const slug = project.slug;
  const isPrivate = project.visibility === 'private';
  const mismatched =
    history.mismatch.latest === null ? undefined : history.runs[history.mismatch.latest];
  const daysSinceFirstSeen = utcDayNumber(now) - utcDayNumber(test.firstSeenAt);
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
      module: test.module,
      layer: LAYER_LABEL[test.layer],
      flaky: history.flaky,
      mismatch:
        mismatched === undefined
          ? null
          : {
              text: `Platform mismatch in ${qty(history.mismatch.runs, 'run')}`,
              run: isPrivate ? PRIVATE_TITLE : mismatched.title,
              when: relativeLabel(mismatched.finishedAt, now),
            },
      firstSeen: daysSinceFirstSeen < NEW_FOR_DAYS ? relativeLabel(test.firstSeenAt, now) : null,
    },
    tiles: tiles(page, now),
    stripNote:
      history.runs.length === 0
        ? null
        : history.runs.length === 1
          ? 'One run so far'
          : 'Oldest on the left',
    timeline:
      history.initialRun === null
        ? null
        : {
            testName: test.name,
            private: isPrivate,
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
    duration: durationChart(history.duration, slug, now),
  };
}
