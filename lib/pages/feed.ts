import type { FeedRun } from '../../components/RunFeedRow/RunFeedRow';
import { formatRunDuration, relativeLabel } from '../copy/time';
import type { Visibility } from '../projects/schema';
import type { ListedRun } from '../queries/run-rows';
import type { RunTests } from '../stats/test-counts';

// A run as a RunFeedRow shows it, on the landing feed and the project page's run list alike
// (design/components.md, RunFeedRow: "Same on every page"). Pure: now is passed in.

export const runHref = (slug: string, runId: string): string =>
  `/p/${encodeURIComponent(slug)}/runs/${runId}`;

export interface FeedProject {
  readonly slug: string;
  readonly name: string;
  readonly visibility: Visibility;
}

export function feedRun(
  run: ListedRun & { readonly tests: RunTests | null },
  project: FeedProject,
  now: Date,
): FeedRun {
  // Distinct tests, as the latest-run card counts them (decision 2026-09-29). A pruned run has
  // none left to count and keeps its executions until the design defines its row (13.2).
  const tests = run.tests ?? run;
  const base = {
    id: run.id,
    href: runHref(project.slug, run.id),
    project: project.name,
    branch: run.branch,
    sha: run.commitSha.slice(0, 7),
    when: relativeLabel(run.finishedAt, now),
  };
  // A private project's row shows no title (design/components.md, RunFeedRow).
  const title =
    project.visibility === 'private'
      ? { visibility: 'private' as const }
      : { visibility: 'public' as const, title: run.title };
  switch (run.status) {
    case 'passed':
      return {
        ...base,
        ...title,
        status: 'passed',
        total: tests.total,
        duration: formatRunDuration(run.durationMs),
      };
    case 'failed':
      return {
        ...base,
        ...title,
        status: 'failed',
        failed: tests.failed,
        passed: tests.passed,
        total: tests.total,
      };
    case 'empty':
      return { ...base, ...title, status: 'empty', reports: run.reports };
  }
}
