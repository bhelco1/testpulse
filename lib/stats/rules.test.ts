import { describe, expect, it } from 'vitest';

import { at } from './records.test-support.ts';
import {
  CI_ONLY_SOURCES,
  countsTowardCiOnlyStats,
  countsTowardTrends,
  inWindow,
  TREND_SOURCES,
  utcDays,
  windowStart,
} from './rules.ts';

// Spec section 11: "All trend stats use default-branch runs with source = ci unless stated.
// Backfilled runs contribute to pass-rate, count, and coverage trends only."

describe('which runs count', () => {
  it.each([
    ['a CI run on the default branch', { branch: 'main', source: 'ci' }, true, true],
    ['a backfilled run on the default branch', { branch: 'main', source: 'backfill' }, true, false],
    ['a CI run on another branch', { branch: 'feature/x', source: 'ci' }, false, false],
    ['a backfilled run on another branch', { branch: 'dev', source: 'backfill' }, false, false],
  ] as const)('%s: trends %s, CI-only stats %s', (_, scope, trend, ciOnly) => {
    expect(countsTowardTrends(scope, 'main')).toBe(trend);
    expect(countsTowardCiOnlyStats(scope, 'main')).toBe(ciOnly);
  });

  it('names the sources each rule admits, so the loader can ask for the same ones', () => {
    expect(TREND_SOURCES).toEqual(['ci', 'backfill']);
    expect(CI_ONLY_SOURCES).toEqual(['ci']);
  });

  it('compares the branch exactly', () => {
    expect(countsTowardTrends({ branch: 'Main', source: 'ci' }, 'main')).toBe(false);
    expect(countsTowardCiOnlyStats({ branch: 'main ', source: 'ci' }, 'main')).toBe(false);
  });
});

describe('windows', () => {
  const now = at('2026-10-01T15:30:00Z');

  it('starts at UTC midnight N - 1 days before the day of now', () => {
    expect(windowStart(now, 30)).toEqual(at('2026-09-02T00:00:00Z'));
    expect(windowStart(now, 90)).toEqual(at('2026-07-04T00:00:00Z'));
  });

  it('includes its first instant and now, and nothing before or after', () => {
    expect(inWindow(at('2026-09-02T00:00:00Z'), now, 30)).toBe(true);
    expect(inWindow(at('2026-09-01T23:59:59.999Z'), now, 30)).toBe(false);
    expect(inWindow(now, now, 30)).toBe(true);
    expect(inWindow(at('2026-10-01T15:30:00.001Z'), now, 30)).toBe(false);
  });

  it('lists the N UTC days of the window, oldest first', () => {
    const days = utcDays(now, 30);
    expect(days).toHaveLength(30);
    expect(days[0]).toBe('2026-09-02');
    expect(days[29]).toBe('2026-10-01');
    expect(utcDays(now, 90)).toHaveLength(90);
  });

  it('treats a now just after UTC midnight as a new day', () => {
    const justAfter = at('2026-10-01T00:00:00.001Z');
    expect(windowStart(justAfter, 30)).toEqual(at('2026-09-02T00:00:00Z'));
    expect(utcDays(justAfter, 30).at(-1)).toBe('2026-10-01');
  });
});
