import { describe, expect, it } from 'vitest';

import { fromCacheJson, toCacheJson } from './cache-json.ts';

// Next.js stores a cached value as JSON and hands back JSON.parse of it on a hit, but the value
// itself on a miss, so a Date would be a Date on one request and a string on the next. Cached
// reads go through this encoding both ways, so a hit and a miss give the same value.

const roundTrip = <T>(value: T): T =>
  fromCacheJson<T>(
    JSON.parse(JSON.stringify(toCacheJson(value))) as ReturnType<typeof toCacheJson<T>>,
  );

describe('cache JSON', () => {
  it('brings Dates back as Dates, nested in objects and arrays', () => {
    const value = {
      lastReportAt: new Date('2026-10-05T11:58:12.345Z'),
      runs: [{ id: 'r1', finishedAt: new Date('2026-10-04T09:00:00.000Z') }],
      none: null,
    };

    const back = roundTrip(value);

    expect(back).toStrictEqual(value);
    expect(back.lastReportAt).toBeInstanceOf(Date);
    expect(back.runs[0]?.finishedAt).toBeInstanceOf(Date);
  });

  it('keeps strings that look like instants as strings', () => {
    const value = { name: '2026-10-05T11:58:12.345Z', suite: '{"$date":"x"}' };

    expect(roundTrip(value)).toStrictEqual(value);
  });

  it('keeps keys that start with $, even one shaped like its own Date tag', () => {
    const value = { $date: '2026-10-05T11:58:12.345Z', $$other: 1, floors: { $date: 80 } };

    const back = roundTrip(value);

    expect(back).toStrictEqual(value);
    expect(typeof back.$date).toBe('string');
  });

  it('leaves out properties that are undefined, as JSON does', () => {
    expect(roundTrip({ a: 1, b: undefined })).toStrictEqual({ a: 1 });
  });

  it('refuses what JSON would change silently', () => {
    expect(() => toCacheJson({ rate: Number.NaN })).toThrow(/rate/);
    expect(() => toCacheJson({ rate: Number.POSITIVE_INFINITY })).toThrow(/rate/);
    expect(() => toCacheJson({ byRun: new Map([['r1', 1]]) })).toThrow(/byRun/);
    expect(() => toCacheJson({ ids: new Set(['a']) })).toThrow(/ids/);
    expect(() => toCacheJson({ list: [1, undefined] })).toThrow(/list\[1\]/);
    expect(() => toCacheJson({ at: new Date(Number.NaN) })).toThrow(/at/);
  });

  it('refuses a value it did not encode', () => {
    expect(() => fromCacheJson({ json: { $when: 'x' } } as never)).toThrow(/\$when/);
  });
});
