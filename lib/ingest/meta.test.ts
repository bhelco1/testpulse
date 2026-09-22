import { describe, expect, it } from 'vitest';

import { type ReportMeta, ReportMetaSchema } from './meta';

// The meta the Appendix A reporter script posts for an Ostomate2 JVM job.
const full = {
  ci_run_id: '35644117162',
  run_attempt: 2,
  job: 'android',
  module: 'shared',
  platform: 'jvm',
  commit_sha: '2ec580f377e52f0a1ae584661ff09b07821ea1e2',
  branch: 'main',
  event: 'push',
  run_url: 'https://github.com/bhelco1/Ostomate2/actions/runs/35644117162',
  path_prefix: '/home/runner/work/Ostomate2/Ostomate2/',
} satisfies ReportMeta;

const issuePaths = (input: unknown): string[] => {
  const result = ReportMetaSchema.safeParse(input);
  expect(result.success, 'expected the input to be rejected').toBe(false);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
};

describe('ReportMetaSchema (spec section 6.2)', () => {
  it('accepts the reporter script meta unchanged', () => {
    expect(ReportMetaSchema.parse(full)).toEqual(full);
  });

  it('defaults run_attempt to 1 and leaves run_url and path_prefix absent', () => {
    const { run_attempt, run_url, path_prefix, ...minimal } = full;
    void run_attempt;
    void run_url;
    void path_prefix;
    const parsed = ReportMetaSchema.parse(minimal);
    expect(parsed).toEqual({ ...minimal, run_attempt: 1 });
    expect(parsed).not.toHaveProperty('run_url');
    expect(parsed).not.toHaveProperty('path_prefix');
  });

  it('accepts a short SHA of 7 characters and a full one of 40', () => {
    expect(ReportMetaSchema.parse({ ...full, commit_sha: '2ec580f' }).commit_sha).toBe('2ec580f');
    expect(ReportMetaSchema.parse({ ...full, commit_sha: 'A'.repeat(40) }).commit_sha).toBe(
      'A'.repeat(40),
    );
  });

  it.each(['ci_run_id', 'job', 'module', 'platform', 'commit_sha', 'branch', 'event'])(
    'rejects meta without %s',
    (field) => {
      const { [field as keyof typeof full]: omitted, ...rest } = full;
      void omitted;
      expect(issuePaths(rest)).toEqual([field]);
    },
  );

  it.each<[string, Partial<Record<keyof typeof full, unknown>>, string]>([
    ['an empty ci_run_id', { ci_run_id: '' }, 'ci_run_id'],
    ['a ci_run_id over 100 characters', { ci_run_id: '1'.repeat(101) }, 'ci_run_id'],
    ['a ci_run_id containing a line break', { ci_run_id: '3564\n4117162' }, 'ci_run_id'],
    ['a ci_run_id containing U+0000', { ci_run_id: '3564\u00004117162' }, 'ci_run_id'],
    ['a ci_run_id containing a lone surrogate', { ci_run_id: '3564\uD83D4117162' }, 'ci_run_id'],
    ['run_attempt 0', { run_attempt: 0 }, 'run_attempt'],
    ['a fractional run_attempt', { run_attempt: 1.5 }, 'run_attempt'],
    ['run_attempt as a string', { run_attempt: '1' }, 'run_attempt'],
    ['an empty job', { job: '' }, 'job'],
    ['a job over 100 characters', { job: 'j'.repeat(101) }, 'job'],
    ['a job containing a line break', { job: 'android\nios' }, 'job'],
    ['a job containing a lone surrogate', { job: 'android\uDC00' }, 'job'],
    ['an empty module', { module: '' }, 'module'],
    ['a module over 100 characters', { module: 'm'.repeat(101) }, 'module'],
    ['a module containing a line break', { module: 'shared\ncomposeApp' }, 'module'],
    ['a module containing U+0000', { module: 'shared\u0000composeApp' }, 'module'],
    ['a module containing a lone surrogate', { module: 'shared\uD800' }, 'module'],
    ['an empty platform', { platform: '' }, 'platform'],
    ['a platform over 100 characters', { platform: 'p'.repeat(101) }, 'platform'],
    ['a platform containing a control character', { platform: 'jvm\u0007' }, 'platform'],
    ['a commit_sha under 7 characters', { commit_sha: '2ec580' }, 'commit_sha'],
    ['a commit_sha over 40 characters', { commit_sha: 'a'.repeat(41) }, 'commit_sha'],
    ['a commit_sha that is not hex', { commit_sha: 'g'.repeat(40) }, 'commit_sha'],
    ['an empty branch', { branch: '' }, 'branch'],
    ['a branch over 255 characters', { branch: 'b'.repeat(256) }, 'branch'],
    ['a branch containing U+0000', { branch: 'a\u0000b' }, 'branch'],
    ['a branch containing a line break', { branch: 'main\nfeature' }, 'branch'],
    ['a branch containing a lone surrogate', { branch: 'main\uDBFF' }, 'branch'],
    ['an event outside the four GitHub events', { event: 'merge_group' }, 'event'],
    ['an http run_url', { run_url: 'http://github.com/bhelco1/Ostomate2' }, 'run_url'],
    ['a run_url that is not a URL', { run_url: 'github.com/bhelco1' }, 'run_url'],
    [
      'a run_url over 2,000 characters',
      { run_url: `https://github.com/${'a'.repeat(1990)}` },
      'run_url',
    ],
    ['a path_prefix over 1,000 characters', { path_prefix: `/${'p'.repeat(1000)}` }, 'path_prefix'],
    [
      'a path_prefix containing a control character',
      { path_prefix: '/home/\u0007/' },
      'path_prefix',
    ],
    ['a path_prefix containing a lone surrogate', { path_prefix: '/home/\uDFFF/' }, 'path_prefix'],
    // The URL parser strips line breaks and re-encodes lone surrogates, so z.url alone would
    // accept both; the rule has to see the raw string.
    [
      'a run_url containing a line break',
      { run_url: 'https://github.com/bhelco1/Ostomate2\n/actions' },
      'run_url',
    ],
    ['a run_url containing U+0000', { run_url: 'https://github.com/a\u0000b' }, 'run_url'],
    [
      'a run_url containing a lone surrogate',
      { run_url: 'https://github.com/a\uD83Db' },
      'run_url',
    ],
  ])('rejects %s', (_label, overrides, path) => {
    expect(issuePaths({ ...full, ...overrides })).toEqual([path]);
  });

  it('names the problem for a storable-text failure', () => {
    const result = ReportMetaSchema.safeParse({ ...full, branch: 'a\u0000b' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual([
        'must not contain control characters',
      ]);
    }
    const lone = ReportMetaSchema.safeParse({ ...full, branch: 'a\uD83Db' });
    expect(lone.success).toBe(false);
    if (!lone.success) {
      expect(lone.error.issues.map((issue) => issue.message)).toEqual([
        'must not contain a lone surrogate U+D83D, which cannot be stored',
      ]);
    }
  });

  it('accepts an empty path_prefix, which strips nothing', () => {
    expect(ReportMetaSchema.parse({ ...full, path_prefix: '' }).path_prefix).toBe('');
  });

  it('rejects unknown keys so a typo cannot be silently ignored', () => {
    const result = ReportMetaSchema.safeParse({ ...full, workflow: 'ci' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.code)).toEqual(['unrecognized_keys']);
    }
  });
});
