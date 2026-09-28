import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { importPathTo, publicEntryPoints } from './import-graph.test-support.ts';

// Spec section 15: public pages read only through the publishable-key client. The lint rule sees
// one file's own imports; this walks the whole static import graph, so a page that reaches the
// secret client through any number of lib/ modules fails here.

const ROOT = realpathSync(join(import.meta.dirname, '..', '..'));
const SECRET_CLIENT = join(ROOT, 'lib', 'supabase', 'server.ts');

const shown = (files: readonly string[], root: string) =>
  files.map((file) => relative(root, file)).join(' -> ');

describe('public read boundary (spec section 15)', () => {
  const entries = publicEntryPoints(ROOT);

  it('starts from every page and layout outside app/api and every lib/queries module', () => {
    const listed = entries.map((file) => relative(ROOT, file));

    expect(listed).toEqual(
      expect.arrayContaining(['app/layout.tsx', 'app/page.tsx', 'lib/queries/projects.ts']),
    );
    expect(listed.filter((file) => file.startsWith('app/api/'))).toEqual([]);
    expect(listed.filter((file) => /\.test(-support)?\.tsx?$/.test(file))).toEqual([]);
  });

  it.each(entries.map((file) => [relative(ROOT, file), file]))(
    '%s cannot reach lib/supabase/server.ts',
    (_label, entry) => {
      const path = importPathTo(SECRET_CLIENT, [entry], ROOT);

      expect(path && shown(path, ROOT)).toBeNull();
    },
  );
});

describe('importPathTo', () => {
  let root: string;

  const write = (file: string, source: string) => {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source);
  };
  const at = (file: string) => join(root, file);
  const walk = (entry: string) => importPathTo(at('lib/supabase/server.ts'), [at(entry)], root);

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'testpulse-import-graph-')));
    write(
      'tsconfig.json',
      JSON.stringify({
        compilerOptions: {
          module: 'esnext',
          moduleResolution: 'bundler',
          allowImportingTsExtensions: true,
          noEmit: true,
          paths: { '@/*': ['./*'] },
        },
      }),
    );
    write('lib/supabase/server.ts', "export const secret = 'placeholder';\n");
    write('lib/supabase/public.ts', "export const publishable = 'placeholder';\n");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('finds the secret client behind a chain of path-mapped and relative imports', () => {
    write('app/page.tsx', "import { rows } from '@/lib/queries/rows';\nexport default rows;\n");
    write('lib/queries/rows.ts', "export { rows } from '../stats/rows.ts';\n");
    write(
      'lib/stats/rows.ts',
      "import { secret } from '../supabase/server';\nexport const rows = secret;\n",
    );

    expect(walk('app/page.tsx')).toEqual([
      at('app/page.tsx'),
      at('lib/queries/rows.ts'),
      at('lib/stats/rows.ts'),
      at('lib/supabase/server.ts'),
    ]);
  });

  it.each([
    ['a side-effect import', "import '../supabase/server';\n"],
    ['a re-export of everything', "export * from '../supabase/server';\n"],
    ['a type-only import', "import type { secret } from '../supabase/server';\n"],
    ['a dynamic import', "export const load = () => import('../supabase/server');\n"],
    ['an index file', "import '../supabase';\n"],
  ])('follows %s', (label, source) => {
    if (label === 'an index file') write('lib/supabase/index.ts', "export * from './server';\n");
    write('lib/queries/q.ts', source);

    expect(walk('lib/queries/q.ts')?.at(-1)).toBe(at('lib/supabase/server.ts'));
  });

  it('returns null for a graph that only reaches the publishable-key client', () => {
    write(
      'lib/queries/q.ts',
      [
        "import { z } from 'zod';",
        "import styles from './q.module.css';",
        "import { publishable } from '@/lib/supabase/public.ts';",
        "import { other } from './other';",
        'export const q = [z, styles, publishable, other];',
        '',
      ].join('\n'),
    );
    write('lib/queries/q.module.css', '.q {}\n');
    write('lib/queries/other.ts', "import { q } from './q';\nexport const other = q;\n");

    expect(walk('lib/queries/q.ts')).toBeNull();
  });

  it('refuses to pass a graph it cannot fully resolve', () => {
    write('lib/queries/q.ts', "import { gone } from './missing';\nexport const q = gone;\n");

    expect(() => walk('lib/queries/q.ts')).toThrow(/lib\/queries\/q\.ts imports "\.\/missing"/);
  });
});
