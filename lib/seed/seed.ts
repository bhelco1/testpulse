import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { backfillSourceFor } from '../backfill/sources.ts';
import { findBackfillTarget, writeBackfill } from '../backfill/write.ts';
import { ReportMetaSchema } from '../ingest/meta.ts';
import {
  type CoverageInput,
  type IngestProject,
  normalizeReport,
  type ParsedResults,
} from '../ingest/normalize.ts';
import { parseIstanbulSummary, parseJacoco, parseJestJson, parseJunit } from '../parsers/index.ts';
import { loadProjectFile, PROJECTS_DIR, projectFilePath } from '../projects/files.ts';
import { addProject } from '../projects/repo.ts';
import type { ProjectFile, Visibility } from '../projects/schema.ts';
import { placeReport, type SeedPlan, type SeedReport, type SeedSlug } from './plan.ts';

// Writes a SeedPlan through the code production uses: addProject registers each project from
// its projects/<slug>.yaml, backfill_run imports the history exactly as `npm run backfill` does,
// and every report goes through the real parsers, normalizeReport and ingest_report. The one
// step the route does not take is placeReport, which moves a report to its planned time.
//
// The route itself (POST /api/v1/reports) is not used: it takes each report's start from the
// file, which for a fixture is always the moment of capture, and what it adds before that
// (key, rate limit, multipart reading) is proven by lib/ingest/ingest.int.test.ts.

export interface SeededProject {
  readonly slug: SeedSlug;
  readonly visibility: Visibility;
  readonly ciRuns: number;
  readonly reports: number;
  readonly backfilledRuns: number;
}

export interface SeedSummary {
  readonly now: string;
  readonly projects: readonly SeededProject[];
}

const IngestResultSchema = z.object({
  run_id: z.string(),
  report_id: z.string(),
  replaced: z.boolean(),
  run_status: z.enum(['passed', 'failed', 'empty']),
});

const ProjectRowSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  layer_rules: z.unknown(),
  name_normalization: z.unknown(),
});

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function readText(root: string, source: string): string {
  try {
    return readFileSync(join(root, source), 'utf8');
  } catch (error) {
    throw new Error(`cannot read ${source}: ${message(error)}`);
  }
}

function junitFiles(root: string, source: string): string[] {
  if (!statSync(join(root, source)).isDirectory()) return [readText(root, source)];
  return readdirSync(join(root, source))
    .filter((name) => name.endsWith('.xml'))
    .sort()
    .map((name) => readText(root, `${source}/${name}`));
}

interface ParsedReport {
  readonly results: ParsedResults;
  readonly coverage: CoverageInput[];
}

function parseReport(root: string, report: SeedReport): ParsedReport {
  const { results, coverage } = report;
  const described = `${results.source}${coverage === null ? '' : ` with ${coverage.source}`}`;
  try {
    const parsed: ParsedResults =
      results.format === 'junit'
        ? { format: 'junit', report: parseJunit(junitFiles(root, results.source)) }
        : {
            format: 'jest-json',
            report: parseJestJson(readText(root, results.source), {
              pathPrefix: results.pathPrefix,
            }),
          };
    const coverageInput: CoverageInput[] =
      coverage === null
        ? []
        : [
            coverage.format === 'jacoco'
              ? { format: 'jacoco', coverage: parseJacoco(readText(root, coverage.source)) }
              : {
                  format: 'istanbul',
                  coverage: parseIstanbulSummary(readText(root, coverage.source)),
                },
          ];
    return { results: parsed, coverage: coverageInput };
  } catch (error) {
    throw new Error(`cannot parse ${described}: ${message(error)}`);
  }
}

const failed = (what: string, error: { code: string; message: string }): Error =>
  new Error(`${what}: ${error.code} ${error.message}`);

async function loadIngestProjects(
  client: SupabaseClient,
  slugs: readonly SeedSlug[],
): Promise<Map<string, IngestProject>> {
  const { data, error } = await client
    .from('projects')
    .select('id, slug, layer_rules, name_normalization')
    .in('slug', [...slugs]);
  if (error) throw failed('look up the seeded projects', error);
  const rows = z.array(ProjectRowSchema).parse(data);
  return new Map(
    rows.map((row) => [
      row.slug,
      { id: row.id, layer_rules: row.layer_rules, name_normalization: row.name_normalization },
    ]),
  );
}

