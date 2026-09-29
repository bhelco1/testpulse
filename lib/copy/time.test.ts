import { describe, expect, it } from 'vitest';

import { formatRunDuration, relativeTime, shortDate } from './time';

const NOW = new Date('2026-10-05T12:00:00.000Z');
const before = (ms: number) => new Date(NOW.getTime() - ms);
const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('relativeTime', () => {
  it.each([
    [0, 'now'],
    [59 * SECOND, '59 seconds ago'],
    [MINUTE, '1 minute ago'],
    [4 * MINUTE + 59 * SECOND, '4 minutes ago'],
    [59 * MINUTE, '59 minutes ago'],
    [HOUR, '1 hour ago'],
    [2 * HOUR + 30 * MINUTE, '2 hours ago'],
    [23 * HOUR + 59 * MINUTE, '23 hours ago'],
    [DAY, 'yesterday'],
    [2 * DAY - 1, 'yesterday'],
    [2 * DAY, '2 days ago'],
    [13 * DAY + 7 * HOUR, '13 days ago'],
    [120 * DAY, '120 days ago'],
  ])('%d ms before now reads %j', (ms, expected) => {
    expect(relativeTime(before(ms), NOW)).toBe(expected);
  });

  it('reads a time after now as now, rather than in the future', () => {
    expect(relativeTime(new Date(NOW.getTime() + 5 * MINUTE), NOW)).toBe('now');
  });
});

describe('shortDate', () => {
  it('names the UTC day as a month and day', () => {
    expect(shortDate(new Date('2026-09-22T04:37:00Z'))).toBe('Sep 22');
    expect(shortDate(new Date('2026-10-01T00:00:00Z'))).toBe('Oct 1');
  });

  it('uses the UTC day, not the server’s', () => {
    expect(shortDate(new Date('2026-09-22T23:59:59Z'))).toBe('Sep 22');
  });
});

describe('formatRunDuration', () => {
  it('reads whole seconds, as the charts do', () => {
    expect(formatRunDuration(35_604)).toBe('36 s');
    expect(formatRunDuration(204_120)).toBe('204 s');
    expect(formatRunDuration(0)).toBe('0 s');
  });
});
