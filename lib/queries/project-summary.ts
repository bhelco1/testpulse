import { z } from 'zod';

import { DeclaredSuiteSchema, SLUG_PATTERN, VisibilitySchema } from '../projects/schema.ts';
import {
  COVERAGE_COLUMNS,
  CoverageRowSchema,
  PUBLIC_RUN_COLUMNS,
  PublicRunRowSchema,
  TEST_LAYER_COLUMNS,
  TestLayerRowSchema,
  type PublicRun,
  type StatsCoverage,
} from '../stats/input.ts';
import { readAll, readByRunIds } from '../stats/load.ts';
import { byFinish, countsTowardTrends, latestRun, TREND_SOURCES } from '../stats/rules.ts';
import type { ProjectSummaryInput, SummaryProject } from '../stats/summary.ts';
import type { PublicClient } from '../supabase/public.ts';

// What the landing page's project cards and the project page both read for one project (spec
// sections 11 and 13), as anon: projects_public, runs_public, and the reports, results, tests
// and coverage tables, which is all section 9 opens. A private project's rows arrive already
// redacted by the views; nothing here hides or reveals anything.

export const PROJECT_COLUMNS =
  'id, slug, name, tagline, visibility, default_branch, declared_suites, ' +
  'coverage_floors, expected_cadence_days';

const projectFields = {
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  tagline: z.string(),
  visibility: VisibilitySchema,
  default_branch: z.string().min(1),
  declared_suites: z.array(DeclaredSuiteSchema),
  coverage_floors: z.record(z.string(), z.number()),
  expected_cadence_days: z.int().min(1),
};

type ProjectFields = z.output<z.ZodObject<typeof projectFields>>;

const toSummaryProject = (row: ProjectFields): SummaryProject => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  tagline: row.tagline,
  visibility: row.visibility,
  defaultBranch: row.default_branch,
  declaredSuites: row.declared_suites,
  coverageFloors: row.coverage_floors,
  expectedCadenceDays: row.expected_cadence_days,
});

export const ProjectRowSchema = z.object(projectFields).transform(toSummaryProject);

const StackSchema = z.array(z.object({ category: z.string(), items: z.array(z.string()) }));

/** The project page's own columns beside the card's. */
export const PROJECT_DETAIL_COLUMNS = `${PROJECT_COLUMNS}, description, repo_url, dev_stack, test_stack`;

export const ProjectDetailRowSchema = z
  .object({
    ...projectFields,
    description: z.string(),
    // projects_public nulls it for a private project (section 9).
    repo_url: z.string().nullable(),
    dev_stack: StackSchema,
    test_stack: StackSchema,
  })
  .transform((row) => ({
    ...toSummaryProject(row),
    description: row.description,
    repoUrl: row.repo_url,
    devStack: row.dev_stack,
    testStack: row.test_stack,
  }));

export type ProjectDetail = z.output<typeof ProjectDetailRowSchema>;

/**
 * One project by its URL slug, or null when there is none. A slug that could never exist (5.1)
 * is not looked up, so a malformed URL segment never reaches the database.
 */
export async function loadProject(
  client: PublicClient,
  slug: string,
): Promise<ProjectDetail | null> {
  if (!SLUG_PATTERN.test(slug)) return null;
  const [project = null] = await readAll('look up the project', ProjectDetailRowSchema, () =>
    client.from('projects_public').select(PROJECT_DETAIL_COLUMNS).eq('slug', slug).limit(1),
  );
  return project;
}

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
  runs: readonly PublicRun[],
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

export interface SummaryInput extends ProjectSummaryInput {
  readonly runs: readonly PublicRun[];
}

export async function loadSummaryInput(
  client: PublicClient,
  project: SummaryProject,
  at: Date,
): Promise<SummaryInput> {
  // Every default-branch run, both sources: the green streak's longest has no window, and the
  // stats pick their own sources through lib/stats/rules.ts.
  const runs = await readAll('load runs', PublicRunRowSchema, (from, to) =>
    client
      .from('runs_public')
      .select(PUBLIC_RUN_COLUMNS)
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
