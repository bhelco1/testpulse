import type { AdminAccess } from './access.ts';
import { isEmailAddress } from './email.ts';

// Which of Admin.dc.html's states /admin shows (design/components.md, Admin). The guard's answer
// decides; the `notice` parameter and the refused flash cookie, both of which anyone can set, only
// choose among the signed-out states, so neither can show a signed-in view.

export const NOTICE_PARAM = 'notice';

export type Notice = 'signed-out' | 'link-expired' | 'unavailable';
const NOTICES: readonly string[] = ['signed-out', 'link-expired', 'unavailable'] satisfies Notice[];

export type AdminView =
  | { readonly kind: 'shell'; readonly email: string }
  | { readonly kind: 'refused'; readonly email: string }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'sign-in'; readonly notice: 'signed-out' | 'link-expired' | null };

export function adminPath(notice?: Notice): string {
  return notice === undefined ? '/admin' : `/admin?${NOTICE_PARAM}=${notice}`;
}

function noticeOf(value: string | string[] | undefined): Notice | null {
  return typeof value === 'string' && NOTICES.includes(value) ? (value as Notice) : null;
}

export function adminView(
  access: AdminAccess,
  query: { readonly notice?: string | string[] },
  refusedFlash: string | undefined,
): AdminView {
  switch (access.status) {
    case 'allowed':
      return { kind: 'shell', email: access.email };
    case 'refused':
      return { kind: 'refused', email: access.email };
    case 'unavailable':
      return { kind: 'unavailable' };
    case 'signed-out':
      break;
  }
  if (refusedFlash !== undefined && isEmailAddress(refusedFlash)) {
    return { kind: 'refused', email: refusedFlash };
  }
  const notice = noticeOf(query.notice);
  if (notice === 'unavailable') return { kind: 'unavailable' };
  if (notice === 'link-expired') return { kind: 'sign-in', notice };
  // A session that ended by itself reads as the drawn signed-out state: "Your session on this
  // browser has ended. Send a new link to sign in again."
  if (notice === 'signed-out' || access.reason === 'session-ended') {
    return { kind: 'sign-in', notice: 'signed-out' };
  }
  return { kind: 'sign-in', notice: null };
}

// Document titles (design v21 item 16): they never repeat "admin". The home, in every state a
// session reaches (signed in, loading, error, not allowed), is "Testament admin" alone.
const ADMIN_TITLE = 'Testament admin';

export function adminTitle(view: AdminView): string {
  return view.kind === 'sign-in' ? `Sign in · ${ADMIN_TITLE}` : ADMIN_TITLE;
}

/** A tracked link's page: its company; null for no such link; anything else, the home's title. */
export function linkTitle(link: { readonly company: string } | null | 'refused' | 'error'): string {
  if (link === null) return `Not found · ${ADMIN_TITLE}`;
  if (typeof link === 'string') return ADMIN_TITLE;
  return `${link.company} · ${ADMIN_TITLE}`;
}
