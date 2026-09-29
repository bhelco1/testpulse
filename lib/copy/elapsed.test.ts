import { describe, expect, it } from 'vitest';

import { formatElapsed } from './elapsed';

// Design v6 item 1 and components.md (StatTile, Projects passing; RecoveryStats): calendar time
// as "{m}m" under 1 h, "{h}h {mm}m" under 24 h with two-digit minutes, "{d}d {h}h" from 24 h.
// Whole units, counted down: 59 min 59 s is still "59m".

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatElapsed', () => {
  it('gives whole minutes under an hour', () => {
    expect(formatElapsed(0)).toBe('0m');
    expect(formatElapsed(59 * SECOND)).toBe('0m');
    expect(formatElapsed(4 * MINUTE)).toBe('4m');
    expect(formatElapsed(59 * MINUTE + 59 * SECOND)).toBe('59m');
  });

  it('gives hours and two-digit minutes under a day', () => {
    expect(formatElapsed(HOUR)).toBe('1h 00m');
    expect(formatElapsed(2 * HOUR + 14 * MINUTE)).toBe('2h 14m');
    expect(formatElapsed(9 * HOUR + 2 * MINUTE)).toBe('9h 02m');
    // The seed's routeserve red stretch at SEED_NOW: 226 min 4.588 s.
    expect(formatElapsed(226 * MINUTE + 4_588)).toBe('3h 46m');
    expect(formatElapsed(23 * HOUR + 59 * MINUTE + 59 * SECOND)).toBe('23h 59m');
  });

  it('gives days and hours from 24 hours', () => {
    expect(formatElapsed(DAY)).toBe('1d 0h');
    expect(formatElapsed(2 * DAY + 3 * HOUR)).toBe('2d 3h');
    expect(formatElapsed(3 * DAY + 4 * HOUR + 59 * MINUTE)).toBe('3d 4h');
    // Calendar time over a weekend: Friday 18:00 to Monday 06:00.
    expect(formatElapsed(60 * HOUR)).toBe('2d 12h');
  });

  it('refuses a negative or non-finite duration rather than print nonsense', () => {
    expect(() => formatElapsed(-1)).toThrow('formatElapsed: -1 is not a duration');
    expect(() => formatElapsed(Number.NaN)).toThrow('is not a duration');
  });
});
