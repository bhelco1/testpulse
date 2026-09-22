import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseJunit } from './junit';
import { MAX_REPORT_DURATION_MS, MAX_TEST_DURATION_MS } from './limits';
import { ParseError } from './types';

const fixturesDir = fileURLToPath(new URL('../../fixtures/', import.meta.url));

const readFixture = (relativePath: string): string =>
  readFileSync(`${fixturesDir}${relativePath}`, 'utf8');

const readSuiteDir = (relativeDir: string): string[] =>
  readdirSync(`${fixturesDir}${relativeDir}`)
    .filter((name) => name.endsWith('.xml'))
    .sort()
    .map((name) => readFixture(`${relativeDir}/${name}`));

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

describe('parseJunit against Ostomate2 Gradle output (single testsuite root)', () => {
  const shared = parseJunit(readSuiteDir('ostomate2/junit/jvm/shared'));
  const composeApp = parseJunit(readSuiteDir('ostomate2/junit/jvm/composeApp'));
  const iosComposeApp = parseJunit(readSuiteDir('ostomate2/junit/ios-sim/composeApp'));

  it('merges the 10 shared JVM files into 82 passed tests', () => {
    expect(shared.tests).toHaveLength(82);
    expect(countBy(shared.tests.map((test) => test.status))).toEqual({ passed: 82 });
  });

  it('merges the 11 composeApp JVM files into 60 passed tests', () => {
    expect(composeApp.tests).toHaveLength(60);
    expect(countBy(composeApp.tests.map((test) => test.status))).toEqual({ passed: 60 });
  });

  it('merges the 7 composeApp iOS-simulator files into 50 passed tests', () => {
    expect(iosComposeApp.tests).toHaveLength(50);
    expect(countBy(iosComposeApp.tests.map((test) => test.status))).toEqual({ passed: 50 });
  });

  it('maps classname to suite with the per-suite counts from the capture', () => {
    const suites = countBy(shared.tests.map((test) => test.suite));
    expect(suites['com.ostomate.app.data.RepositoryTest']).toBe(14);
    expect(suites['com.ostomate.app.domain.DeepLinkParserTest']).toBe(15);
    expect(suites['com.ostomate.app.data.db.MigrationTest']).toBe(1);
    expect(Object.keys(suites)).toHaveLength(10);

    const iosSuites = countBy(iosComposeApp.tests.map((test) => test.suite));
    expect(iosSuites['iosSimulatorArm64Test.com.ostomate.app.ui.home.HomeViewModelTest']).toBe(9);
  });

  it('maps name and converts time in seconds to integer milliseconds', () => {
    const undoLog = shared.tests.find((test) => test.name === 'undoLogRestoresThePriorCount');
    expect(undoLog).toEqual({
      suite: 'com.ostomate.app.data.RepositoryTest',
      name: 'undoLogRestoresThePriorCount',
      status: 'passed',
      durationMs: 13310,
    });

    const zeroTime = shared.tests.find((test) => test.name === 'parsesFlangeLink');
    expect(zeroTime?.durationMs).toBe(0);

    const ios = iosComposeApp.tests.find(
      (test) => test.name === 'rowsAggregateCountsAndAverages[iosSimulatorArm64]',
    );
    expect(ios?.durationMs).toBe(1);

    for (const test of [...shared.tests, ...composeApp.tests, ...iosComposeApp.tests]) {
      expect(Number.isInteger(test.durationMs)).toBe(true);
      expect(test.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('takes startedAt from the earliest testsuite timestamp across the files', () => {
    expect(shared.startedAt).toBe('2026-09-21T19:17:35.308Z');
    expect(composeApp.startedAt).toBe('2026-09-21T19:21:33.637Z');
    expect(iosComposeApp.startedAt).toBe('2026-09-21T18:57:03.830Z');

    // The same files in another order give the same answer, so it is the minimum, not the first.
    const files = readSuiteDir('ostomate2/junit/jvm/shared');
    const timestamps = files.map((file) => /timestamp="([^"]+)"/.exec(file)?.[1]);
    const earliestIndex = timestamps.indexOf('2026-09-21T19:17:35.308Z');
    const earliestLast = [...files.slice(0, earliestIndex), ...files.slice(earliestIndex + 1)];
    earliestLast.push(files[earliestIndex] ?? '');
    expect(/timestamp="([^"]+)"/.exec(earliestLast[0] ?? '')?.[1]).not.toBe(
      '2026-09-21T19:17:35.308Z',
    );
    expect(parseJunit(earliestLast).startedAt).toBe('2026-09-21T19:17:35.308Z');
    expect(parseJunit([...files].reverse()).startedAt).toBe('2026-09-21T19:17:35.308Z');
  });

  it('sums the testsuite time attributes into durationMs', () => {
    expect(shared.durationMs).toBe(17747);
  });

  it('ignores hostname, properties, system-out and system-err content', () => {
    const files = readSuiteDir('ostomate2/junit/jvm/composeApp');
    expect(files.some((file) => file.includes('<system-out><![CDATA['))).toBe(true);
    expect(files.every((file) => file.includes('hostname='))).toBe(true);

    const serialized = JSON.stringify(composeApp);
    expect(serialized).not.toContain('runnervmlun5p');
    expect(serialized).not.toContain('system-out');
    expect(serialized).not.toContain('properties');
    expect(composeApp.tests.every((test) => test.failure === undefined)).toBe(true);
  });
});

describe('parseJunit against Playwright output (testsuites wrapper)', () => {
  const report = parseJunit([readFixture('testpulse/junit/playwright-one-failure.xml')]);

  it('reads every testcase under the testsuites wrapper', () => {
    expect(report.tests).toHaveLength(3);
    expect(report.startedAt).toBe('2026-09-22T04:37:33.640Z');
    expect(report.durationMs).toBe(242);
  });

  it('maps a testcase without failure, error or skipped children to passed', () => {
    expect(report.tests[0]).toEqual({
      suite: 'home.spec.ts',
      name: 'home page renders the testpulse heading',
      status: 'passed',
      durationMs: 238,
    });
  });

  it('maps a failure child to failed with the message attribute and the full text as detail', () => {
    const failed = report.tests[1];
    expect(failed).toMatchObject({
      suite: 'zz-deliberate-failure.spec.ts',
      name: 'deliberately fails to capture a failing JUnit fixture',
      status: 'failed',
      durationMs: 4,
    });
    expect(failed?.failure?.message).toBe('expect(received).toBe(expected) // Object.is equality');
    expect(failed?.failure?.message).toContain('toBe');
    expect(failed?.failure?.detail).toContain('Expected: 2');
    expect(failed?.failure?.detail).toContain('Received: 1');
    expect(failed?.failure?.detail).toContain(
      '/home/runner/work/testpulse/testpulse/tests/e2e/zz-deliberate-failure.spec.ts:4:13',
    );
  });

  it('maps a skipped child to skipped with a zero duration when time is absent', () => {
    expect(report.tests[2]).toEqual({
      suite: 'zz-deliberate-failure.spec.ts',
      name: 'deliberately skipped to capture a skipped JUnit fixture',
      status: 'skipped',
      durationMs: 0,
    });
  });
});

describe('parseJunit edge cases derived from the real fixtures', () => {
  const playwright = readFixture('testpulse/junit/playwright-one-failure.xml');
  const gradle = readFixture(
    'ostomate2/junit/jvm/shared/TEST-com.ostomate.app.data.RepositoryTest.xml',
  );

  it('returns zero tests for no files, blank files, or files without testcases', () => {
    expect(parseJunit([])).toEqual({ tests: [], durationMs: 0 });
    expect(parseJunit(['', '  \n'])).toEqual({ tests: [], durationMs: 0 });

    // Derived from the real fixtures: every testcase (and, for Playwright, every testsuite that
    // held one) is removed, leaving only the wrappers the tools emit.
    const gradleWithoutTestcases = gradle.replace(/^\s*<testcase [^>]*\/>\n/gm, '');
    expect(gradleWithoutTestcases).not.toContain('<testcase');
    expect(gradleWithoutTestcases).toContain('<testsuite name=');
    expect(parseJunit([gradleWithoutTestcases])).toEqual({
      tests: [],
      startedAt: '2026-09-21T19:17:36.326Z',
      durationMs: 15273,
    });

    const playwrightWithoutSuites = playwright.replace(/<testsuite [\s\S]*<\/testsuite>\n/, '');
    expect(playwrightWithoutSuites).not.toContain('<testsuite ');
    expect(playwrightWithoutSuites).toMatch(/^<testsuites [^>]*>\n<\/testsuites>$/);
    expect(parseJunit([playwrightWithoutSuites])).toEqual({ tests: [], durationMs: 0 });
  });

  it('maps an error child to error, using the first line of the text when there is no message attribute', () => {
    // The Playwright fixture has no <error> element, so its <failure> is rewritten into one here.
    const withError = playwright
      .replace(
        '<failure message="expect(received).toBe(expected) // Object.is equality" type="expect.toBe">',
        '<error>',
      )
      .replace('</failure>', '</error>');
    const errored = parseJunit([withError]).tests[1];
    expect(errored?.status).toBe('error');
    expect(errored?.failure?.message).toBe(
      '[chromium] › zz-deliberate-failure.spec.ts:3:1 › deliberately fails to capture a failing JUnit fixture',
    );
    expect(errored?.failure?.detail).toContain('Expected: 2');
  });

  it('falls back to the first line of the body when the message attribute is empty', () => {
    const emptyMessage = playwright.replace(
      'message="expect(received).toBe(expected) // Object.is equality"',
      'message=""',
    );
    const failed = parseJunit([emptyMessage]).tests[1];
    expect(failed?.status).toBe('failed');
    expect(failed?.failure?.message).toBe(
      '[chromium] › zz-deliberate-failure.spec.ts:3:1 › deliberately fails to capture a failing JUnit fixture',
    );
  });

  it('gives an empty message and detail for a self-closing failure element', () => {
    // Derived from the Gradle fixture: one passing testcase is rewritten to carry a bare <failure/>.
    const bare = gradle.replace(
      '<testcase name="undoLogRestoresThePriorCount" classname="com.ostomate.app.data.RepositoryTest" time="13.31"/>',
      '<testcase name="undoLogRestoresThePriorCount" classname="com.ostomate.app.data.RepositoryTest" time="13.31"><failure/></testcase>',
    );
    const failed = parseJunit([bare]).tests.find(
      (test) => test.name === 'undoLogRestoresThePriorCount',
    );
    expect(failed?.status).toBe('failed');
    expect(failed?.failure).toEqual({ message: '', detail: '' });
  });

  it('falls back to summing testcase times when a testsuite has no time attribute', () => {
    const withoutSuiteTimes = playwright.replace(/(<testsuite [^>]*?) time="[^"]*"/g, '$1');
    expect(withoutSuiteTimes).not.toMatch(/<testsuite [^>]*time=/);
    expect(parseJunit([withoutSuiteTimes]).durationMs).toBe(242);

    // An empty time attribute is treated the same as an absent one.
    const emptySuiteTimes = playwright.replace(/(<testsuite [^>]*?) time="[^"]*"/g, '$1 time=""');
    expect(emptySuiteTimes).toMatch(/<testsuite [^>]*time=""/);
    expect(parseJunit([emptySuiteTimes]).durationMs).toBe(242);
    const emptyCaseTime = gradle.replace('time="13.31"', 'time=""');
    const undoLog = parseJunit([emptyCaseTime]).tests.find(
      (test) => test.name === 'undoLogRestoresThePriorCount',
    );
    expect(undoLog?.durationMs).toBe(0);
  });

  it('rounds half a millisecond up', () => {
    const half = gradle.replace('time="13.31"', 'time="0.0005"');
    const undoLog = parseJunit([half]).tests.find(
      (test) => test.name === 'undoLogRestoresThePriorCount',
    );
    expect(undoLog?.durationMs).toBe(1);
  });

  it('reads a timestamp without an offset as UTC, whatever the server timezone', () => {
    const offsetless = playwright.replace(/timestamp="([^"]*)Z"/g, 'timestamp="$1"');
    expect(offsetless).toContain('timestamp="2026-09-22T04:37:33.640"');
    expect(parseJunit([offsetless]).startedAt).toBe('2026-09-22T04:37:33.640Z');

    const explicitOffset = playwright.replace(
      /timestamp="([^"]*)Z"/g,
      'timestamp="2026-09-21T22:37:33.640-06:00"',
    );
    expect(parseJunit([explicitOffset]).startedAt).toBe('2026-09-22T04:37:33.640Z');
  });

  it('omits startedAt when no testsuite carries a usable timestamp', () => {
    const withoutTimestamps = playwright.replace(/ timestamp="[^"]*"/g, '');
    expect(parseJunit([withoutTimestamps]).startedAt).toBeUndefined();

    const withBadTimestamp = playwright.replace(/ timestamp="[^"]*"/g, ' timestamp="yesterday"');
    expect(parseJunit([withBadTimestamp]).startedAt).toBeUndefined();
  });

  it('decodes the predefined XML entities in names without expanding anything else', () => {
    // Derived from the Gradle fixture: one testcase name is rewritten to use predefined entities.
    const encoded = gradle.replace(
      'name="undoLogRestoresThePriorCount"',
      'name="undo &lt;log&gt; &amp; &quot;restore&quot; &#39;x&#39; &#x41; &unknown;"',
    );
    const names = parseJunit([encoded]).tests.map((test) => test.name);
    expect(names).toContain('undo <log> & "restore" \'x\' A &unknown;');

    const doubleEncoded = gradle.replace('name="undoLogRestoresThePriorCount"', 'name="&amp;lt;"');
    expect(parseJunit([doubleEncoded]).tests.map((test) => test.name)).toContain('&lt;');

    const supplementary = gradle.replace(
      'name="undoLogRestoresThePriorCount"',
      'name="tab&#9;emoji&#x1F600;"',
    );
    expect(parseJunit([supplementary]).tests.map((test) => test.name)).toContain(
      'tab\temoji\u{1F600}',
    );
  });

  it('rejects a numeric character reference outside the XML Char range, naming it', () => {
    for (const reference of ['&#0;', '&#1114112;', '&#xD800;', '&#xFFFE;', '&#x1F;']) {
      const withReference = gradle.replace(
        'name="undoLogRestoresThePriorCount"',
        `name="${reference}"`,
      );
      const caught = catchError(() => parseJunit([withReference]));
      expect(caught).toBeInstanceOf(ParseError);
      expect((caught as ParseError).message).toContain(reference);
    }
  });

  it('rejects U+0000 and lone surrogates in names and failure text, naming the field', () => {
    // The validator accepts a raw NUL, and a JavaScript string can hold half a surrogate pair;
    // Postgres text rejects both, so the parser must refuse them with a specific message.
    const nulName = gradle.replace('name="undoLogRestoresThePriorCount"', 'name="undo\u0000Log"');
    const nameError = catchError(() => parseJunit([nulName]));
    expect(nameError).toBeInstanceOf(ParseError);
    expect((nameError as ParseError).field).toBe('name');
    expect((nameError as ParseError).message).toMatch(/U\+0000/);

    const loneSuite = gradle.replace(
      'classname="com.ostomate.app.data.RepositoryTest" time="13.31"',
      'classname="com.\uD83D.RepositoryTest" time="13.31"',
    );
    const suiteError = catchError(() => parseJunit([loneSuite]));
    expect(suiteError).toBeInstanceOf(ParseError);
    expect((suiteError as ParseError).field).toBe('suite');
    expect((suiteError as ParseError).message).toMatch(/lone surrogate/);
    expect((suiteError as ParseError).message).toMatch(/U\+D83D/);

    const nulMessage = playwright.replace(
      'message="expect(received).toBe(expected) // Object.is equality"',
      'message="expect\u0000"',
    );
    const messageError = catchError(() => parseJunit([nulMessage]));
    expect(messageError).toBeInstanceOf(ParseError);
    expect((messageError as ParseError).field).toBe('message');

    const nulDetail = playwright.replace('Expected: 2\n', 'Expected: \u00002\n');
    const detailError = catchError(() => parseJunit([nulDetail]));
    expect(detailError).toBeInstanceOf(ParseError);
    expect((detailError as ParseError).field).toBe('detail');
  });

  it('still reads testcases from a testsuite without a name attribute', () => {
    const unnamed = gradle.replace(
      '<testsuite name="com.ostomate.app.data.RepositoryTest"',
      '<testsuite',
    );
    expect(unnamed).not.toContain('<testsuite name=');
    expect(parseJunit([unnamed]).tests).toHaveLength(14);
    const noName = unnamed.replace('name="undoLogRestoresThePriorCount" ', '');
    const caught = catchError(() => parseJunit([noName]));
    expect((caught as ParseError).location).toBe('file 1');
  });

  it('keeps CDATA content literal instead of decoding entity-like text inside it', () => {
    // Derived from the Playwright fixture: the failure body's CDATA is given text that looks
    // like entity references, which by definition are not references inside CDATA.
    const withEntityText = playwright.replace(
      'Expected: 2\n',
      'Expected: &lt;2&gt; &amp; &#65; &amp;lt;\n',
    );
    expect(withEntityText).toContain('&lt;2&gt; &amp; &#65; &amp;lt;');
    const failed = parseJunit([withEntityText]).tests[1];
    expect(failed?.failure?.detail).toContain('Expected: &lt;2&gt; &amp; &#65; &amp;lt;');
    expect(failed?.failure?.detail).not.toContain('<2>');
  });

  it('rejects any input containing a DOCTYPE before parsing, so entities are never resolved', () => {
    const payload = [
      '<?xml version="1.0"?>',
      '<!DOCTYPE testsuite [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>',
      '<testsuite name="s"><testcase classname="c" name="&xxe;"/></testsuite>',
    ].join('\n');
    expect(() => parseJunit([payload])).toThrow(ParseError);
    expect(() => parseJunit([payload])).toThrow(/DOCTYPE/);
    expect((catchError(() => parseJunit([payload])) as ParseError).location).toBe('line 2, col 1');

    const lowercase = payload.replace('<!DOCTYPE', '<!doctype');
    expect(() => parseJunit([lowercase])).toThrow(/DOCTYPE/);

    // A DOCTYPE inside a comment in the prolog is rejected too: nothing before the root element
    // may mention one.
    const commented = `<!-- <!DOCTYPE testsuite> -->\n${gradle}`;
    expect(() => parseJunit([commented])).toThrow(/DOCTYPE/);
  });

  it('rejects a markup-level DOCTYPE after the root element, which is not valid XML', () => {
    // fast-xml-parser's validator lets these through, so the parser must reject them itself.
    const embedded = gradle.replace('<properties/>', '<properties/><!DOCTYPE x>');
    const caught = catchError(() => parseJunit([embedded]));
    expect(caught).toBeInstanceOf(ParseError);
    expect((caught as ParseError).message).toMatch(/DOCTYPE/);
    expect((caught as ParseError).location).toMatch(/^line \d+, col \d+$/);

    const trailing = `${gradle.trimEnd()}\n<!doctype x>`;
    expect(() => parseJunit([trailing])).toThrow(/DOCTYPE/);
  });

  it('accepts a DOCTYPE that is data inside CDATA or a comment after the root element', () => {
    // Derived from the Playwright fixture: a DOCTYPE string is inserted into the failure CDATA,
    // where it is text, and the failure text survives verbatim.
    const inCdata = playwright.replace('Expected: 2\n', '<!DOCTYPE html>\nExpected: 2\n');
    expect(inCdata).toContain('<!DOCTYPE html>');
    const failed = parseJunit([inCdata]).tests[1];
    expect(failed?.status).toBe('failed');
    expect(failed?.failure?.detail).toContain('<!DOCTYPE html>\nExpected: 2');

    const inComment = gradle.replace('<properties/>', '<properties/><!-- <!DOCTYPE x> -->');
    expect(parseJunit([inComment]).tests).toHaveLength(14);
  });

  it('rejects truncated XML with the validator message and location', () => {
    // Cut after the last complete testcase so the document ends without its closing testsuite tag.
    const truncated = gradle.slice(0, gradle.indexOf('<system-out>'));
    expect(truncated).not.toContain('</testsuite>');
    const caught = catchError(() => parseJunit([truncated]));
    expect(caught).toBeInstanceOf(ParseError);
    const parseError = caught as ParseError;
    expect(parseError.message).toMatch(/testsuite/);
    expect(parseError.location).toMatch(/^line \d+/);

    const midAttribute = gradle.slice(0, gradle.indexOf('classname=') + 12);
    const midAttributeError = catchError(() => parseJunit([midAttribute]));
    expect(midAttributeError).toBeInstanceOf(ParseError);
    expect((midAttributeError as ParseError).message).toMatch(/quote/);
  });

  it('rejects an XML document whose root is not testsuite or testsuites', () => {
    expect(() => parseJunit(['<report><counter/></report>'])).toThrow(ParseError);
    expect(() => parseJunit(['<report><counter/></report>'])).toThrow(/testsuite/);
  });

  it('rejects a testsuite nested inside a testsuite with a specific error', () => {
    // Derived from the Playwright fixture: the second testsuite is moved inside the first.
    const nested = playwright
      .replace(
        '</testsuite>\n<testsuite name="zz-deliberate-failure.spec.ts"',
        '<testsuite name="zz-deliberate-failure.spec.ts"',
      )
      .replace('</testsuite>\n</testsuites>', '</testsuite>\n</testsuite>\n</testsuites>');
    expect(nested.match(/<testsuite /g)).toHaveLength(2);
    const caught = catchError(() => parseJunit([nested]));
    expect(caught).toBeInstanceOf(ParseError);
    expect((caught as ParseError).message).toMatch(/nested/);
    expect((caught as ParseError).location).toBe('file 1, testsuite "home.spec.ts"');
  });

  it('rejects a testcase directly under testsuites with a specific error', () => {
    // Derived from the Playwright fixture: the first testsuite's tags are removed around its testcase.
    const bare = playwright
      .replace(/<testsuite name="home.spec.ts"[^>]*>\n/, '')
      .replace(
        '</testcase>\n</testsuite>\n<testsuite name="zz',
        '</testcase>\n<testsuite name="zz',
      );
    expect(bare).toMatch(/<testsuites [^>]*>\n<testcase /);
    const caught = catchError(() => parseJunit([bare]));
    expect(caught).toBeInstanceOf(ParseError);
    expect((caught as ParseError).message).toMatch(/directly under testsuites/);
    expect((caught as ParseError).location).toBe('file 1');
  });

  it('rejects a name or classname that is empty after trimming, naming the field', () => {
    for (const value of ['', '  ', '\n\t']) {
      const emptyName = gradle.replace('name="undoLogRestoresThePriorCount"', `name="${value}"`);
      const nameError = catchError(() => parseJunit([emptyName]));
      expect(nameError).toBeInstanceOf(ParseError);
      expect((nameError as ParseError).field).toBe('name');
      expect((nameError as ParseError).message).toMatch(/empty/);
    }
    const emptySuite = gradle.replace(
      'classname="com.ostomate.app.data.RepositoryTest" time="13.31"',
      'classname=" " time="13.31"',
    );
    const suiteError = catchError(() => parseJunit([emptySuite]));
    expect(suiteError).toBeInstanceOf(ParseError);
    expect((suiteError as ParseError).field).toBe('suite');
    expect((suiteError as ParseError).message).toMatch(/empty/);
  });

  it('rejects a testcase without a name or classname, naming the field', () => {
    const noName = gradle.replace('name="undoLogRestoresThePriorCount" ', '');
    const nameError = catchError(() => parseJunit([noName]));
    expect(nameError).toBeInstanceOf(ParseError);
    expect((nameError as ParseError).field).toBe('name');

    const noClass = gradle.replace(/ classname="com\.ostomate\.app\.data\.RepositoryTest"/, '');
    const suiteError = catchError(() => parseJunit([noClass]));
    expect(suiteError).toBeInstanceOf(ParseError);
    expect((suiteError as ParseError).field).toBe('classname');
  });

  it('rejects a time attribute that is not a plain non-negative decimal, naming the field', () => {
    for (const value of ['fast', '1e3', '-1', '1.', '.5', 'Infinity', '0x10', 'NaN']) {
      const badTime = gradle.replace('time="13.31"', `time="${value}"`);
      const caught = catchError(() => parseJunit([badTime]));
      expect(caught).toBeInstanceOf(ParseError);
      expect((caught as ParseError).field).toBe('time');
      expect((caught as ParseError).message).toContain(`"${value}"`);
    }
  });

  it('rejects a name or suite longer than 1,000 characters, naming the field', () => {
    // Built by rewriting one testcase of the real Gradle fixture with an oversized attribute.
    const longName = gradle.replace(
      'name="undoLogRestoresThePriorCount"',
      `name="${'n'.repeat(1001)}"`,
    );
    const nameError = catchError(() => parseJunit([longName]));
    expect(nameError).toBeInstanceOf(ParseError);
    expect((nameError as ParseError).field).toBe('name');
    expect((nameError as ParseError).message).toMatch(/1,000|1000/);

    const maxName = gradle.replace(
      'name="undoLogRestoresThePriorCount"',
      `name="${'n'.repeat(1000)}"`,
    );
    expect(parseJunit([maxName]).tests.some((test) => test.name.length === 1000)).toBe(true);

    const longSuite = gradle.replace(
      'classname="com.ostomate.app.data.RepositoryTest" time="13.31"',
      `classname="${'s'.repeat(1001)}" time="13.31"`,
    );
    const suiteError = catchError(() => parseJunit([longSuite]));
    expect(suiteError).toBeInstanceOf(ParseError);
    expect((suiteError as ParseError).field).toBe('suite');
  });

  it('truncates failure message to 2,000 and detail to 10,000 characters', () => {
    // Built by rewriting the real Playwright failure with oversized message and body text.
    const longMessage = 'm'.repeat(2500);
    const longDetail = 'd'.repeat(12_000);
    const oversized = playwright
      .replace(
        'message="expect(received).toBe(expected) // Object.is equality"',
        `message="${longMessage}"`,
      )
      .replace(/<!\[CDATA\[ {2}\[chromium\][\s\S]*?\]\]>/, `<![CDATA[${longDetail}]]>`);
    expect(oversized).toContain(longDetail);
    const failed = parseJunit([oversized]).tests[1];
    expect(failed?.failure?.message).toBe('m'.repeat(2000));
    expect(failed?.failure?.detail).toBe('d'.repeat(10_000));
  });

  it('never splits a surrogate pair when truncating failure text', () => {
    // A character that straddles the cap is dropped whole rather than leaving half of it.
    const straddling = playwright
      .replace(
        'message="expect(received).toBe(expected) // Object.is equality"',
        `message="${'m'.repeat(1999)}\u{1F600}"`,
      )
      .replace(
        /<!\[CDATA\[ {2}\[chromium\][\s\S]*?\]\]>/,
        `<![CDATA[${'d'.repeat(9999)}\u{1F600}]]>`,
      );
    const failed = parseJunit([straddling]).tests[1];
    expect(failed?.failure?.message).toBe('m'.repeat(1999));
    expect(failed?.failure?.detail).toBe('d'.repeat(9999));
  });
});

