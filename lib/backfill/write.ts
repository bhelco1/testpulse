import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { BackfillRun } from './types.ts';

export interface BackfillTarget {
  readonly id: string;
  readonly defaultBranch: string;
}

export interface BackfillSummary {
  readonly inserted: number;
  /** Runs CI had already reported; backfill_run never alters them. */
  readonly skippedExistingCi: number;
  /** Runs an earlier backfill had already stored, which makes re-running a no-op. */
  readonly skippedExistingBackfill: number;
}

const BackfillResultSchema = z.discriminatedUnion('inserted', [
  z.object({
    inserted: z.literal(true),
    run_id: z.string(),
    status: z.enum(['passed', 'failed', 'empty']),
  }),
  z.object({
    inserted: z.literal(false),
    run_id: z.string(),
    existing_source: z.enum(['ci', 'backfill']),
  }),
]);

const failed = (what: string, error: { code: string; message: string }): Error =>
  new Error(`${what}: ${error.code} ${error.message}`);

/** The project a slug names, with the branch whose history is imported. */
export async function findBackfillTarget(
  client: SupabaseClient,
  slug: string,
): Promise<BackfillTarget> {
  const { data, error } = await client
    .from('projects')
    .select('id, default_branch')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw failed(`look up project "${slug}"`, error);
  if (data === null) throw new Error(`project "${slug}" not found; project:add registers it`);
  return { id: data.id as string, defaultBranch: data.default_branch as string };
}

/**
 * Writes the runs one backfill_run call at a time, oldest first. Each call is its own
 * transaction, so a failure part-way leaves the earlier runs stored; running the command again
 * skips those and carries on, which is why it stops at the first failure rather than guessing.
 */
export async function writeBackfill(
  client: SupabaseClient,
  projectId: string,
  runs: readonly BackfillRun[],
): Promise<BackfillSummary> {
  let inserted = 0;
  let skippedExistingCi = 0;
  let skippedExistingBackfill = 0;
  for (const run of runs) {
    const what = `backfill_run for run ${run.ci_run_id}`;
    const { data, error } = await client.rpc('backfill_run', {
      payload: { project_id: projectId, ...run },
    });
    if (error) throw failed(what, error);
    const result = BackfillResultSchema.safeParse(data);
    if (!result.success) throw new Error(`${what} returned an unexpected result`);
    if (result.data.inserted) inserted += 1;
    else if (result.data.existing_source === 'ci') skippedExistingCi += 1;
    else skippedExistingBackfill += 1;
  }
  return { inserted, skippedExistingCi, skippedExistingBackfill };
}

export function describeBackfill(
  slug: string,
  branch: string,
  runCount: number,
  summary: BackfillSummary,
): string {
  return (
    `backfill ${slug}: ${runCount} runs on ${branch} in the file; inserted ${summary.inserted}, ` +
    `skipped ${summary.skippedExistingCi} already reported by CI and ` +
    `${summary.skippedExistingBackfill} already backfilled.`
  );
}
