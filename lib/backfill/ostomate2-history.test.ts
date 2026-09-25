import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  BackfillFileError,
  HISTORY_LIMIT,
  type BackfillRun,
  toOstomate2BackfillRuns,
} from './ostomate2-history.ts';

const FIXTURE = fileURLToPath(
  new URL('../../fixtures/ostomate2/history/history.json', import.meta.url),
);

// A fresh parse per call, so a test can mutate its copy without touching any other test's.
const history = (): Array<Record<string, unknown>> =>
  JSON.parse(readFileSync(FIXTURE, 'utf8')) as Array<Record<string, unknown>>;

const runsOf = (file: unknown): BackfillRun[] => toOstomate2BackfillRuns(file, 'main');

// Invalid inputs are the captured file with one field changed here, never a hand-written sample.
const mutated = (index: number, mutate: (entry: Record<string, unknown>) => void): unknown => {
  const file = history();
  const entry = file[index];
  if (entry === undefined) throw new Error(`fixture has no entry ${index}`);
  mutate(entry);
  return file;
};

const child = (entry: Record<string, unknown>, key: string): Record<string, unknown> =>
  entry[key] as Record<string, unknown>;

const rejection = (file: unknown): BackfillFileError => {
  let caught: unknown;
  try {
    runsOf(file);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(BackfillFileError);
  return caught as BackfillFileError;
};

describe('toOstomate2BackfillRuns on the captured history (spec section 17, Phase 4)', () => {
  const runs = runsOf(history());

  it('keeps exactly the 13 default-branch entries', () => {
    expect(runs).toHaveLength(13);
    expect(runs.every((run) => run.branch === 'main')).toBe(true);
  });

  it('records every run as a push, attempt 1, per the spec decision', () => {
    expect(runs.every((run) => run.event === 'push' && run.run_attempt === 1)).toBe(true);
  });

  it('gives every run a distinct CI run ID', () => {
    expect(new Set(runs.map((run) => run.ci_run_id)).size).toBe(runs.length);
  });

  it('maps the first main entry to shared and composeApp reports with their coverage', () => {
    expect(runs[0]).toEqual({
      ci_run_id: '29279945808',
      run_attempt: 1,
      commit_sha: 'a132513e34ebbe832cc62fc5a62f3e999658e820',
      branch: 'main',
      event: 'push',
      run_url: 'https://github.com/bhelco1/Ostomate2/actions/runs/29279945808',
      started_at: '2026-07-13T20:10:42.000Z',
      finished_at: '2026-07-13T20:10:42.000Z',
      reports: [
        {
          job: 'android',
          module: 'shared',
          platform: 'jvm',
          format: 'junit',
          total: 79,
          passed: 79,
          failed: 0,
          skipped: 0,
          coverage: { format: 'jacoco', lines_pct: 93.2 },
        },
        {
          job: 'android',
          module: 'composeApp',
          platform: 'jvm',
          format: 'junit',
          total: 47,
          passed: 47,
          failed: 0,
          skipped: 0,
          coverage: { format: 'jacoco', lines_pct: 93.6 },
        },
      ],
    });
  });

  it('maps the last main entry with the counts and coverage it recorded', () => {
    const last = runs.at(-1);
    expect(last).toMatchObject({
      ci_run_id: '35776037304',
      commit_sha: 'cebddb1c9aae4d0459224d84bb0237327465cb0a',
      started_at: '2026-09-22T20:14:18.000Z',
      finished_at: '2026-09-22T20:14:18.000Z',
    });
    expect(last?.reports.map((report) => [report.module, report.total, report.coverage])).toEqual([
      ['shared', 82, { format: 'jacoco', lines_pct: 93.3 }],
      ['composeApp', 60, { format: 'jacoco', lines_pct: 94.3 }],
    ]);
  });

  it('keeps only the branch it is given', () => {
    // 14 entries on this branch, two of them the same run, so 13 runs.
    const feature = toOstomate2BackfillRuns(history(), 'fix-ci-secrets-context');
    expect(feature).toHaveLength(13);
    expect(feature.every((run) => run.branch === 'fix-ci-secrets-context')).toBe(true);
    expect(toOstomate2BackfillRuns(history(), 'trunk')).toEqual([]);
  });
});

describe('toOstomate2BackfillRuns mapping rules', () => {
  // Run 29269066815 appears twice in the capture (attempts 1 and 2, on a feature branch).
  it('keeps the later of two entries for one run ID', () => {
    const runs = toOstomate2BackfillRuns(history(), 'fix-ci-secrets-context');
    const repeated = runs.filter((run) => run.ci_run_id === '29269066815');
    expect(repeated).toHaveLength(1);
    expect(repeated[0]?.started_at).toBe('2026-07-13T17:40:45.000Z');
  });

  it('adds failures from unit and integration into shared and ui into composeApp', () => {
    const file = mutated(16, (entry) => {
      child(entry, 'unit').failed = 2;
      child(entry, 'integration').failed = 1;
      child(entry, 'ui').failed = 4;
    });
    const [first] = runsOf(file);
    expect(first?.reports.map((report) => [report.total, report.passed, report.failed])).toEqual([
      [79, 76, 3],
      [47, 43, 4],
    ]);
  });

  it('writes no coverage for a module whose percentage is null', () => {
    const file = mutated(16, (entry) => {
      child(entry, 'coverage').composeApp = null;
    });
    const [first] = runsOf(file);
    expect(first?.reports.map((report) => report.coverage)).toEqual([
      { format: 'jacoco', lines_pct: 93.2 },
      null,
    ]);
  });

  it('accepts an empty history', () => {
    expect(runsOf([])).toEqual([]);
  });
});

describe('toOstomate2BackfillRuns refuses a malformed file', () => {
  it('refuses a run URL on another host, naming the path', () => {
    const error = rejection(
      mutated(16, (entry) => {
        child(entry, 'run').url = 'https://example.com/bhelco1/Ostomate2/actions/runs/29279945808';
      }),
    );
    expect(error.message).toMatch(/\[16\]\.run\.url: /);
    expect(error.issues).toEqual([{ path: '[16].run.url', message: expect.any(String) }]);
  });

  it('refuses a run URL whose run ID is not numeric', () => {
    const error = rejection(
      mutated(16, (entry) => {
        child(entry, 'run').url = 'https://github.com/bhelco1/Ostomate2/actions/runs/latest';
      }),
    );
    expect(error.message).toMatch(/\[16\]\.run\.url: .*actions\/runs\/<digits>/);
  });

  it('refuses more failures than tests', () => {
    const error = rejection(
      mutated(16, (entry) => {
        child(entry, 'integration').failed = 40;
      }),
    );
    expect(error.message).toMatch(/\[16\]\.integration\.failed: must not exceed tests \(39\)/);
  });

  it('refuses a coverage percentage above 100', () => {
    const error = rejection(
      mutated(16, (entry) => {
        child(entry, 'coverage').shared = 100.1;
      }),
    );
    expect(error.message).toMatch(/\[16\]\.coverage\.shared: /);
  });

  it(`refuses more than ${HISTORY_LIMIT} entries, the generator's own limit`, () => {
    const file = history();
    const oversized = Array.from({ length: HISTORY_LIMIT + 1 }, (_, index) => file[index % 30]);
    const error = rejection(oversized);
    expect(error.issues).toEqual([{ path: '(root)', message: expect.stringMatching(/200/) }]);
  });

  it('refuses a count of the wrong type', () => {
    const error = rejection(
      mutated(16, (entry) => {
        child(entry, 'ui').tests = '47';
      }),
    );
    expect(error.message).toMatch(/\[16\]\.ui\.tests: /);
  });

  it('refuses a SHA that is not 40 hexadecimal characters', () => {
    const error = rejection(
      mutated(16, (entry) => {
        const run = child(entry, 'run');
        run.sha = String(run.sha).slice(0, 7);
      }),
    );
    expect(error.message).toMatch(/\[16\]\.run\.sha: /);
  });

  it('refuses a generatedAt that is not an ISO 8601 timestamp', () => {
    const error = rejection(
      mutated(16, (entry) => {
        entry.generatedAt = 'now';
      }),
    );
    expect(error.message).toMatch(/\[16\]\.generatedAt: /);
  });

  it('refuses a generatedAt that matches the form but names no real time', () => {
    const error = rejection(
      mutated(16, (entry) => {
        entry.generatedAt = '2026-13-45T10:48:11+00:00';
      }),
    );
    expect(error.message).toMatch(/\[16\]\.generatedAt: /);
  });

  it('refuses a branch with a control character', () => {
    const error = rejection(
      mutated(16, (entry) => {
        child(entry, 'run').branch = 'main\n';
      }),
    );
    expect(error.message).toMatch(/\[16\]\.run\.branch: /);
  });

  it('refuses an unexpected field, so a changed generator is noticed rather than misread', () => {
    const error = rejection(
      mutated(16, (entry) => {
        child(entry, 'ui').skipped = 0;
      }),
    );
    expect(error.issues).toEqual([{ path: '[16].ui.skipped', message: expect.any(String) }]);
  });

  it('refuses a document that is not an array', () => {
    const error = rejection(history()[0]);
    expect(error.issues[0]?.path).toBe('(root)');
  });
});
