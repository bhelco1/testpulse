import { z } from 'zod';

import { now } from '../clock.ts';
import type { Visibility } from '../projects/schema.ts';
import type { PublicRun } from '../stats/input.ts';
import { byFinish, countsTowardCiOnlyStats, latestRun } from '../stats/rules.ts';
import {
  landingHeadline,
  projectSummary,
  type LandingHeadline,
  type ProjectSummary,
} from '../stats/summary.ts';
import { testOutcomesByRun, type RunTests } from '../stats/test-counts.ts';
import { createPublicClient, type PublicClient } from '../supabase/public.ts';
import { loadSummaryInput, PROJECT_COLUMNS, ProjectRowSchema } from './project-summary.ts';
import {
  loadLatestRunDetail,
  loadReportCounts,
  loadResults,
  toListedRun,
  type LatestRunDetail,
  type ListedRun,
} from './run-rows.ts';

// The landing page's headline tiles, project cards and recent runs (spec sections 11 and 13),
// read as anon through projects_public, runs_public and the reports, results, tests and coverage
// tables, which is all section 9 opens. A private project's rows arrive already redacted by the
// views; nothing here hides or reveals anything. Time is read once, here, and passed to lib/stats.

export interface LandingProject extends ProjectSummary {
  /** The latest default-branch CI run's reports, failing tests and duration; null before the first. */
  readonly latestRunDetail: LatestRunDetail | null;
}

/** A row of the recent runs feed: the run, its project, and its distinct tests. */
export interface RecentRun extends ListedRun {
  readonly project: {
    readonly slug: string;
    readonly name: string;
    readonly visibility: Visibility;
  };
  /** Distinct tests, as the project page's run rows count them; null once results are pruned (5.12). */
  readonly tests: RunTests | null;
}

export interface Landing {
  readonly projects: readonly LandingProject[];
  readonly headline: LandingHeadline;
  readonly recentRuns: readonly RecentRun[];
}

/** The landing feed's length (design/data-map.md, "Recent runs"). */
export const RECENT_RUNS = 3;

type FeedCandidate = { readonly run: PublicRun; readonly project: RecentRun['project'] };

async function loadRecentRuns(
  client: PublicClient,
  candidates: readonly FeedCandidate[],
): Promise<RecentRun[]> {
  // Default-branch CI runs only (decision 2026-09-26): imported history is not a report.
  const shown = [...candidates].sort((a, b) => byFinish(b.run, a.run)).slice(0, RECENT_RUNS);
  const ids = shown.map(({ run }) => run.id);
  const counts = await loadReportCounts(client, ids);
  const counted = shown.filter(({ run }) => run.resultsPrunedAt === null).map(({ run }) => run.id);
  const tests = testOutcomesByRun(counted, await loadResults(client, counted));
  return shown.map(({ run, project }) => ({
    ...toListedRun(run, counts.get(run.id) ?? 0),
    project,
    tests: tests.get(run.id) ?? null,
  }));
}

export async function loadLanding(
  client: PublicClient = createPublicClient(),
  at: Date = now(),
): Promise<Landing> {
  const { data, error } = await client
    .from('projects_public')
    .select(PROJECT_COLUMNS)
    .order('sort_order')
    .order('slug');
  if (error) throw new Error(`list projects: ${error.code} ${error.message}`);
  const parsed = z.array(ProjectRowSchema).safeParse(data);
  if (!parsed.success) throw new Error('list projects returned an unexpected row');

  const projects: LandingProject[] = [];
  const candidates: FeedCandidate[] = [];
  for (const project of parsed.data) {
    const input = await loadSummaryInput(client, project, at);
    const latest = latestRun(input.runs, project.defaultBranch, at);
    projects.push({
      ...projectSummary(input, at),
      latestRunDetail: latest === null ? null : await loadLatestRunDetail(client, latest),
    });
    const { slug, name, visibility } = project;
    for (const run of input.runs) {
      if (countsTowardCiOnlyStats(run, project.defaultBranch)) {
        candidates.push({ run, project: { slug, name, visibility } });
      }
    }
  }
  return {
    projects,
    headline: landingHeadline(projects),
    recentRuns: await loadRecentRuns(client, candidates),
  };
}
