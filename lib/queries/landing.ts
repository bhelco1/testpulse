import { z } from 'zod';

import { now } from '../clock.ts';
import {
  landingHeadline,
  projectSummary,
  type LandingHeadline,
  type ProjectSummary,
} from '../stats/summary.ts';
import { createPublicClient, type PublicClient } from '../supabase/public.ts';
import { loadSummaryInput, PROJECT_COLUMNS, ProjectRowSchema } from './project-summary.ts';

// The landing page's headline tiles and project cards (spec sections 11 and 13), read as anon
// through projects_public, runs_public and the reports, results, tests and coverage tables,
// which is all section 9 opens. A private project's rows arrive already redacted by the views;
// nothing here hides or reveals anything. Time is read once, here, and passed to lib/stats.

export interface Landing {
  readonly projects: readonly ProjectSummary[];
  readonly headline: LandingHeadline;
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

  const projects: ProjectSummary[] = [];
  for (const project of parsed.data) {
    projects.push(projectSummary(await loadSummaryInput(client, project, at), at));
  }
  return { projects, headline: landingHeadline(projects) };
}
