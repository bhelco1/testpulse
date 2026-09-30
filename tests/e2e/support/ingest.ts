import { readFileSync } from 'node:fs';

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { ReportMetaSchema } from '../../../lib/ingest/meta.ts';
import { normalizeReport, type ParsedResults } from '../../../lib/ingest/normalize.ts';
import { parseJestJson, parseJunit } from '../../../lib/parsers/index.ts';
import { loadProjectFile, projectFilePath } from '../../../lib/projects/files.ts';
import { addProject } from '../../../lib/projects/repo.ts';
import { placeReport } from '../../../lib/seed/plan.ts';
import { createSeedClient } from '../../../lib/seed/local.ts';
import type { SecretClientEnv } from '../../../lib/supabase/server.ts';

// Reports for the live-feed spec (tests/e2e/live.spec.ts), written while a page is open, through
// the path the seed takes (lib/seed/seed.ts): a committed fixture through the real parser,
// normalizeReport, placeReport and ingest_report, so a report lands at a planned instant before
// SEED_NOW and the pages' relative times and order stay fixed. The route's own steps (key, rate
// limit, multipart) are proven by lib/ingest/ingest.int.test.ts; the route takes a report's time
// from the file or the wall clock, neither of which can be placed.
//
// Projects are the spec's own, under slugs the seed never touches, and are deleted afterwards.
// The secret client never reaches the page or the server under test, and its key is never
// printed: errors carry the database's code and message only.

export const LIVE_SLUGS = ['live-public', 'live-private'] as const;
export type LiveSlug = (typeof LIVE_SLUGS)[number];

// Each spec project copies a seeded project's file under its own slug and name: public from
// testpulse's, private from routeserve's.
const SOURCES: Record<LiveSlug, { file: string; name: string }> = {
  'live-public': { file: 'testpulse', name: 'Live public' },
  'live-private': { file: 'routeserve', name: 'Live private' },
};

const FIXTURES: Record<
  LiveSlug,
  { job: string; module: string; platform: string; parse: () => ParsedResults }
> = {
  'live-public': {
    job: 'e2e',
    module: 'e2e',
    platform: 'chromium',
    parse: () => ({
      format: 'junit',
      report: parseJunit([
        readFileSync('fixtures/testpulse/junit/playwright-one-failure.xml', 'utf8'),
      ]),
    }),
  },
  // The captured routeserve failure: its message and stack trace must never reach anon.
  'live-private': {
    job: 'test',
    module: 'packages/shared',
    platform: 'node',
    parse: () => ({
      format: 'jest-json',
      report: parseJestJson(
        readFileSync('fixtures/routeserve/jest/shared-one-failure.json', 'utf8'),
        {
          pathPrefix: '/home/runner/work/routeserve/routeserve/',
        },
      ),
    }),
  },
};

const ProjectRowSchema = z.object({
  id: z.string().min(1),
  layer_rules: z.unknown(),
  name_normalization: z.unknown(),
});

const IngestResultSchema = z.object({ run_id: z.string(), report_id: z.string() });

const failed = (what: string, error: { code: string; message: string }): Error =>
  new Error(`${what}: ${error.code} ${error.message}`);

/**
 * The secret client, only for the local stack: like db:seed, the writer deletes and re-creates
 * projects, so a hosted URL is refused before any client exists (lib/seed/local.ts).
 */
export const writerClient = (env: SecretClientEnv = process.env): SupabaseClient =>
  createSeedClient(env, 'the e2e report writer');

let secret: SupabaseClient | undefined;
/** The writer's client, made on first use so a spec that never writes never needs the key. */
export const admin = (): SupabaseClient => (secret ??= writerClient());

export async function removeLiveProjects(): Promise<void> {
  const { error } = await admin()
    .from('projects')
    .delete()
    .in('slug', [...LIVE_SLUGS]);
  if (error) throw failed('delete the live-feed projects', error);
}

export async function registerLiveProjects(): Promise<void> {
  await removeLiveProjects();
  for (const slug of LIVE_SLUGS) {
    const { file, name } = SOURCES[slug];
    // The key is dropped: these projects are written through ingest_report, as the seed's are.
    await addProject(admin(), { ...loadProjectFile(projectFilePath(file)), slug, name });
  }
}

export interface LiveRun {
  readonly ciRunId: string;
  readonly commitSha: string;
  readonly runUrl: string;
  readonly startedAt: string;
}

/** Writes one report as a run of `slug` that started at `run.startedAt`; returns its ids. */
export async function ingestLiveRun(
  slug: LiveSlug,
  run: LiveRun,
): Promise<{ runId: string; reportId: string }> {
  const client = admin();
  const found = await client
    .from('projects')
    .select('id, layer_rules, name_normalization')
    .eq('slug', slug)
    .single();
  if (found.error) throw failed(`look up ${slug}`, found.error);
  const project = ProjectRowSchema.parse(found.data);
  const { job, module, platform, parse } = FIXTURES[slug];
  const meta = ReportMetaSchema.parse({
    ci_run_id: run.ciRunId,
    job,
    module,
    platform,
    commit_sha: run.commitSha,
    branch: 'main',
    event: 'push',
    run_url: run.runUrl,
  });
  const startedAt = new Date(run.startedAt);
  const payload = placeReport(normalizeReport(meta, project, parse(), [], startedAt), startedAt);
  const { data, error } = await client.rpc('ingest_report', { payload });
  if (error) throw failed(`ingest_report for ${slug} run ${run.ciRunId}`, error);
  const result = IngestResultSchema.parse(data);
  return { runId: result.run_id, reportId: result.report_id };
}
