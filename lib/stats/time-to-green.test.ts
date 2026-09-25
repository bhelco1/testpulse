import { describe, expect, it } from 'vitest';

import { at, run } from './records.test-support.ts';
import { timeToGreen, type TimeToGreenOptions } from './time-to-green.ts';

// Spec section 11: "For each default-branch run that turned failed after a passed run, elapsed
// time until the next passed run. Report median and worst, 90 days." Section 17, Phase 4:
// time-to-green excludes backfilled runs.

const HOUR = 3_600_000;
const now = at('2026-10-01T12:00:00Z');
const options: TimeToGreenOptions = { defaultBranch: 'main', now };

const passed = (id: string, finishedAt: string, overrides = {}) =>
  run(id, finishedAt, { status: 'passed', ...overrides });
const failed = (id: string, finishedAt: string, overrides = {}) =>
  run(id, finishedAt, { status: 'failed', passed: 9, failed: 1, ...overrides });

describe('timeToGreen', () => {
  it('measures from the run that turned red to the next passed run', () => {
    const result = timeToGreen(
      [
        passed('p0', '2026-09-20T00:00:00Z'),
        failed('f1', '2026-09-20T01:00:00Z'),
        failed('f2', '2026-09-20T02:00:00Z'),
        passed('p3', '2026-09-20T04:00:00Z'),
      ],
      options,
    );
    expect(result.recoveries).toEqual([
      {
        failedRunId: 'f1',
        failedAt: at('2026-09-20T01:00:00Z'),
        greenRunId: 'p3',
        greenAt: at('2026-09-20T04:00:00Z'),
        elapsedMs: 3 * HOUR,
      },
    ]);
    expect(result).toMatchObject({ medianMs: 3 * HOUR, worstMs: 3 * HOUR, stillRed: null });
  });

  describe('backfilled runs are excluded', () => {
    // As CI runs alone: one recovery of 1 hour. Counted, the backfilled pair would add a
    // 5-minute recovery and pull the median down to 32.5 minutes.
    const history = [
      passed('ci-p0', '2026-09-20T00:00:00Z'),
      failed('bf-f', '2026-09-20T01:00:00Z', { source: 'backfill' }),
      passed('bf-p', '2026-09-20T01:05:00Z', { source: 'backfill' }),
      failed('ci-f', '2026-09-20T02:00:00Z'),
      passed('ci-p', '2026-09-20T03:00:00Z'),
    ];

    it('ignores a backfilled red to green pair entirely', () => {
      const result = timeToGreen(history, options);
      expect(result.recoveries.map((r) => [r.failedRunId, r.greenRunId])).toEqual([
        ['ci-f', 'ci-p'],
      ]);
      expect(result).toMatchObject({ medianMs: HOUR, worstMs: HOUR });
    });

    it('does not let a backfilled pass end a CI red episode', () => {
      const result = timeToGreen(
        [
          passed('ci-p0', '2026-09-20T00:00:00Z'),
          failed('ci-f', '2026-09-20T01:00:00Z'),
          passed('bf-p', '2026-09-20T01:10:00Z', { source: 'backfill' }),
          passed('ci-p', '2026-09-20T06:00:00Z'),
        ],
        options,
      );
      expect(result.recoveries).toHaveLength(1);
      expect(result.recoveries[0]).toMatchObject({ greenRunId: 'ci-p', elapsedMs: 5 * HOUR });
    });

    it('does not let a backfilled pass open the way for a CI failure to count', () => {
      const result = timeToGreen(
        [
          failed('ci-f0', '2026-09-20T00:00:00Z'),
          passed('bf-p', '2026-09-20T01:00:00Z', { source: 'backfill' }),
          failed('ci-f1', '2026-09-20T02:00:00Z'),
          passed('ci-p', '2026-09-20T03:00:00Z'),
        ],
        options,
      );
      // Counted, the backfilled pass would make ci-f1 a red turn with a 1-hour recovery.
      expect(result.recoveries).toEqual([]);
    });
  });

  it('ignores runs on other branches', () => {
    const result = timeToGreen(
      [
        passed('p0', '2026-09-20T00:00:00Z'),
        failed('f1', '2026-09-20T01:00:00Z'),
        passed('feature-p', '2026-09-20T01:30:00Z', { branch: 'feature/x' }),
        passed('p2', '2026-09-20T03:00:00Z'),
      ],
      options,
    );
    expect(result.recoveries).toEqual([
      expect.objectContaining({ greenRunId: 'p2', elapsedMs: 2 * HOUR }),
    ]);
  });

  it('does not count a failure with no passed run before it', () => {
    const result = timeToGreen(
      [failed('f0', '2026-09-20T00:00:00Z'), passed('p1', '2026-09-20T01:00:00Z')],
      options,
    );
    expect(result.recoveries).toEqual([]);
    expect(result.medianMs).toBeNull();
  });

  // An empty run is neither passed nor failed (section 5.2), so it neither turns the branch red
  // nor ends an episode: "after a passed run" is read as the run immediately before.
  it('does not start an episode after an empty run, and skips empty runs while red', () => {
    const result = timeToGreen(
      [
        passed('p0', '2026-09-20T00:00:00Z'),
        run('e1', '2026-09-20T01:00:00Z', { status: 'empty', passed: 0 }),
        failed('f2', '2026-09-20T02:00:00Z'),
        passed('p3', '2026-09-20T03:00:00Z'),
        failed('f4', '2026-09-20T04:00:00Z'),
        run('e5', '2026-09-20T05:00:00Z', { status: 'empty', passed: 0 }),
        passed('p6', '2026-09-20T07:00:00Z'),
      ],
      options,
    );
    expect(result.recoveries.map((r) => [r.failedRunId, r.greenRunId, r.elapsedMs])).toEqual([
      ['f4', 'p6', 3 * HOUR],
    ]);
  });

  it('reports a branch still red at now separately, outside median and worst', () => {
    const result = timeToGreen(
      [
        passed('p0', '2026-09-30T00:00:00Z'),
        failed('f1', '2026-09-30T01:00:00Z'),
        passed('p2', '2026-09-30T02:00:00Z'),
        failed('f3', '2026-10-01T00:00:00Z'),
        failed('f4', '2026-10-01T06:00:00Z'),
      ],
      options,
    );
    expect(result.stillRed).toEqual({
      failedRunId: 'f3',
      failedAt: at('2026-10-01T00:00:00Z'),
      elapsedMs: 12 * HOUR,
    });
    expect(result).toMatchObject({ medianMs: HOUR, worstMs: HOUR });
  });

  it('reports the median (mean of the middle two when even) and the worst', () => {
    const pairs = [1, 4, 2, 10].flatMap((hours, index) => {
      const day = `2026-09-${String(10 + index).padStart(2, '0')}`;
      return [
        passed(`p${index}`, `${day}T00:00:00Z`),
        failed(`f${index}`, `${day}T01:00:00Z`),
        passed(
          `g${index}`,
          new Date(at(`${day}T01:00:00Z`).getTime() + hours * HOUR).toISOString(),
        ),
      ];
    });
    const result = timeToGreen(pairs, options);
    expect(result.recoveries).toHaveLength(4);
    expect(result).toMatchObject({ medianMs: 3 * HOUR, worstMs: 10 * HOUR });
  });

  it('counts episodes whose failing run finished in the 90-day window, using a pass before it', () => {
    const result = timeToGreen(
      [
        passed('p0', '2026-07-01T00:00:00Z'),
        failed('f-outside', '2026-07-03T23:00:00Z'),
        passed('g-inside', '2026-07-04T01:00:00Z'),
        failed('f-edge', '2026-07-04T02:00:00Z'),
        passed('g-edge', '2026-07-04T03:00:00Z'),
      ],
      options,
    );
    // The window opens at 2026-07-04T00:00Z (90 UTC days ending on the day of now).
    expect(result.recoveries.map((r) => r.failedRunId)).toEqual(['f-edge']);
  });

  it('ignores runs that finished after now', () => {
    const result = timeToGreen(
      [
        passed('p0', '2026-10-01T10:00:00Z'),
        failed('f1', '2026-10-01T11:00:00Z'),
        passed('p-later', '2026-10-01T12:00:00.001Z'),
      ],
      options,
    );
    expect(result.recoveries).toEqual([]);
    expect(result.stillRed).toMatchObject({ failedRunId: 'f1', elapsedMs: HOUR });
  });

  // Runs are ordered by finished_at, the moment each status became known. Ties are broken by
  // started_at, then by run ID and attempt, so the order never depends on input order.
  it('orders runs finishing at the same instant by start, so a tie gives zero elapsed', () => {
    const sameFinish = '2026-09-20T02:00:00Z';
    const input = [
      passed('p-late-start', sameFinish, { startedAt: at('2026-09-20T01:30:00Z') }),
      failed('f-early-start', sameFinish, { startedAt: at('2026-09-20T01:00:00Z') }),
      passed('p0', '2026-09-20T00:00:00Z'),
    ];
    const result = timeToGreen(input, options);
    expect(result.recoveries).toEqual([
      expect.objectContaining({
        failedRunId: 'f-early-start',
        greenRunId: 'p-late-start',
        elapsedMs: 0,
      }),
    ]);
    expect(timeToGreen([...input].reverse(), options)).toEqual(result);
  });

  it('breaks a full timestamp tie by run ID and then attempt', () => {
    const instant = '2026-09-20T02:00:00Z';
    const input = [
      passed('b', instant, { ciRunId: '200', runAttempt: 1 }),
      failed('a2', instant, { ciRunId: '100', runAttempt: 2 }),
      passed('a1', instant, { ciRunId: '100', runAttempt: 1 }),
    ];
    const result = timeToGreen(input, options);
    expect(result.recoveries.map((r) => [r.failedRunId, r.greenRunId])).toEqual([['a2', 'b']]);
  });

  it('is empty for no runs', () => {
    expect(timeToGreen([], options)).toEqual({
      recoveries: [],
      medianMs: null,
      worstMs: null,
      stillRed: null,
    });
  });
});
