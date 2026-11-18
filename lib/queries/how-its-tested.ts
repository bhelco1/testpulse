import { now } from '../clock.ts';
import { latestCoverageWithLines, type ModuleCoverageWithLines } from '../stats/coverage.ts';
import { projectSummary, summaryAsOf, type ProjectSummary } from '../stats/summary.ts';
import { createPublicClient, type PublicClient } from '../supabase/public.ts';
import { loadProject, loadSummaryInput } from './project-summary.ts';

// /how-its-tested (spec section 13; design/data-map.md, How it's tested): the live section reads
// project `testpulse` like any other, as anon through projects_public, runs_public, the coverage
// table and the database's test counts (lib/queries/aggregates.ts). Production had no testpulse row until self-reporting went
// live on 2026-10-07, so a missing project is an ordinary answer, never an error. Time is read once, here.

/** testpulse's own slug, as projects/testpulse.yaml registers it. */
export const SELF_SLUG = 'testpulse';

export interface SelfResults {
  /** The project's summary, as its landing card reads it. */
  readonly summary: ProjectSummary;
  /** When the project last reported, which its health is counted from (section 11). */
  readonly lastReportAt: Date | null;
  /** The latest default-branch CI run's duration (runs.duration_ms); null before the first. */
  readonly latestDurationMs: number | null;
  /**
   * The coverage card's rows (design v12; data-map v11): the summary's latest coverage per
   * module, with the line counts its note prints.
   */
  readonly coverage: readonly ModuleCoverageWithLines[];
}

export interface HowItsTested {
  /** Null while testpulse is not registered, as in production before 2026-10-07. */
  readonly self: SelfResults | null;
}

export async function loadHowItsTested(
  client: PublicClient = createPublicClient(),
  at: Date = now(),
): Promise<HowItsTested> {
  const project = await loadProject(client, SELF_SLUG);
  if (project === null) return { self: null };
  const input = await loadSummaryInput(client, project, at);
  const summary = projectSummary(input, at);
  const latestId = summary.latestRun?.id;
  const latest = input.runs.find((run) => run.id === latestId);
  const coverage = latestCoverageWithLines(input.runs, input.coverage, {
    defaultBranch: project.defaultBranch,
    floors: project.coverageFloors,
  });
  return {
    self: {
      summary,
      lastReportAt: input.lastReportAt,
      latestDurationMs: latest?.durationMs ?? null,
      coverage,
    },
  };
}

/**
 * The section as of `at`, from one read as of another instant of the same UTC day
 * (lib/queries/read-minute.ts): health and Red now are recomputed at the exact instant
 * (decision 2026-11-17).
 */
export function howItsTestedAsOf(page: HowItsTested, at: Date): HowItsTested {
  const { self } = page;
  if (self === null) return page;
  return { self: { ...self, summary: summaryAsOf(self.summary, self.lastReportAt, at) } };
}
