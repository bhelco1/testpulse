import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseIstanbulSummary } from './istanbul';
import { ParseError } from './types';

const fixturesDir = fileURLToPath(new URL('../../fixtures/', import.meta.url));

const readFixture = (relativePath: string): string =>
  readFileSync(`${fixturesDir}${relativePath}`, 'utf8');

const catchError = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
};

// Vitest's v8 coverage writes the same json-summary as Jest's istanbul (testpulse checks job).
describe('parseIstanbulSummary against testpulse Vitest v8 coverage-summary.json', () => {
  it('reads the total lines and branches of the unit run', () => {
    expect(parseIstanbulSummary(readFixture('testpulse/istanbul/unit.json'))).toEqual({
      linesCovered: 3125,
      linesTotal: 3141,
      branchesCovered: 2385,
      branchesTotal: 2497,
    });
  });
});

describe('parseIstanbulSummary against routeserve coverage-summary.json', () => {
  it.each([
    ['shared', { linesCovered: 102, linesTotal: 102, branchesCovered: 5, branchesTotal: 5 }],
    [
      'backend',
      { linesCovered: 1862, linesTotal: 1968, branchesCovered: 941, branchesTotal: 1157 },
    ],
    [
      'mobile',
      { linesCovered: 1496, linesTotal: 1551, branchesCovered: 1139, branchesTotal: 1300 },
    ],
  ])('reads the total lines and branches of %s', (workspace, expected) => {
    expect(parseIstanbulSummary(readFixture(`routeserve/istanbul/${workspace}.json`))).toEqual(
      expected,
    );
  });
});

describe('parseIstanbulSummary edge cases derived from the real fixtures', () => {
  const shared = readFixture('routeserve/istanbul/shared.json');

  // Each case rewrites the parsed real fixture rather than hand-writing a summary.
  const rewrite = (edit: (root: Record<string, unknown>) => void): string => {
    const root = JSON.parse(shared) as Record<string, unknown>;
    edit(root);
    return JSON.stringify(root);
  };

  it('leaves branches undefined when total has no branches entry', () => {
    const text = rewrite((root) => {
      delete (root.total as Record<string, unknown>).branches;
    });
    expect(parseIstanbulSummary(text)).toEqual({ linesCovered: 102, linesTotal: 102 });
  });

  it('rejects invalid JSON', () => {
    const caught = catchError(() => parseIstanbulSummary(shared.slice(0, 50)));
    expect(caught).toBeInstanceOf(ParseError);
    expect((caught as ParseError).message).toMatch(/JSON/);
  });

  it('rejects a summary without a total entry, naming the path', () => {
    const text = rewrite((root) => {
      delete root.total;
    });
    const caught = catchError(() => parseIstanbulSummary(text));
    expect(caught).toBeInstanceOf(ParseError);
    expect((caught as ParseError).location).toBe('total');
  });

  it('rejects a non-integer or negative count, naming the path', () => {
    const fractional = rewrite((root) => {
      ((root.total as Record<string, unknown>).lines as Record<string, unknown>).covered = 1.5;
    });
    const fractionalError = catchError(() => parseIstanbulSummary(fractional));
    expect(fractionalError).toBeInstanceOf(ParseError);
    expect((fractionalError as ParseError).location).toBe('total.lines.covered');

    const negative = rewrite((root) => {
      ((root.total as Record<string, unknown>).branches as Record<string, unknown>).total = -1;
    });
    const negativeError = catchError(() => parseIstanbulSummary(negative));
    expect(negativeError).toBeInstanceOf(ParseError);
    expect((negativeError as ParseError).location).toBe('total.branches.total');
  });

  it('rejects JSON that is not an object', () => {
    expect(() => parseIstanbulSummary('"total"')).toThrow(ParseError);
  });
});
