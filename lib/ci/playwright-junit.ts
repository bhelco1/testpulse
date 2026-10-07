// Playwright's junit reporter writes one file for the whole run, with a `testsuite` per spec file
// per project and the project's name in its `hostname`. testpulse reports each Playwright project
// as its own platform (reporting standard section 4), so CI splits the file by project before
// posting. Pure: text in, text out. Each suite is copied byte for byte, so the parser reads
// exactly what Playwright wrote.

const CDATA_OPEN = '<![CDATA[';
const CDATA_CLOSE = ']]>';
const COMMENT_OPEN = '<!--';
const COMMENT_CLOSE = '-->';
const SUITE_OPEN = '<testsuite';
const SUITE_CLOSE = '</testsuite>';

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function skipPast(xml: string, close: string, from: number): number {
  const end = xml.indexOf(close, from);
  if (end === -1) throw new Error(`unterminated markup: no ${close} after offset ${from}`);
  return end + close.length;
}

// Index just past the `>` that ends the start tag at `from`. Attribute values may hold `>`, so
// quotes are tracked.
function startTagEnd(xml: string, from: number): number {
  let quote: string | null = null;
  for (let index = from; index < xml.length; index += 1) {
    const char = xml[index];
    if (quote !== null) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      return index + 1;
    }
  }
  throw new Error(`unterminated start tag at offset ${from}`);
}

// The next `</testsuite>` after `from` that is markup, not text inside CDATA or a comment.
function suiteEnd(xml: string, from: number): number {
  let index = from;
  for (;;) {
    const next = xml.indexOf('<', index);
    if (next === -1) throw new Error(`unterminated testsuite before offset ${from}`);
    if (xml.startsWith(CDATA_OPEN, next)) index = skipPast(xml, CDATA_CLOSE, next);
    else if (xml.startsWith(COMMENT_OPEN, next)) index = skipPast(xml, COMMENT_CLOSE, next);
    else if (xml.startsWith(SUITE_CLOSE, next)) return next + SUITE_CLOSE.length;
    else index = next + 1;
  }
}

function hostnameOf(startTag: string): string {
  const match = /\shostname\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(startTag);
  const raw = match?.[1] ?? match?.[2];
  if (raw === undefined) throw new Error(`testsuite without a hostname: ${startTag.slice(0, 200)}`);
  return raw.replace(/&(amp|lt|gt|quot|apos);/g, (_entity, name: string) => ENTITIES[name] ?? '');
}

const isSuiteStart = (xml: string, at: number): boolean =>
  xml.startsWith(SUITE_OPEN, at) && /[\s>/]/.test(xml[at + SUITE_OPEN.length] ?? '');

/**
 * Splits a Playwright junit file into one junit document per project, keyed by project name in
 * the order the projects first appear. Every `testsuite` is copied verbatim into a bare
 * `testsuites` wrapper. Throws on a suite with no hostname or on unterminated markup.
 */
export function splitJunitByProject(xml: string): Map<string, string> {
  const suites = new Map<string, string[]>();
  let index = 0;
  for (;;) {
    const next = xml.indexOf('<', index);
    if (next === -1) break;
    if (xml.startsWith(CDATA_OPEN, next)) {
      index = skipPast(xml, CDATA_CLOSE, next);
    } else if (xml.startsWith(COMMENT_OPEN, next)) {
      index = skipPast(xml, COMMENT_CLOSE, next);
    } else if (isSuiteStart(xml, next)) {
      const tagEnd = startTagEnd(xml, next);
      const startTag = xml.slice(next, tagEnd);
      const end = startTag.endsWith('/>') ? tagEnd : suiteEnd(xml, tagEnd);
      const project = hostnameOf(startTag);
      const group = suites.get(project) ?? [];
      group.push(xml.slice(next, end));
      suites.set(project, group);
      index = end;
    } else {
      index = next + 1;
    }
  }
  return new Map(
    [...suites].map(([project, group]) => [
      project,
      `<testsuites>\n${group.join('\n')}\n</testsuites>\n`,
    ]),
  );
}

/** Project names become file names, so only plain ones are written. */
export const isSafeProjectName = (name: string): boolean =>
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(name);
