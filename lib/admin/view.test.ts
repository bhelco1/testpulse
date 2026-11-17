import { describe, expect, it } from 'vitest';

import type { AdminAccess } from './access.ts';
import { adminPath, adminTitle, adminView, linkTitle, NOTICE_PARAM } from './view.ts';

// What /admin shows (design/components.md, Admin, "Sign-in" and "Page states"; Admin.dc.html):
// the guard's answer decides, and the address bar or a flash cookie can only choose among the
// signed-out states; neither can open the signed-in page or the refused card for a signed-in user.

const OWNER = 'owner@example.com';
const allowed: AdminAccess = { status: 'allowed', email: OWNER };
const noSession: AdminAccess = { status: 'signed-out', reason: 'no-session' };
const ended: AdminAccess = { status: 'signed-out', reason: 'session-ended' };

describe('adminPath', () => {
  it('names each notice in one query parameter', () => {
    expect(NOTICE_PARAM).toBe('notice');
    expect(adminPath()).toBe('/admin');
    expect(adminPath('signed-out')).toBe('/admin?notice=signed-out');
    expect(adminPath('link-expired')).toBe('/admin?notice=link-expired');
    expect(adminPath('unavailable')).toBe('/admin?notice=unavailable');
  });
});

describe('adminView', () => {
  it('shows the signed-in page to the owner, whatever the address bar or a flash cookie says', () => {
    for (const notice of [undefined, 'signed-out', 'link-expired', 'unavailable']) {
      expect(adminView(allowed, { notice }, 'someone@example.org')).toEqual({
        kind: 'shell',
        email: OWNER,
      });
    }
  });

  it('shows the refused card for a session with another address, and nothing else', () => {
    const refused: AdminAccess = { status: 'refused', email: 'someone@example.org' };
    expect(adminView(refused, { notice: 'signed-out' }, undefined)).toEqual({
      kind: 'refused',
      email: 'someone@example.org',
    });
  });

  it('shows the error state when Supabase did not answer', () => {
    expect(adminView({ status: 'unavailable' }, {}, undefined)).toEqual({ kind: 'unavailable' });
    expect(adminView(noSession, { notice: 'unavailable' }, undefined)).toEqual({
      kind: 'unavailable',
    });
  });

  it('shows the form alone to someone who has not signed in', () => {
    expect(adminView(noSession, {}, undefined)).toEqual({ kind: 'sign-in', notice: null });
    expect(adminView({ status: 'signed-out', reason: 'not-magic-link' }, {}, undefined)).toEqual({
      kind: 'sign-in',
      notice: null,
    });
  });

  it('confirms a sign-out, and says so too when a session has ended by itself', () => {
    expect(adminView(noSession, { notice: 'signed-out' }, undefined)).toEqual({
      kind: 'sign-in',
      notice: 'signed-out',
    });
    expect(adminView(ended, {}, undefined)).toEqual({ kind: 'sign-in', notice: 'signed-out' });
  });

  it('says a link has expired or was used when the callback found it so', () => {
    expect(adminView(noSession, { notice: 'link-expired' }, undefined)).toEqual({
      kind: 'sign-in',
      notice: 'link-expired',
    });
  });

  it('names a refused address the callback just signed out, from its flash cookie', () => {
    expect(adminView(noSession, {}, 'Someone@Example.org')).toEqual({
      kind: 'refused',
      email: 'Someone@Example.org',
    });
  });

  it.each([
    ['empty', ''],
    ['not an address', '<b>not an address</b>'],
    ['too long', `${'a'.repeat(250)}@example.com`],
  ])('ignores a flash cookie that is %s', (_label, flash) => {
    expect(adminView(noSession, {}, flash)).toEqual({ kind: 'sign-in', notice: null });
  });

  it.each([
    ['unknown', 'admin'],
    ['repeated', ['signed-out', 'link-expired']],
    ['empty', ''],
  ])('ignores a notice parameter that is %s', (_label, notice) => {
    expect(adminView(noSession, { notice }, undefined)).toEqual({
      kind: 'sign-in',
      notice: null,
    });
  });
});

// Design v21 item 16 (components.md, "Site name, wordmark and page titles"): admin titles never
// repeat "admin". The home is "Testament admin" alone; signed out it is "Sign in"; a link is its
// company; an unknown link "Not found".
describe('adminTitle', () => {
  it('titles the admin home "Testament admin" signed in, not allowed and unavailable', () => {
    expect(adminTitle({ kind: 'shell', email: OWNER })).toBe('Testament admin');
    expect(adminTitle({ kind: 'refused', email: 'someone@example.org' })).toBe('Testament admin');
    expect(adminTitle({ kind: 'unavailable' })).toBe('Testament admin');
  });

  it('titles every signed-out state "Sign in · Testament admin"', () => {
    for (const notice of [null, 'signed-out', 'link-expired'] as const) {
      expect(adminTitle({ kind: 'sign-in', notice })).toBe('Sign in · Testament admin');
    }
  });
});

describe('linkTitle', () => {
  it('titles a link by its company, and an unknown link "Not found"', () => {
    expect(linkTitle({ company: 'Acme Robotics' })).toBe('Acme Robotics · Testament admin');
    expect(linkTitle(null)).toBe('Not found · Testament admin');
  });

  it('titles anything else, refused or failed, as the admin home', () => {
    expect(linkTitle('refused')).toBe('Testament admin');
    expect(linkTitle('error')).toBe('Testament admin');
  });
});
