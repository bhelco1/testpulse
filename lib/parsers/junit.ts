import { assertDuration, assertName, firstNonEmptyLine, toFailure } from './limits';
import { ParseError, type NormalizedReport, type NormalizedTest, type TestStatus } from './types';
import {
  assertNoDoctype,
  asNode,
  attribute,
  children,
  parseXml,
  textOf,
  type XmlNode,
} from './xml';

const OUTCOME_CHILDREN: ReadonlyArray<{ tag: string; status: TestStatus }> = [
  { tag: 'failure', status: 'failed' },
  { tag: 'error', status: 'error' },
  { tag: 'skipped', status: 'skipped' },
];

const TIME_PATTERN = /^\d+(\.\d+)?$/;
// An ISO date-time with no zone suffix; Date.parse would read it in the server's zone.
const OFFSETLESS_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;

function secondsToMs(value: string, location: string): number {
  if (!TIME_PATTERN.test(value)) {
    throw new ParseError(
      `time attribute "${value}" is not a plain non-negative number of seconds`,
      {
        field: 'time',
        location,
      },
    );
  }
  return Math.round(Number(value) * 1000);
}

/** The element's `time` in milliseconds, or undefined when the attribute is absent or empty. */
function timeOf(node: XmlNode, location: string): number | undefined {
  const value = attribute(node, 'time');
  return value === undefined || value === '' ? undefined : secondsToMs(value, location);
}

/** Reads a testsuite timestamp as UTC when it carries no offset, so output is server-independent. */
function parseTimestamp(value: string): number {
  return Date.parse(OFFSETLESS_TIMESTAMP.test(value) ? `${value}Z` : value);
}

function requiredAttribute(node: XmlNode, name: string, location: string): string {
  const value = attribute(node, name);
  if (value === undefined) {
    throw new ParseError(`testcase is missing the ${name} attribute`, { field: name, location });
  }
  return value;
}

function toTest(testcase: XmlNode, location: string): NormalizedTest {
  const suite = assertName('suite', requiredAttribute(testcase, 'classname', location), location);
  const name = assertName('name', requiredAttribute(testcase, 'name', location), location);
  const testLocation = `${location}, testcase "${name}"`;
  const durationMs = assertDuration(
    'test',
    'time',
    timeOf(testcase, testLocation) ?? 0,
    testLocation,
  );

  for (const outcome of OUTCOME_CHILDREN) {
    const [element] = children(testcase, outcome.tag);
    if (element === undefined) continue;
    if (outcome.status === 'skipped') return { suite, name, status: 'skipped', durationMs };
    const detail = textOf(element);
    const messageAttribute = attribute(element, 'message');
    const message =
      messageAttribute === undefined || messageAttribute.trim() === ''
        ? firstNonEmptyLine(detail)
        : messageAttribute;
    return {
      suite,
      name,
      status: outcome.status,
      durationMs,
      failure: toFailure(message, detail, `${location}, testcase "${name}"`),
    };
  }
  return { suite, name, status: 'passed', durationMs };
}

function rootSuites(document: XmlNode, location: string): XmlNode[] {
  const wrapper = asNode(document['testsuites']);
  if (wrapper !== undefined) {
    if (children(wrapper, 'testcase').length > 0) {
      throw new ParseError(
        'A testcase directly under testsuites has no suite; it must be inside a testsuite',
        { location },
      );
    }
    return children(wrapper, 'testsuite');
  }
  const single = asNode(document['testsuite']);
  if (single !== undefined) return [single];
  throw new ParseError('Expected a testsuite or testsuites root element', { location });
}

/**
 * Merges one or more JUnit XML files into a single report. Blank files and files without
 * testcases contribute nothing; the caller decides whether an empty report is acceptable.
 */
export function parseJunit(files: readonly string[]): NormalizedReport {
  const tests: NormalizedTest[] = [];
  let durationMs = 0;
  let earliestStart: number | undefined;

  files.forEach((file, index) => {
    if (file.trim() === '') return;
    const fileLocation = `file ${index + 1}`;
    assertNoDoctype(file);
    const document = parseXml(file);

    for (const suite of rootSuites(document, fileLocation)) {
      const suiteName = attribute(suite, 'name');
      const location =
        suiteName === undefined ? fileLocation : `${fileLocation}, testsuite "${suiteName}"`;
      if (children(suite, 'testsuite').length > 0) {
        throw new ParseError('A testsuite nested inside a testsuite is not supported', {
          location,
        });
      }
      const suiteTests = children(suite, 'testcase').map((testcase) => toTest(testcase, location));
      tests.push(...suiteTests);

      durationMs +=
        timeOf(suite, location) ?? suiteTests.reduce((total, test) => total + test.durationMs, 0);
      assertDuration('report', 'time', durationMs, location);

      const timestamp = attribute(suite, 'timestamp');
      const started = timestamp === undefined ? Number.NaN : parseTimestamp(timestamp);
      if (!Number.isNaN(started) && (earliestStart === undefined || started < earliestStart)) {
        earliestStart = started;
      }
    }
  });

  return earliestStart === undefined
    ? { tests, durationMs }
    : { tests, startedAt: new Date(earliestStart).toISOString(), durationMs };
}
