import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

// The build must not depend on Google Fonts being reachable: main's CI failed once when
// next/font/google could not download Public Sans. These tests keep the fonts committed.

const ROOT = join(import.meta.dirname, '../..');
const APP = join(ROOT, 'app');
const LAYOUT = join(APP, 'layout.tsx');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return /\.(ts|tsx|js|jsx|mjs|cjs|css)$/.test(entry.name) ? [path] : [];
  });
}

// Each localFont({ ... }) call in the layout, as its source text.
function localFontCalls(source: string): string[] {
  return [...source.matchAll(/localFont\(\{([\s\S]*?)\}\);/g)].map((match) => match[1] ?? '');
}

describe('self-hosted fonts', () => {
  it('never loads a font from Google Fonts', () => {
    const files = [
      ...['app', 'components', 'lib'].flatMap((dir) => sourceFiles(join(ROOT, dir))),
      join(ROOT, 'design/tokens.css'),
    ];
    const offenders = files
      .filter((file) => file !== join(APP, 'fonts/fonts.test.ts'))
      .filter((file) =>
        /next\/font\/google|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(
          readFileSync(file, 'utf8'),
        ),
      )
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  it('loads every font variable globals.css uses through next/font/local', () => {
    const layout = readFileSync(LAYOUT, 'utf8');
    const used = [
      ...readFileSync(join(APP, 'globals.css'), 'utf8').matchAll(/var\((--font-[a-z0-9-]+)\)/g),
    ].map((match) => match[1]);
    const declared = localFontCalls(layout).flatMap((call) =>
      [...call.matchAll(/variable: '(--font-[a-z0-9-]+)'/g)].map((match) => match[1]),
    );

    expect(layout).toMatch(/^import localFont from 'next\/font\/local';$/m);
    expect(used).toEqual(['--font-source-serif-4', '--font-public-sans', '--font-jetbrains-mono']);
    expect(declared.sort()).toEqual([...used].sort());
  });

  it('commits every font file the layout references, with its OFL licence beside it', () => {
    const paths = localFontCalls(readFileSync(LAYOUT, 'utf8')).flatMap((call) =>
      [...call.matchAll(/(?:src|path): '([^']+)'/g)].map((match) => join(APP, match[1] ?? '')),
    );

    expect(paths).toHaveLength(3);
    for (const path of paths) {
      expect(existsSync(path), relative(ROOT, path)).toBe(true);
      expect(readFileSync(path).subarray(0, 4).toString('latin1'), relative(ROOT, path)).toBe(
        'wOF2',
      );

      const licence = join(dirname(path), 'OFL.txt');
      expect(existsSync(licence), relative(ROOT, licence)).toBe(true);
      const text = readFileSync(licence, 'utf8');
      expect(text).toMatch(/^(Copyright|©)/);
      expect(text).toContain('SIL OPEN FONT LICENSE Version 1.1');
    }
  });
});
