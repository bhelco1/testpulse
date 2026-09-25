// The shape backfill_run takes for one run, less the project_id the writer adds. Built by a
// source's parser from a validated file, never from raw input, so these are plain types.

export interface BackfillCoverage {
  readonly format: 'jacoco' | 'istanbul';
  /** Line coverage as recorded by the source, 0 to 100. */
  readonly lines_pct: number;
}

export interface BackfillReport {
  readonly job: string;
  readonly module: string;
  readonly platform: string;
  readonly format: 'junit' | 'jest-json';
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly coverage: BackfillCoverage | null;
}

export interface BackfillRun {
  readonly ci_run_id: string;
  readonly run_attempt: number;
  readonly commit_sha: string;
  readonly branch: string;
  readonly event: 'push' | 'pull_request' | 'schedule' | 'workflow_dispatch';
  readonly run_url: string | null;
  readonly started_at: string;
  readonly finished_at: string;
  readonly reports: readonly BackfillReport[];
}
