import type { SupabaseClient } from '@supabase/supabase-js';

import { sentAtFromDate, TrackedLinkInputSchema } from './schema.ts';
import { generateToken as drawToken } from './token.ts';

// Creates a tracked link (spec section 14, Phase 6 criterion 3) with the secret client: anon and
// authenticated have no access to tracked_links at all (initial schema), so only server code that
// has checked the admin session may call this. The caller passes now, from lib/clock.ts.

/** A collision among 62^12 tokens is all but impossible; more than this many in a row is a bug. */
export const TOKEN_ATTEMPTS = 5;

const TOKEN_CONSTRAINT = 'tracked_links_token_key';
const UNIQUE_VIOLATION = '23505';

export const TRACKED_LINK_COLUMNS =
  'id, created_at, token, company, role, contact, sent_at, notes, lead_project_slug';

export interface TrackedLinkRow {
  id: string;
  created_at: string;
  token: string;
  company: string;
  role: string;
  contact: string | null;
  sent_at: string | null;
  notes: string | null;
  lead_project_slug: string | null;
}

export type CreateTrackedLinkResult =
  { ok: true; link: TrackedLinkRow } | { ok: false; reason: 'unknown_lead_project' };

export interface CreateTrackedLinkOptions {
  generateToken?: () => string;
}

const failed = (what: string, error: { code: string; message: string }): Error =>
  new Error(`${what}: ${error.code} ${error.message}`);

/**
 * Validates the input (throwing Zod's error when it is invalid), checks that a lead project
 * exists, and inserts the link with a fresh token, drawing a new one when the token is taken.
 */
export async function createTrackedLink(
  client: SupabaseClient,
  input: unknown,
  now: Date,
  options: CreateTrackedLinkOptions = {},
): Promise<CreateTrackedLinkResult> {
  const fields = TrackedLinkInputSchema.parse(input);
  const nextToken = options.generateToken ?? (() => drawToken());

  if (fields.lead_project_slug !== null) {
    const { data, error } = await client
      .from('projects')
      .select('slug')
      .eq('slug', fields.lead_project_slug)
      .maybeSingle();
    if (error) throw failed('look up the lead project', error);
    if (data === null) return { ok: false, reason: 'unknown_lead_project' };
  }

  const row = {
    company: fields.company,
    role: fields.role,
    contact: fields.contact,
    sent_at: fields.sent_on === null ? null : sentAtFromDate(fields.sent_on),
    notes: fields.notes,
    lead_project_slug: fields.lead_project_slug,
    created_at: now.toISOString(),
  };

  for (let attempt = 1; attempt <= TOKEN_ATTEMPTS; attempt += 1) {
    const { data, error } = await client
      .from('tracked_links')
      .insert({ token: nextToken(), ...row })
      .select(TRACKED_LINK_COLUMNS)
      .single<TrackedLinkRow>();
    if (!error) return { ok: true, link: data };
    const collided = error.code === UNIQUE_VIOLATION && error.message.includes(TOKEN_CONSTRAINT);
    if (!collided) throw failed('insert the tracked link', error);
  }
  throw new Error(`no unused token after ${String(TOKEN_ATTEMPTS)} attempts`);
}
