import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { AlertSchema } from '../alerts/schema.ts';
import { DailySummarySchema, type DailySummary } from '../jobs/summary.ts';
import type { ProjectRow } from '../projects/repo.ts';
import { createSecretClient } from '../supabase/server.ts';
import { TRACKED_LINK_COLUMNS, type TrackedLinkRow } from '../tracked-links/create.ts';
import { loadLinkVisitDetail, loadLinkVisitSummaries } from '../visits/load.ts';
import type { AccessGranted } from './guard.ts';
import { type AdminProjectRow, projectSync, readDeployedProjectFiles } from './sync.ts';
import type { AdminPageData, LinkDetailData, OpenAlert, ProjectName } from './types.ts';

// Admin's reads (spec section 15, "Admin" as built; design/data-map.md, Admin). alerts,
// tracked_links, visits and heartbeats are closed to anon and authenticated, so admin reads with
// the secret client, which only adminClient makes, and only for a caller holding the guard's
// "allowed" answer (lib/admin/guard.ts): every admin page and action asks the guard first
// (lib/admin/guarded.test.ts), and lib/queries/boundary.test.ts keeps every other page, and every
// client component, from reaching this module. Errors carry the database's code and message,
// never a value.

/** The secret client, for a caller the guard has let in. */
export function adminClient(granted: AccessGranted): SupabaseClient {
  if (!granted.ok) throw new Error('admin data needs the guard’s allowed answer');
  return createSecretClient();
}

const failed = (what: string, error: { code: string; message: string }): Error =>
  new Error(`${what}: ${error.code} ${error.message}`);

const PROJECT_COLUMNS =
  'id, slug, name, tagline, description, visibility, repo_url, default_branch, dev_stack, ' +
  'test_stack, layer_rules, name_normalization, declared_suites, coverage_floors, ' +
  'expected_cadence_days, sort_order, retention_days';

const ALERT_COLUMNS = 'id, project_id, kind, detail, opened_at, resolved_at, acknowledged_at';

const EmptyReportSchema = z.object({
  id: z.uuid(),
  runs: z.object({ branch: z.string(), commit_sha: z.string() }),
});

export async function loadProjectRows(client: SupabaseClient): Promise<AdminProjectRow[]> {
  const { data, error } = await client
    .from('projects')
    .select(PROJECT_COLUMNS)
    .order('sort_order')
    .order('slug')
    .overrideTypes<(ProjectRow & { id: string })[], { merge: false }>();
  if (error) throw failed('projects', error);
  return data;
}

/** Open alerts: not resolved, which an acknowledged alert always is (spec section 5.9). */
export async function loadOpenAlerts(client: SupabaseClient): Promise<OpenAlert[]> {
  const { data, error } = await client
    .from('alerts')
    .select(ALERT_COLUMNS)
    .is('resolved_at', null)
    .order('opened_at', { ascending: false });
  if (error) throw failed('alerts', error);
  // ingest_report and check_stale write every alert in its kind's shape (lib/alerts/schema.ts;
  // lib/alerts/alerts.int.test.ts), so one that does not parse is a bug to be seen: the load fails
  // and the page shows its error state. The log names the alert's id and kind, never its detail.
  const alerts = data.map((row: { id?: unknown; kind?: unknown }) => {
    const parsed = AlertSchema.safeParse(row);
    if (!parsed.success) {
      throw new Error(`alert ${String(row.id)} (${String(row.kind)}): its detail does not parse`);
    }
    return parsed.data;
  });

  // Read after the alerts, reports first and projects last. A project deleted in between takes
  // its alerts and reports with it (on delete cascade), so an alert whose project the last read
  // no longer finds is genuinely gone and is left out, logged by its id. A project the last read
  // still finds existed when its reports were read, so an empty_run report missing then is a bug,
  // and the load fails.
  const reportIds = alerts.flatMap((alert) =>
    alert.kind === 'empty_run' ? [alert.detail.report_id] : [],
  );
  const runs = new Map<string, { branch: string; commitSha: string }>();
  if (reportIds.length > 0) {
    const reports = await client
      .from('reports')
      .select('id, runs(branch, commit_sha)')
      .in('id', reportIds);
    if (reports.error) throw failed('empty reports', reports.error);
    for (const row of reports.data) {
      const report = EmptyReportSchema.parse(row);
      runs.set(report.id, { branch: report.runs.branch, commitSha: report.runs.commit_sha });
    }
  }
  const projectIds = [...new Set(alerts.map((alert) => alert.project_id))];
  const names = new Map<string, string>();
  if (projectIds.length > 0) {
    const projects = await client.from('projects').select('id, name').in('id', projectIds);
    if (projects.error) throw failed('alert projects', projects.error);
    for (const row of projects.data as { id: string; name: string }[]) names.set(row.id, row.name);
  }

  return alerts.flatMap((alert): OpenAlert[] => {
    const name = names.get(alert.project_id);
    if (name === undefined) {
      console.error(`testpulse admin: alert ${alert.id} left out: its project has been deleted`);
      return [];
    }
    if (alert.kind !== 'empty_run') return [{ alert, projectName: name, emptyReport: null }];
    const run = runs.get(alert.detail.report_id);
    if (run === undefined) throw new Error(`alert ${alert.id} (empty_run): its report is missing`);
    return [{ alert, projectName: name, emptyReport: run }];
  });
}

