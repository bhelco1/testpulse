import { describe, expect, it } from 'vitest';

import {
  dateLabel,
  formatRunDuration,
  fullTimestamp,
  relativeLabel,
  relativeTime,
  shortDate,
} from './time';

const NOW = new Date('2026-10-05T12:00:00.000Z');
const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const before = (ms: number) => new Date(NOW.getTime() - ms);

// Design v7 item 16 (components.md, "Relative time"), computed in UTC (decision 2026-09-29):
// under a minute, minutes, then hours for anything under 24 hours, then the UTC calendar day.
describe('relativeTime', () => {
  it.each([
    [0, 'just now'],
    [59 * SECOND + 999, 'just now'],
    [MINUTE, '1 min ago'],
    [4 * MINUTE + 59 * SECOND, '4 min ago'],
    [59 * MINUTE + 59 * SECOND + 999, '59 min ago'],
    [HOUR, '1 h ago'],
    [2 * HOUR + 59 * MINUTE, '2 h ago'],
    // 12:00 back past midnight to 2026-10-04T12:00:00.001Z: the previous UTC day, still hours.
    [DAY - 1, '23 h ago'],
    // Exactly 24 hours: 2026-10-04T12:00Z, the previous UTC day.
    [DAY, 'yesterday'],
    // 2026-10-04T00:00:00Z, the first instant of the previous UTC day.
    [DAY + 12 * HOUR, 'yesterday'],
    // 2026-10-03T23:59:59.999Z: two UTC days back, although only 36 hours ago.
    [DAY + 12 * HOUR + 1, '2 days ago'],
    [6 * DAY, '6 days ago'],
    // 2026-09-29T00:00:00Z is 6 UTC days back; one millisecond earlier is 7.
    [6 * DAY + 12 * HOUR, '6 days ago'],
    [6 * DAY + 12 * HOUR + 1, '1 week ago'],
    [7 * DAY, '1 week ago'],
    [13 * DAY + 7 * HOUR, '1 week ago'],
    [14 * DAY, '2 weeks ago'],
    [27 * DAY, '3 weeks ago'],
    // 2026-09-08T00:00:00Z is 27 UTC days back; 2026-09-07T23:59:59.999Z is 28, and dated.
    [27 * DAY + 12 * HOUR, '3 weeks ago'],
    [27 * DAY + 12 * HOUR + 1, '7 Sep'],
    [28 * DAY, '7 Sep'],
    [120 * DAY, '7 Jun'],
  ])('%d ms before 2026-10-05T12:00Z reads %j', (ms, expected) => {
    expect(relativeTime(before(ms), NOW)).toBe(expected);
  });

  it('counts hours, not the calendar, under 24 hours across UTC midnight', () => {
    const justAfterMidnight = new Date('2026-10-05T00:01:00.000Z');
    expect(relativeTime(new Date('2026-10-04T23:59:00.000Z'), justAfterMidnight)).toBe('2 min ago');
    expect(relativeTime(new Date('2026-10-04T20:00:00.000Z'), justAfterMidnight)).toBe('4 h ago');
    expect(relativeTime(new Date('2026-10-04T00:01:00.000Z'), justAfterMidnight)).toBe('yesterday');
  });

  it('reads the latest instant of the previous UTC day as yesterday once 24 hours have passed', () => {
    expect(
      relativeTime(new Date('2026-10-04T23:59:59.999Z'), new Date('2026-10-05T23:59:59.999Z')),
    ).toBe('yesterday');
  });

  it('dates an instant 28 days or more back, with the year when it differs', () => {
    const newYear = new Date('2026-01-05T12:00:00.000Z');
    // Seven UTC days back across the year still counts weeks.
    expect(relativeTime(new Date('2025-12-29T12:00:00.000Z'), newYear)).toBe('1 week ago');
    expect(relativeTime(new Date('2025-12-01T09:00:00.000Z'), newYear)).toBe('1 Dec 2025');
    expect(relativeTime(new Date('2025-08-12T09:00:00.000Z'), NOW)).toBe('12 Aug 2025');
    expect(relativeTime(new Date('2026-01-01T00:00:00.000Z'), NOW)).toBe('1 Jan');
  });

  it('reads a time after now as just now, rather than in the future', () => {
    expect(relativeTime(new Date(NOW.getTime() + 5 * MINUTE), NOW)).toBe('just now');
    expect(relativeTime(new Date(NOW.getTime() + 3 * DAY), NOW)).toBe('just now');
  });
});

describe('shortDate', () => {
  it('names the UTC day as day and month, with the year only when it is not now’s', () => {
    expect(shortDate(new Date('2026-09-22T04:37:00Z'), NOW)).toBe('22 Sep');
    expect(shortDate(new Date('2026-10-01T00:00:00Z'), NOW)).toBe('1 Oct');
    expect(shortDate(new Date('2025-09-22T04:37:00Z'), NOW)).toBe('22 Sep 2025');
    expect(shortDate(new Date('2027-01-03T00:00:00Z'), NOW)).toBe('3 Jan 2027');
  });

  it('uses the UTC day, not the server’s', () => {
    expect(shortDate(new Date('2026-09-22T23:59:59Z'), NOW)).toBe('22 Sep');
    expect(shortDate(new Date('2025-12-31T23:59:59Z'), NOW)).toBe('31 Dec 2025');
  });
});

describe('fullTimestamp', () => {
  it('is the UTC date and time to the minute, as the <time> title shows it', () => {
    expect(fullTimestamp(new Date('2026-09-22T04:37:59.999Z'))).toBe('22 Sep 2026, 04:37 UTC');
    expect(fullTimestamp(new Date('2026-10-05T00:00:00.000Z'))).toBe('5 Oct 2026, 00:00 UTC');
  });
});

describe('relativeLabel and dateLabel', () => {
  const then = new Date('2026-10-05T09:26:17.000Z');

  it('carries the words, the ISO instant for datetime and the full timestamp for title', () => {
    expect(relativeLabel(then, NOW)).toEqual({
      text: '2 h ago',
      datetime: '2026-10-05T09:26:17.000Z',
      title: '5 Oct 2026, 09:26 UTC',
    });
  });

  it('dates the instant when asked for a date', () => {
    expect(dateLabel(new Date('2026-09-22T04:37:00.000Z'), NOW)).toEqual({
      text: '22 Sep',
      datetime: '2026-09-22T04:37:00.000Z',
      title: '22 Sep 2026, 04:37 UTC',
    });
  });
});

describe('formatRunDuration', () => {
  it('reads whole seconds, as the charts do', () => {
    expect(formatRunDuration(35_604)).toBe('36 s');
    expect(formatRunDuration(204_120)).toBe('204 s');
    expect(formatRunDuration(0)).toBe('0 s');
  });
});
