import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { acknowledgeAlert } from '../alerts/rpc.ts';
import { now } from '../clock.ts';
import { rotateProjectKey } from '../projects/repo.ts';
import { SlugSchema } from '../projects/schema.ts';
import { createTrackedLink } from '../tracked-links/create.ts';
import { TrackedLinkInputSchema } from '../tracked-links/schema.ts';
import { adminClient } from './data.ts';
import type { AccessGranted, AdminGate } from './guard.ts';
import type {
  AcknowledgeResult,
  CreateLinkResult,
  DeleteLinkResult,
  Refused,
  RotateKeyResult,
} from './types.ts';

export type { AcknowledgeResult, CreateLinkResult, DeleteLinkResult, RotateKeyResult };

// What admin's server actions do (app/admin/actions.ts; spec section 15, "Admin" as built). The
// action calls the guard as its first statement and hands its answer here: anything but the
// owner's session is refused before the input is read or a client made, as the drawn session-ended
// state when there is no session (401) and as the action's error when Supabase did not answer
// (503). Input is validated with Zod; a failure is logged by the action's name and the database's
// code and message, never with what was typed or the key that was issued.

export interface ActionDeps {
  readonly client: (granted: AccessGranted) => SupabaseClient;
  readonly now: () => Date;
  readonly create: typeof createTrackedLink;
  readonly acknowledgeAlert: typeof acknowledgeAlert;
  readonly rotate: typeof rotateProjectKey;
  readonly remove: (client: SupabaseClient, id: string) => Promise<boolean>;
}

/** Deletes a tracked link; its visits stay, unlinked (on delete set null). False if none. */
export async function deleteTrackedLink(client: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await client.from('tracked_links').delete().eq('id', id).select('id');
  if (error) throw new Error(`delete the tracked link: ${error.code} ${error.message}`);
  return data.length > 0;
}

export const DEFAULT_DEPS: ActionDeps = {
  client: adminClient,
  now: () => now(),
  create: createTrackedLink,
  acknowledgeAlert,
  rotate: rotateProjectKey,
  remove: deleteTrackedLink,
};

const ERROR: Refused = { status: 'error' };

const refusal = (gate: Extract<AdminGate, { ok: false }>): Refused =>
  gate.status === 401 ? { status: 'session-ended' } : ERROR;

function logFailure(action: string, error: unknown): Refused {
  console.error(
    `testpulse admin: ${action} failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  return ERROR;
}

const REQUIRED = ['company', 'role'] as const;

export async function createLink(
  gate: AdminGate,
  input: unknown,
  origin: string,
  deps: ActionDeps = DEFAULT_DEPS,
): Promise<CreateLinkResult> {
  if (!gate.ok) return refusal(gate);

  const parsed = TrackedLinkInputSchema.safeParse(input);
  if (!parsed.success) {
    // Only a blank required field is the form's to show; anything else the form cannot send.
    const blank = parsed.error.issues.every(
      (issue) =>
        issue.code === 'too_small' &&
        REQUIRED.some((field) => issue.path.length === 1 && issue.path[0] === field),
    );
    if (!blank) return ERROR;
    return {
      status: 'invalid',
      fields: REQUIRED.filter((field) => parsed.error.issues.some((i) => i.path[0] === field)),
    };
  }

  try {
    const result = await deps.create(deps.client(gate), input, deps.now());
    if (!result.ok) return logFailure('create a tracked link', result.reason);
    return { status: 'created', id: result.link.id, url: `${origin}/v/${result.link.token}` };
  } catch (error) {
    return logFailure('create a tracked link', error);
  }
}

export async function acknowledge(
  gate: AdminGate,
  alertId: unknown,
  deps: ActionDeps = DEFAULT_DEPS,
): Promise<AcknowledgeResult> {
  if (!gate.ok) return refusal(gate);
  const id = z.uuid().safeParse(alertId);
  if (!id.success) return ERROR;
  try {
    // The database acknowledges only an open count_drop (spec section 12) and refuses the rest.
    await deps.acknowledgeAlert(deps.client(gate), id.data, deps.now());
    return { status: 'acknowledged' };
  } catch (error) {
    return logFailure('acknowledge an alert', error);
  }
}

export async function rotateKey(
  gate: AdminGate,
  slug: unknown,
  deps: ActionDeps = DEFAULT_DEPS,
): Promise<RotateKeyResult> {
  if (!gate.ok) return refusal(gate);
  const parsed = SlugSchema.safeParse(slug);
  if (!parsed.success) return ERROR;
  try {
    // The key goes back to the owner's browser once, in this answer, and nowhere else.
    return { status: 'rotated', key: await deps.rotate(deps.client(gate), parsed.data) };
  } catch (error) {
    return logFailure('rotate a project key', error);
  }
}

export async function deleteLink(
  gate: AdminGate,
  linkId: unknown,
  deps: ActionDeps = DEFAULT_DEPS,
): Promise<DeleteLinkResult> {
  if (!gate.ok) return refusal(gate);
  const id = z.uuid().safeParse(linkId);
  if (!id.success) return ERROR;
  try {
    if (await deps.remove(deps.client(gate), id.data)) return { status: 'deleted' };
    return logFailure('delete a tracked link', 'no such link');
  } catch (error) {
    return logFailure('delete a tracked link', error);
  }
}