/** Every tracked link, newest first. */
export async function loadTrackedLinks(client: SupabaseClient): Promise<TrackedLinkRow[]> {
  const { data, error } = await client
    .from('tracked_links')
    .select(TRACKED_LINK_COLUMNS)
    .order('created_at', { ascending: false })
    .order('id')
    .overrideTypes<TrackedLinkRow[], { merge: false }>();
  if (error) throw failed('tracked links', error);
  return data;
}

/**
 * Each project's last report: the latest finished_at of its CI runs, on any branch, at or before
 * now, as the public health marker and the stale alert read it (spec sections 11 and 12).
 */
export async function loadLastReports(
  client: SupabaseClient,
  projectIds: readonly string[],
  now: Date,
): Promise<Map<string, Date | null>> {
  const latest = await Promise.all(
    projectIds.map(async (id) => {
      const { data, error } = await client
        .from('runs')
        .select('finished_at')
        .eq('project_id', id)
        .eq('source', 'ci')
        .lte('finished_at', now.toISOString())
        .order('finished_at', { ascending: false })
        .limit(1)
        .overrideTypes<{ finished_at: string }[], { merge: false }>();
      if (error) throw failed('last report', error);
      const [run] = data;
      return [id, run === undefined ? null : new Date(run.finished_at)] as const;
    }),
  );
  return new Map(latest);
}

/** The latest daily job's summary; a heartbeat written before the job existed has none. */
export async function loadLatestJob(client: SupabaseClient): Promise<DailySummary | null> {
  const { data, error } = await client
    .from('heartbeats')
    .select('summary')
    .not('summary', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw failed('heartbeats', error);
  const [row] = data as { summary: unknown }[];
  return row === undefined ? null : DailySummarySchema.parse(row.summary);
}

export async function loadAdminPage(client: SupabaseClient, now: Date): Promise<AdminPageData> {
  const files = readDeployedProjectFiles();
  const rows = await loadProjectRows(client);
  const [alerts, links, linkFigures, lastReports, job] = await Promise.all([
    loadOpenAlerts(client),
    loadTrackedLinks(client),
    loadLinkVisitSummaries(client),
    loadLastReports(
      client,
      rows.map((row) => row.id),
      now,
    ),
    loadLatestJob(client),
  ]);
  return { alerts, links, linkFigures, projects: projectSync(files, rows), lastReports, job };
}

/** One tracked link with its figures, or null for an id that is not one. */
export async function loadLinkDetail(
  client: SupabaseClient,
  id: string,
): Promise<LinkDetailData | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { data, error } = await client
    .from('tracked_links')
    .select(TRACKED_LINK_COLUMNS)
    .eq('id', id)
    .maybeSingle<TrackedLinkRow>();
  if (error) throw failed('tracked link', error);
  if (data === null) return null;
  const [figures, projects] = await Promise.all([
    loadLinkVisitDetail(client, id),
    client
      .from('projects')
      .select('id, slug, name, visibility')
      .order('sort_order')
      .overrideTypes<ProjectName[], { merge: false }>(),
  ]);
  if (projects.error) throw failed('projects', projects.error);
  return { link: data, figures, projects: projects.data };
}

function couldNotLoad(error: unknown): null {
  // Database codes and messages, and a missing setting's name; never a value.
  console.error(
    `testpulse admin: couldn’t load: ${error instanceof Error ? error.message : String(error)}`,
  );
  return null;
}

/** Everything /admin shows, or null when it could not be read (the drawn error state). */
export async function readAdminPage(
  granted: AccessGranted,
  now: Date,
): Promise<AdminPageData | null> {
  try {
    return await loadAdminPage(adminClient(granted), now);
  } catch (error) {
    return couldNotLoad(error);
  }
}

/** One link's page: its data, null for no such link, or 'error' when it could not be read. */
export async function readLinkDetail(
  granted: AccessGranted,
  id: string,
): Promise<LinkDetailData | null | 'error'> {
  try {
    return await loadLinkDetail(adminClient(granted), id);
  } catch (error) {
    couldNotLoad(error);
    return 'error';
  }
}
