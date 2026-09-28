// @vitest-environment jsdom
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { keyframesIn, ruleFor } from './stylesheet';

function cssFile(css: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'stylesheet-')), 'x.module.css');
  writeFileSync(path, css);
  return path;
}

const FILE = cssFile(`
  .a { color: var(--ink); padding: 24px var(--pad-card-x) 0; }
  .a:hover:not([aria-busy='true']) { background: var(--raised); }
  .x,
  .y { color: green; }
  .twice { color: red; }
  .twice { color: blue; }
  @media (max-width: 640px) { .a { font-size: 32px; } }
  @keyframes spin { to { transform: rotate(360deg); } }
`);

describe('ruleFor', () => {
  it('returns a top-level rule with its declarations as written', () => {
    expect(ruleFor(FILE, '.a')).toEqual({
      color: 'var(--ink)',
      padding: '24px var(--pad-card-x) 0',
    });
    expect(ruleFor(FILE, ".a:hover:not([aria-busy='true'])")).toEqual({
      background: 'var(--raised)',
    });
  });

  it('matches a selector list written across lines', () => {
    expect(ruleFor(FILE, '.x, .y')).toEqual({ color: 'green' });
  });

  it('reads a rule inside a media condition only when asked', () => {
    expect(ruleFor(FILE, '.a', '(max-width: 640px)')).toEqual({ 'font-size': '32px' });
  });

  it('refuses a selector that is missing or defined twice', () => {
    expect(() => ruleFor(FILE, '.missing')).toThrow('found 0');
    expect(() => ruleFor(FILE, '.twice')).toThrow('found 2');
  });
});

describe('keyframesIn', () => {
  it('lists the keyframes a stylesheet defines', () => {
    expect(keyframesIn(FILE)).toEqual(['spin']);
  });
});
