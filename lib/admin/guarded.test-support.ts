import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

// Finds every way into admin under app/admin and what each one does first (spec section 15:
// "checked server-side on every admin route and action"). Read from the source, so an action or
// route added later is found without anyone listing it:
//   - every export of a 'use server' module (a server action),
//   - every function that starts with its own 'use server' (an inline server action),
//   - every HTTP method a route.ts exports,
//   - every page's default export.
// Each must start with `const … = await requireAdmin();` (actions and routes) or
// `const … = await getAdminAccess();` (pages), both imported from lib/admin/guard.ts, unless the
// test names it as an exception. Anything this cannot read is reported rather than passed.

export type EntryKind = 'action' | 'inline-action' | 'route' | 'page';

export interface AdminEntry {
  /** `file#name`, the file relative to the root. */
  readonly id: string;
  readonly kind: EntryKind;
  /** The guard the entry calls first, or null when it does not start with one. */
  readonly guard: 'requireAdmin' | 'getAdminAccess' | null;
}

export interface AdminScan {
  readonly entries: readonly AdminEntry[];
  /** Things the scan could not hold to the rule; each must be fixed, not listed. */
  readonly unreadable: readonly string[];
}

const CODE = new Set(['.ts', '.tsx']);
const TEST = /\.(test|test-support)\.tsx?$/;
const HTTP_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const UI_FILE = /^(page|layout|template|loading|error|global-error|not-found|default)\.tsx?$/;
const GUARD_MODULE = join('lib', 'admin', 'guard.ts');

function codeFilesUnder(directory: string): string[] {
  let found: string[];
  try {
    found = readdirSync(directory, { withFileTypes: true, recursive: true })
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name));
  } catch {
    return [];
  }
  return found.filter((file) => CODE.has(extname(file)) && !TEST.test(file)).sort();
}

function parse(file: string): ts.SourceFile {
  const kind = extname(file) === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, kind);
}

function startsWithUseServer(statements: readonly ts.Statement[]): boolean {
  const first = statements[0];
  return (
    first !== undefined &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === 'use server'
  );
}

const isExported = (node: ts.Node): boolean =>
  ts.canHaveModifiers(node) &&
  (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

const isDefault = (node: ts.Node): boolean =>
  ts.canHaveModifiers(node) &&
  (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);

type FunctionNode = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;

const isFunction = (node: ts.Node | undefined): node is FunctionNode =>
  node !== undefined &&
  (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node));

/** The names this file imports from lib/admin/guard.ts under their own names. */
function guardImports(source: ts.SourceFile, file: string, root: string): Set<string> {
  const names = new Set<string>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    const specifier = statement.moduleSpecifier.text;
    if (!specifier.startsWith('.')) continue;
    const target = resolve(dirname(file), specifier);
    const resolved = extname(target) === '' ? `${target}.ts` : target;
    if (relative(root, resolved) !== GUARD_MODULE) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if (element.propertyName === undefined) names.add(element.name.text);
    }
  }
  return names;
}

/** The guard a body's first statement awaits, if it is `const … = await guard();`. */
function firstGuard(
  statements: readonly ts.Statement[],
  imported: ReadonlySet<string>,
): AdminEntry['guard'] {
  const first = statements[0];
  if (first === undefined || !ts.isVariableStatement(first)) return null;
  const [declaration, ...more] = first.declarationList.declarations;
  if (declaration === undefined || more.length > 0) return null;
  const init = declaration.initializer;
  if (init === undefined || !ts.isAwaitExpression(init)) return null;
  const call = init.expression;
  if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) return null;
  if (call.arguments.length > 0) return null;
  const name = call.expression.text;
  if (!imported.has(name)) return null;
  return name === 'requireAdmin' || name === 'getAdminAccess' ? name : null;
}

function bodyOf(fn: FunctionNode): readonly ts.Statement[] | null {
  return fn.body !== undefined && ts.isBlock(fn.body) ? fn.body.statements : null;
}

function guardOf(fn: FunctionNode, imported: ReadonlySet<string>, skipDirective: boolean) {
  const body = bodyOf(fn);
  if (body === null) return null;
  return firstGuard(skipDirective ? body.slice(1) : body, imported);
}

export function scanAdmin(root: string): AdminScan {
  const entries: AdminEntry[] = [];
  const unreadable: string[] = [];

  for (const file of codeFilesUnder(join(root, 'app', 'admin'))) {
    const at = relative(root, file);
    const source = parse(file);
    const imported = guardImports(source, file, root);
    const serverModule = startsWithUseServer(source.statements);
    const route = basename(file).replace(/\.tsx?$/, '') === 'route';
    const ui = UI_FILE.exec(basename(file))?.[1];
    if (ui !== undefined && ui !== 'page') {
      unreadable.push(`${at}: a ${ui} file; decide how it is guarded and teach this scan`);
    }

    const add = (name: string, kind: EntryKind, guard: AdminEntry['guard']) =>
      entries.push({ id: `${at}#${name}`, kind, guard });

    for (const statement of source.statements) {
      if (ts.isExportDeclaration(statement) || ts.isExportAssignment(statement)) {
        if (serverModule || route || ui === 'page') {
          unreadable.push(`${at}: an export this scan cannot follow; export the function itself`);
        }
        continue;
      }
      if (!isExported(statement)) continue;

      const declared: [string, ts.Node | undefined][] = ts.isFunctionDeclaration(statement)
        ? [[isDefault(statement) ? 'default' : (statement.name?.text ?? 'default'), statement]]
        : ts.isVariableStatement(statement)
          ? statement.declarationList.declarations.map((d) => [
              d.name.getText(source),
              d.initializer,
            ])
          : [];

      for (const [name, node] of declared) {
        const kind: EntryKind | null = serverModule
          ? 'action'
          : route && HTTP_METHODS.has(name)
            ? 'route'
            : ui === 'page' && name === 'default'
              ? 'page'
              : null;
        if (kind === null) continue;
        if (!isFunction(node)) {
          unreadable.push(`${at}#${name}: not a function this scan can read`);
          continue;
        }
        add(name, kind, guardOf(node, imported, false));
      }
    }

    // Inline server actions: any function, at any depth, whose body starts with 'use server'.
    const visit = (node: ts.Node) => {
      if (isFunction(node)) {
        const body = bodyOf(node);
        if (body !== null && startsWithUseServer(body)) {
          const line = `line ${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
          const name = ts.isArrowFunction(node) ? line : (node.name?.text ?? line);
          add(name, 'inline-action', guardOf(node, imported, true));
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  return { entries, unreadable };
}

/** Every module in app, lib and components that starts with 'use server', relative to the root. */
export function serverActionModules(root: string): string[] {
  return ['app', 'lib', 'components']
    .flatMap((directory) => codeFilesUnder(join(root, directory)))
    .filter((file) => startsWithUseServer(parse(file).statements))
    .map((file) => relative(root, file));
}
