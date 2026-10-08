import { describe, expect, it } from 'vitest';

import {
  chartWhen,
  clockLabel,
  clockSecondsLabel,
  dateLabel,
  dateTimeLabel,
  formatRunDuration,
  formatTestTime,
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

  // components.md "Relative time" (v9 item 17), its worked examples word for word.
  it('reads v9’s examples: 25 h across one midnight is yesterday, 30 h across two is 2 days', () => {
    const early = new Date('2026-10-05T02:00:00.000Z');
    expect(relativeTime(new Date('2026-10-05T00:00:00.000Z'), early)).toBe('2 h ago');
    expect(relativeTime(new Date('2026-10-04T01:00:00.000Z'), early)).toBe('yesterday');
    expect(relativeTime(new Date('2026-10-03T20:00:00.000Z'), early)).toBe('2 days ago');
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

// The feed's offline note, "Offline. Showing runs as of {HH:MM}; reconnecting" (components.md,
// RunFeed), is an absolute time ("Relative time": "As of {HH:MM}" is unaffected), in UTC as every
// other time the site prints (decision 2026-09-29).
describe('clockLabel', () => {
  it('reads HH:MM in UTC, 24-hour and zero-padded, with the instant and full timestamp', () => {
    expect(clockLabel(new Date('2026-10-05T12:00:00.000Z'))).toEqual({
      text: '12:00',
      datetime: '2026-10-05T12:00:00.000Z',
      title: '5 Oct 2026, 12:00 UTC',
    });
    expect(clockLabel(new Date('2026-10-05T09:05:59.999Z')).text).toBe('09:05');
    expect(clockLabel(new Date('2026-10-05T00:00:00.000Z')).text).toBe('00:00');
    expect(clockLabel(new Date('2026-10-05T23:59:00.000Z')).text).toBe('23:59');
  });
});

// A test's time reads one way everywhere it is printed, the charts included (design v10 item 14,
// components.md "Small durations, everywhere"; decision 2026-10-07): seconds to two places from
// 10 ms, whole ms under it, and a stored 0 "<1 ms".
describe('formatTestTime', () => {
  it('reads seconds to two places from 10 ms', () => {
    expect(formatTestTime(410)).toBe('0.41 s');
    expect(formatTestTime(10)).toBe('0.01 s');
    expect(formatTestTime(1_125)).toBe('1.13 s');
  });

  it('reads whole milliseconds under 10 ms, and a stored 0 as under 1 ms', () => {
    expect(formatTestTime(9)).toBe('9 ms');
    expect(formatTestTime(3)).toBe('3 ms');
    expect(formatTestTime(1)).toBe('1 ms');
    expect(formatTestTime(0)).toBe('<1 ms');
  });
});

// Design v13 item 6 (components.md "Run duration", tp-kit.js runDur): whole seconds rounded down;
// "{s} s" under a minute, "{m}m {ss}s" under an hour, then "{h}h {mm}m".
describe('formatRunDuration', () => {
  it.each([
    [0, '0 s'],
    [999, '0 s'],
    [27_400, '27 s'],
    [35_604, '35 s'],
    [59_999, '59 s'],
    [60_000, '1m 00s'],
    [107_999, '1m 47s'],
    [204_120, '3m 24s'],
    [694_000, '11m 34s'],
    [1_073_000, '17m 53s'],
    [3_599_999, '59m 59s'],
    [3_600_000, '1h 00m'],
    [3_912_000, '1h 05m'],
    [90_000_000, '25h 00m'],
  ])('reads %i ms as "%s"', (ms, text) => {
    expect(formatRunDuration(ms)).toBe(text);
  });

  // Ingest stores durations as non-negative integers, so neither reaches a page; the guard keeps
  // a bad value from printing "NaNh NaNm" or "-1 s".
  it('reads a negative or missing duration as 0 s', () => {
    expect(formatRunDuration(-1)).toBe('0 s');
    expect(formatRunDuration(Number.NaN)).toBe('0 s');
  });
});

// The run page's absolute times (docs/spec.md section 13.5): "Started" as the one date format
// with the time of day and "UTC" (design v8 item 2, components.md "Relative time"), and a report's
// "Received" as the Run Detail mock's "14:03:41", in UTC.
describe('dateTimeLabel', () => {
  it('reads "5 Oct, 09:25 UTC" in now’s year, with the full timestamp as its title', () => {
    expect(dateTimeLabel(new Date('2026-10-05T09:25:47.312Z'), NOW)).toEqual({
      text: '5 Oct, 09:25 UTC',
      datetime: '2026-10-05T09:25:47.312Z',
      title: '5 Oct 2026, 09:25 UTC',
    });
  });

  it('adds the year in another year, and reads the UTC day at midnight', () => {
    expect(dateTimeLabel(new Date('2025-12-31T23:59:59.999Z'), NOW).text).toBe(
      '31 Dec 2025, 23:59 UTC',
    );
    expect(dateTimeLabel(new Date('2026-10-05T00:00:00.000Z'), NOW).text).toBe('5 Oct, 00:00 UTC');
  });
});

describe('clockSecondsLabel', () => {
  it('reads the UTC time of day to the second, rounded down', () => {
    expect(clockSecondsLabel(new Date('2026-10-05T14:03:41.999Z'))).toEqual({
      text: '14:03:41',
      datetime: '2026-10-05T14:03:41.999Z',
      title: '5 Oct 2026, 14:03 UTC',
    });
    expect(clockSecondsLabel(new Date('2026-10-05T00:00:00.000Z')).text).toBe('00:00:00');
  });
});

// A chart table's "When" (components.md TrendChart, "Table"; design v9 item 1): the run's finish
// time as "22 Sep, 04:37 UTC", the year added outside the current UTC year, in two pieces that a
// narrow table wraps between and never inside. The chart is drawn in the browser, so the server
// passes the current UTC year rather than the chart reading a clock.
describe('chartWhen', () => {
  it('splits "22 Sep, 04:37 UTC" into its date and time, titled with the full timestamp', () => {
    expect(chartWhen('2026-09-22T04:37:59.999Z', 2026)).toEqual({
      date: '22 Sep,',
      time: '04:37 UTC',
      title: '22 Sep 2026, 04:37 UTC',
    });
  });

  it('adds the year to the date in another UTC year', () => {
    expect(chartWhen('2025-12-12T04:37:00.000Z', 2026)).toEqual({
      date: '12 Dec 2025,',
      time: '04:37 UTC',
      title: '12 Dec 2025, 04:37 UTC',
    });
  });

  it('reads the UTC day and time, not the server’s', () => {
    expect(chartWhen('2026-12-31T23:59:00.000+00:00', 2026).date).toBe('31 Dec,');
    expect(chartWhen('2027-01-01T00:30:00.000+01:00', 2026)).toEqual({
      date: '31 Dec,',
      time: '23:30 UTC',
      title: '31 Dec 2026, 23:30 UTC',
    });
  });
});
