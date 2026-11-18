// The minute a cached public read belongs to (decision 2026-11-17). Everyone who visits in the
// same minute shares one entry, keyed by the minute's start. The read itself runs up to the
// minute's last millisecond rather than its start, so a run that has finished by now is never
// left out; a run stamped up to a minute ahead of the server's clock can show up to a minute early.
// A UTC day is a whole number of minutes, so the bound never crosses into the next day, and the
// day-aligned windows of section 11 are those of the exact instant. Pure: the instant is passed in.

const MINUTE_MS = 60_000;

export interface ReadMinute {
  /** The minute's start, as an ISO instant: the cache key's time part. */
  readonly start: string;
  /** The minute's last millisecond: the instant the cached read runs as of. */
  readonly until: Date;
}

export function readMinute(at: Date): ReadMinute {
  const start = new Date(Math.floor(at.getTime() / MINUTE_MS) * MINUTE_MS);
  return { start: start.toISOString(), until: new Date(start.getTime() + MINUTE_MS - 1) };
}

/** The last millisecond of the minute a key names. */
export function minuteUntil(start: string): Date {
  const time = new Date(start).getTime();
  if (Number.isNaN(time) || time % MINUTE_MS !== 0) {
    throw new Error(`a read minute must be the start of a minute; got ${JSON.stringify(start)}`);
  }
  return new Date(time + MINUTE_MS - 1);
}
