import { z } from 'zod';

import { now } from '../clock.ts';
import { DeclaredSuiteSchema, VisibilitySchema } from '../projects/schema.ts';
import {
  COVERAGE_COLUMNS,
  CoverageRowSchema,
  RUN_COLUMNS,
  RunRowSchema,
  TEST_LAYER_COLUMNS,
  TestLayerRowSchema,
  type StatsCoverage,
  type StatsRun,
} from '../stats/input.ts';
import { readAll, readByRunIds } from '../stats/load.ts';
import { byFinish, countsTowardTrends, latestRun, TREND_SOURCES } from '../stats/rules.ts';
import {
  landingHeadline,
  projectSummary,
  type LandingHeadline,
  type ProjectSummary,
  type ProjectSummaryInput,
  type SummaryProject,
} from '../stats/summary.ts';
import { createPublicClient, type PublicClient } from '../supabase/public.ts';

// The landing page's headline tiles and project cards (spec sections 11 and 13), read as anon
// through projects_public, runs_public and the reports, results, tests and coverage tables,
// which is all section 9 opens. A private project's rows arrive already redacted by the views;
// nothing here hides or reveals anything. Time is read once, here, and passed to lib/stats.

export interface Landing {
  readonly projects: readonly ProjectSummary[];
  readonly headline: LandingHeadline;
}

const PROJECT_COLUMNS =
  'id, slug, name, tagline, visibility, default_branch, declared_suites, ' +
  'coverage_floors, expected_cadence_days';

const ProjectRowSchema = z
  .object({
    id: z.string().min(1),
    slug: z.string().min(1),
    name: z.string().min(1),
    tagline: z.string(),
    visibility: VisibilitySchema,
    default_branch: z.string().min(1),
    declared_suites: z.array(DeclaredSuiteSchema),
    coverage_floors: z.record(z.string(), z.number()),
    expected_cadence_days: z.int().min(1),
  })
  .transform((row): SummaryProject => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    visibility: row.visibility,
    defaultBranch: row.default_branch,
    declaredSuites: row.declared_suites,
    coverageFloors: row.coverage_floors,
    expectedCadenceDays: row.expected_cadence_days,
  }));

const LastReportRowSchema = z
  .object({ finished_at: z.iso.datetime({ offset: true }) })
  .transform((row) => new Date(row.finished_at));

// How many runs' coverage one step of the walk back reads.
const COVERAGE_WALK_CHUNK = 50;

/**
 * Latest coverage per module can sit on an older run than the latest (a module whose report
 * came without coverage), so this reads newest runs first, a chunk at a time, and stops once
 * every module with a floor has a row or the runs run out. A module with no floor is shown if
 * it reported within the runs read.
 */
async function loadCoverage(
  client: PublicClient,
  project: SummaryProject,
  runs: readonly StatsRun[],
): Promise<StatsCoverage[]> {
  const newestFirst = runs
    .filter((run) => countsTowardTrends(run, project.defaultBranch))
    .sort((a, b) => byFinish(b, a))
    .map((run) => run.id);
  const wanted = Object.keys(project.coverageFloors);
  const rows: StatsCoverage[] = [];
  for (let start = 0; start < newestFirst.length; start += COVERAGE_WALK_CHUNK) {
    const ids = newestFirst.slice(start, start + COVERAGE_WALK_CHUNK);
    rows.push(
      ...(await readByRunIds('load coverage', CoverageRowSchema, ids, (chunk, from, to) =>
        client
          .from('coverage')
          .select(COVERAGE_COLUMNS)
          .in('reports.run_id', [...chunk])
          .order('id')
          .range(from, to),
      )),
    );
    const found = new Set(rows.map((row) => row.module));
    if (wanted.every((module) => found.has(module))) break;
  }
  return rows;
}

async function loadSummaryInput(
  client: PublicClient,
  project: SummaryProject,
  at: Date,
): Promise<ProjectSummaryInput> {
  // Every default-branch run, both sources: the green streak's longest has no window, and the
  // stats pick their own sources through lib/stats/rules.ts.
  const runs = await readAll('load runs', RunRowSchema, (from, to) =>
    client
      .from('runs_public')
      .select(RUN_COLUMNS)
      .eq('project_id', project.id)
      .eq('branch', project.defaultBranch)
      .in('source', [...TREND_SOURCES])
      .lte('finished_at', at.toISOString())
      .order('id')
      .range(from, to),
  );

  // A report on any branch keeps a project from going stale; imported history is not a report.
  const [lastReportAt = null] = await readAll('load the last report', LastReportRowSchema, () =>
    client
      .from('runs_public')
      .select('finished_at')
      .eq('project_id', project.id)
      .eq('source', 'ci')
      .lte('finished_at', at.toISOString())
      .order('finished_at', { ascending: false })
      .limit(1),
  );

  const latest = latestRun(runs, project.defaultBranch, at);
  const latestRunTests =
    latest === null
      ? []
      : await readAll('load the latest run tests', TestLayerRowSchema, (from, to) =>
          client
            .from('results')
            .select(TEST_LAYER_COLUMNS)
            .eq('reports.run_id', latest.id)
            .order('id')
            .range(from, to),
        );

  return {
    project,
    runs,
    lastReportAt,
    latestRunTests,
    coverage: await loadCoverage(client, project, runs),
  };
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
