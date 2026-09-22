import { z } from 'zod';

import { formatPath, parseJsonText, validateShape } from './json';
import { assertName, firstNonEmptyLine, stripAnsi, toFailure } from './limits';
import { ParseError, type NormalizedReport, type NormalizedTest, type TestStatus } from './types';

// The largest epoch-millisecond value a Date can hold; beyond it `toISOString` throws.
const MAX_EPOCH_MS = 8.64e15;

// Only the fields the parser reads; Jest's other fields are ignored (spec section 7).
const assertionResultSchema = z.object({
  fullName: z.string(),
  status: z.string(),
  duration: z.number().nonnegative().nullable().optional(),
  failureMessages: z.array(z.string()),
});

const testResultSchema = z
  .object({
    name: z.string(),
    status: z.string(),
    message: z.string(),
    startTime: z.number(),
    endTime: z.number(),
    assertionResults: z.array(assertionResultSchema),
  })
  .refine((file) => file.endTime >= file.startTime, {
    message: 'endTime is before startTime',
    path: ['endTime'],
  });

const jestJsonSchema = z.object({
  startTime: z.number().int().min(0).max(MAX_EPOCH_MS),
  numRuntimeErrorTestSuites: z.number().int().nonnegative().optional(),
  testResults: z.array(testResultSchema),
});

export type JestAssertionResult = z.infer<typeof assertionResultSchema>;
export type JestTestResult = z.infer<typeof testResultSchema>;
export type JestJson = z.infer<typeof jestJsonSchema>;

/** Name of the synthetic result that stands in for a test file that failed before running any test. */
export const SUITE_LOAD_FAILURE_NAME = '<suite load failure>';

// Every value Jest itself assigns to assertionResults[].status; anything else is rejected.
const STATUS_MAP: Readonly<Record<string, TestStatus>> = {
  passed: 'passed',
  focused: 'passed',
  failed: 'failed',
  pending: 'skipped',
  todo: 'skipped',
  skipped: 'skipped',
  disabled: 'skipped',
};

export interface JestJsonOptions {
  /** Stripped from `testResults[].name` when it is a prefix, so suites are repo-relative. */
  pathPrefix?: string;
}

function toSuite(fileName: string, pathPrefix: string | undefined, location: string): string {
  const relative =
    pathPrefix !== undefined && fileName.startsWith(pathPrefix)
      ? fileName.slice(pathPrefix.length)
      : fileName;
  return assertName('suite', relative, location);
}

function toStatus(status: string, location: string): TestStatus {
  const mapped = STATUS_MAP[status];
  if (mapped === undefined) {
    throw new ParseError(`Unknown Jest test status "${status}"`, { location });
  }
  return mapped;
}

function toTest(
  suite: string,
  assertion: JestAssertionResult,
  path: ReadonlyArray<PropertyKey>,
): NormalizedTest {
  const name = assertName('name', assertion.fullName, formatPath([...path, 'fullName']));
  const status = toStatus(assertion.status, formatPath([...path, 'status']));
  const test: NormalizedTest = {
    suite,
    name,
    status,
    durationMs: Math.round(assertion.duration ?? 0),
  };
  if (status === 'failed' || status === 'error') {
    const detail = assertion.failureMessages.join('\n');
    test.failure = toFailure(
      firstNonEmptyLine(detail),
      detail,
      formatPath([...path, 'failureMessages']),
    );
  }
  return test;
}

/**
 * A file that failed without any failed assertion never ran its tests (a syntax error, a missing
 * import, a throwing hook); Jest puts the console report in `message`. Ingesting it as green would
 * hide a broken test file, so it becomes one error result.
 */
function suiteLoadFailure(suite: string, file: JestTestResult, location: string): NormalizedTest {
  const detail = stripAnsi(file.message);
  return {
    suite,
    name: SUITE_LOAD_FAILURE_NAME,
    status: 'error',
    durationMs: 0,
    failure: toFailure(firstNonEmptyLine(detail), detail, location),
  };
}

export function parseJestJson(text: string, options: JestJsonOptions): NormalizedReport {
  const root = validateShape(jestJsonSchema, parseJsonText(text));
  const tests: NormalizedTest[] = [];
  let durationMs = 0;
  let loadFailures = 0;

  root.testResults.forEach((file, fileIndex) => {
    durationMs += file.endTime - file.startTime;
    const suite = toSuite(file.name, options.pathPrefix, formatPath(['testResults', fileIndex]));
    const suiteTests = file.assertionResults.map((assertion, assertionIndex) =>
      toTest(suite, assertion, ['testResults', fileIndex, 'assertionResults', assertionIndex]),
    );
    tests.push(...suiteTests);
    if (file.status === 'failed' && !suiteTests.some((test) => test.status === 'failed')) {
      tests.push(suiteLoadFailure(suite, file, formatPath(['testResults', fileIndex, 'message'])));
      loadFailures += 1;
    }
  });

  const runtimeErrors = root.numRuntimeErrorTestSuites ?? 0;
  if (runtimeErrors > 0 && loadFailures === 0) {
    throw new ParseError(
      `numRuntimeErrorTestSuites is ${runtimeErrors} but no test file reports a load failure`,
      { location: 'numRuntimeErrorTestSuites' },
    );
  }

  return { tests, startedAt: new Date(root.startTime).toISOString(), durationMs };
}
