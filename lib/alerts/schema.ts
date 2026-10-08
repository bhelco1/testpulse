import { z } from 'zod';

// Spec sections 5.9 and 12: an alert row and the detail each kind stores. This is the one
// TypeScript definition of those keys; ingest_report and check_stale write them, and
// lib/alerts/alerts.int.test.ts parses every alert they write with these schemas.

export const ALERT_KINDS = ['stale', 'count_drop', 'empty_run', 'coverage_below_floor'] as const;

// A timestamptz as PostgREST and to_jsonb give it, e.g. 2026-10-08T12:00:00+00:00.
const Instant = z.iso.datetime({ offset: true });
const Count = z.int().min(0);
const Pct = z.number().min(0).max(100);
const Name = z.string().min(1);

/** The project's last report and the cadence it was measured against. */
export const StaleDetailSchema = z.strictObject({
  last_report_at: Instant,
  expected_cadence_days: z.int().min(1),
});

/**
 * Executed tests (reports.total) for one (job, module, platform): the baseline the count fell
 * from, in the previous default-branch CI run, and the latest report's count.
 */
export const CountDropDetailSchema = z.strictObject({
  job: Name,
  module: Name,
  platform: Name,
  baseline: z.int().min(1),
  current: Count,
  baseline_run_id: z.uuid(),
  run_id: z.uuid(),
});

export const EmptyRunDetailSchema = z.strictObject({
  job: Name,
  module: Name,
  platform: Name,
  report_id: z.uuid(),
});

/** lines_pct is rounded to two decimals for display; the floor test uses the exact counts. */
export const CoverageBelowFloorDetailSchema = z.strictObject({
  module: Name,
  floor: Pct,
  lines_pct: Pct,
  report_id: z.uuid(),
});

const base = {
  id: z.uuid(),
  project_id: z.uuid(),
  opened_at: Instant,
  resolved_at: Instant.nullable(),
};

// Only count_drop can be acknowledged, and acknowledging resolves it at the same instant.
const CountDropAlertSchema = z
  .object({
    ...base,
    kind: z.literal('count_drop'),
    detail: CountDropDetailSchema,
    acknowledged_at: Instant.nullable(),
  })
  .refine((alert) => alert.acknowledged_at === null || alert.resolved_at !== null, {
    message: 'an acknowledged alert is resolved',
    path: ['resolved_at'],
  });

const selfResolving = <K extends string, D extends z.ZodType>(kind: K, detail: D) =>
  z.object({ ...base, kind: z.literal(kind), detail, acknowledged_at: z.null() });

export const AlertSchema = z.discriminatedUnion('kind', [
  selfResolving('stale', StaleDetailSchema),
  CountDropAlertSchema,
  selfResolving('empty_run', EmptyRunDetailSchema),
  selfResolving('coverage_below_floor', CoverageBelowFloorDetailSchema),
]);

export type AlertKind = (typeof ALERT_KINDS)[number];
export type StaleDetail = z.output<typeof StaleDetailSchema>;
export type CountDropDetail = z.output<typeof CountDropDetailSchema>;
export type EmptyRunDetail = z.output<typeof EmptyRunDetailSchema>;
export type CoverageBelowFloorDetail = z.output<typeof CoverageBelowFloorDetailSchema>;
export type Alert = z.output<typeof AlertSchema>;
