import { describe, expect, it } from 'vitest';

import { ADMIN_EMAIL_VAR, isAdminEmail } from './allowlist.ts';

// Spec section 15: admin is one allowlisted address, ADMIN_EMAIL, compared case-insensitively
// after trimming; a missing or blank ADMIN_EMAIL refuses everyone (decision 2026-10-13).
describe('isAdminEmail', () => {
  it('reads the address from ADMIN_EMAIL', () => {
    expect(ADMIN_EMAIL_VAR).toBe('ADMIN_EMAIL');
  });

  it('allows the configured address', () => {
    expect(isAdminEmail('owner@example.com', 'owner@example.com')).toBe(true);
  });

  it('ignores case and surrounding whitespace on both sides', () => {
    expect(isAdminEmail('  Owner@Example.COM\n', ' owner@example.com ')).toBe(true);
    expect(isAdminEmail('owner@example.com', '\tOWNER@EXAMPLE.COM  ')).toBe(true);
  });

  it.each([
    ['another address', 'someone@example.com'],
    ['the owner address with a different domain', 'owner@example.org'],
    ['a longer address that contains it', 'owner@example.com.evil.test'],
    ['a shorter one it contains', 'wner@example.com'],
  ])('refuses %s', (_label, email) => {
    expect(isAdminEmail(email, 'owner@example.com')).toBe(false);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['blank', '   \n'],
  ])('refuses everyone when ADMIN_EMAIL is %s', (_label, configured) => {
    expect(isAdminEmail('owner@example.com', configured)).toBe(false);
    expect(isAdminEmail('', configured)).toBe(false);
    expect(isAdminEmail('   ', configured)).toBe(false);
  });

  it.each([
    ['no address', undefined],
    ['a null address', null],
    ['an empty address', ''],
  ])('refuses %s even when one is configured', (_label, email) => {
    expect(isAdminEmail(email, 'owner@example.com')).toBe(false);
  });
});
