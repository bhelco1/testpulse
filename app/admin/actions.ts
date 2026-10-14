'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  type AcknowledgeResult,
  acknowledge,
  type CreateLinkResult,
  createLink,
  type DeleteLinkResult,
  deleteLink,
  type RotateKeyResult,
  rotateKey,
} from '../../lib/admin/actions';
import { requireAdmin } from '../../lib/admin/guard';
import { handleSignInRequest, handleSignOut } from '../../lib/admin/handlers';
import { siteOrigin } from '../../lib/admin/origin';
import type { SignInState } from '../../lib/admin/sign-in';
import { adminPath } from '../../lib/admin/view';

// Admin's server actions (spec section 15, "Admin" as built). Every admin action calls
// requireAdmin from lib/admin/guard.ts as its first statement; the sign-in and sign-out actions
// are the only exceptions, listed with their reasons in lib/admin/guarded.test.ts. Next.js refuses
// a server action whose Origin is not the site's own, so another site cannot post them. What each
// guarded action does, and how it answers a refusal, is lib/admin/actions.ts.

// Asks for a link, before there is any session to check. The answer is the same for every valid
// address (lib/admin/sign-in.ts).
export async function requestSignInLinkAction(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  return handleSignInRequest(formData);
}

// Ends whatever session this browser has; it needs no check, since it only takes access away.
export async function signOutAction(): Promise<void> {
  await handleSignOut();
  redirect(adminPath('signed-out'));
}

/** Creates a tracked link from the form's fields; answers its copyable address. */
export async function createLinkAction(input: unknown): Promise<CreateLinkResult> {
  const gate = await requireAdmin();
  const result = await createLink(gate, input, siteOrigin(await headers()) ?? '');
  if (result.status === 'created') revalidatePath('/admin');
  return result;
}

/** Acknowledges an open count_drop alert. */
export async function acknowledgeAlertAction(alertId: unknown): Promise<AcknowledgeResult> {
  const gate = await requireAdmin();
  const result = await acknowledge(gate, alertId);
  // Refreshed unless the session ended: an alert that had already closed leaves the page.
  if (result.status !== 'session-ended') revalidatePath('/admin');
  return result;
}

/** Issues a project a new API key and answers it, once; the page shows it and keeps it nowhere. */
export async function rotateKeyAction(slug: unknown): Promise<RotateKeyResult> {
  const gate = await requireAdmin();
  return rotateKey(gate, slug);
}

/** Deletes a tracked link, keeping its visits unlinked, and goes back to /admin. */
export async function deleteLinkAction(linkId: unknown): Promise<DeleteLinkResult> {
  const gate = await requireAdmin();
  const result = await deleteLink(gate, linkId);
  if (result.status !== 'deleted') return result;
  revalidatePath('/admin');
  redirect(adminPath());
}
