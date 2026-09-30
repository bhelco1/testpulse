import { describe, expect, it } from 'vitest';

import { joinNames } from './names';

// Design v9 item 6 (components.md "Landing hero", name lists): "A", "A and B", "A, B and C",
// with no Oxford comma, in the order given, never truncated.
describe('joinNames', () => {
  it('reads one name as itself', () => {
    expect(joinNames(['RouteServe'])).toBe('RouteServe');
  });

  it('joins two names with "and"', () => {
    expect(joinNames(['Ostomate 2.0', 'RouteServe'])).toBe('Ostomate 2.0 and RouteServe');
  });

  it('joins three or more with commas and a final "and", no Oxford comma', () => {
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C');
    expect(joinNames(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C, D and E');
  });

  it('keeps the order it is given', () => {
    expect(joinNames(['testpulse', 'Ostomate 2.0'])).toBe('testpulse and Ostomate 2.0');
  });

  it('is empty for no names', () => {
    expect(joinNames([])).toBe('');
  });
});
