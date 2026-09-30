import { formatTrendValue } from '../charts/format';

// Times as pages print them. Pure: the current time is passed in (spec section 16, "Fixed
// time"), so the server renders the same words on every run of the e2e suite. Everything is in
// UTC: pages are rendered on the server and must read the same without JavaScript, so the
// viewer's time zone is never known (decision 2026-09-29).

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Written out rather than from Intl: en-GB's short month for September is "Sept" in current
// CLDR data, and the design writes "Sep".
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const utcDayNumber = (instant: Date): number => Math.floor(instant.getTime() / DAY);
const pad2 = (n: number): string => String(n).padStart(2, '0');

/** "22 Sep" in now's UTC year, else "22 Sep 2025": the one date format of every page. */
export function shortDate(instant: Date, now: Date): string {
  const dayMonth = `${instant.getUTCDate()} ${MONTHS[instant.getUTCMonth()]}`;
  return instant.getUTCFullYear() === now.getUTCFullYear()
    ? dayMonth
    : `${dayMonth} ${instant.getUTCFullYear()}`;
}

/** "22 Sep 2026, 04:37 UTC": the full date and time a <time> element's title gives. */
export function fullTimestamp(instant: Date): string {
  return (
    `${instant.getUTCDate()} ${MONTHS[instant.getUTCMonth()]} ${instant.getUTCFullYear()}, ` +
    `${pad2(instant.getUTCHours())}:${pad2(instant.getUTCMinutes())} UTC`
  );
}

/**
 * Design v7 item 16, as v9 item 17 restates it (components.md, "Relative time"), in UTC. The first rule that applies wins,
 * so no two overlap:
 * 1. under 1 minute, or after now: "just now";
 * 2. under 1 hour: "{m} min ago", whole minutes;
 * 3. under 24 hours: "{h} h ago", whole hours, even when the instant is on the previous UTC day;
 * 4. otherwise by UTC calendar days back (d is at least 1 here): 1 is "yesterday", 2 to 6
 *    "{d} days ago", 7 to 27 "1 week ago" or "{w} weeks ago" (w = d / 7, rounded down), and from
 *    28 the date, "12 Aug", with the year when it is not now's year, "12 Aug 2025".
 * Hours come before the calendar so a run 30 minutes before midnight reads "1 h ago" shortly
 * after it rather than "yesterday"; v7 says "yesterday" once 24 hours have passed.
 */
export function relativeTime(then: Date, now: Date): string {
  const elapsed = now.getTime() - then.getTime();
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} h ago`;
  const days = utcDayNumber(now) - utcDayNumber(then);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 28) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  }
  return shortDate(then, now);
}

/** A "when" as a <time> element shows it: its words, datetime, and full date and time as title. */
export interface TimeLabel {
  readonly text: string;
  /** The instant in ISO 8601, UTC. */
  readonly datetime: string;
  readonly title: string;
}

/** Copy with times in it, such as the stale notice: each TimeLabel renders as a <time>. */
export type TimedText = readonly (string | TimeLabel)[];

const label = (text: string, instant: Date): TimeLabel => ({
  text,
  datetime: instant.toISOString(),
  title: fullTimestamp(instant),
});

export const relativeLabel = (then: Date, now: Date): TimeLabel =>
  label(relativeTime(then, now), then);

export const dateLabel = (instant: Date, now: Date): TimeLabel =>
  label(shortDate(instant, now), instant);

/** "12:00": an absolute time of day in UTC, as the feed's offline note gives it. */
export const clockLabel = (instant: Date): TimeLabel =>
  label(`${pad2(instant.getUTCHours())}:${pad2(instant.getUTCMinutes())}`, instant);

/**
 * "5 Oct, 09:25 UTC": the one date format with the UTC time of day, as the run page's "Started".
 * An absolute clock time says UTC (design v8 item 2).
 */
export const dateTimeLabel = (instant: Date, now: Date): TimeLabel =>
  label(
    `${shortDate(instant, now)}, ${pad2(instant.getUTCHours())}:${pad2(instant.getUTCMinutes())} UTC`,
    instant,
  );

/** "14:03:41": the UTC time of day to the second, as the run page dates each report. */
export const clockSecondsLabel = (instant: Date): TimeLabel =>
  label(
    `${pad2(instant.getUTCHours())}:${pad2(instant.getUTCMinutes())}:${pad2(instant.getUTCSeconds())}`,
    instant,
  );

/** A run's duration as the charts and run rows read it: whole seconds, "36 s". */
export const formatRunDuration = (ms: number): string => formatTrendValue(ms / SECOND, 'dur');

/** A test's time as the run page and test history panel read it: seconds to two places, "0.41 s". */
export const formatTestTime = (ms: number): string => `${(ms / SECOND).toFixed(2)} s`;
