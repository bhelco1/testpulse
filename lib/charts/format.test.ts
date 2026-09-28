import { describe, expect, it } from 'vitest';

import { formatTrendValue } from './format';

describe('formatTrendValue', () => {
  it('drops trailing zeros on axis ticks and keeps one decimal on exact percentages', () => {
    expect(formatTrendValue(100, 'pct')).toBe('100%');
    expect(formatTrendValue(99.3, 'pct')).toBe('99.3%');
    expect(formatTrendValue(99.25, 'pct')).toBe('99.3%');
    expect(formatTrendValue(92, 'pct', true)).toBe('92.0%');
    expect(formatTrendValue(52.6, 'pct', true)).toBe('52.6%');
  });

  it('shows seconds to two places when exact, and trims them on ticks', () => {
    expect(formatTrendValue(0.4, 'sec')).toBe('0.4 s');
    expect(formatTrendValue(0.4, 'sec', true)).toBe('0.40 s');
    expect(formatTrendValue(0.384, 'sec', true)).toBe('0.38 s');
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
