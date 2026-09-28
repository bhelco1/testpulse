import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import {
  COVERAGE_COLUMNS,
  CoverageRowSchema,
  RESULT_COLUMNS,
  ResultRowSchema,
  RUN_COLUMNS,
  RunRowSchema,
  type StatsCoverage,
  type StatsResult,
  type StatsRun,
} from './input.ts';
import { CI_ONLY_SOURCES, TREND_SOURCES, windowStart } from './rules.ts';

// Loads what the section 11 trends, time to green and flakiness read for one project. It uses
// only what section 9 opens to the anon role (projects_public, runs_public, and the reports,
// coverage and results tables), so the browser's publishable-key client can call it too.

export interface StatsInput {
  readonly projectId: string;
  readonly defaultBranch: string;
  /**
   * Default-branch runs from both sources finished in the last 90 UTC days up to now, plus the
   * latest CI run before that, which time to green needs to tell whether the first run of the
   * window turned the branch red. Stats apply their own window and source rules.
   */
  readonly runs: readonly StatsRun[];
  /** Coverage rows of the loaded runs in the 90-day window. */
  readonly coverage: readonly StatsCoverage[];
  /** Results of the loaded runs in the 30-day window, the most any stat here reads. */
  readonly results: readonly StatsResult[];
}

const LONGEST_WINDOW_DAYS = 90;
const RESULTS_WINDOW_DAYS = 30;

// PostgREST caps a response at max_rows (1000 in supabase/config.toml), so reads page by id.
const PAGE_SIZE = 1000;
// Keeps an `in` filter of UUIDs to a few kilobytes of URL.
const ID_CHUNK = 100;

type Response = PromiseLike<{ data: unknown; error: PostgrestError | null }>;

const failed = (what: string, error: PostgrestError): Error =>
  new Error(`${what}: ${error.code} ${error.message}`);

export async function readAll<S extends z.ZodType>(
  what: string,
  schema: S,
  page: (from: number, to: number) => Response,
): Promise<Array<z.output<S>>> {
  const rows: Array<z.output<S>> = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw failed(what, error);
    const parsed = z.array(schema).safeParse(data);
    if (!parsed.success) throw new Error(`${what} returned an unexpected row`);
    rows.push(...parsed.data);
    if (parsed.data.length < PAGE_SIZE) return rows;
  }
}

export async function readByRunIds<S extends z.ZodType>(
  what: string,
  schema: S,
  runIds: readonly string[],
  page: (ids: readonly string[], from: number, to: number) => Response,
): Promise<Array<z.output<S>>> {
  const rows: Array<z.output<S>> = [];
  for (let start = 0; start < runIds.length; start += ID_CHUNK) {
    const ids = runIds.slice(start, start + ID_CHUNK);
    rows.push(...(await readAll(what, schema, (from, to) => page(ids, from, to))));
  }
  return rows;
}

const ProjectRowSchema = z.object({ id: z.string().min(1), default_branch: z.string().min(1) });

export async function loadStatsInput(
  client: SupabaseClient,
  slug: string,
  now: Date,
): Promise<StatsInput> {
  const project = await client
    .from('projects_public')
    .select('id, default_branch')
    .eq('slug', slug)
    .maybeSingle();
  if (project.error) throw failed(`look up project "${slug}"`, project.error);
  if (project.data === null) throw new Error(`project "${slug}" not found`);
  const parsedProject = ProjectRowSchema.safeParse(project.data);
  if (!parsedProject.success) throw new Error(`project "${slug}" returned an unexpected row`);
  const { id: projectId, default_branch: defaultBranch } = parsedProject.data;

  const since = windowStart(now, LONGEST_WINDOW_DAYS).toISOString();
  const runsOfProject = () =>
    client
      .from('runs_public')
      .select(RUN_COLUMNS)
      .eq('project_id', projectId)
      .eq('branch', defaultBranch);

  const windowRuns = await readAll('load runs', RunRowSchema, (from, to) =>
    runsOfProject()
      .in('source', [...TREND_SOURCES])
      .gte('finished_at', since)
      .lte('finished_at', now.toISOString())
      .order('id')
      .range(from, to),
  );

  // Same order as byFinish in rules.ts, newest first.
  const before = await readAll('load the run before the window', RunRowSchema, () =>
    runsOfProject()
      .in('source', [...CI_ONLY_SOURCES])
      .lt('finished_at', since)
      .order('finished_at', { ascending: false })
      .order('started_at', { ascending: false })
      .order('ci_run_id', { ascending: false })
      .order('run_attempt', { ascending: false })
      .limit(1),
  );

  const windowRunIds = windowRuns.map((run) => run.id);
  const coverage = await readByRunIds(
    'load coverage',
    CoverageRowSchema,
    windowRunIds,
    (ids, from, to) =>
      client
        .from('coverage')
        .select(COVERAGE_COLUMNS)
        .in('reports.run_id', [...ids])
        .order('id')
        .range(from, to),
  );

  const resultsSince = windowStart(now, RESULTS_WINDOW_DAYS).getTime();
  const resultRunIds = windowRuns
    .filter((run) => run.finishedAt.getTime() >= resultsSince)
    .map((run) => run.id);
  const results = await readByRunIds(
    'load results',
    ResultRowSchema,
    resultRunIds,
    (ids, from, to) =>
      client
        .from('results')
        .select(RESULT_COLUMNS)
        .in('reports.run_id', [...ids])
        .order('id')
        .range(from, to),
  );

  return { projectId, defaultBranch, runs: [...before, ...windowRuns], coverage, results };
}
