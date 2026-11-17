import { describe, expect, it } from 'vitest';

import { minuteUntil, readMinute } from './read-minute.ts';

// Cached public reads are shared by everyone who visits in the same minute (decision 2026-11-17):
// keyed by the minute's start, and reading every run finished up to the minute's last millisecond,
// so nothing that has finished by now is left out.

describe('readMinute', () => {
  it('keys on the start of the minute and reads up to its last millisecond', () => {
    expect(readMinute(new Date('2026-10-05T11:59:42.318Z'))).toEqual({
      start: '2026-10-05T11:59:00.000Z',
      until: new Date('2026-10-05T11:59:59.999Z'),
    });
  });

  it('gives every instant of one minute the same key, and the next minute a new one', () => {
    const first = readMinute(new Date('2026-10-05T12:00:00.000Z'));
    const last = readMinute(new Date('2026-10-05T12:00:59.999Z'));
    const next = readMinute(new Date('2026-10-05T12:01:00.000Z'));

    expect(last).toEqual(first);
    expect(next.start).toBe('2026-10-05T12:01:00.000Z');
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

describe('minuteUntil', () => {
  it('gives a key’s last millisecond', () => {
    expect(minuteUntil('2026-10-05T11:59:00.000Z')).toEqual(new Date('2026-10-05T11:59:59.999Z'));
  });

  it('refuses anything that is not the start of a minute', () => {
    expect(() => minuteUntil('2026-10-05T11:59:30.000Z')).toThrow(/start of a minute/);
    expect(() => minuteUntil('soon')).toThrow(/start of a minute/);
  });
});