/**
 * Replaces the plan's projects with freshly seeded ones. Only rows under the plan's slugs are
 * deleted; their runs, reports, tests, results and coverage go with them by cascade.
 */
export async function seedDatabase(
  client: SupabaseClient,
  plan: SeedPlan,
  root: string,
): Promise<SeedSummary> {
  // Everything is read, validated and parsed before the first write, so a bad fixture or
  // project file leaves the database as it was.
  const files: ProjectFile[] = plan.projects.map((slug) =>
    loadProjectFile(projectFilePath(slug, join(root, PROJECTS_DIR))),
  );
  const parsed = new Map<string, ParsedReport>();
  const cacheKey = (report: SeedReport): string =>
    JSON.stringify([report.results, report.coverage]);
  for (const report of plan.runs.flatMap((run) => run.reports)) {
    const key = cacheKey(report);
    if (!parsed.has(key)) parsed.set(key, parseReport(root, report));
  }
  const histories = plan.backfill.map((entry) => ({
    ...entry,
    file: JSON.parse(readText(root, entry.source)) as unknown,
  }));

  const deleted = await client
    .from('projects')
    .delete()
    .in('slug', [...plan.projects]);
  if (deleted.error) throw failed('delete the previous seed', deleted.error);
  for (const file of files) {
    // The key is dropped here; the seed never needs to post with it, and it is never printed.
    await addProject(client, file);
  }

  const backfilled = new Map<string, number>();
  for (const { slug, source, file } of histories) {
    const target = await findBackfillTarget(client, slug);
    const runs = backfillSourceFor(slug)(file, target.defaultBranch);
    const summary = await writeBackfill(client, target.id, runs);
    if (summary.inserted !== runs.length) {
      throw new Error(`backfill of ${source} inserted ${summary.inserted} of ${runs.length} runs`);
    }
    backfilled.set(slug, (backfilled.get(slug) ?? 0) + summary.inserted);
  }

  const projects = await loadIngestProjects(client, plan.projects);
  for (const run of plan.runs) {
    const project = projects.get(run.slug);
    if (project === undefined) throw new Error(`project "${run.slug}" was not registered`);
    const startedAt = new Date(run.startedAt);
    for (const report of run.reports) {
      const what =
        `ingest_report for run ${run.ciRunId} attempt ${run.runAttempt} ` +
        `(${report.job}/${report.module}/${report.platform})`;
      const meta = ReportMetaSchema.parse({
        ci_run_id: run.ciRunId,
        run_attempt: run.runAttempt,
        job: report.job,
        module: report.module,
        platform: report.platform,
        commit_sha: run.commitSha,
        branch: run.branch,
        event: run.event,
        run_url: run.runUrl,
        ...(report.results.format === 'jest' ? { path_prefix: report.results.pathPrefix } : {}),
      });
      const input = parsed.get(cacheKey(report));
      if (input === undefined) throw new Error(`${what}: fixtures were not parsed`);
      const payload = placeReport(
        normalizeReport(meta, project, input.results, input.coverage, startedAt),
        startedAt,
      );
      const { data, error } = await client.rpc('ingest_report', { payload });
      if (error) throw failed(what, error);
      const result = IngestResultSchema.safeParse(data);
      if (!result.success) throw new Error(`${what} returned an unexpected result`);
      if (result.data.replaced) throw new Error(`${what} replaced a report the plan sent twice`);
    }
  }

  return {
    now: plan.now,
    projects: files.map((file) => {
      const slug = file.slug as SeedSlug;
      const runs = plan.runs.filter((run) => run.slug === slug);
      return {
        slug,
        visibility: file.visibility,
        ciRuns: runs.length,
        reports: runs.reduce((sum, run) => sum + run.reports.length, 0),
        backfilledRuns: backfilled.get(slug) ?? 0,
      };
    }),
  };
}

const count = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;

export function describeSeed(summary: SeedSummary): string {
  return [
    `Seeded local Supabase for now = ${summary.now} (set TESTPULSE_FIXED_NOW to the same value).`,
    ...summary.projects.map(
      (project) =>
        `  ${project.slug} (${project.visibility}): ${count(project.ciRuns, 'CI run')}, ` +
        `${count(project.reports, 'report')}, ${count(project.backfilledRuns, 'backfilled run')}`,
    ),
    'API keys were issued and discarded; run project:rotate-key <slug> to post by hand.',
  ].join('\n');
}
