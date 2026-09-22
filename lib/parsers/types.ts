export type TestStatus = 'passed' | 'failed' | 'error' | 'skipped';

export interface TestFailure {
  message: string;
  detail: string;
}

export interface NormalizedTest {
  suite: string;
  name: string;
  status: TestStatus;
  durationMs: number;
  failure?: TestFailure;
}

export interface NormalizedReport {
  tests: NormalizedTest[];
  startedAt?: string;
  durationMs: number;
}

export interface NormalizedCoverage {
  linesCovered: number;
  linesTotal: number;
  branchesCovered?: number;
  branchesTotal?: number;
}

export interface ParseErrorOptions {
  /** The input field the error is about, e.g. `name` or `time`. */
  field?: string;
  /** Where in the input the error was found, e.g. `line 12, col 3` or a JSON path. */
  location?: string;
}

export class ParseError extends Error {
  readonly field?: string;
  readonly location?: string;

  constructor(message: string, options: ParseErrorOptions = {}) {
    super(options.location === undefined ? message : `${message} (${options.location})`);
    this.name = 'ParseError';
    if (options.field !== undefined) this.field = options.field;
    if (options.location !== undefined) this.location = options.location;
  }
}
