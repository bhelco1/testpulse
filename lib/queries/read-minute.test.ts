import { describe, expect, it } from 'vitest';

import { readMinute } from './read-minute.ts';

// Cached public reads are shared by everyone who visits on the same UTC day while the data
// version holds (decision 2026-11-18): keyed by the day, and reading every run finished up to the
// last millisecond of the minute the read runs in, so nothing that has finished by then is left
// out.

describe('readMinute', () => {
  it('keys on the UTC day and reads up to the minute’s last millisecond', () => {
    expect(readMinute(new Date('2026-10-05T11:59:42.318Z'))).toEqual({
      day: '2026-10-05',
      until: new Date('2026-10-05T11:59:59.999Z'),
    });
  });

  it('gives every instant of one UTC day the same key, and the next day a new one', () => {
    const first = readMinute(new Date('2026-10-05T00:00:00.000Z'));
    const last = readMinute(new Date('2026-10-05T23:59:59.999Z'));
    const next = readMinute(new Date('2026-10-06T00:00:00.000Z'));

    expect(last.day).toBe(first.day);
    expect(next.day).toBe('2026-10-06');
  });

  it('never reads past the UTC day the instant is in', () => {
    const { until } = readMinute(new Date('2026-10-05T23:59:30.000Z'));

    expect(until.toISOString()).toBe('2026-10-05T23:59:59.999Z');
    expect(until.getUTCDate()).toBe(5);
  });

  it('is never earlier than the instant it was given', () => {
    const at = new Date('2026-10-05T08:15:59.999Z');

    expect(readMinute(at).until.getTime()).toBeGreaterThanOrEqual(at.getTime());
  });
});
