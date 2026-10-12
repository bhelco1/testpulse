// The visitor's session (spec sections 5.10, 14 and 15; decision rows of 2026-10-12): one
// first-party cookie holding only a random session identifier. httpOnly, so no script on the page
// can read it; SameSite=Lax, so another site cannot send it with its own requests' side effects;
// Path=/ for the whole site; and no Max-Age or Expires, so the browser drops it when it closes.
// Pure: no I/O; the identifier is drawn by the caller (crypto.randomUUID).

export const SESSION_COOKIE = 'testpulse_session';

// crypto.randomUUID's form: lower-case hex in 8-4-4-4-12. Anything else in the cookie is not one
// of ours and is replaced rather than stored.
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function parseSessionId(value: string | null | undefined): string | null {
  return typeof value === 'string' && SESSION_ID.test(value) ? value : null;
}

/** The session identifier from a Cookie header, or null when it is absent or malformed. */
export function readSessionCookie(header: string | null): string | null {
  if (header === null) return null;
  for (const pair of header.split(';')) {
    const at = pair.indexOf('=');
    if (at === -1) continue;
    if (pair.slice(0, at).trim() === SESSION_COOKIE) return parseSessionId(pair.slice(at + 1));
  }
  return null;
}

/** The Set-Cookie value for a session; Secure wherever the site is served over HTTPS. */
export function sessionCookieHeader(id: string, options: { readonly secure: boolean }): string {
  if (parseSessionId(id) === null)
    throw new Error('refusing to set a value that is not a session identifier');
  const attributes = [`${SESSION_COOKIE}=${id}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (options.secure) attributes.push('Secure');
  return attributes.join('; ');
}

/** The request's session, or a new one that the response must set. */
export function ensureSession(
  header: string | null,
  newId: () => string,
): { readonly id: string; readonly isNew: boolean } {
  const existing = readSessionCookie(header);
  return existing === null ? { id: newId(), isNew: true } : { id: existing, isNew: false };
}

/**
 * Whether to mark the cookie Secure: on every Vercel deployment (VERCEL is "1" there, at build
 * and at runtime), which is served over HTTPS only. A local `next start` is plain HTTP, where a
 * Secure cookie would not be sent back.
 */
export const cookieSecure = (env: Readonly<Record<string, string | undefined>>): boolean =>
  env.VERCEL === '1';
