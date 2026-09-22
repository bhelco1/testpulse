import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseJacoco } from './jacoco';
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

describe('parseJacoco against Ostomate2 reports', () => {
  const shared = readFixture('ostomate2/jacoco/shared.xml');
  const composeApp = readFixture('ostomate2/jacoco/composeApp.xml');

  it('reads the report-level LINE and BRANCH counters of shared.xml', () => {
    expect(parseJacoco(shared)).toEqual({
      linesCovered: 457,
      linesTotal: 490,
      branchesCovered: 105,
      branchesTotal: 140,
    });
  });

  it('reads the report-level LINE and BRANCH counters of composeApp.xml', () => {
    expect(parseJacoco(composeApp)).toEqual({
      linesCovered: 497,
      linesTotal: 527,
      branchesCovered: 116,
      branchesTotal: 164,
    });
  });

  it('accepts the standard JaCoCo DOCTYPE that every report carries', () => {
    expect(shared).toContain(
      '<!DOCTYPE report PUBLIC "-//JACOCO//DTD Report 1.1//EN" "report.dtd">',
    );
    expect(() => parseJacoco(shared)).not.toThrow();
  });

  it('ignores the nested package, class and method counters', () => {
    // Derived from the real report: every report-level counter is removed, leaving only nested ones.
    const withoutReportCounters = shared.replace(
      /<counter [^>]*\/>(?=(<counter [^>]*\/>)*<\/report>)/g,
      '',
    );
    expect(withoutReportCounters).toContain('type="LINE"');
    const caught = catchError(() => parseJacoco(withoutReportCounters));
    expect(caught).toBeInstanceOf(ParseError);
    expect((caught as ParseError).message).toMatch(/LINE/);
  });
});

describe('parseJacoco edge cases derived from the real fixtures', () => {
  const shared = readFixture('ostomate2/jacoco/shared.xml');
  const reportLevelBranch = '<counter type="BRANCH" missed="35" covered="105"/>';

  it('leaves branches undefined when the report has no BRANCH counter', () => {
    const lastIndex = shared.lastIndexOf(reportLevelBranch);
    const withoutBranch = `${shared.slice(0, lastIndex)}${shared.slice(lastIndex + reportLevelBranch.length)}`;
    expect(parseJacoco(withoutBranch)).toEqual({ linesCovered: 457, linesTotal: 490 });
  });

  it('rejects a report without a LINE counter', () => {
    const reportLevelLine = '<counter type="LINE" missed="33" covered="457"/>';
    const lastIndex = shared.lastIndexOf(reportLevelLine);
    const withoutLine = `${shared.slice(0, lastIndex)}${shared.slice(lastIndex + reportLevelLine.length)}`;
    const caught = catchError(() => parseJacoco(withoutLine));
    expect(caught).toBeInstanceOf(ParseError);
    expect((caught as ParseError).message).toMatch(/LINE/);
  });

  it('rejects a counter whose covered or missed value is not a whole number', () => {
    const lastIndex = shared.lastIndexOf(reportLevelBranch);
    const badBranch = `${shared.slice(0, lastIndex)}<counter type="BRANCH" missed="many" covered="105"/>${shared.slice(lastIndex + reportLevelBranch.length)}`;
    const caught = catchError(() => parseJacoco(badBranch));
    expect(caught).toBeInstanceOf(ParseError);
    expect((caught as ParseError).field).toBe('missed');

    const noCovered = `${shared.slice(0, lastIndex)}<counter type="BRANCH" missed="35"/>${shared.slice(lastIndex + reportLevelBranch.length)}`;
    const missingError = catchError(() => parseJacoco(noCovered));
    expect(missingError).toBeInstanceOf(ParseError);
    expect((missingError as ParseError).field).toBe('covered');
  });

  it('rejects a DOCTYPE with an internal subset, so entities are never resolved', () => {
    const payload = shared.replace(
      '<!DOCTYPE report PUBLIC "-//JACOCO//DTD Report 1.1//EN" "report.dtd">',
      '<!DOCTYPE report [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>',
    );
    expect(() => parseJacoco(payload)).toThrow(ParseError);
    expect(() => parseJacoco(payload)).toThrow(/DOCTYPE/);
  });

  it('rejects any DOCTYPE other than the JaCoCo one', () => {
    const payload = shared.replace(
      '<!DOCTYPE report PUBLIC "-//JACOCO//DTD Report 1.1//EN" "report.dtd">',
      '<!DOCTYPE report SYSTEM "http://example.invalid/report.dtd">',
    );
    expect(() => parseJacoco(payload)).toThrow(/DOCTYPE/);
  });

  it('rejects the JaCoCo declaration when a second DOCTYPE follows it', () => {
    const payload = shared.replace(
      '<report name="shared">',
      '<!DOCTYPE report><report name="shared">',
    );
    expect(() => parseJacoco(payload)).toThrow(/DOCTYPE/);
  });

  it('rejects the JaCoCo declaration when an internal subset is appended to it', () => {
    const payload = shared.replace(
      '"report.dtd">',
      '"report.dtd" [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>',
    );
    expect(payload).toContain('"-//JACOCO//DTD Report 1.1//EN" "report.dtd" [');
    expect(() => parseJacoco(payload)).toThrow(/DOCTYPE/);
  });

  it('rejects the JaCoCo declaration anywhere but the prolog', () => {
    const declaration = '<!DOCTYPE report PUBLIC "-//JACOCO//DTD Report 1.1//EN" "report.dtd">';
    const moved = shared.replace(declaration, '').replace('</report>', `${declaration}</report>`);
    expect(moved).toContain(declaration);
    expect(() => parseJacoco(moved)).toThrow(/DOCTYPE/);
  });

  it('rejects truncated XML with the validator message', () => {
    const caught = catchError(() => parseJacoco(shared.slice(0, 4000)));
    expect(caught).toBeInstanceOf(ParseError);
    expect((caught as ParseError).location).toMatch(/^line \d+/);
  });

  it('rejects empty input and documents whose root is not report', () => {
    expect(() => parseJacoco('')).toThrow(ParseError);
    expect(() => parseJacoco('<testsuite/>')).toThrow(/report/);
  });
});
