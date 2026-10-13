import { describe, expect, it } from 'vitest';

import {
  cookieSecure,
  ensureSession,
  parseSessionId,
  readSessionCookie,
  SESSION_COOKIE,
  sessionCookieHeader,
} from './session.ts';

// Spec sections 5.10, 14 and 15 (decision rows of 2026-10-12): one first-party httpOnly cookie
// holding only a random session identifier, ending when the browser closes.

const ID = '0b7c6f2e-4f1a-4c39-9a51-2d6f3e8b9c10';
const OTHER = '6a1f8e44-0c2b-4d7e-8f90-b1c2d3e4f5a6';

describe('parseSessionId', () => {
  it('accepts a lower-case UUID, as crypto.randomUUID writes it', () => {
    expect(parseSessionId(ID)).toBe(ID);
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['empty', ''],
    ['upper case', ID.toUpperCase()],
    ['braced', `{${ID}}`],
    ['too long', `${ID}0`],
    ['not hex', 'zb7c6f2e-4f1a-4c39-9a51-2d6f3e8b9c10'],
    ['surrounded by spaces', ` ${ID} `],
    ['a token', 'Qm8r2LxT0aZe'],
  ])('refuses a value that is %s', (_label, value) => {
    expect(parseSessionId(value)).toBeNull();
  });
});

describe('readSessionCookie', () => {
  it('finds the session cookie among others', () => {
    expect(readSessionCookie(`a=1; ${SESSION_COOKIE}=${ID}; b=2`)).toBe(ID);
    expect(readSessionCookie(`${SESSION_COOKIE}=${ID}`)).toBe(ID);
  });

  it('answers null without a header, without the cookie, or with a malformed value', () => {
    expect(readSessionCookie(null)).toBeNull();
    expect(readSessionCookie('')).toBeNull();
    expect(readSessionCookie(`other=${ID}`)).toBeNull();
    expect(readSessionCookie(`x${SESSION_COOKIE}=${ID}`)).toBeNull();
    expect(readSessionCookie(`${SESSION_COOKIE}=not-a-uuid`)).toBeNull();
  });
});

describe('sessionCookieHeader', () => {
  it('is httpOnly, Lax, for the whole site, with no expiry, so it ends with the browser', () => {
    const header = sessionCookieHeader(ID, { secure: false });
    expect(header).toBe(`${SESSION_COOKIE}=${ID}; Path=/; HttpOnly; SameSite=Lax`);
    expect(header).not.toMatch(/Max-Age|Expires|Domain/i);
  });

  it('adds Secure where the site is served over HTTPS', () => {
    expect(sessionCookieHeader(ID, { secure: true })).toBe(
      `${SESSION_COOKIE}=${ID}; Path=/; HttpOnly; SameSite=Lax; Secure`,
    );
  });

  it('refuses to write anything but a session identifier', () => {
    expect(() => sessionCookieHeader('Qm8r2LxT0aZe', { secure: false })).toThrow(
      'not a session identifier',
    );
  });
});

describe('ensureSession', () => {
  it('keeps the session the cookie already holds and sets nothing', () => {
    expect(ensureSession(`${SESSION_COOKIE}=${ID}`, () => OTHER)).toEqual({
      id: ID,
      isNew: false,
    });
  });

  it('draws a new one when the cookie is missing or malformed', () => {
    expect(ensureSession(null, () => OTHER)).toEqual({ id: OTHER, isNew: true });
    expect(ensureSession(`${SESSION_COOKIE}=forged`, () => OTHER)).toEqual({
      id: OTHER,
      isNew: true,
    });
  });
});

describe('cookieSecure', () => {
  it('is on for a Vercel deployment and off for a local server', () => {
    expect(cookieSecure({ VERCEL: '1' })).toBe(true);
    expect(cookieSecure({})).toBe(false);
    expect(cookieSecure({ VERCEL: '' })).toBe(false);
  });
});
