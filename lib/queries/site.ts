import { z } from 'zod';

import { now } from '../clock.ts';
import { readAll } from '../stats/load.ts';
import { createPublicClient, type PublicClient } from '../supabase/public.ts';

// What the header and footer of every public page read (design/components.md, SiteHeader,
// ProjectSwitcher, SiteFooter), as anon: each project with its latest run's status for the
// project switcher, and when the last report arrived for the footer. Time is read once, here.
// - "Latest run" is the latest default-branch CI run, as on the landing card (section 11).
// - The last report is the latest finished_at of any project's CI runs on any branch, the time
//   section 11 dates a report by for staleness. reports.created_at is when a row was written,
//   which for seeded data is when the seed ran, not when the run finished.

export type SwitcherStatus = 'passed' | 'failed' | 'empty' | 'not_reporting';

export interface SiteProject {
  readonly slug: string;
  readonly name: string;
  readonly status: SwitcherStatus;
}

export interface SiteChrome {
  readonly projects: readonly SiteProject[];
  readonly lastReportAt: Date | null;
}

const ProjectRowSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  default_branch: z.string().min(1),
});

const StatusRowSchema = z
  .object({ status: z.enum(['passed', 'failed', 'empty']) })
  .transform((row) => row.status);

const FinishedRowSchema = z
  .object({ finished_at: z.iso.datetime({ offset: true }) })
  .transform((row) => new Date(row.finished_at));

export async function loadSiteChrome(
  client: PublicClient = createPublicClient(),
  at: Date = now(),
): Promise<SiteChrome> {
  const until = at.toISOString();
  const rows = await readAll('list the projects', ProjectRowSchema, () =>
    client
      .from('projects_public')
      .select('id, slug, name, default_branch')
      .order('sort_order')
      .order('slug'),
  );
  const projects = await Promise.all(
    rows.map(async (project): Promise<SiteProject> => {
      const [status = 'not_reporting'] = await readAll(
        'load the latest run status',
        StatusRowSchema,
        () =>
          client
            .from('runs_public')
            .select('status')
            .eq('project_id', project.id)
            .eq('branch', project.default_branch)
            .eq('source', 'ci')
            .lte('finished_at', until)
            .order('finished_at', { ascending: false })
            .order('started_at', { ascending: false })
            .order('ci_run_id', { ascending: false })
            .order('run_attempt', { ascending: false })
            .limit(1),
      );
      return { slug: project.slug, name: project.name, status };
    }),
  );
  const [lastReportAt = null] = await readAll('load the last report', FinishedRowSchema, () =>
    client
      .from('runs_public')
      .select('finished_at')
      .eq('source', 'ci')
      .lte('finished_at', until)
      .order('finished_at', { ascending: false })
      .limit(1),
  );
  return { projects, lastReportAt };
}
