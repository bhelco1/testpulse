import { describe, expect, it, vi } from 'vitest';

import { checkClockAtStartup, FIXED_NOW_VAR, now } from './clock.ts';
import { SEED_NOW } from './seed/plan.ts';

// Spec section 16, "Fixed time", and the 2026-09-28 decision row: TESTPULSE_FIXED_NOW pins the
// clock for e2e and visual snapshots, a malformed value fails loudly, and production refuses it.

const WALL = new Date('2026-09-28T09:30:00.000Z');

function wallClock() {
  return vi.fn(() => new Date(WALL));
}

describe('now', () => {
  it('reads the wall clock when TESTPULSE_FIXED_NOW is not set', () => {
    const clock = wallClock();

    expect(now({}, clock).toISOString()).toBe(WALL.toISOString());
    expect(clock).toHaveBeenCalledTimes(1);
  });

  it('defaults to the real wall clock', () => {
    const before = Date.now();
    const read = now({}).getTime();

    expect(read).toBeGreaterThanOrEqual(before);
    expect(read).toBeLessThanOrEqual(Date.now());
  });

  it('returns the fixed instant, and never reads the wall clock, when it is set', () => {
    const clock = wallClock();

    expect(now({ [FIXED_NOW_VAR]: SEED_NOW }, clock).toISOString()).toBe(SEED_NOW);
    expect(clock).not.toHaveBeenCalled();
  });

  it('accepts the instant without milliseconds', () => {
    expect(now({ [FIXED_NOW_VAR]: '2026-10-05T12:00:00Z' }).toISOString()).toBe(
      '2026-10-05T12:00:00.000Z',
    );
  });

  it('returns a new Date each call, so a caller cannot move the fixed clock', () => {
    const env = { [FIXED_NOW_VAR]: SEED_NOW };
    const first = now(env);
    first.setUTCFullYear(1999);

    expect(now(env).toISOString()).toBe(SEED_NOW);
  });

  it.each([
    ['an empty value', ''],
    ['a word', 'yesterday'],
    ['a date without a time', '2026-10-05'],
    ['a time without a zone', '2026-10-05T12:00:00'],
    ['an offset other than Z', '2026-10-05T14:00:00+02:00'],
    ['a day that does not exist', '2026-02-30T12:00:00Z'],
    ['surrounding whitespace', ' 2026-10-05T12:00:00Z'],
    ['epoch milliseconds', '1791201600000'],
  ])('fails loudly on %s instead of falling back to the wall clock', (_, value) => {
    const clock = wallClock();

    expect(() => now({ [FIXED_NOW_VAR]: value }, clock)).toThrow(
      `${FIXED_NOW_VAR} must be a UTC instant like ${SEED_NOW}; got ${JSON.stringify(value)}`,
    );
    expect(clock).not.toHaveBeenCalled();
  });

  it('caps a long malformed value in the message', () => {
    expect(() => now({ [FIXED_NOW_VAR]: 'x'.repeat(500) })).toThrow(`"${'x'.repeat(40)}…"`);
  });

  it('refuses a fixed clock when VERCEL_ENV is production', () => {
    expect(() => now({ [FIXED_NOW_VAR]: SEED_NOW, VERCEL_ENV: 'production' })).toThrow(
      `${FIXED_NOW_VAR} is set and VERCEL_ENV is production`,
    );
  });

  it('reads the wall clock in production when TESTPULSE_FIXED_NOW is not set', () => {
    expect(now({ VERCEL_ENV: 'production' }, wallClock()).toISOString()).toBe(WALL.toISOString());
  });
});

describe('checkClockAtStartup', () => {
  it('has nothing to report when the clock is not fixed', () => {
    expect(checkClockAtStartup({})).toBeNull();
    expect(checkClockAtStartup({ VERCEL_ENV: 'production' })).toBeNull();
  });

  it.each([undefined, 'preview', 'development'])(
    'reports the fixed instant when VERCEL_ENV is %s',
    (vercelEnv) => {
      expect(checkClockAtStartup({ [FIXED_NOW_VAR]: SEED_NOW, VERCEL_ENV: vercelEnv })).toBe(
        `testpulse: clock fixed by ${FIXED_NOW_VAR} at ${SEED_NOW}`,
      );
    },
  );

  it('refuses to start in production, whatever the value', () => {
    for (const value of [SEED_NOW, 'not a time', '']) {
      expect(() =>
        checkClockAtStartup({ [FIXED_NOW_VAR]: value, VERCEL_ENV: 'production' }),
      ).toThrow(
        `testpulse refuses to start: ${FIXED_NOW_VAR} is set and VERCEL_ENV is production. ` +
          'A fixed clock would freeze the live site; remove it from the production environment.',
      );
    }
  });

  it('refuses to start on a malformed value', () => {
    expect(() => checkClockAtStartup({ [FIXED_NOW_VAR]: 'tomorrow' })).toThrow(
      `${FIXED_NOW_VAR} must be a UTC instant`,
    );
  });
});
