import { describe, expect, it } from 'vitest';

import { formatTrendValue } from './format';

describe('formatTrendValue', () => {
  it('drops trailing zeros on axis ticks and keeps one decimal on exact percentages', () => {
    expect(formatTrendValue(100, 'pct')).toBe('100%');
    expect(formatTrendValue(99.3, 'pct')).toBe('99.3%');
    expect(formatTrendValue(92, 'pct', true)).toBe('92.0%');
    expect(formatTrendValue(52.6, 'pct', true)).toBe('52.6%');
  });

  // Decision 2026-09-29 (spec section 19): a percentage rounds down, so it never reads as a
  // figure it has not reached. 10,446 of 10,450 is 99.9617...%, which must not read "100%".
  it('rounds a percentage down, so only exactly 100 reads 100%', () => {
    expect(formatTrendValue((10_446 / 10_450) * 100, 'pct')).toBe('99.9%');
    expect(formatTrendValue(99.96, 'pct', true)).toBe('99.9%');
    expect(formatTrendValue(99.99, 'pct')).toBe('99.9%');
    expect(formatTrendValue(100, 'pct', true)).toBe('100.0%');
    expect(formatTrendValue(0, 'pct')).toBe('0%');
    expect(formatTrendValue(0, 'pct', true)).toBe('0.0%');
    // Rounding to nearest gave 99.3% and 94.4%.
    expect(formatTrendValue(99.25, 'pct')).toBe('99.2%');
    expect(formatTrendValue((1_042 / 1_104) * 100, 'pct', true)).toBe('94.3%');
  });

  it('does not drop a tenth to binary floating point error', () => {
    // 0.57 * 100 is 56.99999999999999 in binary floating point; 57 of 100 is still 57.0%.
    expect(formatTrendValue(0.57 * 100, 'pct', true)).toBe('57.0%');
    expect(formatTrendValue(0.7 * 100, 'pct', true)).toBe('70.0%');
  });

  it('shows seconds to two places when exact, and trims them on ticks', () => {
    expect(formatTrendValue(0.4, 'sec')).toBe('0.4 s');
    expect(formatTrendValue(0.4, 'sec', true)).toBe('0.40 s');
    expect(formatTrendValue(0.384, 'sec', true)).toBe('0.38 s');
  });

  // Design v8 item 48 and v9 item 8 (tp-charts.js fmtFor; components.md TrendChart "sec format"):
  // durations are stored in whole ms, so under 10 ms reads in whole ms and a stored 0 reads
  // "<1 ms"; an axis tick at 0 stays "0 s".
  it('reads a test time under 10 ms in whole milliseconds, and a stored 0 as "<1 ms"', () => {
    expect(formatTrendValue(0.003, 'sec', true)).toBe('3 ms');
    expect(formatTrendValue(0.0094, 'sec', true)).toBe('9 ms');
    expect(formatTrendValue(0.001, 'sec', true)).toBe('1 ms');
    expect(formatTrendValue(0, 'sec', true)).toBe('<1 ms');
    expect(formatTrendValue(0.01, 'sec', true)).toBe('0.01 s');
    expect(formatTrendValue(0.025, 'sec', true)).toBe('0.03 s');
    expect(formatTrendValue(0, 'sec')).toBe('0 s');
    expect(formatTrendValue(0.005, 'sec')).toBe('5 ms');
  });

  it('reads the whole-millisecond axis of a chart under 10 ms: "0 ms" at 0, "<1 ms" exact', () => {
    expect(formatTrendValue(0, 'ms')).toBe('0 ms');
    expect(formatTrendValue(4, 'ms')).toBe('4 ms');
    expect(formatTrendValue(0, 'ms', true)).toBe('<1 ms');
    expect(formatTrendValue(0.4, 'ms', true)).toBe('<1 ms');
    expect(formatTrendValue(3, 'ms', true)).toBe('3 ms');
  });

  it('rounds run durations to whole seconds', () => {
    expect(formatTrendValue(26.6, 'dur')).toBe('27 s');
    expect(formatTrendValue(26.6, 'dur', true)).toBe('27 s');
  });

  it('rounds counts and groups thousands', () => {
    expect(formatTrendValue(1048, 'int')).toBe('1,048');
    expect(formatTrendValue(118.4, 'int', true)).toBe('118');
  });
});
