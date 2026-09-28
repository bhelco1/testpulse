import { readdirSync, readFileSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

// Walks the static import graph the way the TypeScript compiler resolves it, using the project's
// own tsconfig (so "@/" and every other paths mapping resolve as they do in the build). It is
// deliberately conservative: type-only imports count, and an import of a local file that cannot
// be resolved is an error rather than a dead end, so a gap in resolution fails instead of
// passing quietly.

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);

function compilerOptions(root: string): ts.CompilerOptions {
  const configPath = join(root, 'tsconfig.json');
  const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);
  if (error) throw new Error(`cannot read ${configPath}`);
  return ts.parseJsonConfigFileContent(config, ts.sys, root).options;
}

function isLocal(specifier: string, options: ts.CompilerOptions): boolean {
  if (specifier.startsWith('.') || specifier.startsWith('/')) return true;
  return Object.keys(options.paths ?? {}).some((pattern) =>
    specifier.startsWith(pattern.replace(/\*$/, '')),
  );
}

function importsOf(file: string, root: string, options: ts.CompilerOptions): string[] {
  const { importedFiles } = ts.preProcessFile(readFileSync(file, 'utf8'), true, true);
  const found: string[] = [];
  for (const { fileName: specifier } of importedFiles) {
    const extension = extname(specifier);
    // Stylesheets, JSON and other assets cannot import code.
    if (extension !== '' && !CODE_EXTENSIONS.has(extension) && isLocal(specifier, options)) {
      continue;
    }
    const { resolvedModule } = ts.resolveModuleName(specifier, file, options, ts.sys);
    if (resolvedModule === undefined) {
      if (isLocal(specifier, options)) {
        throw new Error(`${relative(root, file)} imports "${specifier}", which does not resolve`);
      }
      continue;
    }
    if (resolvedModule.isExternalLibraryImport) continue;
    if (resolvedModule.resolvedFileName.endsWith('.d.ts')) continue;
    found.push(resolve(resolvedModule.resolvedFileName));
  }
  return found;
}

/**
 * The first import chain from any entry to the target, entry first and target last, or null if
 * the target is unreachable.
 */
export function importPathTo(
  target: string,
  entries: readonly string[],
  root: string,
): string[] | null {
  const options = compilerOptions(root);
  const goal = resolve(target);
  const cameFrom = new Map<string, string | null>();
  const queue: string[] = [];
  for (const entry of entries) {
    const file = resolve(entry);
    if (!cameFrom.has(file)) {
      cameFrom.set(file, null);
      queue.push(file);
    }
  }

  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    if (next === goal) {
      const path: string[] = [];
      for (let at: string | null | undefined = next; at; at = cameFrom.get(at)) path.unshift(at);
      return path;
    }
    for (const imported of importsOf(next, root, options)) {
      if (!cameFrom.has(imported)) {
        cameFrom.set(imported, next);
        queue.push(imported);
      }
    }
  }
  return null;
}

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

// Every Next.js file that renders UI. Route handlers are left out: they are not pages.
const APP_UI_FILE =
  /^(page|layout|template|loading|error|global-error|not-found|default)\.[jt]sx?$/;
const TEST_FILE = /\.(test|test-support)\.[jt]sx?$/;

/** Every public page and layout outside app/api, and every non-test module under lib/queries. */
export function publicEntryPoints(root: string): string[] {
  const app = join(root, 'app');
  const pages = filesUnder(app).filter(
    (file) => !relative(app, file).startsWith('api/') && APP_UI_FILE.test(basename(file)),
  );
  const queries = filesUnder(join(root, 'lib', 'queries')).filter(
    (file) => CODE_EXTENSIONS.has(extname(file)) && !TEST_FILE.test(file),
  );
  return [...pages, ...queries].sort();
}
