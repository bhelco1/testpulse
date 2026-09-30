import { now } from '../clock.ts';
import { projectSummary, type ProjectSummary } from '../stats/summary.ts';
import { createPublicClient, type PublicClient } from '../supabase/public.ts';
import { loadProject, loadSummaryInput } from './project-summary.ts';

// /how-its-tested (spec section 13; design/data-map.md, How it's tested): the live section reads
// project `testpulse` like any other, as anon through projects_public, runs_public and the
// results, tests and coverage tables. Production has no testpulse row until Phase 7 (decision
// 2026-09-28), so a missing project is an ordinary answer, never an error. Time is read once, here.

/** testpulse's own slug, as projects/testpulse.yaml registers it. */
export const SELF_SLUG = 'testpulse';

export interface SelfResults {
  /** The project's summary, as its landing card reads it. */
  readonly summary: ProjectSummary;
  /** The latest default-branch CI run's duration (runs.duration_ms); null before the first. */
  readonly latestDurationMs: number | null;
}

export interface HowItsTested {
  /** Null while testpulse is not registered, as in production before Phase 7. */
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
  return { self: { summary, latestDurationMs: latest?.durationMs ?? null } };
}
