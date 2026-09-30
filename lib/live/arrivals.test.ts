import { describe, expect, it } from 'vitest';

import { arrivals, rebase, type Baseline } from './arrivals';

// components.md, RunFeedRow "New": a row that arrived over realtime since the page loaded. The
// page is re-rendered on the server (router.refresh), so the browser knows a row is new only by
// comparing the ids it is given with the ids it first rendered.

const base = (scope: string, ids: readonly string[]): Baseline => ({ scope, seen: new Set(ids) });
const list = (set: ReadonlySet<string>) => [...set];

describe('arrivals', () => {
  it('is nothing at first render: every row was seen', () => {
    expect(list(arrivals(new Set(['c', 'b', 'a']), ['c', 'b', 'a']))).toEqual([]);
  });

  it('is a run above the newest row seen, and stays so as older rows drop off the end', () => {
    // The landing feed keeps 3 rows: d arrives on top and a leaves.
    expect(list(arrivals(new Set(['c', 'b', 'a']), ['d', 'c', 'b']))).toEqual(['d']);
    expect(list(arrivals(new Set(['c', 'b', 'a']), ['e', 'd', 'c']))).toEqual(['e', 'd']);
  });

  it('is every row once none of the rows seen is left', () => {
    expect(list(arrivals(new Set(['c', 'b', 'a']), ['f', 'e', 'd']))).toEqual(['f', 'e', 'd']);
  });

  it('is every row of a list that was empty when the page loaded', () => {
    expect(list(arrivals(new Set(), ['b', 'a']))).toEqual(['b', 'a']);
    expect(list(arrivals(new Set(), []))).toEqual([]);
  });

  // "Load 20 more" appends older runs below the ones seen; they did not arrive.
  it('is never a row below the newest row seen', () => {
    expect(list(arrivals(new Set(['c', 'b']), ['d', 'c', 'b', 'a', 'z']))).toEqual(['d']);
  });

  it('looks for the first seen row anywhere, so one dropped from the top does not matter', () => {
    expect(list(arrivals(new Set(['c', 'b', 'a']), ['d', 'b', 'a']))).toEqual(['d']);
  });
});

describe('rebase', () => {
  it('keeps the baseline, unchanged, while the list shows the same scope', () => {
    const first = base('default', ['c', 'b', 'a']);
    expect(rebase(first, 'default', ['d', 'c', 'b'])).toBe(first);
  });

  // The project page's branch filter changes what the list holds; runs it adds did not arrive.
  it('starts again from the rows shown when the scope changes', () => {
    const first = base('default', ['c', 'b', 'a']);
    const next = rebase(first, 'all', ['pr', 'c', 'b']);
    expect(next).toEqual(base('all', ['pr', 'c', 'b']));
    expect(list(arrivals(next.seen, ['pr', 'c', 'b']))).toEqual([]);
  });
});
