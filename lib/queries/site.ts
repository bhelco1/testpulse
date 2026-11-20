import { z } from 'zod';

import { now } from '../clock.ts';
import { RUN_COLUMNS, RunRowSchema, type StatsRun } from '../stats/input.ts';
import { readAll } from '../stats/load.ts';
import { anySettledByTime, latestSettledRun } from '../stats/settled.ts';
import { createPublicClient, type PublicClient } from '../supabase/public.ts';
import { loadSettleReports, type ReceivedReport } from './run-rows.ts';

// What the header and footer of every public page read (design/components.md, SiteHeader,
// ProjectSwitcher, SiteFooter), as anon: each project with its latest run's status for the
// project switcher and its id for the test kind of the not-found page ("Latest {project}
// results"), and when the last report arrived for the footer. Time is read once, here.
// - "Latest run" is the latest settled default-branch CI run, as on the landing card (section 11,
//   lib/stats/settled.ts): the newest runs are read back a page at a time, with their reports,
//   until one has settled by time or the runs run out.
// - The last report is the latest finished_at of any project's CI runs on any branch, the time
//   section 11 dates a report by for staleness. reports.created_at is when a row was written,
//   which for seeded data is when the seed ran, not when the run finished.

export type SwitcherStatus = 'passed' | 'failed' | 'empty' | 'not_reporting';

export interface SiteProject {
  readonly slug: string;
  readonly name: string;
  readonly status: SwitcherStatus;
  /** The latest default-branch CI run; null before the project has one. */
  readonly latestRunId: string | null;
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

// Runs read per step back: the newest has usually settled, or the one before it has by time.
const RUN_PAGE = 5;

interface SwitcherProject {
  readonly id: string;
  readonly default_branch: string;
}

async function loadLatestSettledRun(
  client: PublicClient,
  project: SwitcherProject,
  at: Date,
): Promise<StatsRun | null> {
  const runs: StatsRun[] = [];
  const receipts: ReceivedReport[] = [];
  for (let from = 0; ; from += RUN_PAGE) {
    const page = await readAll('load the latest run status', RunRowSchema, () =>
      client
        .from('runs_public')
        .select(RUN_COLUMNS)
        .eq('project_id', project.id)
        .eq('branch', project.default_branch)
        .eq('source', 'ci')
        .lte('finished_at', at.toISOString())
        .order('finished_at', { ascending: false })
        .order('started_at', { ascending: false })
        .order('ci_run_id', { ascending: false })
        .order('run_attempt', { ascending: false })
        .range(from, from + RUN_PAGE - 1),
    );
    runs.push(...page);
    receipts.push(
      ...(await loadSettleReports(
        client,
        page.map((run) => run.id),
        at,
      )),
    );
    if (page.length < RUN_PAGE || anySettledByTime(receipts, at)) break;
  }
  return latestSettledRun(runs, receipts, { defaultBranch: project.default_branch, now: at });
}

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
      const latest = await loadLatestSettledRun(client, project, at);
      return {
        slug: project.slug,
        name: project.name,
        status: latest?.status ?? 'not_reporting',
        latestRunId: latest?.id ?? null,
      };
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
