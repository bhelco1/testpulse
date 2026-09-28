// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { keyframesIn } from './stylesheet';

const ROOT = join(import.meta.dirname, '..', '..');
const TOKENS = join(ROOT, 'design', 'tokens.css');

const moduleSheets = readdirSync(join(ROOT, 'components'), { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.module.css'))
  .map((path) => join(ROOT, 'components', path));

// CSS Modules rename every animation name in a module to a local one, so a module that names a
// keyframes from tokens.css points at one that does not exist and the animation silently stops.
// Components name the global keyframes in an inline style instead.
describe('global keyframes', () => {
  const globals = keyframesIn(TOKENS);

  it('tokens.css defines tp-shimmer and tp-pulse', () => {
    expect(globals).toEqual(expect.arrayContaining(['tp-shimmer', 'tp-pulse']));
  });

  it('finds the component stylesheets', () => {
    expect(moduleSheets.length).toBeGreaterThan(10);
  });

  for (const sheet of moduleSheets) {
    it(`${sheet.slice(ROOT.length + 1)} names no tokens.css keyframes`, () => {
      const css = readFileSync(sheet, 'utf8');
      const named = globals.filter((name) => new RegExp(`\\b${name}\\b`).test(css));
      expect(named).toEqual([]);
    });
  }
});
