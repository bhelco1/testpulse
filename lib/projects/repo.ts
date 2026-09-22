import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

import { generateApiKey } from './keys.ts';
import type { ProjectFile } from './schema.ts';

// Postgres SQLSTATE for a unique-constraint violation, as surfaced by PostgREST.
const UNIQUE_VIOLATION = '23505';

const TABLE = 'projects';

/** The columns projects/<slug>.yaml owns; api_key_hash is deliberately not among them. */
export interface ProjectRow {
  readonly slug: string;
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  readonly visibility: ProjectFile['visibility'];
  readonly repo_url: string | null;
  readonly default_branch: string;
  readonly dev_stack: ProjectFile['dev_stack'];
  readonly test_stack: ProjectFile['test_stack'];
  readonly layer_rules: ProjectFile['layer_rules'];
  readonly name_normalization: ProjectFile['name_normalization'];
  readonly declared_suites: ProjectFile['declared_suites'];
  readonly coverage_floors: ProjectFile['coverage_floors'];
  readonly expected_cadence_days: number;
  readonly sort_order: number;
  readonly retention_days: number;
}

export interface SyncSummary {
  /** Slugs whose row was updated from its file. */
  readonly updated: readonly string[];
  /** Slugs with a file but no row; project:add creates rows, sync never does. */
  readonly skipped: readonly string[];
  /** Slugs with a row but no file; left untouched. */
  readonly orphaned: readonly string[];
}

// Listed explicitly rather than spread so a future YAML field cannot reach the database
// without a conscious column mapping here.
export function toProjectRow(file: ProjectFile): ProjectRow {
  return {
    slug: file.slug,
    name: file.name,
    tagline: file.tagline,
    description: file.description,
    visibility: file.visibility,
    repo_url: file.repo_url,
    default_branch: file.default_branch,
    dev_stack: file.dev_stack,
    test_stack: file.test_stack,
    layer_rules: file.layer_rules,
    name_normalization: file.name_normalization,
    declared_suites: file.declared_suites,
    coverage_floors: file.coverage_floors,
    expected_cadence_days: file.expected_cadence_days,
    sort_order: file.sort_order,
    retention_days: file.retention_days,
  };
}

export function planSync(
  fileSlugs: readonly string[],
  existingSlugs: readonly string[],
): SyncSummary {
  const seen = new Set<string>();
  for (const slug of fileSlugs) {
    if (seen.has(slug)) {
      throw new Error(`duplicate project file for slug "${slug}"`);
    }
    seen.add(slug);
  }
  const existing = new Set(existingSlugs);
  const sorted = [...fileSlugs].sort();
  return {
    updated: sorted.filter((slug) => existing.has(slug)),
    skipped: sorted.filter((slug) => !existing.has(slug)),
    orphaned: [...existingSlugs].filter((slug) => !seen.has(slug)).sort(),
  };
}

const failed = (what: string, error: PostgrestError): Error =>
  new Error(`${what}: ${error.code} ${error.message}`);

/** Inserts the project with a fresh key and returns that key; the caller shows it once. */
export async function addProject(client: SupabaseClient, file: ProjectFile): Promise<string> {
  const { key, hash } = generateApiKey();
  const { error } = await client.from(TABLE).insert({ ...toProjectRow(file), api_key_hash: hash });
  if (error?.code === UNIQUE_VIOLATION) {
    throw new Error(
      `project "${file.slug}" already exists; projects:sync updates it and ` +
        'project:rotate-key issues a new key',
    );
  }
  if (error) {
    throw failed(`insert project "${file.slug}"`, error);
  }
  return key;
}

/**
 * Spec section 10: updates every row that has a file, from that file, and never touches
 * api_key_hash. Files without a row and rows without a file are reported, not changed.
 */
export async function syncProjects(
  client: SupabaseClient,
  files: readonly ProjectFile[],
): Promise<SyncSummary> {
  const { data, error } = await client.from(TABLE).select('slug');
  if (error) {
    throw failed('list projects', error);
  }
  const existing: string[] = data.map((row: { slug: string }) => row.slug);
  const summary = planSync(
    files.map((file) => file.slug),
    existing,
  );

  const bySlug = new Map(files.map((file) => [file.slug, file]));
  for (const slug of summary.updated) {
    const file = bySlug.get(slug);
    if (file === undefined) {
      throw new Error(`planSync listed "${slug}" without a file`);
    }
    const updated = await client.from(TABLE).update(toProjectRow(file)).eq('slug', slug);
    if (updated.error) {
      throw failed(`update project "${slug}"`, updated.error);
    }
  }
  return summary;
}

/** Replaces the stored hash with that of a fresh key and returns the key. */
export async function rotateProjectKey(client: SupabaseClient, slug: string): Promise<string> {
  const { key, hash } = generateApiKey();
  const { data, error } = await client
    .from(TABLE)
    .update({ api_key_hash: hash })
    .eq('slug', slug)
    .select('slug');
  if (error) {
    throw failed(`rotate key for "${slug}"`, error);
  }
  if (data.length === 0) {
    throw new Error(`project "${slug}" not found; project:add registers new projects`);
  }
  return key;
}
