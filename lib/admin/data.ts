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

function leftOutRow(id: unknown): [] {
  console.error(`testpulse admin: alert ${String(id)} left out: its detail does not parse`);
  return [];
}

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
export async function loadOpenAlerts(
  client: SupabaseClient,
  projects: readonly Pick<ProjectName, 'id' | 'name'>[],
): Promise<OpenAlert[]> {
  const { data, error } = await client
    .from('alerts')
    .select(ALERT_COLUMNS)
    .is('resolved_at', null)
    .order('opened_at', { ascending: false });
  if (error) throw failed('alerts', error);
  // ingest_report and check_stale write every alert in its kind's shape (lib/alerts/schema.ts;
  // lib/alerts/alerts.int.test.ts), so a row that does not parse was written by hand. It is left
  // out and logged by its id, rather than taking the rest of admin down with it.
  const alerts = data.flatMap((row: { id?: unknown }) => {
    const parsed = AlertSchema.safeParse(row);
    if (parsed.success) return [parsed.data];
    return leftOutRow(row.id);
  });

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

  // The reads are not one snapshot: a project registered after its row was read, or deleted (with
  // its alerts and reports) after the alerts were, leaves an alert this load cannot name or place.
  // It is left out and logged by its id; the next load reads it, or finds it gone.
  const names = new Map(projects.map((project) => [project.id, project.name]));
  const leftOut = (id: string, why: string): [] => {
    console.error(`testpulse admin: alert ${id} left out: ${why}`);
    return [];
  };
  return alerts.flatMap((alert): OpenAlert[] => {
    const name = names.get(alert.project_id);
    if (name === undefined) return leftOut(alert.id, 'its project was not read');
    if (alert.kind !== 'empty_run') return [{ alert, projectName: name, emptyReport: null }];
    const run = runs.get(alert.detail.report_id);
    if (run === undefined) return leftOut(alert.id, 'its report was not read');
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
    loadOpenAlerts(client, rows),
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
