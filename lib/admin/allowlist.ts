// Spec section 15: admin is one allowlisted address. Server-only in effect: the address is read
// from the environment by the callers in lib/admin, never shipped to the browser.

export const ADMIN_EMAIL_VAR = 'ADMIN_EMAIL';

const normalized = (value: string): string => value.trim().toLowerCase();

/**
 * Whether the address is the configured owner's, ignoring case and surrounding whitespace. A
 * missing or blank ADMIN_EMAIL refuses everyone, so a deployment without it is closed, never open.
 */
export function isAdminEmail(
  email: string | null | undefined,
  configured: string | undefined,
): boolean {
  const owner = normalized(configured ?? '');
  if (owner === '' || email === null || email === undefined) return false;
  return normalized(email) === owner;
}
