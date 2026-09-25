import { z } from 'zod';

import type { BackfillReport, BackfillRun } from './types.ts';

export type { BackfillRun } from './types.ts';

// Spec section 17, Phase 4, "Backfill sources": Ostomate2's history.json, a JSON array written
// by scripts/generate_test_dashboard.py. The file is read from a branch anyone with push access
// can rewrite, so every field is checked before it is trusted.

/** The generator's HISTORY_LIMIT; a longer file was not written by it. */
export const HISTORY_LIMIT = 200;

// int4, the type of every count column the totals land in.
const MAX_COUNT = 2_147_483_647;
// Same caps as the live meta (lib/ingest/meta.ts): branch 255, run URL 2000.
const MAX_BRANCH_LENGTH = 255;
const MAX_URL_LENGTH = 2000;

// Control characters and lone surrogates, the same text meta.ts refuses for a live branch:
// Postgres cannot store a lone surrogate or U+0000, and a line break has no place in a branch.
const UNSTORABLE_TEXT = /[\p{Cc}\p{Cs}]/u;

// The form Python's isoformat(timespec="seconds") writes, which is also what ingest_timestamp
// accepts; a looser Date parse would take values such as "2026" or a bare date.
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

// The run ID is the last path segment and becomes ci_run_id, so the URL is held to exactly the
// shape GitHub Actions gives it rather than to "any https URL".
const RUN_URL =
  /^https:\/\/github\.com\/[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}\/actions\/runs\/(\d{1,20})$/;

const count = z.int().min(0).max(MAX_COUNT);

const TestCategorySchema = z
  .strictObject({
    tests: count,
    failed: count,
    status: z.enum(['pass', 'fail', 'empty']),
  })
  .superRefine((category, context) => {
    if (category.failed > category.tests) {
      context.addIssue({
        code: 'custom',
        path: ['failed'],
        message: `must not exceed tests (${category.tests})`,
      });
    }
  });

const percentage = z.number().min(0).max(100).nullable();

const HistoryEntrySchema = z.strictObject({
  generatedAt: z
    .string()
    .regex(ISO_TIMESTAMP, 'must be an ISO 8601 timestamp')
    .refine((value) => !Number.isNaN(Date.parse(value)), 'must be a real point in time'),
  run: z.strictObject({
    sha: z.string().regex(/^[0-9a-f]{40}$/, 'must be 40 lowercase hexadecimal characters'),
    branch: z
      .string()
      .min(1)
      .max(MAX_BRANCH_LENGTH)
      .refine((value) => !UNSTORABLE_TEXT.test(value), 'must not contain control characters'),
    url: z
      .string()
      .max(MAX_URL_LENGTH)
      .transform((url, context) => {
        const runId = RUN_URL.exec(url)?.[1];
        if (runId === undefined) {
          context.addIssue({
            code: 'custom',
            message: 'must be https://github.com/<owner>/<repo>/actions/runs/<digits>',
          });
          return z.NEVER;
        }
        return { url, runId };
      }),
  }),
  unit: TestCategorySchema,
  integration: TestCategorySchema,
  ui: TestCategorySchema,
  cicd: z.enum(['pass', 'fail', 'empty']),
  coverage: z.strictObject({ shared: percentage, composeApp: percentage }),
});

export const Ostomate2HistorySchema = z.array(HistoryEntrySchema).max(HISTORY_LIMIT);

export type Ostomate2History = z.output<typeof Ostomate2HistorySchema>;
type HistoryEntry = Ostomate2History[number];

export interface BackfillFileIssue {
  /** Where in the file, e.g. `[16].run.url`; `(root)` for the document as a whole. */
  readonly path: string;
  readonly message: string;
}

export class BackfillFileError extends Error {
  readonly issues: readonly BackfillFileIssue[];

  constructor(issues: readonly BackfillFileIssue[]) {
    super(
      `history file is invalid:\n${issues.map((issue) => `  ${issue.path}: ${issue.message}`).join('\n')}`,
    );
    this.name = 'BackfillFileError';
    this.issues = issues;
  }
}

const pathOf = (path: readonly PropertyKey[]): string =>
  path.length === 0
    ? '(root)'
    : path
        .map((part) => (typeof part === 'number' ? `[${part}]` : `.${String(part)}`))
        .join('')
        .replace(/^\./, '');

// Zod reports unknown keys once at the parent; one issue per key names the field to look at.
const toIssues = (issue: z.core.$ZodIssue): BackfillFileIssue[] =>
  issue.code === 'unrecognized_keys'
    ? issue.keys.map((key) => ({ path: pathOf([...issue.path, key]), message: 'unexpected field' }))
    : [{ path: pathOf(issue.path), message: issue.message }];

function report(
  module: 'shared' | 'composeApp',
  total: number,
  failed: number,
  linesPct: number | null,
): BackfillReport {
  return {
    job: 'android',
    module,
    platform: 'jvm',
    format: 'junit',
    total,
    passed: total - failed,
    failed,
    // The file does not record skipped tests; spec "Backfill sources" lists it as not recorded.
    skipped: 0,
    coverage: linesPct === null ? null : { format: 'jacoco', lines_pct: linesPct },
  };
}

function toRun(entry: HistoryEntry): BackfillRun {
  // generatedAt is when the dashboard was built, the only time the file holds. The span is a
  // single instant because nothing records how long the tests took.
  const at = new Date(entry.generatedAt).toISOString();
  return {
    ci_run_id: entry.run.url.runId,
    // The file records neither; the spec decision takes push, attempt 1, which the GitHub API
    // confirmed for every default-branch entry captured.
    run_attempt: 1,
    commit_sha: entry.run.sha,
    branch: entry.run.branch,
    event: 'push',
    run_url: entry.run.url.url,
    started_at: at,
    finished_at: at,
    reports: [
      // unit is the shared suites outside `.data.`, integration those inside it: together they
      // are the whole shared module, reported under the same key as live CI reports.
      report(
        'shared',
        entry.unit.tests + entry.integration.tests,
        entry.unit.failed + entry.integration.failed,
        entry.coverage.shared,
      ),
      report('composeApp', entry.ui.tests, entry.ui.failed, entry.coverage.composeApp),
    ],
  };
}

/**
 * The default-branch entries of an Ostomate2 history file as backfill runs, oldest first.
 * Pure: the caller reads and JSON-parses the file, and passes the project's default branch.
 */
export function toOstomate2BackfillRuns(file: unknown, defaultBranch: string): BackfillRun[] {
  const parsed = Ostomate2HistorySchema.safeParse(file);
  if (!parsed.success) {
    throw new BackfillFileError(parsed.error.issues.flatMap(toIssues));
  }

  // A run re-run in place keeps its run ID and gets a second entry, and the file cannot tell the
  // attempts apart (run 29269066815 in the capture). Both would be attempt 1, so only one can be
  // stored; the later entry is the run's final outcome, so it wins, at the later position.
  const byRunId = new Map<string, BackfillRun>();
  for (const entry of parsed.data) {
    if (entry.run.branch !== defaultBranch) continue;
    const run = toRun(entry);
    byRunId.delete(run.ci_run_id);
    byRunId.set(run.ci_run_id, run);
  }
  return [...byRunId.values()];
}
