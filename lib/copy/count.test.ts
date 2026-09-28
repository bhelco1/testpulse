import { describe, expect, it } from 'vitest';

import { formatCount, qty } from './count';

describe('qty', () => {
  it('is singular at exactly 1 for every count noun (design v4 item 50)', () => {
    expect(qty(1, 'test')).toBe('1 test');
    expect(qty(1, 'report')).toBe('1 report');
    expect(qty(1, 'flow')).toBe('1 flow');
    expect(qty(1, 'run')).toBe('1 run');
    expect(qty(1, 'suite')).toBe('1 suite');
    expect(qty(1, 'day')).toBe('1 day');
  });

  it('is plural at 0 and above 1', () => {
    expect(qty(0, 'test')).toBe('0 tests');
    expect(qty(2, 'report')).toBe('2 reports');
    expect(qty(13, 'flow')).toBe('13 flows');
  });

  it('groups thousands as the rest of the site does', () => {
    expect(qty(1045, 'test')).toBe('1,045 tests');
  });
});

describe('formatCount', () => {
  it('groups thousands in en-US', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(1045)).toBe('1,045');
    expect(formatCount(1234567)).toBe('1,234,567');
  });
});
