import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { scanAdmin, serverActionModules } from './guarded.test-support.ts';

// Spec section 15, "checked server-side on every admin route and action", and section 17, Phase 6
// criterion 2, "every admin action re-checks the session server-side": every way into admin calls
// the guard (lib/admin/guard.ts) before anything else. Each exception is named here with why it
// cannot: none of them can show or change anything of admin.

const ROOT = realpathSync(join(import.meta.dirname, '..', '..'));

const EXCEPTIONS: Readonly<Record<string, string>> = {
  'app/admin/actions.ts#requestSignInLinkAction':
    'asks for a sign-in link, before there is a session; it answers every address alike',
  'app/admin/actions.ts#signOutAction': 'only ends the session this browser has',
  'app/admin/auth/confirm/route.ts#GET':
    'spends the emailed token that makes the session, then checks its address itself ' +
    '(lib/admin/confirm.ts)',
};

describe('every admin page, action and route starts with the guard', () => {
  const { entries, unreadable } = scanAdmin(ROOT);

  it('finds every way into admin', () => {
    expect(unreadable).toEqual([]);
    expect(entries.map(({ id, kind }) => [id, kind])).toEqual([
      ['app/admin/actions.ts#requestSignInLinkAction', 'action'],
      ['app/admin/actions.ts#signOutAction', 'action'],
      ['app/admin/actions.ts#createLinkAction', 'action'],
      ['app/admin/actions.ts#acknowledgeAlertAction', 'action'],
      ['app/admin/actions.ts#rotateKeyAction', 'action'],
      ['app/admin/actions.ts#deleteLinkAction', 'action'],
      ['app/admin/auth/confirm/route.ts#GET', 'route'],
      ['app/admin/links/[id]/page.tsx#default', 'page'],
      ['app/admin/page.tsx#default', 'page'],
    ]);
  });

  it('keeps every server action of the site under app/admin, where this scan looks', () => {
    expect(serverActionModules(ROOT)).toEqual(['app/admin/actions.ts']);
  });

  it.each(entries.filter(({ id }) => !(id in EXCEPTIONS)).map((entry) => [entry.id, entry]))(
    '%s calls the guard first',
    (_id, entry) => {
      expect(entry.guard).toBe(entry.kind === 'page' ? 'getAdminAccess' : 'requireAdmin');
    },
  );

  it('names only exceptions that exist, and none of them calls a guard it could skip', () => {
    for (const id of Object.keys(EXCEPTIONS)) {
      expect(entries.find((entry) => entry.id === id)?.guard, id).toBeNull();
    }
  });
});

describe('scanAdmin', () => {
  let root: string;

  const write = (file: string, source: string) => {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source);
  };
  const guards = (id: string) => scanAdmin(root).entries.find((entry) => entry.id === id)?.guard;
  const IMPORT = "import { getAdminAccess, requireAdmin } from '../../lib/admin/guard';\n";

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'testpulse-admin-guard-')));
    write('lib/admin/guard.ts', 'export const requireAdmin = async () => ({ ok: true });\n');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('accepts an action that awaits requireAdmin first', () => {
    write(
      'app/admin/act.ts',
      `'use server';\n${IMPORT}export async function act() {\n  const gate = await requireAdmin();\n  return gate;\n}\n`,
    );
    expect(guards('app/admin/act.ts#act')).toBe('requireAdmin');
  });

  it.each([
    ['no guard', 'return 1;'],
    ['the guard second', 'const x = 1;\n  const gate = await requireAdmin();\n  return [x, gate];'],
    ['the guard not awaited', 'const gate = requireAdmin();\n  return gate;'],
    ['the guard called with arguments', 'const gate = await requireAdmin(1);\n  return gate;'],
    ['the page’s guard in an action', 'const access = await getAdminAccess();\n  return access;'],
  ])('flags an action with %s', (_label, body) => {
    write(
      'app/admin/act.ts',
      `'use server';\n${IMPORT}export async function act() {\n  ${body}\n}\n`,
    );
    expect(guards('app/admin/act.ts#act')).not.toBe('requireAdmin');
  });

  it('flags a guard of the same name from anywhere but lib/admin/guard.ts', () => {
    write('app/admin/fake.ts', 'export const requireAdmin = async () => ({ ok: true });\n');
    write(
      'app/admin/act.ts',
      "'use server';\nimport { requireAdmin } from './fake';\nexport const act = async () => {\n  const gate = await requireAdmin();\n  return gate;\n};\n",
    );
    expect(guards('app/admin/act.ts#act')).toBeNull();
  });

  it('flags an arrow action with an expression body', () => {
    write(
      'app/admin/act.ts',
      `'use server';\n${IMPORT}export const act = async () => requireAdmin();\n`,
    );
    expect(guards('app/admin/act.ts#act')).toBeNull();
  });

  it('finds an inline server action in a page and checks it after its directive', () => {
    write(
      'app/admin/x/page.tsx',
      `${IMPORT.replace('../../', '../../../')}export default async function Page() {\n  const access = await getAdminAccess();\n  async function save() {\n    'use server';\n    return 1;\n  }\n  async function remove() {\n    'use server';\n    const gate = await requireAdmin();\n    return gate;\n  }\n  return [access, save, remove];\n}\n`,
    );
    const { entries } = scanAdmin(root);
    expect(entries.map(({ id, kind, guard }) => [id, kind, guard])).toEqual([
      ['app/admin/x/page.tsx#default', 'page', 'getAdminAccess'],
      ['app/admin/x/page.tsx#save', 'inline-action', null],
      ['app/admin/x/page.tsx#remove', 'inline-action', 'requireAdmin'],
    ]);
  });

  it('flags a route handler or a page that does not start with its guard', () => {
    write(
      'app/admin/r/route.ts',
      'export async function POST() {\n  return new Response(null);\n}\nexport const helper = 1;\n',
    );
    write('app/admin/page.tsx', 'export default function Page() {\n  return null;\n}\n');
    const { entries } = scanAdmin(root);
    expect(entries.map(({ id, kind, guard }) => [id, kind, guard])).toEqual([
      ['app/admin/page.tsx#default', 'page', null],
      ['app/admin/r/route.ts#POST', 'route', null],
    ]);
  });

  it('reports what it cannot follow instead of passing it', () => {
    write('app/admin/act.ts', "'use server';\nexport { act } from './elsewhere';\n");
    write('app/admin/layout.tsx', 'export default function Layout() {\n  return null;\n}\n');
    write('app/admin/v.ts', "'use server';\nexport const value = 1;\n");
    expect(scanAdmin(root).unreadable).toEqual([
      'app/admin/act.ts: an export this scan cannot follow; export the function itself',
      'app/admin/layout.tsx: a layout file; decide how it is guarded and teach this scan',
      'app/admin/v.ts#value: not a function this scan can read',
    ]);
  });

  it('finds a server action module outside app/admin', () => {
    write('lib/elsewhere/act.ts', "'use server';\nexport async function act() {}\n");
    write('app/admin/act.ts', "'use server';\nexport async function act() {}\n");
    expect(serverActionModules(root)).toEqual(['app/admin/act.ts', 'lib/elsewhere/act.ts']);
  });
});
