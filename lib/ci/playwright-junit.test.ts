import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { isSafeProjectName, splitJunitByProject } from './playwright-junit';
import { parseJunit } from '../parsers';

const fixture = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(`../../fixtures/${relative}`, import.meta.url)), 'utf8');

const oneFailure = fixture('testpulse/junit/playwright-one-failure.xml');

const suitesOf = (xml: string): string[] =>
  [...xml.matchAll(/<testsuite\s[\s\S]*?<\/testsuite>/g)].map(([suite]) => suite);

describe('splitJunitByProject against fixtures/testpulse/junit/playwright-one-failure.xml', () => {
  const split = splitJunitByProject(oneFailure);

  it('puts every suite of the one-project capture under its hostname, byte for byte', () => {
    expect([...split.keys()]).toEqual(['chromium']);
    expect(suitesOf(split.get('chromium') ?? '')).toEqual(suitesOf(oneFailure));
  });

  it('gives the parser the same tests as the unsplit file', () => {
    expect(parseJunit([split.get('chromium') ?? '']).tests).toEqual(parseJunit([oneFailure]).tests);
  });
});

// Rewrites of the captured file, as the junit parser's edge-case tests do: no hand-written sample.
describe('splitJunitByProject edge cases derived from the capture', () => {
  const [passing, failing] = suitesOf(oneFailure) as [string, string];

  it('groups suites by hostname in the order the projects first appear', () => {
    const phone = failing.replace('hostname="chromium"', 'hostname="phone-dark"');
    const xml = `<testsuites>\n${passing}\n${phone}\n${passing}\n</testsuites>\n`;

    const split = splitJunitByProject(xml);

    expect([...split.keys()]).toEqual(['chromium', 'phone-dark']);
    expect(split.get('chromium')).toBe(`<testsuites>\n${passing}\n${passing}\n</testsuites>\n`);
    expect(split.get('phone-dark')).toBe(`<testsuites>\n${phone}\n</testsuites>\n`);
    expect(parseJunit([split.get('phone-dark') ?? '']).tests).toHaveLength(2);
  });

  it('is not misled by testsuite markup inside CDATA or a comment', () => {
    const tricky = failing
      .replace('Expected: 2', 'Expected: </testsuite><testsuite hostname="x">')
      .replace('<testcase ', '<!-- </testsuite> --><testcase ');
    const xml = `<testsuites>\n${tricky}\n</testsuites>`;

    expect(splitJunitByProject(xml).get('chromium')).toBe(
      `<testsuites>\n${tricky}\n</testsuites>\n`,
    );
  });

  it('reads a hostname after an attribute value holding ">", and decodes its entities', () => {
    const odd = passing
      .replace('name="home.spec.ts"', 'name="a > b"')
      .replace('hostname="chromium"', 'hostname="a&amp;b"');

    expect([...splitJunitByProject(odd).keys()]).toEqual(['a&b']);
  });

  it('keeps a self-closing suite', () => {
    const empty = '<testsuite name="empty.spec.ts" hostname="no-js" tests="0"/>';
    expect(splitJunitByProject(`<testsuites>${empty}</testsuites>`).get('no-js')).toBe(
      `<testsuites>\n${empty}\n</testsuites>\n`,
    );
  });

  it('refuses a suite with no hostname or no end', () => {
    expect(() => splitJunitByProject(passing.replace(' hostname="chromium"', ''))).toThrow(
      /without a hostname/,
    );
    expect(() => splitJunitByProject(passing.replace('</testsuite>', ''))).toThrow(
      /unterminated testsuite/,
    );
    expect(() => splitJunitByProject(failing.replaceAll(']]>', ''))).toThrow(/unterminated markup/);
    expect(() => splitJunitByProject(passing.slice(0, 40))).toThrow(/unterminated start tag/);
  });

  it('returns nothing for a file with no suites', () => {
    expect(splitJunitByProject('<testsuites>\n</testsuites>').size).toBe(0);
  });
});

describe('isSafeProjectName', () => {
  it('accepts the names a Playwright project in this repo has', () => {
    for (const name of ['desktop-dark', 'phone-light', 'no-js', 'leak-sweep', 'chromium']) {
      expect(isSafeProjectName(name), name).toBe(true);
    }
  });

  it('refuses names that would leave the output directory or are not plain', () => {
    for (const name of ['', '../x', 'a/b', '.hidden', 'a b', 'x'.repeat(101)]) {
      expect(isSafeProjectName(name), name).toBe(false);
    }
  });
});
