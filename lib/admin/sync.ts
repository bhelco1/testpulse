import { join } from 'node:path';

import { loadProjectFiles, PROJECTS_DIR } from '../projects/files.ts';
import { type ProjectRow, toProjectRow } from '../projects/repo.ts';
import type { ProjectFile } from '../projects/schema.ts';

// Admin's YAML sync column (spec section 15, "Admin" as built; design/components.md, Admin,
// "Projects table"). Each projects/<slug>.yaml deployed with the site is read when the page loads,
// with the parsing and validation `npm run projects:sync` uses, and compared with its database row
// by slug, field by field over the columns the file owns (toProjectRow): In sync, Differs (the
// fields), Not registered (a file without a row) or No YAML (a row without a file). The files are
// traced into the admin routes' functions by next.config.ts, so on Vercel they are read from the
// deployment, never from the repository.

export interface AdminProjectRow extends ProjectRow {
  readonly id: string;
}

/** Both values of a short scalar as the page prints them; null for a long or structured field. */
export interface FieldDiff {
  readonly field: keyof ProjectRow;
  readonly yaml: string | null;
  readonly database: string | null;
}

export type SyncState =
  | { readonly kind: 'in-sync' }
  | { readonly kind: 'differs'; readonly fields: readonly FieldDiff[] }
  | { readonly kind: 'not-registered'; readonly file: string }
  | { readonly kind: 'no-yaml' };

export interface ProjectPair {
  readonly slug: string;
  readonly file: ProjectFile | null;
  readonly row: AdminProjectRow | null;
  readonly sync: SyncState;
}

// Longer text would push the column past a line; the field is named and its value left out.
const SHORT_TEXT = 40;

/** The deployment's projects directory: the working directory of `next start` and of Vercel. */
export function deployedProjectsDir(cwd: string = process.cwd()): string {
  return join(cwd, PROJECTS_DIR);
}

/** Every deployed project file, valid; any invalid file stops the comparison, named. */
export function readDeployedProjectFiles(cwd: string = process.cwd()): ProjectFile[] {
  const { files, errors } = loadProjectFiles(deployedProjectsDir(cwd));
  if (errors.length > 0) {
    throw new Error(`invalid project files: ${errors.map((error) => error.message).join('; ')}`);
  }
  return [...files];
}

/** JSON with object keys sorted, so jsonb's own key order never reads as a difference. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner !== null && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.entries(inner as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : inner,
  );
}

function printed(value: unknown): string | null {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'string' && value.length <= SHORT_TEXT) return `“${value}”`;
  return null;
}

export function compareProject(
  file: ProjectFile | undefined,
  row: AdminProjectRow | undefined,
): SyncState {
  if (file === undefined && row !== undefined) return { kind: 'no-yaml' };
  if (file === undefined) throw new Error('compareProject needs a file or a row');
  if (row === undefined)
    return { kind: 'not-registered', file: `${PROJECTS_DIR}/${file.slug}.yaml` };

  const expected = toProjectRow(file);
  const fields: FieldDiff[] = [];
  for (const field of Object.keys(expected) as (keyof ProjectRow)[]) {
    const yaml: unknown = expected[field];
    const database: unknown = row[field];
    if (canonical(yaml) === canonical(database)) continue;
    const [a, b] = [printed(yaml), printed(database)];
    fields.push(
      a === null || b === null
        ? { field, yaml: null, database: null }
        : { field, yaml: a, database: b },
    );
  }
  return fields.length === 0 ? { kind: 'in-sync' } : { kind: 'differs', fields };
}

const bySortThenSlug = (a: ProjectPair, b: ProjectPair): number => {
  const order = (pair: ProjectPair) => pair.row?.sort_order ?? pair.file?.sort_order ?? 0;
  return order(a) - order(b) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
};

/** Every slug with a file or a row, in the site's project order (sort_order, then slug). */
export function projectSync(
  files: readonly ProjectFile[],
  rows: readonly AdminProjectRow[],
): ProjectPair[] {
  const fileBySlug = new Map(files.map((file) => [file.slug, file]));
  const rowBySlug = new Map(rows.map((row) => [row.slug, row]));
  const slugs = [...new Set([...fileBySlug.keys(), ...rowBySlug.keys()])];
  return slugs
    .map((slug) => {
      const file = fileBySlug.get(slug);
      const row = rowBySlug.get(slug);
      return { slug, file: file ?? null, row: row ?? null, sync: compareProject(file, row) };
    })
    .sort(bySortThenSlug);
}
