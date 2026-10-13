// The sign-in form's address check (design/components.md, Admin, "Sign-in"): the rule
// Admin.dc.html draws, run in the browser before sending and again by the server action. Pure and
// free of any configured value, so the form's client bundle can carry it.

/** The longest address SMTP can carry (RFC 5321's 256-octet path less its angle brackets). */
export const EMAIL_MAX_LENGTH = 254;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmailAddress(value: string): boolean {
  return value.length <= EMAIL_MAX_LENGTH && EMAIL_PATTERN.test(value);
}
