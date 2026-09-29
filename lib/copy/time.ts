import { formatTrendValue } from '../charts/format';

// Times as pages print them. Pure: the current time is passed in (spec section 16, "Fixed
// time"), so the server renders the same words on every run of the e2e suite.

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// numeric: 'auto' gives the design's "yesterday" for one day and "now" for zero.
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/**
 * "4 minutes ago", "2 hours ago", "yesterday", "13 days ago": the largest whole unit up to days.
 * Days are 24-hour periods, as the health marker counts them. A time after now reads "now".
 */
export function relativeTime(then: Date, now: Date): string {
  const elapsed = Math.max(0, now.getTime() - then.getTime());
  if (elapsed < MINUTE) return relative.format(-Math.floor(elapsed / SECOND), 'second');
  if (elapsed < HOUR) return relative.format(-Math.floor(elapsed / MINUTE), 'minute');
  if (elapsed < DAY) return relative.format(-Math.floor(elapsed / HOUR), 'hour');
  return relative.format(-Math.floor(elapsed / DAY), 'day');
}

const monthDay = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

/** "Sep 12", on the UTC day, as the stale project notice dates the last report. */
export const shortDate = (instant: Date): string => monthDay.format(instant);

/** A run's duration as the charts and run rows read it: whole seconds, "36 s". */
export const formatRunDuration = (ms: number): string => formatTrendValue(ms / SECOND, 'dur');
