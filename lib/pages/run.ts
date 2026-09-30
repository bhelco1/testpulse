import type {
  FailureDetail,
  PrunedTotals,
  ResultRow,
} from '../../components/ResultsTable/ResultsTable';
import type { RunReportRow } from '../../components/RunReportTable/RunReportTable';
import { formatTrendValue } from '../charts/format';
import { formatCount } from '../copy/count';
import {
  clockSecondsLabel,
  dateTimeLabel,
  formatRunDuration,
  relativeLabel,
  type TimeLabel,
} from '../copy/time';
import type { Visibility } from '../projects/schema';
import type { RunDetail } from '../queries/run';
import type { RunReport } from '../queries/run-rows';
import { rowDurationMs, type RunTestRow } from '../results/run-results';
import { isFailing } from '../results/table';
import { testHref } from './project';

// The run page, /p/[slug]/runs/[id], as its components take it (design/pages/Run Detail.dc.html,
// design/components.md ResultsTable, design/data-map.md "Run detail"). Pure: the page passes the
// loader's result and now. Parts the design leaves undefined are left out rather than guessed
// (docs/spec.md section 13.5).

export interface RunPageView {
  readonly title: string;
  readonly crumbs: {
    readonly items: readonly { readonly label: string; readonly href: string }[];
    readonly current: string;
  };
  readonly status: RunDetail['run']['status'];
  readonly when: TimeLabel;
  /** The run's title; a private project's run is "Run {id}", shown with a lock. */
  readonly heading: { readonly text: string; readonly private: boolean };
  readonly meta: {
    readonly branch: string;
    /** Seven characters; linked to the commit on a public project with a repository. */
    readonly commit: { readonly text: string; readonly href: string | null };
    readonly event: string;
    readonly started: TimeLabel;
    /** The CI run's page; none for a private project, whose run_url runs_public nulls. */
    readonly ciHref: string | null;
  };
  readonly tiles: {
    readonly tests: string;
    readonly passed: string;
    readonly failed: string;
    readonly skipped: string;
    readonly duration: string;
    /** The Failed tile takes --fail-tint when the run failed. */
    readonly failTone: boolean;
  };
  readonly reports: readonly RunReportRow[];
  /** Null for a run with no results to list and none pruned: an empty run, not drawn (13.5). */
  readonly results:
    | {
        readonly kind: 'rows';
        readonly visibility: Visibility;
        readonly rows: readonly ResultRow[];
      }
    | { readonly kind: 'pruned'; readonly totals: PrunedTotals }
    | null;
}

const projectHref = (slug: string) => `/p/${encodeURIComponent(slug)}`;
const sha7 = (sha: string) => sha.slice(0, 7);

// One test's time, as the design writes it: "0.41 s" (tp-charts.js, a test's duration).
const testSeconds = (ms: number): string => formatTrendValue(ms / 1000, 'sec', true);

function reportRow(report: RunReport): RunReportRow {
  const { total, passed, failed } = report;
  const share = (count: number) => (total === 0 ? 0 : (count / total) * 100);
  return {
    key: `${report.job}/${report.module}/${report.platform}`,
    status: total === 0 ? null : failed > 0 ? 'failed' : 'passed',
    // Skipped tests have no colour or words in the design, so their share of the bar is the
    // track and the line leaves them out (13.5).
    passedShare: share(passed),
    failedShare: share(failed),
    result:
      total === 0
        ? null
        : failed > 0
          ? `${formatCount(failed)} failed · ${formatCount(passed)} passed`
          : `${formatCount(passed)} passed`,
    tests: formatCount(total),
    received: clockSecondsLabel(report.finishedAt),
    duration: formatRunDuration(report.durationMs),
  };
}

// One block per failed or error result, in platform order, each with its own status and time
// (design v7 item 3; data-map "Failure detail (several)").
const failuresOf = (row: RunTestRow): FailureDetail[] =>
  row.platforms.flatMap(({ platform, failures }) =>
    failures.flatMap((failure): FailureDetail[] =>
      failure.status === 'failed' || failure.status === 'error'
        ? [
            {
              platform,
              status: failure.status,
              duration: testSeconds(failure.durationMs),
              message: failure.message,
              detail: failure.detail,
            },
          ]
        : [],
    ),
  );

function resultRow(slug: string, row: RunTestRow, isPrivate: boolean): ResultRow {
  const duration = rowDurationMs(row.platforms);
  return {
    key: row.testKey,
    suite: row.suite,
    name: row.name,
    status: row.status,
    layer: row.layer,
    flaky: row.flaky,
    platforms: row.platforms.map(({ platform, status }) => ({ platform, status })),
    time: duration === null ? '—' : testSeconds(duration),
    historyHref: testHref(slug, row.testKey),
    // Row-level security returns no failure text for a private project (section 9); none is
    // passed on even if some arrived, so the page cannot print it.
    failures: isPrivate || !isFailing(row.status) ? [] : failuresOf(row),
  };
}

export function runPageView(detail: RunDetail, now: Date): RunPageView {
  const { project, run } = detail;
  const isPrivate = project.visibility === 'private';
  const heading = isPrivate ? `Run ${run.ciRunId}` : run.title;
  // Distinct tests (decision 2026-09-29); a pruned run has only its executions left (5.12).
  const counts = run.tests ?? run;
  const repoUrl = isPrivate ? null : project.repoUrl;
  const results = detail.results;
  return {
    title: `${heading} · ${project.name} · testpulse`,
    crumbs: {
      items: [
        { label: 'Overview', href: '/' },
        { label: project.name, href: projectHref(project.slug) },
      ],
      current: `Run ${run.ciRunId}`,
    },
    status: run.status,
    when: relativeLabel(run.finishedAt, now),
    heading: { text: heading, private: isPrivate },
    meta: {
      branch: run.branch,
      commit: {
        text: sha7(run.commitSha),
        href: repoUrl === null ? null : `${repoUrl}/commit/${run.commitSha}`,
      },
      event: run.event,
      started: dateTimeLabel(run.startedAt, now),
      ciHref: isPrivate ? null : run.runUrl,
    },
    tiles: {
      tests: formatCount(counts.total),
      passed: formatCount(counts.passed),
      failed: formatCount(counts.failed),
      skipped: formatCount(counts.skipped),
      duration: formatRunDuration(run.durationMs),
      failTone: run.status === 'failed',
    },
    reports: detail.reports.map(reportRow),
    results:
      results === null
        ? { kind: 'pruned', totals: { total: run.total, passed: run.passed, failed: run.failed } }
        : results.length === 0
          ? null
          : {
              kind: 'rows',
              visibility: project.visibility,
              rows: results.map((row) => resultRow(project.slug, row, isPrivate)),
            },
  };
}
