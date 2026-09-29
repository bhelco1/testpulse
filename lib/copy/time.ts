import { formatTrendValue } from '../charts/format';

// Times as pages print them. Pure: the current time is passed in (spec section 16, "Fixed
// time"), so the server renders the same words on every run of the e2e suite.

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "just now", "4 min ago", "2 h ago", "yesterday", "13 days ago": the largest whole unit up to
 * days, in the design's short style (Project Page run rows, Kiosk; "just now" from the Landing
 * footer). Written out because Intl.RelativeTimeFormat's short style gives "4 min. ago".
 * Provisional until design v7 item 16 (spec section 13.2). Days are 24-hour periods, as the
 * health marker counts them. A time after now reads "just now".
 */
export function relativeTime(then: Date, now: Date): string {
  const elapsed = Math.max(0, now.getTime() - then.getTime());
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} h ago`;
  const days = Math.floor(elapsed / DAY);
  return days === 1 ? 'yesterday' : `${days} days ago`;
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
