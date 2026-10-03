import { describe, expect, it } from 'vitest';

import {
  COVERAGE_10,
  OSTOMATE2_RUN_SECONDS,
  PASS_RATE_30,
  RUNS_PER_DAY,
  TESTS_30,
} from './design-samples.test-support';
import { niceScale, trendYScale } from './scale';

const line = { zero: false, percent: false, integer: false, steps: 3 };

describe('trendYScale', () => {
  it('fits a percentage line to its data and floor, padded and snapped to nice steps', () => {
    expect(
      trendYScale({ ...line, values: COVERAGE_10, floor: 91, percent: true, integer: false }),
    ).toEqual({ min: 40, max: 100, ticks: [40, 60, 80, 100] });
  });

  it('uses two steps at phone width', () => {
    expect(
      trendYScale({ ...line, values: COVERAGE_10, floor: 91, percent: true, steps: 2 }),
    ).toEqual({ min: 25, max: 100, ticks: [25, 50, 75, 100] });
  });

  it('includes the floor even when every point is above it', () => {
    const scale = trendYScale({ ...line, values: [96, 97], floor: 80, percent: true });
    expect(scale.min).toBeLessThanOrEqual(80);
  });

  it('clamps percentages to 100 at the top', () => {
    expect(trendYScale({ ...line, values: PASS_RATE_30, percent: true })).toEqual({
      min: 98,
      max: 100,
      ticks: [98, 99, 100],
    });
    expect(trendYScale({ ...line, values: PASS_RATE_30, percent: true, steps: 2 })).toEqual({
      min: 98,
      max: 100,
      ticks: [98, 100],
    });
  });

  it('clamps percentages to 0 at the bottom', () => {
    expect(trendYScale({ ...line, values: [0.5, 2], percent: true })).toEqual({
      min: 0,
      max: 4,
      ticks: [0, 2, 4],
    });
  });

  it('fits a count line without starting it at zero', () => {
    expect(trendYScale({ ...line, values: TESTS_30, integer: true })).toEqual({
      min: 110,
      max: 150,
      ticks: [110, 120, 130, 140, 150],
    });
  });

  it('starts bars and counts that read as amounts at zero', () => {
    expect(trendYScale({ ...line, values: RUNS_PER_DAY, zero: true, integer: true })).toEqual({
      min: 0,
      max: 3,
      ticks: [0, 1, 2, 3],
    });
    expect(
      trendYScale({ ...line, values: RUNS_PER_DAY, zero: true, integer: true, steps: 2 }),
    ).toEqual({ min: 0, max: 4, ticks: [0, 2, 4] });
  });

  it('keeps a zero-based scale at zero when every value is zero', () => {
    expect(trendYScale({ ...line, values: [0, 0, 0], zero: true, integer: true })).toEqual({
      min: 0,
      max: 1,
      ticks: [0, 1],
    });
  });

  it('never gives whole-number values a fractional tick, which would print twice', () => {
    expect(trendYScale({ ...line, values: [0, 1, 0], zero: true, integer: true })).toEqual({
      min: 0,
      max: 1,
      ticks: [0, 1],
    });
    expect(trendYScale({ ...line, values: OSTOMATE2_RUN_SECONDS, integer: true })).toEqual({
      min: 20,
      max: 35,
      ticks: [20, 25, 30, 35],
    });
  });

  // Ostomate2's fromTagsFindsSourceAmongOtherUserTags takes 352 ms in each of its 8 seeded CI runs.
  // A step of 5 ms put ticks at 0.345 and 0.355, which print as "0.34 s" and "0.35 s" beside the
  // real 0.34 and 0.35: the axis read "0.35 s, 0.35 s, 0.34 s, 0.34 s".
  it('never steps a duration finer than the hundredth of a second it prints at', () => {
    const scale = trendYScale({ ...line, values: Array(8).fill(0.352), precision: 0.01 });
    expect(scale).toEqual({ min: 0.34, max: 0.36, ticks: [0.34, 0.35, 0.36] });
  });

  it('snaps seconds to tenths without floating-point noise', () => {
    expect(trendYScale({ ...line, values: [0.4, 0.6] })).toEqual({
      min: 0.3,
      max: 0.7,
      ticks: [0.3, 0.4, 0.5, 0.6, 0.7],
    });
  });

  it('gives a flat line room above and below', () => {
    expect(trendYScale({ ...line, values: [5, 5, 5], integer: true })).toEqual({
      min: 4,
      max: 6,
      ticks: [4, 5, 6],
    });
  });
});

describe('niceScale', () => {
  // Design v5 item 5: whole-number formats step by 1, 2 or 5 × 10ⁿ, never 2.5 × 10ⁿ.
  it('steps whole numbers by 1, 2, 5 or 10 times a power of ten, never 25', () => {
    expect(niceScale(0, 66, 3, { percent: false, integer: true })).toEqual({
      min: 0,
      max: 100,
      ticks: [0, 50, 100],
    });
    expect(niceScale(0, 66, 3, { percent: false, integer: false })).toEqual({
      min: 0,
      max: 75,
      ticks: [0, 25, 50, 75],
    });
  });

  it('skips a step its labels cannot print, such as 2.5 hundredths', () => {
    expect(niceScale(0.31, 0.38, 3, { percent: false, integer: false, precision: 0.01 })).toEqual({
      min: 0.3,
      max: 0.4,
      ticks: [0.3, 0.35, 0.4],
    });
    expect(niceScale(0.31, 0.38, 3, { percent: false, integer: false })).toEqual({
      min: 0.3,
      max: 0.4,
      ticks: [0.3, 0.325, 0.35, 0.375, 0.4],
    });
  });

  // Design v5 item 5 (tp-charts.js nice()): a single value of zero opens upwards only.
  it('opens a range of only zero to 0…1, never -1…1', () => {
    expect(niceScale(0, 0, 3, { percent: false, integer: false })).toEqual({
      min: 0,
      max: 1,
      ticks: [0, 0.5, 1],
    });
  });

  it('opens a single value upwards on a zero-based chart', () => {
    expect(niceScale(3, 3, 2, { percent: false, integer: true, zero: true })).toEqual({
      min: 3,
      max: 4,
      ticks: [3, 4],
    });
  });

  it('falls back to 0 to 1 when given no finite range', () => {
    expect(niceScale(Number.NaN, Number.NaN, 2, { percent: false, integer: false })).toEqual({
      min: 0,
      max: 1,
      ticks: [0, 0.5, 1],
    });
  });

  it('opens a range of one value around it', () => {
    expect(niceScale(3, 3, 2, { percent: false, integer: true })).toEqual({
      min: 2,
      max: 4,
      ticks: [2, 3, 4],
    });
  });
});
