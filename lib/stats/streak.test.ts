import { describe, expect, it } from 'vitest';

import { at, run } from './records.test-support.ts';
import { greenStreak } from './streak.ts';

// Spec section 11: "Green streak: Consecutive passed default-branch runs, current and longest."
// CI runs only: section 11 lets backfilled runs into pass-rate, count and coverage trends only.

const now = at('2026-10-05T12:00:00Z');
const options = { defaultBranch: 'main', now };

const passed = (id: string, finishedAt: string, overrides = {}) =>
  run(id, finishedAt, { status: 'passed', ...overrides });
const failed = (id: string, finishedAt: string, overrides = {}) =>
  run(id, finishedAt, { status: 'failed', passed: 9, failed: 1, ...overrides });
const empty = (id: string, finishedAt: string) =>
  run(id, finishedAt, { status: 'empty', passed: 0, failed: 0 });

describe('greenStreak', () => {
  it('is 0 and 0 with no runs', () => {
    expect(greenStreak([], options)).toEqual({ current: 0, longest: 0 });
  });

  it('is 1 and 1 for a single passed run, 0 and 0 for a single failed run', () => {
    expect(greenStreak([passed('a', '2026-10-01T00:00:00Z')], options)).toEqual({
      current: 1,
      longest: 1,
    });
    expect(greenStreak([failed('a', '2026-10-01T00:00:00Z')], options)).toEqual({
      current: 0,
      longest: 0,
    });
  });

  it('counts the current run of passes and the longest ever, in finish order', () => {
    // Finish order: P P P F P P, given out of order. Streaks 3 then 2: current 2, longest 3.
    const runs = [
      passed('p5', '2026-10-05T00:00:00Z'),
      passed('p1', '2026-10-01T00:00:00Z'),
      failed('f4', '2026-10-04T00:00:00Z'),
      passed('p3', '2026-10-03T00:00:00Z'),
      passed('p6', '2026-10-05T06:00:00Z'),
      passed('p2', '2026-10-02T00:00:00Z'),
    ];
    expect(greenStreak(runs, options)).toEqual({ current: 2, longest: 3 });
  });

  it('is current 0 when the latest run failed', () => {
    // P P F: streak of 2 then broken.
    const runs = [
      passed('p1', '2026-10-01T00:00:00Z'),
      passed('p2', '2026-10-02T00:00:00Z'),
      failed('f3', '2026-10-03T00:00:00Z'),
    ];
    expect(greenStreak(runs, options)).toEqual({ current: 0, longest: 2 });
  });

  it('breaks the streak on an empty run, which is never green (section 5.2)', () => {
    // P E P: two streaks of 1.
    const runs = [
      passed('p1', '2026-10-01T00:00:00Z'),
      empty('e2', '2026-10-02T00:00:00Z'),
      passed('p3', '2026-10-03T00:00:00Z'),
    ];
    expect(greenStreak(runs, options)).toEqual({ current: 1, longest: 1 });
  });

  it('leaves out backfilled runs and runs on other branches', () => {
    // CI main alone: P P, current 2. Counted, the backfilled failure would split it into 1 + 1
    // and the passing pull request would make it 3.
    const runs = [
      passed('p1', '2026-10-01T00:00:00Z'),
      failed('bf', '2026-10-01T06:00:00Z', { source: 'backfill' }),
      passed('pr', '2026-10-01T07:00:00Z', { branch: 'feature/x' }),
      passed('p2', '2026-10-02T00:00:00Z'),
    ];
    expect(greenStreak(runs, options)).toEqual({ current: 2, longest: 2 });
  });

  it('breaks a finish-time tie by attempt, so a passing re-run after a failure ends green', () => {
    // Same run ID and finish instant: attempt 1 failed, attempt 2 passed. Order F then P.
    const runs = [
      passed('rerun', '2026-10-02T00:00:00Z', { ciRunId: '7', runAttempt: 2 }),
      failed('first', '2026-10-02T00:00:00Z', { ciRunId: '7', runAttempt: 1 }),
    ];
    expect(greenStreak(runs, options)).toEqual({ current: 1, longest: 1 });
  });

  it('ignores runs finished after now', () => {
    const runs = [
      passed('p1', '2026-10-05T11:59:59.999Z'),
      failed('later', '2026-10-05T12:00:00.001Z'),
    ];
    expect(greenStreak(runs, options)).toEqual({ current: 1, longest: 1 });
  });
});