describe('parseJunit duration caps (results.duration_ms is int4; report timestamps are bounded)', () => {
  const gradle = readFixture(
    'ostomate2/junit/jvm/shared/TEST-com.ostomate.app.data.RepositoryTest.xml',
  );
  const testcaseTime = 'classname="com.ostomate.app.data.RepositoryTest" time="13.31"';
  const suiteTime = 'hostname="runnervmlun5p" time="15.273"';

  it('accepts a testcase time of exactly 2,147,483.647 s and rejects one millisecond more', () => {
    const atCap = gradle.replace(testcaseTime, testcaseTime.replace('13.31', '2147483.647'));
    expect(parseJunit([atCap]).tests[0]?.durationMs).toBe(MAX_TEST_DURATION_MS);

    const over = gradle.replace(testcaseTime, testcaseTime.replace('13.31', '2147483.648'));
    const caught = catchError(() => parseJunit([over]));
    expect(caught).toBeInstanceOf(ParseError);
    expect((caught as ParseError).field).toBe('time');
    expect((caught as ParseError).message).toMatch(/2,147,483,647/);
    expect((caught as ParseError).location).toContain('testcase "undoLogRestoresThePriorCount"');
  });

  it('rejects a testcase time of 2200000 s, which would overflow the results column', () => {
    const over = gradle.replace(testcaseTime, testcaseTime.replace('13.31', '2200000'));
    const caught = catchError(() => parseJunit([over]));
    expect(caught).toBeInstanceOf(ParseError);
    expect((caught as ParseError).field).toBe('time');
  });

  it('accepts a testsuite time of exactly one year and rejects one millisecond more', () => {
    const atCap = gradle.replace(suiteTime, suiteTime.replace('15.273', '31536000'));
    expect(parseJunit([atCap]).durationMs).toBe(MAX_REPORT_DURATION_MS);

    const over = gradle.replace(suiteTime, suiteTime.replace('15.273', '31536000.001'));
    const caught = catchError(() => parseJunit([over]));
    expect(caught).toBeInstanceOf(ParseError);
    expect((caught as ParseError).field).toBe('time');
    expect((caught as ParseError).message).toMatch(/31,536,000,000/);
    expect((caught as ParseError).location).toContain(
      'testsuite "com.ostomate.app.data.RepositoryTest"',
    );
  });

  it('caps the report duration on the sum across files, not per file', () => {
    const half = gradle.replace(suiteTime, suiteTime.replace('15.273', '15768000'));
    expect(parseJunit([half, half]).durationMs).toBe(MAX_REPORT_DURATION_MS);
    const caught = catchError(() => parseJunit([half, half, gradle]));
    expect(caught).toBeInstanceOf(ParseError);
    expect((caught as ParseError).field).toBe('time');
    expect((caught as ParseError).location).toContain('file 3');
  });

  it('rejects a time too large for a number without an unhandled overflow', () => {
    const huge = gradle.replace(testcaseTime, testcaseTime.replace('13.31', `1${'0'.repeat(400)}`));
    const caught = catchError(() => parseJunit([huge]));
    expect(caught).toBeInstanceOf(ParseError);
    expect((caught as ParseError).field).toBe('time');
  });
});
