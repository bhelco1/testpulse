import { createHash } from 'node:crypto';

import {
  type NormalizedCoverage,
  type NormalizedReport,
  type TestFailure,
  type TestStatus,
} from '../parsers/index.ts';
import { compileLayerRules, type Layer } from './layer-rules.ts';
import type { ReportEvent, ReportMeta } from './meta.ts';
import { compileNameNormalization } from './name-normalization.ts';

export type RunStatus = 'passed' | 'failed' | 'empty';
export type ReportFormat = 'junit' | 'jest-json';
export type CoverageFormat = 'jacoco' | 'istanbul';

export interface Totals {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
}

/** The columns of the project row that ingestion needs. */
export interface IngestProject {
  readonly id: string;
  readonly layer_rules: unknown;
  readonly name_normalization: unknown;
}

export interface ParsedResults {
  readonly format: ReportFormat;
  readonly report: NormalizedReport;
}

export interface CoverageInput {
  readonly format: CoverageFormat;
  readonly coverage: NormalizedCoverage;
}

export interface PayloadTest {
  readonly test_key: string;
  readonly module: string;
  readonly suite: string;
  readonly name: string;
  readonly layer: Layer;
  readonly status: TestStatus;
  readonly duration_ms: number;
  readonly failure: TestFailure | null;
}

export interface PayloadCoverage {
  readonly module: string;
  readonly format: CoverageFormat;
  readonly lines_covered: number;
  readonly lines_total: number;
  readonly branches_covered: number | null;
  readonly branches_total: number | null;
}

/** The argument of the `ingest_report` database function; every write comes from here. */
export interface IngestPayload {
  readonly project_id: string;
  readonly received_at: string;
  readonly run: {
    readonly ci_run_id: string;
    readonly run_attempt: number;
    readonly commit_sha: string;
    readonly branch: string;
    readonly event: ReportEvent;
    readonly run_url: string | null;
  };
  readonly report: Totals & {
    readonly job: string;
    readonly module: string;
    readonly platform: string;
    readonly format: ReportFormat;
    readonly duration_ms: number;
  };
  readonly tests: readonly PayloadTest[];
  readonly coverage: readonly PayloadCoverage[];
}

// U+0000 cannot be stored in Postgres text, so the parsers and the meta schema refuse it in
// every part; that makes it the one separator that cannot appear inside a part.
const KEY_SEPARATOR = '\u0000';

/**
 * Spec 5.4: the stable identity of a test. The parts are joined with a separator none of them
 * can contain, so ("ab", "c") and ("a", "bc") hash differently.
 */
export function testKey(module: string, suite: string, name: string): string {
  return createHash('sha256')
    .update([module, suite, name].join(KEY_SEPARATOR), 'utf8')
    .digest('hex');
}

// Spec 5.2 rolls errors into `failed`: the results table keeps the distinction, the totals
// only need to know that the run cannot be green.
export function summarize(tests: ReadonlyArray<{ readonly status: TestStatus }>): Totals {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const test of tests) {
    if (test.status === 'passed') passed += 1;
    else if (test.status === 'skipped') skipped += 1;
    else failed += 1;
  }
  return { total: tests.length, passed, failed, skipped };
}

export function sumTotals(reports: readonly Totals[]): Totals {
  return reports.reduce<Totals>(
    (sum, report) => ({
      total: sum.total + report.total,
      passed: sum.passed + report.passed,
      failed: sum.failed + report.failed,
      skipped: sum.skipped + report.skipped,
    }),
    { total: 0, passed: 0, failed: 0, skipped: 0 },
  );
}

/** Spec 5.2: failed beats empty, and a run of only skipped tests still passed. */
export function deriveStatus(totals: Totals): RunStatus {
  if (totals.failed > 0) return 'failed';
  if (totals.total === 0) return 'empty';
  return 'passed';
}

/**
 * Turns one parsed report into the payload `ingest_report` writes. Pure: the receipt time is an
 * argument. The files' own times are left out: `ingest_report` dates the report by its receipt,
 * from `received_at` minus `duration_ms` to `received_at` (decision 2026-10-05).
 */
export function normalizeReport(
  meta: ReportMeta,
  project: IngestProject,
  results: ParsedResults,
  coverage: readonly CoverageInput[],
  receivedAt: Date,
): IngestPayload {
  const resolveLayer = compileLayerRules(project.layer_rules);
  const normalizeIdentity = compileNameNormalization(project.name_normalization);
  const { report } = results;

  return {
    project_id: project.id,
    received_at: receivedAt.toISOString(),
    run: {
      ci_run_id: meta.ci_run_id,
      run_attempt: meta.run_attempt,
      commit_sha: meta.commit_sha,
      branch: meta.branch,
      event: meta.event,
      run_url: meta.run_url ?? null,
    },
    report: {
      job: meta.job,
      module: meta.module,
      platform: meta.platform,
      format: results.format,
      ...summarize(report.tests),
      duration_ms: report.durationMs,
    },
    // The project's normalization runs before the key and the layer, so both are computed from
    // the identity the test has on every platform rather than the one this runner spelled.
    tests: report.tests.map((test) => {
      const { suite, name } = normalizeIdentity(test.suite, test.name);
      return {
        test_key: testKey(meta.module, suite, name),
        module: meta.module,
        suite,
        name,
        layer: resolveLayer({
          job: meta.job,
          module: meta.module,
          platform: meta.platform,
          suite,
        }),
        status: test.status,
        duration_ms: test.durationMs,
        failure: test.failure ?? null,
      };
    }),
    coverage: coverage.map((entry) => ({
      module: meta.module,
      format: entry.format,
      lines_covered: entry.coverage.linesCovered,
      lines_total: entry.coverage.linesTotal,
      branches_covered: entry.coverage.branchesCovered ?? null,
      branches_total: entry.coverage.branchesTotal ?? null,
    })),
  };
}
