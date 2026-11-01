// Where mono text may break (design v21 item 8, components.md "Wrapping mono text"; tp-kit.js
// breakPieces). key: report keys, after each "/". suite: dotted class names and file paths, after
// each "." and "/". name: a test name, as a suite and also at camelCase humps (a lower-case letter
// or digit, then a capital). path: a requested URL path, after "/" and ".". The pieces join back
// to the text exactly; the page puts a <wbr> between them, never a character.
export type BreakRule = 'key' | 'suite' | 'name' | 'path';

const AFTER: Readonly<Record<BreakRule, ReadonlySet<string>>> = {
  key: new Set(['/']),
  suite: new Set(['.', '/']),
  name: new Set(['.', '/']),
  path: new Set(['.', '/']),
};

const isHumpStart = (before: string, at: string) => /[a-z0-9]/.test(before) && /[A-Z]/.test(at);

export function breakPieces(text: string, rule: BreakRule): string[] {
  const pieces: string[] = [];
  let start = 0;
  for (let i = 1; i < text.length; i++) {
    const before = text.charAt(i - 1);
    const at = text.charAt(i);
    if (AFTER[rule].has(before) || (rule === 'name' && isHumpStart(before, at))) {
      pieces.push(text.slice(start, i));
      start = i;
    }
  }
  pieces.push(text.slice(start));
  return pieces;
}
