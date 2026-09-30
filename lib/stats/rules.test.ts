import { describe, expect, it } from 'vitest';

import type { StatsRun } from './input.ts';
import { at, run } from './records.test-support.ts';
import {
  CI_ONLY_SOURCES,
  countsTowardCiOnlyStats,
  countsTowardTrends,
  inWindow,
  lastRuns,
  latestRun,
  TREND_RUNS,
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

describe('latestRun', () => {
  const now = at('2026-10-05T12:00:00Z');

  it('is null with no runs', () => {
    expect(latestRun([], 'main', now)).toBeNull();
  });

  it('is the only run when there is one', () => {
    const only = run('only', '2026-10-01T00:00:00Z');
    expect(latestRun([only], 'main', now)).toBe(only);
  });

  it('is the latest default-branch CI run by finish, passing over backfill and other branches', () => {
    const ci = run('ci', '2026-10-01T00:00:00Z');
    const runs = [
      run('older', '2026-09-30T00:00:00Z'),
      ci,
      run('bf', '2026-10-02T00:00:00Z', { source: 'backfill' }),
      run('pr', '2026-10-03T00:00:00Z', { branch: 'feature/x' }),
      run('future', '2026-10-05T12:00:00.001Z'),
    ];
    expect(latestRun(runs, 'main', now)).toBe(ci);
  });

  it('breaks a finish-time tie by attempt', () => {
    const second = run('a2', '2026-10-01T00:00:00Z', { ciRunId: '5', runAttempt: 2 });
    const first = run('a1', '2026-10-01T00:00:00Z', { ciRunId: '5', runAttempt: 1 });
    expect(latestRun([second, first], 'main', now)).toBe(second);
  });
});

// Decision 2026-09-29 (design v7 item 5): the project page's per-run charts read the last 30
// runs their source rule admits, however old, rather than a day window.
describe('lastRuns', () => {
  const now = at('2026-10-01T12:00:00Z');
  const ci = (candidate: StatsRun) => countsTowardCiOnlyStats(candidate, 'main');

  it('reads 30 runs for the per-run charts', () => {
    expect(TREND_RUNS).toBe(30);
  });

  it('is empty with no runs', () => {
    expect(lastRuns([], 30, ci, now)).toEqual([]);
  });

  it('keeps a single run', () => {
    const only = run('only', '2026-09-30T00:00:00Z');
    expect(lastRuns([only], 30, ci, now)).toEqual([only]);
  });

  it('takes every run when there are fewer than asked, oldest first', () => {
    const runs = [run('b', '2026-09-20T00:00:00Z'), run('a', '2026-09-10T00:00:00Z')];
    expect(lastRuns(runs, 30, ci, now).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('keeps the newest runs of more than asked, however old the oldest kept one is', () => {
    // One run every 10 days through 2025, all long before now.
    const runs = Array.from({ length: 35 }, (_, i) =>
      run(`r${i}`, new Date(Date.UTC(2025, 0, 1) + i * 10 * 86_400_000).toISOString()),
    );
    const kept = lastRuns(runs, 30, ci, now);
    expect(kept).toHaveLength(30);
    expect(kept[0]?.id).toBe('r5');
    expect(kept.at(-1)?.id).toBe('r34');
    // 2025-02-20, more than 90 days before now.
    expect(kept[0]?.finishedAt).toEqual(at('2025-02-20T00:00:00Z'));
  });

  it('counts only the runs the rule admits, and none finished after now', () => {
    const runs = [
      run('ci-1', '2026-09-01T00:00:00Z'),
      run('ci-2', '2026-09-02T00:00:00Z'),
      run('bf', '2026-09-03T00:00:00Z', { source: 'backfill' }),
      run('pr', '2026-09-04T00:00:00Z', { branch: 'feature/x' }),
      run('future', '2026-10-01T12:00:00.001Z'),
    ];
    expect(lastRuns(runs, 2, ci, now).map((r) => r.id)).toEqual(['ci-1', 'ci-2']);
  });

  it('orders by finish, then start, run ID and attempt, as byFinish does', () => {
    const runs = [
      run('attempt-2', '2026-09-20T00:00:00Z', { ciRunId: 'r', runAttempt: 2 }),
      run('attempt-1', '2026-09-20T00:00:00Z', { ciRunId: 'r', runAttempt: 1 }),
    ];
    expect(lastRuns(runs, 1, ci, now).map((r) => r.id)).toEqual(['attempt-2']);
  });

  it('is empty when asked for none', () => {
    expect(lastRuns([run('a', '2026-09-20T00:00:00Z')], 0, ci, now)).toEqual([]);
  });
});
