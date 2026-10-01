import type {
  FailureDetail,
  PrunedTotals,
  ResultRow,
} from '../../components/ResultsTable/ResultsTable';
import type { RunReportRow } from '../../components/RunReportTable/RunReportTable';
import { formatCount, qty } from '../copy/count';
import { joinNames } from '../copy/names';
import {
  clockSecondsLabel,
  dateLabel,
  dateTimeLabel,
  formatRunDuration,
  formatTestTime,
  relativeLabel,
  type TimeLabel,
} from '../copy/time';
import { LAYER_LABEL } from '../design/layers';
import type { Visibility } from '../projects/schema';
import type { RunDetail } from '../queries/run';
import type { RunReport } from '../queries/run-rows';
import { rowDurationMs, type RunTestRow } from '../results/run-results';
import { shortSuite } from '../results/short-suite';
import { isFailing, mismatchSentence, platformMismatch } from '../results/table';
import { testHref } from './project';

// The run page, /p/[slug]/runs/[id], as its components take it (design/pages/Run Detail.dc.html,
// design/components.md "Run page" and ResultsTable, design/data-map.md "Run detail"). Pure: the
// page passes the loader's result and now. Parts the design leaves undefined are left out rather
// than guessed (docs/spec.md section 13.5).

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
    /** "Reports {n}": the run's reports; nothing records how many it should have. */
    readonly reports: string;
    /** "Attempt {k}", only on a re-run (`runs.run_attempt` above 1). */
    readonly attempt: string | null;
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
  /** The failed-run banner under the tiles; none unless the run failed and its rows say how. */
  readonly banner: FailedRunBanner | null;
  readonly reports: readonly RunReportRow[];
  readonly results:
    | {
        readonly kind: 'rows';
        readonly visibility: Visibility;
        readonly rows: readonly ResultRow[];
      }
    | { readonly kind: 'pruned'; readonly totals: PrunedTotals; readonly prunedOn: TimeLabel }
    /** An empty run: its reports held no test cases. */
    | { readonly kind: 'empty'; readonly body: string };
}

export interface FailedRunBanner {
  readonly title: string;
  readonly body: string;
  /** "Show failure" or "Show failures". */
  readonly action: string;
  /** The status filter the action sets: Failed, or Error when only errors failed the run. */
  readonly filter: 'failed' | 'error';
}

const projectHref = (slug: string) => `/p/${encodeURIComponent(slug)}`;
const sha7 = (sha: string) => sha.slice(0, 7);

// A report's row (design v8 items 26 and 27): the bar runs passed, failed, skipped; the line
// leaves out its zero parts; a report whose files held no test cases is Empty.
function reportRow(report: RunReport): RunReportRow {
  const { total, passed, failed, skipped } = report;
  const share = (count: number) => (total === 0 ? 0 : (count / total) * 100);
  const parts: [number, string][] = [
    [failed, 'failed'],
    [passed, 'passed'],
    [skipped, 'skipped'],
  ];
  return {
    key: `${report.job}/${report.module}/${report.platform}`,
    status: total === 0 ? 'empty' : failed > 0 ? 'failed' : 'passed',
    passedShare: share(passed),
    failedShare: share(failed),
    skippedShare: share(skipped),
    result:
      total === 0
        ? 'No tests in this report'
        : parts
            .filter(([count]) => count > 0)
            .map(([count, word]) => `${formatCount(count)} ${word}`)
            .join(' · '),
    tests: formatCount(total),
    received: clockSecondsLabel(report.finishedAt),
    duration: total === 0 ? '—' : formatRunDuration(report.durationMs),
  };
}

// One block per failed or error result, in platform order, each with its own status and time
// (design v7 item 3; data-map "Failure detail (several)"). A private project's blocks are the
// heads alone (design v8 item 18, v9 item 12): platform, status and time are not failure text
// (section 9), and any text that reached this far is dropped, so the page cannot print it.
const failuresOf = (row: RunTestRow, isPrivate: boolean): FailureDetail[] =>
  row.platforms.flatMap(({ platform, failures }) =>
    failures.flatMap((failure): FailureDetail[] =>
      failure.status === 'failed' || failure.status === 'error'
        ? [
            {
              platform,
              status: failure.status,
              duration: formatTestTime(failure.durationMs),
              message: isPrivate ? null : failure.message,
              detail: isPrivate ? null : failure.detail,
            },
          ]
        : [],
    ),
  );

const PRIVATE_SENTENCE =
  'This repository is private, so failure messages and stack traces are hidden.';

