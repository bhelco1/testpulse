import { z } from 'zod';

// Spec sections 5.11 and 12: what one run of the daily job did, stored in heartbeats.summary and
// returned by the cron route. This is the one definition of its shape; the admin page reads it.

export const DAILY_STEPS = ['heartbeat', 'stale_check', 'prune'] as const;
export type DailyStep = (typeof DAILY_STEPS)[number];

/** Longest error text kept. Errors carry a database code and message, never a request or key. */
export const ERROR_MAX = 300;

const Count = z.int().min(0);
const Instant = z.iso.datetime({ offset: true });

export const PrunedCountsSchema = z.strictObject({
  results: Count,
  result_failures: Count,
  visits: Count,
  rate_limit_buckets: Count,
  runs_marked_pruned: Count,
});
export type PrunedCounts = z.infer<typeof PrunedCountsSchema>;

/** What prune_expired removed for one project; visits and buckets belong to no project. */
export const PrunedProjectSchema = z.strictObject({
  project_id: z.uuid(),
  slug: z.string().min(1),
  results: Count,
  result_failures: Count,
  runs_marked_pruned: Count,
});
export type PrunedProject = z.infer<typeof PrunedProjectSchema>;

/** One prune_expired call's answer. */
export const PruneBatchSchema = z.strictObject({
  results: Count,
  result_failures: Count,
  runs_marked_pruned: Count,
  visits: Count,
  rate_limit_buckets: Count,
  projects: z.array(PrunedProjectSchema),
});
export type PruneBatch = z.infer<typeof PruneBatchSchema>;

export const DailySummarySchema = z
  .strictObject({
    /** The job's now, from lib/clock.ts. */
    started_at: Instant,
    /** started_at plus the job's elapsed time; null on the row written before the steps run. */
    finished_at: Instant.nullable(),
    status: z.enum(['ok', 'failed']),
    /** The first step that failed, with its error; every failed step is in failed_steps. */
    failed_step: z.enum(DAILY_STEPS).nullable(),
    error: z.string().min(1).max(ERROR_MAX).nullable(),
    failed_steps: z.array(z.enum(DAILY_STEPS)),
    heartbeat_written: z.boolean(),
    /** Projects check_stale looked at, and the stale alerts it opened; null if it failed. */
    projects_checked: Count.nullable(),
    stale_opened: Count.nullable(),
    stale_opened_project_ids: z.array(z.uuid()),
    /** Rows removed by the batches that committed, even when a later batch failed. */
    pruned: PrunedCountsSchema,
    pruned_by_project: z.array(PrunedProjectSchema),
    prune_batches: Count,
    /** True when the last batch removed nothing; false if the prune failed or ran out of time. */
    prune_complete: z.boolean(),
  })
  // A run is ok only when it finished with no step failed. The row written before the steps run
  // is failed with no step named and UNFINISHED as its error, so a job stopped part-way (the
  // platform's time limit) never reads as ok.
  .refine(
    (s) =>
      (s.status === 'ok') === (s.finished_at !== null && s.failed_steps.length === 0) &&
      s.failed_step === (s.failed_steps[0] ?? null) &&
      (s.status === 'ok') === (s.error === null),
    { message: 'status, finished_at, failed_step, failed_steps and error must agree' },
  );
export type DailySummary = z.infer<typeof DailySummarySchema>;

export const UNFINISHED = 'The job started and has not finished.';

export const NOTHING_PRUNED: PrunedCounts = {
  results: 0,
  result_failures: 0,
  visits: 0,
  rate_limit_buckets: 0,
  runs_marked_pruned: 0,
};
