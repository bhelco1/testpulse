import { z } from 'zod';

// Spec section 11: the rows the stats read, as the anon role sees them (section 9). Rows come
// from PostgREST, which is a trust boundary like any other, so they are parsed rather than cast.

const instant = z.iso.datetime({ offset: true }).transform((value) => new Date(value));
const count = z.int().min(0);

export const RUN_SOURCES = ['ci', 'backfill'] as const;
export const RunSourceSchema = z.enum(RUN_SOURCES);
export type RunSource = z.infer<typeof RunSourceSchema>;

export const RUN_COLUMNS =
  'id, ci_run_id, run_attempt, commit_sha, branch, status, passed, failed, skipped, ' +
  'started_at, finished_at, source';

export const RunRowSchema = z
  .object({
    id: z.string().min(1),
    ci_run_id: z.string().min(1),
    run_attempt: z.int().min(1),
    commit_sha: z.string().min(1),
    branch: z.string().min(1),
    status: z.enum(['passed', 'failed', 'empty']),
    passed: count,
    // Section 5.2 rolls JUnit errors into failed; results keep the distinction.
    failed: count,
    skipped: count,
    started_at: instant,
    finished_at: instant,
    source: RunSourceSchema,
  })
  .transform((row) => ({
    id: row.id,
    ciRunId: row.ci_run_id,
    runAttempt: row.run_attempt,
    commitSha: row.commit_sha,
    branch: row.branch,
    status: row.status,
    passed: row.passed,
    failed: row.failed,
    skipped: row.skipped,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    source: row.source,
  }));

export type StatsRun = z.output<typeof RunRowSchema>;

// A many-to-one embed arrives as an object; the reports policy lets anon read every report.
const embeddedRun = z.object({ run_id: z.string().min(1) });

export const COVERAGE_COLUMNS =
  'id, module, lines_covered, lines_total, lines_pct, reports!inner(run_id)';

export const CoverageRowSchema = z
  .object({
    id: z.string().min(1),
    module: z.string().min(1),
    lines_covered: count.nullable(),
    lines_total: count.nullable(),
    lines_pct: z.number().min(0).max(100).nullable(),
    reports: embeddedRun,
  })
  .transform((row, context) => {
    const base = { id: row.id, runId: row.reports.run_id, module: row.module };
    // Mirrors the coverage_lines_one_form check (section 5.7), so a row the database should
    // never hold is refused here rather than silently read in one form or the other.
    if (row.lines_covered !== null && row.lines_total !== null && row.lines_pct === null) {
      return {
        ...base,
        lines: { form: 'counts' as const, covered: row.lines_covered, total: row.lines_total },
      };
    }
    if (row.lines_covered === null && row.lines_total === null && row.lines_pct !== null) {
      return { ...base, lines: { form: 'pct' as const, pct: row.lines_pct } };
    }
    context.addIssue({
      code: 'custom',
      message: 'coverage row must hold either both line counts or a lines_pct, not both or neither',
    });
    return z.NEVER;
  });

export type StatsCoverage = z.output<typeof CoverageRowSchema>;

export const RESULT_COLUMNS = 'id, test_id, status, reports!inner(run_id, platform)';

export const ResultRowSchema = z
  .object({
    id: z.string().min(1),
    test_id: z.string().min(1),
    status: z.enum(['passed', 'failed', 'error', 'skipped']),
    // A test's ID covers module, suite and name but not platform (section 5.4), so flakiness
    // takes the platform from the report to compare a test with itself on one platform.
    reports: embeddedRun.extend({ platform: z.string().min(1) }),
  })
  .transform((row) => ({
    id: row.id,
    runId: row.reports.run_id,
    testId: row.test_id,
    status: row.status,
    platform: row.reports.platform,
  }));

export type StatsResult = z.output<typeof ResultRowSchema>;
