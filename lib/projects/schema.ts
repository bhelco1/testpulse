import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

// Scripts run this module under Node's type stripping, which needs real extensions on imports.
import { LayerRulesSchema, LayerSchema } from '../ingest/layer-rules.ts';
import { NameNormalizationSchema } from '../ingest/name-normalization.ts';

// A slug is a URL segment (spec section 5.1) and a file name under projects/, so it is kept to
// the characters that need no escaping in either place.
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export const SlugSchema = z
  .string()
  .regex(
    SLUG_PATTERN,
    'slug must be lowercase letters, digits and hyphens, starting with a letter or digit',
  );

export const VisibilitySchema = z.enum(['public', 'private']);

export const StackEntrySchema = z.strictObject({
  category: z.string().min(1),
  items: z.array(z.string().min(1)).min(1),
});

export const DeclaredSuiteStatusSchema = z.enum([
  'authored_not_executed',
  'runs_in_ci_not_reported',
]);

export const DeclaredSuiteSchema = z.strictObject({
  name: z.string().min(1),
  layer: LayerSchema,
  count: z.int().nonnegative(),
  status: DeclaredSuiteStatusSchema,
  note: z.string().min(1).optional(),
});

// Every projects column that projects/<slug>.yaml owns (spec section 5.1): everything except
// api_key_hash, which only project:add and project:rotate-key write. A field is required here
// exactly when its column has no database default, and the other defaults mirror the column
// defaults, so a minimal file and a full one produce the same row.
export const ProjectFileSchema = z.strictObject({
  slug: SlugSchema,
  name: z.string().min(1),
  tagline: z.string().min(1),
  description: z.string().min(1),
  visibility: VisibilitySchema,
  repo_url: z.url().nullable().default(null),
  default_branch: z.string().min(1).default('main'),
  dev_stack: z.array(StackEntrySchema).default([]),
  test_stack: z.array(StackEntrySchema).default([]),
  layer_rules: LayerRulesSchema,
  name_normalization: NameNormalizationSchema.default({}),
  declared_suites: z.array(DeclaredSuiteSchema).default([]),
  coverage_floors: z.record(z.string().min(1), z.number().min(0).max(100)).default({}),
  expected_cadence_days: z.int().positive().default(8),
  sort_order: z.int().default(0),
  retention_days: z.int().positive().default(180),
});

export type ProjectFile = z.output<typeof ProjectFileSchema>;
export type ProjectFileInput = z.input<typeof ProjectFileSchema>;
export type StackEntry = z.infer<typeof StackEntrySchema>;
export type { NameNormalization } from '../ingest/name-normalization.ts';
export type DeclaredSuite = z.infer<typeof DeclaredSuiteSchema>;
export type DeclaredSuiteStatus = z.infer<typeof DeclaredSuiteStatusSchema>;
export type Visibility = z.infer<typeof VisibilitySchema>;

export interface ProjectFileIssue {
  /** Dotted path inside the YAML document; empty for a whole-document problem. */
  readonly path: string;
  readonly message: string;
}

export class ProjectFileError extends Error {
  readonly file: string;
  readonly issues: readonly ProjectFileIssue[];

  constructor(file: string, issues: readonly ProjectFileIssue[]) {
    const details = issues
      .map((issue) => (issue.path === '' ? issue.message : `${issue.path}: ${issue.message}`))
      .join('; ');
    super(`${file}: ${details}`);
    this.name = 'ProjectFileError';
    this.file = file;
    this.issues = issues;
  }
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const dotted = (path: readonly PropertyKey[]): string => path.map(String).join('.');

// Zod reports unknown keys once at the parent with the names inside the issue; one issue per
// key, at the key's own path, tells the operator which line to fix.
const toIssues = (issue: z.core.$ZodIssue): ProjectFileIssue[] =>
  issue.code === 'unrecognized_keys'
    ? issue.keys.map((key) => ({
        path: dotted([...issue.path, key]),
        message: 'Unrecognized key',
      }))
    : [{ path: dotted(issue.path), message: issue.message }];

/**
 * Parses and validates the text of one projects/<slug>.yaml. `file` is only used to label
 * errors, so callers can pass whatever path the operator will recognise.
 */
export function parseProjectFile(text: string, file: string): ProjectFile {
  let document: unknown;
  try {
    document = parseYaml(text);
  } catch (error) {
    throw new ProjectFileError(file, [{ path: '', message: errorMessage(error) }]);
  }

  const result = ProjectFileSchema.safeParse(document);
  if (!result.success) {
    throw new ProjectFileError(file, result.error.issues.flatMap(toIssues));
  }
  return result.data;
}
