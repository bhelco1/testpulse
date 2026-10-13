import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clientModules, importPathTo, publicEntryPoints } from './import-graph.test-support.ts';

// Spec section 15: public pages read only through the publishable-key client. The lint rule sees
// one file's own imports; this walks the whole static import graph, so a page that reaches the
// secret client through any number of lib/ modules fails here.

const ROOT = realpathSync(join(import.meta.dirname, '..', '..'));
const SECRET_CLIENT = join(ROOT, 'lib', 'supabase', 'server.ts');

const shown = (files: readonly string[], root: string) =>
  files.map((file) => relative(root, file)).join(' -> ');

const underAdminApp = (file: string) => relative(ROOT, file).startsWith('app/admin/');

describe('public read boundary (spec section 15)', () => {
  // Admin's pages read with the secret client, through lib/admin/data.ts alone (below).
  const entries = publicEntryPoints(ROOT).filter((file) => !underAdminApp(file));

  it('starts from every page and layout outside app/api and every lib/queries module', () => {
    const listed = entries.map((file) => relative(ROOT, file));

    expect(listed).toEqual(
      expect.arrayContaining([
        'app/layout.tsx',
        'app/page.tsx',
        'app/privacy/page.tsx',
        'app/p/[slug]/runs/[id]/page.tsx',
        'app/p/[slug]/runs/[id]/not-found.tsx',
        'app/p/[slug]/tests/[testKey]/page.tsx',
        'app/p/[slug]/tests/[testKey]/not-found.tsx',
        'lib/queries/test-history.ts',
        'app/how-its-tested/page.tsx',
        'lib/queries/how-its-tested.ts',
        'lib/queries/projects.ts',
      ]),
    );
    expect(listed.filter((file) => file.startsWith('app/api/'))).toEqual([]);
    expect(listed.filter((file) => file.startsWith('app/admin/'))).toEqual([]);
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

// Admin (spec section 15, "Admin" as built) lives under app/admin and lib/admin. No public page,
// layout or lib/queries module may reach lib/admin, so nothing of admin can render on a public
// page or ship in its bundle; only app/admin's own files may.
describe('admin boundary (spec section 15)', () => {
  const ADMIN_LIB = join(ROOT, 'lib', 'admin');
  const isAdmin = (file: string) => file.startsWith(`${ADMIN_LIB}/`);
  const outsideAdmin = publicEntryPoints(ROOT).filter(
    (file) => !relative(ROOT, file).startsWith('app/admin/'),
  );

  it('checks every public entry point and leaves out only app/admin', () => {
    const listed = outsideAdmin.map((file) => relative(ROOT, file));
    expect(listed).toEqual(expect.arrayContaining(['app/layout.tsx', 'app/page.tsx']));
    expect(
      publicEntryPoints(ROOT)
        .filter(underAdminApp)
        .map((file) => relative(ROOT, file)),
    ).toEqual(['app/admin/links/[id]/page.tsx', 'app/admin/page.tsx']);
    expect(listed.length).toBe(publicEntryPoints(ROOT).length - 2);
    // The positive control: the admin page itself does reach lib/admin.
    expect(importPathTo(isAdmin, [join(ROOT, 'app', 'admin', 'page.tsx')], ROOT)).not.toBeNull();
  });

  it.each(outsideAdmin.map((file) => [relative(ROOT, file), file]))(
    '%s cannot reach lib/admin',
    (_label, entry) => {
      const path = importPathTo(isAdmin, [entry], ROOT);

      expect(path && shown(path, ROOT)).toBeNull();
    },
  );
});

// Admin reads alerts, tracked links, visits and heartbeats, which anon cannot (spec section 15,
// "Admin" as built), so its pages and actions use the secret client. They reach it only through
// lib/admin/data.ts, whose adminClient makes it only for the guard's yes, and no client component
// anywhere reaches either, so neither the key nor admin's reads can ship to a browser.
describe('admin secret-client boundary (spec section 15)', () => {
  const DATA = join(ROOT, 'lib', 'admin', 'data.ts');
  const ACTIONS = join(ROOT, 'app', 'admin', 'actions.ts');
  const adminEntries = [...publicEntryPoints(ROOT).filter(underAdminApp), ACTIONS];

  it.each(adminEntries.map((file) => [relative(ROOT, file), file]))(
    '%s reaches lib/supabase/server.ts only through lib/admin/data.ts',
    (_label, entry) => {
      const path = importPathTo(SECRET_CLIENT, [entry], ROOT, (file) => file === DATA);

      expect(path && shown(path, ROOT)).toBeNull();
    },
  );

  it('positive control: the admin page and its actions do reach it, through lib/admin/data.ts', () => {
    for (const entry of [join(ROOT, 'app', 'admin', 'page.tsx'), ACTIONS]) {
      expect(importPathTo(SECRET_CLIENT, [entry], ROOT)).toContain(DATA);
    }
  });

  it('makes the secret client in one place, which takes the guard’s yes', () => {
    const source = readFileSync(DATA, 'utf8');
    expect(source.match(/createSecretClient\(/g)).toHaveLength(1);
    expect(source).toMatch(
      /export function adminClient\(granted: AccessGranted\): SupabaseClient \{\n  if \(!granted\.ok\) throw[^\n]*\n  return createSecretClient\(\);\n\}/,
    );
  });

  const clients = clientModules(ROOT);

  it('finds the client components, admin’s among them', () => {
    const listed = clients.map((file) => relative(ROOT, file));
    expect(listed).toEqual(
      expect.arrayContaining([
        'components/AdminLinks/AdminLinks.tsx',
        'components/AdminProjects/AdminProjects.tsx',
        'components/VisitBeacon/VisitBeacon.tsx',
      ]),
    );
    expect(listed).not.toContain('components/AdminDailyJob/AdminDailyJob.tsx');
  });

  it.each(clients.map((file) => [relative(ROOT, file), file]))(
    '%s cannot reach the secret client or admin’s reads',
    (_label, entry) => {
      const path = importPathTo((file) => file === SECRET_CLIENT || file === DATA, [entry], ROOT);

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

  it('takes a test in place of a file, and finds the first file it accepts', () => {
    write('app/page.tsx', "import { a } from '../lib/admin/guard';\nexport default a;\n");
    write('lib/admin/guard.ts', "export const a = 'placeholder';\n");
    const underAdmin = (file: string) => file.startsWith(`${at('lib/admin')}/`);

    expect(importPathTo(underAdmin, [at('app/page.tsx')], root)).toEqual([
      at('app/page.tsx'),
      at('lib/admin/guard.ts'),
    ]);
    expect(importPathTo(underAdmin, [at('lib/supabase/public.ts')], root)).toBeNull();
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

  it('never enters a file it is told to avoid, unless that file is the target', () => {
    write('app/page.tsx', "import { rows } from '../lib/admin/data';\nexport default rows;\n");
    write(
      'lib/admin/data.ts',
      "import { secret } from '../supabase/server';\nexport const rows = secret;\n",
    );
    const data = at('lib/admin/data.ts');

    expect(walk('app/page.tsx')).not.toBeNull();
    expect(
      importPathTo(at('lib/supabase/server.ts'), [at('app/page.tsx')], root, (f) => f === data),
    ).toBeNull();
    expect(importPathTo(data, [at('app/page.tsx')], root, (f) => f === data)).toEqual([
      at('app/page.tsx'),
      data,
    ]);
  });

  it('refuses to pass a graph it cannot fully resolve', () => {
    write('lib/queries/q.ts', "import { gone } from './missing';\nexport const q = gone;\n");

    expect(() => walk('lib/queries/q.ts')).toThrow(/lib\/queries\/q\.ts imports "\.\/missing"/);
  });
});
