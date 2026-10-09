import { z } from 'zod';

import { SlugSchema } from '../projects/schema.ts';

// What the admin sends to create a tracked link (spec section 5.10; decisions of 2026-10-08):
// company and role required, contact and notes optional, a sent date, and an optional lead
// project, any visibility. Everything is trimmed and capped, as all untrusted text is (section
// 15); whether the lead project exists is checked against the database by createTrackedLink.

export const TRACKED_LINK_LIMITS = {
  company: 120,
  role: 120,
  contact: 200,
  notes: 2000,
} as const;

const required = (limit: number) => z.string().trim().min(1).max(limit);

// A blank optional field is the same as a missing one: null in the database.
const optional = <T extends z.ZodType<string>>(schema: T) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    schema.nullish().transform((value) => value ?? null),
  );

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// A calendar date, read in UTC: Date rolls 2026-02-30 over to 2 March, so the round trip
// catches days that do not exist.
const SentOnSchema = z
  .string()
  .regex(ISO_DATE, 'sent date must be YYYY-MM-DD')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'sent date is not a real date');

export const TrackedLinkInputSchema = z.strictObject({
  company: required(TRACKED_LINK_LIMITS.company),
  role: required(TRACKED_LINK_LIMITS.role),
  contact: optional(z.string().trim().max(TRACKED_LINK_LIMITS.contact)),
  notes: optional(z.string().trim().max(TRACKED_LINK_LIMITS.notes)),
  sent_on: optional(SentOnSchema),
  lead_project_slug: optional(SlugSchema),
});

export type TrackedLinkInput = z.output<typeof TrackedLinkInputSchema>;

/** `sent_at` is timestamptz; a sent date is stored as midnight UTC and read back as that date. */
export function sentAtFromDate(date: string): string {
  return `${date}T00:00:00.000Z`;
}
