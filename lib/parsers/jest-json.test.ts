import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseJestJson, type JestAssertionResult, type JestJson } from './jest-json';
import { ParseError } from './types';

const fixturesDir = fileURLToPath(new URL('../../fixtures/', import.meta.url));

const readFixture = (relativePath: string): string =>
  readFileSync(`${fixturesDir}${relativePath}`, 'utf8');

const pathPrefix = '/home/runner/work/routeserve/routeserve/';

const countBy = (values: readonly string[]): Record<string, number> =>
  values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});

const catchError = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
};

describe('parseJestJson against routeserve output', () => {
  const shared = readFixture('routeserve/jest/shared.json');
  const backend = readFixture('routeserve/jest/backend.json');
  const mobile = readFixture('routeserve/jest/mobile.json');

  it.each([
    ['shared', shared, 119],
    ['backend', backend, 498],
    ['mobile', mobile, 428],
  ])('turns %s into %i passed tests with none skipped', (_workspace, text, expected) => {
    const report = parseJestJson(text, { pathPrefix });
    expect(report.tests).toHaveLength(expected);
    expect(countBy(report.tests.map((test) => test.status))).toEqual({ passed: expected });
    expect(report.tests.every((test) => test.failure === undefined)).toBe(true);
  });

  it('strips the path prefix so suites are repo-relative', () => {
    const report = parseJestJson(shared, { pathPrefix });
    expect(report.tests[0]?.suite).toBe('packages/shared/src/schemas/trip.test.ts');
    expect(report.tests.every((test) => !test.suite.startsWith('/'))).toBe(true);
  });

  it('keeps absolute suites without a path prefix or when the prefix does not match', () => {
    const absolute = parseJestJson(shared, {});
    expect(absolute.tests[0]?.suite).toBe(
      '/home/runner/work/routeserve/routeserve/packages/shared/src/schemas/trip.test.ts',
    );
    const mismatch = parseJestJson(shared, { pathPrefix: '/somewhere/else/' });
    expect(mismatch.tests[0]?.suite).toBe(absolute.tests[0]?.suite);

    // A prefix that occurs in the middle of the path is not a prefix and is left alone.
    const midString = parseJestJson(shared, { pathPrefix: 'packages/shared/' });
    expect(absolute.tests[0]?.suite).toContain('packages/shared/');
    expect(midString.tests[0]?.suite).toBe(absolute.tests[0]?.suite);
  });

  it('maps fullName to name and the per-test duration to durationMs', () => {
    const report = parseJestJson(shared, { pathPrefix });
    expect(report.tests[0]).toEqual({
      suite: 'packages/shared/src/schemas/trip.test.ts',
      name: 'tripPlannerParamsSchema accepts a corridor query with a date window and filters',
      status: 'passed',
      durationMs: 19,
    });
  });

  it('takes startedAt from the root startTime and sums file durations into durationMs', () => {
    const report = parseJestJson(shared, { pathPrefix });
    expect(report.startedAt).toBe('2026-09-21T19:12:44.755Z');
    expect(report.durationMs).toBe(22604);
    expect(parseJestJson(backend, { pathPrefix }).durationMs).toBe(115412);
    expect(parseJestJson(mobile, { pathPrefix }).durationMs).toBe(68719);
  });
});

