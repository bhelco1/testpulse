'use server';

import { redirect } from 'next/navigation';

import { handleSignInRequest, handleSignOut } from '../../lib/admin/handlers';
import type { SignInState } from '../../lib/admin/sign-in';
import { adminPath } from '../../lib/admin/view';

// Admin's server actions (spec section 15, "Admin" as built). Every admin action calls
// requireAdmin from lib/admin/guard.ts as its first statement; these two are the only exceptions,
// listed with their reasons in lib/admin/guarded.test.ts. Next.js refuses a server action whose
// Origin is not the site's own, so another site cannot post them.

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
