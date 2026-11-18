// When a cached public read belongs to (decision 2026-11-18). Everyone who visits on the same UTC
// day shares one entry while the data version holds, keyed by the day. The read itself runs up to
// the last millisecond of the minute it runs in, so a run that has finished by then is never left
// out. A UTC day is a whole number of minutes, so the bound never crosses into the next day, and
// the day-aligned windows of section 11 are those of every instant the entry is served at.
// Pure: the instant is passed in.

const MINUTE_MS = 60_000;

export interface ReadMinute {
  /** The UTC day, as YYYY-MM-DD: the cache key's time part. */
  readonly day: string;
  /** The minute's last millisecond: the instant the cached read runs as of. */
  readonly until: Date;
}

export function readMinute(at: Date): ReadMinute {
  const start = Math.floor(at.getTime() / MINUTE_MS) * MINUTE_MS;
  return { day: at.toISOString().slice(0, 10), until: new Date(start + MINUTE_MS - 1) };
}
