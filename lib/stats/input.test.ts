import { describe, expect, it } from 'vitest';

import { CoverageRowSchema, ResultRowSchema, RunRowSchema } from './input.ts';

const runRow = {
  id: '7f0c3f2e-1d7a-4c55-9d6b-2a1e0c9b8a77',
  ci_run_id: '35644117162',
  run_attempt: 1,
  commit_sha: '2ec580f',
  branch: 'main',
  status: 'passed',
  passed: 82,
  failed: 0,
  skipped: 0,
  started_at: '2026-09-21T19:17:51.618+00:00',
  finished_at: '2026-09-21T19:18:00+00:00',
  source: 'ci',
};

describe('RunRowSchema', () => {
  it('reads a runs_public row as PostgREST returns it', () => {
    expect(RunRowSchema.parse(runRow)).toEqual({
      id: runRow.id,
      ciRunId: '35644117162',
      runAttempt: 1,
      commitSha: '2ec580f',
      branch: 'main',
      status: 'passed',
      passed: 82,
      failed: 0,
      skipped: 0,
      startedAt: new Date('2026-09-21T19:17:51.618Z'),
      finishedAt: new Date('2026-09-21T19:18:00Z'),
      source: 'ci',
    });
  });

  it.each([
    ['an unknown source', { source: 'import' }],
    ['a negative count', { failed: -1 }],
    ['a timestamp that is not ISO 8601', { finished_at: 'yesterday' }],
    ['an unknown status', { status: 'green' }],
  ])('refuses %s', (_, change) => {
    expect(RunRowSchema.safeParse({ ...runRow, ...change }).success).toBe(false);
  });
});

describe('CoverageRowSchema', () => {
  const base = { id: 'c', module: 'shared', reports: { run_id: 'r' } };

  it('reads the count form', () => {
    expect(
      CoverageRowSchema.parse({ ...base, lines_covered: 457, lines_total: 490, lines_pct: null }),
    ).toEqual({
      id: 'c',
      runId: 'r',
      module: 'shared',
      lines: { form: 'counts', covered: 457, total: 490 },
    });
  });

  it('reads the percentage form', () => {
    expect(
      CoverageRowSchema.parse({ ...base, lines_covered: null, lines_total: null, lines_pct: 93.2 }),
    ).toEqual({ id: 'c', runId: 'r', module: 'shared', lines: { form: 'pct', pct: 93.2 } });
  });

  it.each([
    ['both forms', { lines_covered: 1, lines_total: 2, lines_pct: 50 }],
    ['neither form', { lines_covered: null, lines_total: null, lines_pct: null }],
    ['one count only', { lines_covered: 1, lines_total: null, lines_pct: null }],
    ['a percentage above 100', { lines_covered: null, lines_total: null, lines_pct: 100.5 }],
  ])('refuses %s', (_, lines) => {
    expect(CoverageRowSchema.safeParse({ ...base, ...lines }).success).toBe(false);
  });
});

describe('ResultRowSchema', () => {
  it('reads a result with its run and platform from the embedded report', () => {
    expect(
      ResultRowSchema.parse({
        id: 'x',
        test_id: 't',
        status: 'error',
        reports: { run_id: 'r', platform: 'ios-sim' },
      }),
    ).toEqual({ id: 'x', runId: 'r', testId: 't', status: 'error', platform: 'ios-sim' });
  });

  it('refuses a result whose report has no platform', () => {
    expect(
      ResultRowSchema.safeParse({
        id: 'x',
        test_id: 't',
        status: 'passed',
        reports: { run_id: 'r' },
      }).success,
    ).toBe(false);
  });

  it('refuses a result with no report', () => {
    expect(
      ResultRowSchema.safeParse({ id: 'x', test_id: 't', status: 'passed', reports: null }).success,
    ).toBe(false);
  });
});