describe('parseJestJson against a routeserve run with one failure', () => {
  const report = parseJestJson(readFixture('routeserve/jest/shared-one-failure.json'), {
    pathPrefix,
  });

  it('counts 118 passed and 1 failed', () => {
    expect(countBy(report.tests.map((test) => test.status))).toEqual({ passed: 118, failed: 1 });
  });

  it('uses the first line of the failure text as message and the full text as detail', () => {
    const failed = report.tests.find((test) => test.status === 'failed');
    expect(failed).toMatchObject({
      suite: 'packages/shared/src/schemas/asset.test.ts',
      name: 'assetCreateSchema accepts a minimal valid asset',
      durationMs: 2,
    });
    expect(failed?.failure?.message).toBe(
      'Error: expect(received).toBe(expected) // Object.is equality',
    );
    expect(failed?.failure?.detail).toContain('Expected: false');
    expect(failed?.failure?.detail).toContain('Received: true');
    expect(failed?.failure?.detail).toContain(
      '/home/runner/work/routeserve/routeserve/packages/shared/src/schemas/asset.test.ts:5:74',
    );
    expect(failed?.failure?.detail.length).toBeGreaterThan(failed?.failure?.message.length ?? 0);
  });

  it('carries only the matcher line, the diff and stack lines in the detail, never a code frame', () => {
    // The fixture README records that the private source's code frame was scrubbed from this file.
    const failed = report.tests.find((test) => test.status === 'failed');
    const lines = failed?.failure?.detail.split('\n') ?? [];
    expect(lines.length).toBeGreaterThan(3);
    for (const line of lines) {
      expect(line).toMatch(/^(Error: expect\(received\)|Expected: |Received: |\s+at |$)/);
    }
    expect(failed?.failure?.detail).not.toMatch(/\u001b\[/);
  });
});

describe('parseJestJson edge cases derived from the real fixtures', () => {
  const shared = readFixture('routeserve/jest/shared.json');
  const oneFailure = readFixture('routeserve/jest/shared-one-failure.json');

  // Each case rewrites the parsed real fixture rather than hand-writing a Jest sample.
  const rewrite = (text: string, edit: (root: JestJson) => void): string => {
    const root = JSON.parse(text) as JestJson;
    edit(root);
    return JSON.stringify(root);
  };

  const at = <T>(list: readonly T[], index: number): T => {
    const entry = list[index];
    if (entry === undefined) throw new Error(`fixture has no entry at index ${index}`);
    return entry;
  };

  const failedAssertion = (root: JestJson): JestAssertionResult => {
    const failed = root.testResults
      .flatMap((file) => file.assertionResults)
      .find((assertion) => assertion.status === 'failed');
    if (failed === undefined) throw new Error('fixture has no failed assertion');
    return failed;
  };

  it('maps pending, todo, skipped and disabled statuses to skipped, and focused to passed', () => {
    const text = rewrite(shared, (root) => {
      const first = at(root.testResults, 0).assertionResults;
      at(first, 0).status = 'pending';
      at(first, 1).status = 'todo';
      at(first, 2).status = 'skipped';
      at(first, 3).status = 'disabled';
      at(first, 4).status = 'focused';
    });
    const report = parseJestJson(text, { pathPrefix });
    expect(countBy(report.tests.map((test) => test.status))).toEqual({ passed: 115, skipped: 4 });
    expect(report.tests[4]?.status).toBe('passed');
  });

  it('rejects a name or suite that is empty after trimming, naming the field', () => {
    for (const value of ['', '  ']) {
      const emptyName = rewrite(shared, (root) => {
        at(at(root.testResults, 0).assertionResults, 0).fullName = value;
      });
      const nameError = catchError(() => parseJestJson(emptyName, { pathPrefix }));
      expect(nameError).toBeInstanceOf(ParseError);
      expect((nameError as ParseError).field).toBe('name');
      expect((nameError as ParseError).message).toMatch(/empty/);
    }
    // The file name is exactly the prefix, so nothing is left once the prefix is stripped.
    const emptySuite = rewrite(shared, (root) => {
      at(root.testResults, 0).name = pathPrefix;
    });
    const suiteError = catchError(() => parseJestJson(emptySuite, { pathPrefix }));
    expect(suiteError).toBeInstanceOf(ParseError);
    expect((suiteError as ParseError).field).toBe('suite');
    expect((suiteError as ParseError).message).toMatch(/empty/);
  });

  it('treats a null duration as zero', () => {
    const text = rewrite(shared, (root) => {
      at(at(root.testResults, 0).assertionResults, 0).duration = null;
    });
    expect(parseJestJson(text, { pathPrefix }).tests[0]?.durationMs).toBe(0);
  });

  it('rejects a negative duration, naming its path', () => {
    const text = rewrite(shared, (root) => {
      at(at(root.testResults, 0).assertionResults, 0).duration = -1;
    });
    const caught = catchError(() => parseJestJson(text, { pathPrefix }));
    expect(caught).toBeInstanceOf(ParseError);
    expect((caught as ParseError).location).toBe('testResults[0].assertionResults[0].duration');
  });

  it('rejects a file whose endTime is before its startTime, naming its path', () => {
    const text = rewrite(shared, (root) => {
      const file = at(root.testResults, 2);
      file.endTime = file.startTime - 1;
    });
    const caught = catchError(() => parseJestJson(text, { pathPrefix }));
    expect(caught).toBeInstanceOf(ParseError);
    expect((caught as ParseError).message).toMatch(/endTime/);
    expect((caught as ParseError).location).toBe('testResults[2].endTime');
  });

  it('rejects a root startTime outside the range a Date can hold, naming its path', () => {
    for (const startTime of [8.64e15 + 1, -1, 1.5]) {
      const text = rewrite(shared, (root) => {
        root.startTime = startTime;
      });
      const caught = catchError(() => parseJestJson(text, { pathPrefix }));
      expect(caught).toBeInstanceOf(ParseError);
      expect((caught as ParseError).location).toBe('startTime');
    }
    const largest = rewrite(shared, (root) => {
      root.startTime = 8.64e15;
    });
    expect(parseJestJson(largest, { pathPrefix }).startedAt).toBe('+275760-09-13T00:00:00.000Z');
  });

  it('joins several failure messages with newlines and skips blank leading lines for the message', () => {
    const text = rewrite(oneFailure, (root) => {
      const failed = failedAssertion(root);
      failed.failureMessages = ['\n\n', ...failed.failureMessages, 'second failure'];
    });
    const failed = parseJestJson(text, { pathPrefix }).tests.find(
      (test) => test.status === 'failed',
    );
    expect(failed?.failure?.message).toBe(
      'Error: expect(received).toBe(expected) // Object.is equality',
    );
    expect(failed?.failure?.detail.endsWith('\nsecond failure')).toBe(true);
  });

  it('records an empty message and detail for a failed test with no failure messages', () => {
    const text = rewrite(oneFailure, (root) => {
      for (const file of root.testResults) {
        for (const assertion of file.assertionResults) {
          if (assertion.status === 'failed') assertion.failureMessages = [];
        }
      }
    });
    const failed = parseJestJson(text, { pathPrefix }).tests.find(
      (test) => test.status === 'failed',
    );
    expect(failed?.failure).toEqual({ message: '', detail: '' });
  });

  it('reports a suite that failed without a failed assertion as one error result', () => {
    // A test file that throws while loading has status "failed", no assertions, and Jest's
    // coloured console report in message; the failing fixture's suite is rewritten that way.
    const text = rewrite(oneFailure, (root) => {
      const file = root.testResults.find((entry) => entry.status === 'failed');
      if (file === undefined) throw new Error('fixture has no failed suite');
      file.assertionResults = [];
      file.message = [
        '',
        '  \u001b[1m● \u001b[22mTest suite failed to run',
        '',
        "    \u001b[31mCannot find module './missing'\u001b[39m from 'src/schemas/asset.test.ts'",
        '',
        '      at Resolver._throwModNotFoundError (../../node_modules/jest-resolve/build/index.js:1:1)',
      ].join('\n');
    });
    const report = parseJestJson(text, { pathPrefix });
    // The rewritten file held 7 of the 119 tests, so 112 remain plus the synthetic error.
    expect(countBy(report.tests.map((test) => test.status))).toEqual({ passed: 112, error: 1 });
    expect(report.tests.find((test) => test.status === 'error')).toEqual({
      suite: 'packages/shared/src/schemas/asset.test.ts',
      name: '<suite load failure>',
      status: 'error',
      durationMs: 0,
      failure: {
        message: '● Test suite failed to run',
        detail: [
          '',
          '  ● Test suite failed to run',
          '',
          "    Cannot find module './missing' from 'src/schemas/asset.test.ts'",
          '',
          '      at Resolver._throwModNotFoundError (../../node_modules/jest-resolve/build/index.js:1:1)',
        ].join('\n'),
      },
    });
  });

  it('gives a load failure with no message an empty failure rather than dropping it', () => {
    const text = rewrite(oneFailure, (root) => {
      const file = root.testResults.find((entry) => entry.status === 'failed');
      if (file === undefined) throw new Error('fixture has no failed suite');
      file.assertionResults = [];
      file.message = '';
    });
    const error = parseJestJson(text, { pathPrefix }).tests.find((test) => test.status === 'error');
    expect(error?.failure).toEqual({ message: '', detail: '' });
  });

  it('does not add a load failure to a failed suite whose assertion already failed', () => {
    const report = parseJestJson(oneFailure, { pathPrefix });
    expect(report.tests.some((test) => test.status === 'error')).toBe(false);
    expect(report.tests.some((test) => test.name === '<suite load failure>')).toBe(false);
  });

  it('rejects a report whose runtime-error suite count has no matching suite failure', () => {
    const text = rewrite(shared, (root) => {
      root.numRuntimeErrorTestSuites = 1;
    });
    const caught = catchError(() => parseJestJson(text, { pathPrefix }));
    expect(caught).toBeInstanceOf(ParseError);
    expect((caught as ParseError).message).toMatch(/numRuntimeErrorTestSuites/);
    expect((caught as ParseError).location).toBe('numRuntimeErrorTestSuites');
  });

  it('truncates the message to 2,000 and the detail to 10,000 characters', () => {
    const text = rewrite(oneFailure, (root) => {
      failedAssertion(root).failureMessages = [`${'m'.repeat(2500)}\n${'d'.repeat(12_000)}`];
    });
    const failed = parseJestJson(text, { pathPrefix }).tests.find(
      (test) => test.status === 'failed',
    );
    expect(failed?.failure?.message).toBe('m'.repeat(2000));
    expect(failed?.failure?.detail).toHaveLength(10_000);
    expect(failed?.failure?.detail.startsWith('m'.repeat(2500))).toBe(true);
  });

  it('rejects a name or suite longer than 1,000 characters, naming the field', () => {
    const longName = rewrite(shared, (root) => {
      at(at(root.testResults, 0).assertionResults, 0).fullName = 'n'.repeat(1001);
    });
    const nameError = catchError(() => parseJestJson(longName, { pathPrefix }));
    expect(nameError).toBeInstanceOf(ParseError);
    expect((nameError as ParseError).field).toBe('name');

    const longSuite = rewrite(shared, (root) => {
      at(root.testResults, 0).name = `${pathPrefix}${'s'.repeat(1001)}`;
    });
    const suiteError = catchError(() => parseJestJson(longSuite, { pathPrefix }));
    expect(suiteError).toBeInstanceOf(ParseError);
    expect((suiteError as ParseError).field).toBe('suite');
  });

  it('rejects U+0000 and lone surrogates in names and failure text, naming the field', () => {
    // JSON.parse turns "\\u0000" and "\\ud83d" into text that Postgres rejects; the parser refuses
    // them with a specific message instead of letting the insert fail.
    const nulName = rewrite(shared, (root) => {
      at(at(root.testResults, 0).assertionResults, 0).fullName = 'trip\u0000Planner';
    });
    const nameError = catchError(() => parseJestJson(nulName, { pathPrefix }));
    expect(nameError).toBeInstanceOf(ParseError);
    expect((nameError as ParseError).field).toBe('name');
    expect((nameError as ParseError).message).toMatch(/U\+0000/);
    expect((nameError as ParseError).location).toBe('testResults[0].assertionResults[0].fullName');

    const loneSuite = rewrite(shared, (root) => {
      at(root.testResults, 0).name = `${pathPrefix}packages/\uDE00/trip.test.ts`;
    });
    const suiteError = catchError(() => parseJestJson(loneSuite, { pathPrefix }));
    expect(suiteError).toBeInstanceOf(ParseError);
    expect((suiteError as ParseError).field).toBe('suite');
    expect((suiteError as ParseError).message).toMatch(/lone surrogate U\+DE00/);

    const nulDetail = rewrite(oneFailure, (root) => {
      failedAssertion(root).failureMessages = ['Error: expect\u0000'];
    });
    const detailError = catchError(() => parseJestJson(nulDetail, { pathPrefix }));
    expect(detailError).toBeInstanceOf(ParseError);
    expect((detailError as ParseError).field).toBe('message');
    expect((detailError as ParseError).location).toBe(
      'testResults[1].assertionResults[0].failureMessages',
    );
  });

  it('rejects an unknown assertion status, naming its path', () => {
    const text = rewrite(shared, (root) => {
      at(at(root.testResults, 1).assertionResults, 2).status = 'exploded';
    });
    const caught = catchError(() => parseJestJson(text, { pathPrefix }));
    expect(caught).toBeInstanceOf(ParseError);
    expect((caught as ParseError).message).toContain('exploded');
    expect((caught as ParseError).location).toBe('testResults[1].assertionResults[2].status');
  });

  it('rejects invalid JSON', () => {
    const caught = catchError(() => parseJestJson(shared.slice(0, 200), { pathPrefix }));
    expect(caught).toBeInstanceOf(ParseError);
    expect((caught as ParseError).message).toMatch(/JSON/);
  });

  it('rejects JSON of the wrong shape, naming the missing path', () => {
    const noResults = rewrite(shared, (root) => {
      (root as { testResults?: unknown }).testResults = undefined;
    });
    const missing = catchError(() => parseJestJson(noResults, { pathPrefix }));
    expect(missing).toBeInstanceOf(ParseError);
    expect((missing as ParseError).location).toBe('testResults');

    // JSON.stringify turns NaN into null, so the parser sees a null where a number is required.
    const badStart = rewrite(shared, (root) => {
      at(root.testResults, 3).startTime = Number.NaN;
    });
    const nan = catchError(() => parseJestJson(badStart, { pathPrefix }));
    expect(nan).toBeInstanceOf(ParseError);
    expect((nan as ParseError).location).toBe('testResults[3].startTime');

    const notAnObject = catchError(() => parseJestJson('[1, 2, 3]', { pathPrefix }));
    expect(notAnObject).toBeInstanceOf(ParseError);
  });
});