// Code-unit order, so the lists read the same whatever the server's locale.
const sortedUnique = (values: readonly string[]): string[] =>
  [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

// The failed-run banner (design/components.md, Run page; the Design System's four banners in
// section 10). Heads: "1 test failed: {short suite} › {name}" or "1 test errored: …", else "{f}
// tests failed", "{e} tests errored" or "{f} failed, {e} errored", each test counted once under
// its row status. Sub-line from the data: "In {module}, {layer} layer." and the mismatch sentence
// for one test; "In {modules}. On {platforms}." for several, the platforms being those that
// failed or errored; a private project adds its sentence.
function failedRunBanner(
  status: RunDetail['run']['status'],
  rows: readonly RunTestRow[] | null,
  isPrivate: boolean,
): FailedRunBanner | null {
  const failing = (rows ?? []).filter((row) => isFailing(row.status));
  const [first] = failing;
  if (status !== 'failed' || first === undefined) return null;
  const failed = failing.filter((row) => row.status === 'failed').length;
  const errored = failing.length - failed;
  const sentences: string[] = [];
  let title: string;
  if (failing.length === 1) {
    const verb = failed === 1 ? 'failed' : 'errored';
    title = `1 test ${verb}: ${shortSuite(first.suite)} › ${first.name}`;
    sentences.push(`In ${first.module}, ${LAYER_LABEL[first.layer]} layer.`);
    const mismatch = platformMismatch(first.platforms);
    if (mismatch) sentences.push(mismatchSentence(mismatch));
  } else {
    title =
      errored === 0
        ? `${formatCount(failed)} tests failed`
        : failed === 0
          ? `${formatCount(errored)} tests errored`
          : `${formatCount(failed)} failed, ${formatCount(errored)} errored`;
    const platforms = failing.flatMap((row) =>
      row.platforms.filter((outcome) => isFailing(outcome.status)).map((o) => o.platform),
    );
    sentences.push(`In ${joinNames(sortedUnique(failing.map((row) => row.module)))}.`);
    sentences.push(`On ${joinNames(sortedUnique(platforms))}.`);
  }
  if (isPrivate) sentences.push(PRIVATE_SENTENCE);
  return {
    title,
    body: sentences.join(' '),
    action: failing.length === 1 ? 'Show failure' : 'Show failures',
    filter: failed > 0 ? 'failed' : 'error',
  };
}

// components.md, Run page: "{n} reports arrived, but none held any test cases.", and the Design
// System's note for one, "1 report arrived, but it held no test cases."
const emptyRunBody = (reports: number): string =>
  reports === 1
    ? '1 report arrived, but it held no test cases.'
    : `${qty(reports, 'report')} arrived, but none held any test cases.`;

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
    time: duration === null ? '—' : formatTestTime(duration),
    historyHref: testHref(slug, row.testKey),
    failures: isFailing(row.status) ? failuresOf(row, isPrivate) : [],
  };
}

// A private project's run is headed "Run {id}", shown with a lock.
function runHeading(
  project: { readonly visibility: Visibility },
  run: { readonly ciRunId: string; readonly title: string },
): string {
  return project.visibility === 'private' ? `Run ${run.ciRunId}` : run.title;
}

/** The page's title, which its head reads without the rest of the page (lib/queries/heads). */
export const runPageTitle = (
  project: { readonly name: string; readonly visibility: Visibility },
  run: { readonly ciRunId: string; readonly title: string },
) => `${runHeading(project, run)} · ${project.name} · testpulse`;

export function runPageView(detail: RunDetail, now: Date): RunPageView {
  const { project, run } = detail;
  const isPrivate = project.visibility === 'private';
  const heading = runHeading(project, run);
  // Distinct tests (decision 2026-09-29); a pruned run has only its executions left (5.12).
  const counts = run.tests ?? run;
  const repoUrl = isPrivate ? null : project.repoUrl;
  const results = detail.results;
  return {
    title: runPageTitle(project, run),
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
      reports: formatCount(detail.reports.length),
      attempt: run.runAttempt > 1 ? String(run.runAttempt) : null,
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
    banner: failedRunBanner(run.status, results, isPrivate),
    reports: detail.reports.map(reportRow),
    results:
      results === null
        ? {
            kind: 'pruned',
            totals: { total: run.total, passed: run.passed, failed: run.failed },
            // The loader reads no results once results_pruned_at is set (5.12), so it is here.
            prunedOn: dateLabel(run.resultsPrunedAt ?? run.finishedAt, now),
          }
        : results.length === 0
          ? { kind: 'empty', body: emptyRunBody(detail.reports.length) }
          : {
              kind: 'rows',
              visibility: project.visibility,
              rows: results.map((row) => resultRow(project.slug, row, isPrivate)),
            },
  };
}
