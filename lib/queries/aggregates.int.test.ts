import type { PostgrestSingleResponse, SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { secretClient } from '../../tests/int/admin-session.ts';
import { aggregateParity } from '../../tests/int/aggregates.ts';
import { windowStart } from '../stats/rules.ts';
import { createPublicClient } from '../supabase/public.ts';

// The page aggregates (decision 2026-10-29; supabase/migrations/20261029120000_page_aggregates.sql)
// against a generated history that reaches the cases the seed does not: more than 40 CI runs,
// re-runs of one commit that flip, error and skipped results, a test repeated within one report,
// two platforms, runs tied on finished_at whose ci_run_ids sort differently by code unit than by
// a language collation, a run after now, a run part way through pruning, imported history with
// results and a pull request branch, and a commit re-run across the start of the window. Each "now" moves the 30-day window across the history. The same history is written
// under a public and a private project, and read as anon.
//
// Section 9: none of the functions reads result_failures or returns a commit SHA or run URL. The
// private project's failure text, full SHAs and run URLs exist (read with the secret key) and
// appear in nothing anon gets back.

const DAY_MS = 86_400_000;
const NOW = new Date('2026-10-20T12:00:00.000Z');
const PLATFORMS = ['jvm', 'ios'] as const;
const TESTS = [
  { name: 'steady', layer: 'unit' },
  { name: 'flips', layer: 'unit' },
  { name: 'errors', layer: 'integration' },
  { name: 'skips', layer: 'component' },
  { name: 'one platform fails', layer: 'e2e' },
  { name: 'repeated', layer: 'api' },
  // Reports only in the tied pair and the 39 newest runs after it, so at NOW its last 40 runs end
  // between the two: which one is counted depends on ordering ci_run_id by code unit.
  { name: 'tied', layer: 'unit' },
  // Likewise reports only in a pair of attempts on one commit inside the window and the 39 newest
  // runs after them: its last 40 runs end between the two, the newer failing, the older passing.
  // The failure is a side of the flip, so not counted, though the other side is not among the 40.
  { name: 'cutflip', layer: 'unit' },
] as const;
// The tests that report only in their own pair of runs and the 39 newest runs after it.
const CUT_TESTS = ['tied', 'cutflip'] as const;
type TestName = (typeof TESTS)[number]['name'];

type Status = 'passed' | 'failed' | 'error' | 'skipped';

function unwrap<T>(result: PostgrestSingleResponse<T>, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.code} ${result.error.message}`);
  return result.data;
}

// A fixed sequence, so every run of this file writes the same history.
function sequence(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

interface PlannedRun {
  readonly ciRunId: string;
  readonly attempt: number;
  readonly commit: number;
  readonly branch: string;
  readonly source: 'ci' | 'backfill';
  readonly startedAt: Date;
  readonly finishedAt: Date;
  readonly pruned: boolean;
  /** Statuses this run gives a test on every platform, in place of generated ones. */
  readonly fixed: Readonly<Partial<Record<TestName, Status>>>;
}

const runKey = (run: Pick<PlannedRun, 'ciRunId' | 'attempt'>) => `${run.ciRunId}#${run.attempt}`;

function planRuns(): PlannedRun[] {
  const runs: PlannedRun[] = [];
  const start = NOW.getTime() - 60 * DAY_MS;
  for (let index = 0; index < 55; index += 1) {
    const finishedAt = new Date(start + index * 1.2 * DAY_MS);
    const run = {
      ciRunId: `run-${String(index).padStart(3, '0')}`,
      attempt: 1,
      commit: index,
      branch: 'main',
      source: 'ci' as const,
      startedAt: new Date(finishedAt.getTime() - 600_000),
      finishedAt,
      pruned: index === 40,
      fixed: {},
    };
    runs.push(run);
    // Every fifth commit is re-run: a second attempt on the same commit, where flips live.
    if (index % 5 === 0) {
      runs.push({ ...run, attempt: 2, finishedAt: new Date(finishedAt.getTime() + 3_600_000) });
    }
  }
  const tieAt = new Date(NOW.getTime() - 70 * DAY_MS);
  // Tied on finished_at and started_at: "B10" sorts before "a9" by code unit, after it in en_US.
  for (const [index, ciRunId] of ['a9', 'B10'].entries()) {
    runs.push({
      ciRunId,
      attempt: 1,
      commit: 100 + index,
      branch: 'main',
      source: 'ci',
      startedAt: tieAt,
      finishedAt: tieAt,
      pruned: false,
      fixed: { tied: ciRunId === 'a9' ? 'failed' : 'passed' },
    });
  }
  for (const [index, cutflip] of (['passed', 'failed'] as const).entries()) {
    const finishedAt = new Date(NOW.getTime() - 20 * DAY_MS + index * 3_600_000);
    runs.push({
      ciRunId: 'cut',
      attempt: index + 1,
      commit: 700,
      branch: 'main',
      source: 'ci',
      startedAt: finishedAt,
      finishedAt,
      pruned: false,
      fixed: { cutflip },
    });
  }
  // A burst of runs in the last two days, so the window holds more than 40.
  for (let index = 0; index < 25; index += 1) {
    const finishedAt = new Date(NOW.getTime() - 2 * DAY_MS + index * 3_600_000);
    runs.push({
      ciRunId: `burst-${String(index).padStart(2, '0')}`,
      attempt: 1,
      commit: 600 + index,
      branch: 'main',
      source: 'ci',
      startedAt: finishedAt,
      finishedAt,
      pruned: false,
      fixed: {},
    });
  }
  // One commit run three times across the start of NOW's window: its first attempt fails outside
  // the window, so it is not a side of the flip its later attempts make inside it.
  const windowOpens = windowStart(NOW, 30).getTime();
  for (const [index, flips] of (['failed', 'passed', 'failed'] as const).entries()) {
    const finishedAt = new Date(windowOpens + (index === 0 ? -1 : index) * 3_600_000);
    runs.push({
      ciRunId: 'straddle',
      attempt: index + 1,
      commit: 500,
      branch: 'main',
      source: 'ci',
      startedAt: finishedAt,
      finishedAt,
      pruned: false,
      fixed: { flips },
    });
  }
  for (let index = 0; index < 3; index += 1) {
    const finishedAt = new Date(NOW.getTime() - (index + 1) * 3 * DAY_MS);
    runs.push({
      ciRunId: `pr-${index}`,
      attempt: 1,
      commit: 200 + index,
      branch: 'feature/x',
      source: 'ci',
      startedAt: finishedAt,
      finishedAt,
      pruned: false,
      fixed: {},
    });
  }
  // Imported history. Real imports hold no results; the first of these is given some, on the
  // commit of a CI run in the window, so a failure here flipping that run's pass would show if a
  // CI-only rule read it.
  for (let index = 0; index < 2; index += 1) {
    const finishedAt = new Date(NOW.getTime() - (index + 5) * DAY_MS);
    runs.push({
      ciRunId: `import-${index}`,
      attempt: 1,
      commit: index === 0 ? 45 : 300 + index,
      branch: 'main',
      source: 'backfill',
      startedAt: finishedAt,
      finishedAt,
      pruned: false,
      fixed: index === 0 ? { steady: 'failed' } : {},
    });
  }
  const future = new Date(NOW.getTime() + DAY_MS);
  runs.push({
    ciRunId: 'future',
    attempt: 1,
    commit: 400,
    branch: 'main',
    source: 'ci',
    startedAt: future,
    finishedAt: future,
    pruned: false,
    fixed: {},
  });
  return runs;
}

function statusFor(test: TestName, platform: string, next: () => number): Status {
  const roll = next();
  switch (test) {
    case 'steady':
    case 'tied':
    case 'cutflip':
      return 'passed';
    case 'flips':
      return roll < 0.35 ? 'failed' : 'passed';
    case 'errors':
      return roll < 0.2 ? 'error' : roll < 0.3 ? 'skipped' : 'passed';
    case 'skips':
      return roll < 0.7 ? 'skipped' : 'passed';
    case 'one platform fails':
      return platform === 'ios' && roll < 0.5 ? 'failed' : 'passed';
    case 'repeated':
      return roll < 0.25 ? 'failed' : roll < 0.3 ? 'error' : 'passed';
  }
}

interface Written {
  readonly projectId: string;
  readonly failureTexts: readonly string[];
  readonly shas: readonly string[];
  readonly runUrls: readonly string[];
}

async function writeHistory(
  admin: SupabaseClient,
  slug: string,
  visibility: 'public' | 'private',
): Promise<Written> {
  const project = unwrap(
    await admin
      .from('projects')
      .insert({
        slug,
        name: `Aggregates ${visibility}`,
        tagline: 'Generated by the page aggregates integration test',
        description: 'Deleted at the end of the test run.',
        visibility,
        repo_url: `https://github.com/example/${slug}`,
        default_branch: 'main',
        api_key_hash: `hash-${slug}`,
        sort_order: 999,
      })
      .select('id')
      .single(),
    'insert project',
  );
  const tests = unwrap(
    await admin
      .from('tests')
      .insert(
        TESTS.map((test) => ({
          project_id: project.id,
          test_key: `${slug}-${test.name}`,
          module: 'app',
          suite: 'Suite',
          name: test.name,
          layer: test.layer,
          first_seen_at: NOW.toISOString(),
          last_seen_at: NOW.toISOString(),
        })),
      )
      .select('id, name'),
    'insert tests',
  );
  const testId = new Map(tests.map((row) => [String(row.name), String(row.id)]));

  const planned = planRuns();
  const shaOf = (commit: number) => createHash('sha1').update(`${slug} ${commit}`).digest('hex');
  const runs = unwrap(
    await admin
      .from('runs')
      .insert(
        planned.map((run) => ({
          project_id: project.id,
          ci_run_id: run.ciRunId,
          run_attempt: run.attempt,
          commit_sha: shaOf(run.commit),
          branch: run.branch,
          event: run.branch === 'main' ? 'push' : 'pull_request',
          run_url: `https://github.com/example/${slug}/actions/runs/${run.ciRunId}`,
          started_at: run.startedAt.toISOString(),
          finished_at: run.finishedAt.toISOString(),
          status: 'passed',
          source: run.source,
          results_pruned_at: run.pruned ? NOW.toISOString() : null,
        })),
      )
      .select('id, ci_run_id, run_attempt'),
    'insert runs',
  );
  const runId = new Map(
    runs.map((row) => [
      runKey({ ciRunId: row.ci_run_id, attempt: row.run_attempt }),
      String(row.id),
    ]),
  );
  const plannedOf = new Map(planned.map((run) => [runId.get(runKey(run)), run]));

  // Imported history holds no results, but for the one import above; every other run reports
  // both platforms. The pruned run keeps its results, as one does while the daily job is part way
  // through pruning it, and is still never read.
  const reporting = planned.filter((run) => run.source === 'ci' || run.ciRunId === 'import-0');
  const reports = unwrap(
    await admin
      .from('reports')
      .insert(
        reporting.flatMap((run) =>
          PLATFORMS.map((platform) => ({
            run_id: runId.get(runKey(run)),
            job: `test-${platform}`,
            module: 'app',
            platform,
            format: 'junit',
            started_at: run.startedAt.toISOString(),
            finished_at: run.finishedAt.toISOString(),
            received_at: run.finishedAt.toISOString(),
          })),
        ),
      )
      .select('id, platform, run_id'),
    'insert reports',
  );
  const newest39 = (name: TestName) =>
    new Set(
      reporting
        .filter(
          (run) =>
            run.source === 'ci' &&
            run.branch === 'main' &&
            run.finishedAt <= NOW &&
            !run.pruned &&
            !(name in run.fixed),
        )
        .sort((a, b) => b.finishedAt.getTime() - a.finishedAt.getTime())
        .slice(0, 39)
        .map(runKey),
    );
  const onlyIn = new Map(CUT_TESTS.map((name) => [name, newest39(name)]));

  const next = sequence(7);
  const rows = reports.flatMap((report) => {
    const run = plannedOf.get(String(report.run_id));
    if (run === undefined) throw new Error('a report of an unplanned run');
    return TESTS.filter((test) => {
      const only = onlyIn.get(test.name as (typeof CUT_TESTS)[number]);
      return only === undefined || test.name in run.fixed || only.has(runKey(run));
    }).flatMap((test) => {
      const status = (): Status =>
        run.fixed[test.name] ?? statusFor(test.name, String(report.platform), next);
      const repeats = test.name === 'repeated' ? 3 : 1;
      return Array.from({ length: repeats }, () => ({
        report_id: String(report.id),
        test_id: testId.get(test.name),
        status: status(),
        duration_ms: 5,
      }));
    });
  });
  const results = unwrap(
    await admin.from('results').insert(rows).select('id, status'),
    'insert results',
  );
  const failing = results.filter((row) => row.status === 'failed' || row.status === 'error');
  const failureTexts = failing.map((row) => `aggregates failure ${slug} ${String(row.id)}`);
  unwrap(
    await admin.from('result_failures').insert(
      failing.map((row, index) => ({
        result_id: row.id,
        message: failureTexts[index],
        detail: `at Suite (${slug}.ts:1:1)`,
      })),
    ),
    'insert result_failures',
  );
  return {
    projectId: String(project.id),
    failureTexts,
    shas: [...new Set(planned.map((run) => shaOf(run.commit)))],
    runUrls: planned.map((run) => `https://github.com/example/${slug}/actions/runs/${run.ciRunId}`),
  };
}

describe('page aggregates against generated history, read as anon (decision 2026-10-29)', () => {
  const admin = secretClient();
  const anon = createPublicClient();
  const suffix = randomUUID().slice(0, 8);
  const written: Partial<Record<'public' | 'private', Written>> = {};
  const of = (visibility: 'public' | 'private'): Written => {
    const found = written[visibility];
    if (found === undefined) throw new Error(`no ${visibility} history`);
    return found;
  };

  beforeAll(async () => {
    written.public = await writeHistory(admin, `aggregates-public-${suffix}`, 'public');
    written.private = await writeHistory(admin, `aggregates-private-${suffix}`, 'private');
  });

  afterAll(async () => {
    unwrap(
      await admin.from('projects').delete().like('slug', `aggregates-%-${suffix}`),
      'cleanup projects',
    );
  });

  const nows = [
    NOW,
    new Date(NOW.getTime() - 10 * DAY_MS),
    // Exactly the start of a window's first day, and a moment past the future run.
    windowStart(new Date(NOW.getTime() + 3 * DAY_MS), 30),
    new Date(NOW.getTime() + 3 * DAY_MS),
  ];

  describe.each(['public', 'private'] as const)('a %s project', (visibility) => {
    it.each(nows.map((now) => [now.toISOString(), now] as const))(
      'gives the TypeScript stats’ answers at %s',
      async (_, now) => {
        const parity = await aggregateParity(
          anon,
          { id: of(visibility).projectId, defaultBranch: 'main' },
          now,
        );
        expect(parity.actual).toEqual(parity.expected);
        expect(parity.seen.runs).toBe(planRuns().length);
        expect(parity.seen.flaky).toBeGreaterThan(0);
        expect(parity.seen.failing).toBeGreaterThan(0);
      },
    );
  });

  it('reaches the cases it is written for, at NOW', async () => {
    const parity = await aggregateParity(
      anon,
      { id: of('public').projectId, defaultBranch: 'main' },
      NOW,
    );
    const { flakyFailures } = parity.expected as {
      flakyFailures: { testId: string; failed: number; runs: number }[];
    };
    const names = unwrap(
      await admin.from('tests').select('id, name').eq('project_id', of('public').projectId),
      'test names',
    );
    const failuresOf = (name: TestName) =>
      flakyFailures.find((test) => test.testId === names.find((row) => row.name === name)?.id);
    // Last 40 runs reach back past the 30 days, and end inside the tied pair: a9 by code unit.
    expect(failuresOf('steady')).toMatchObject({ failed: 0, runs: 40 });
    expect(failuresOf('tied')).toMatchObject({ failed: 1, runs: 40 });
    // The cut's newer attempt failed against the older one's pass, inside the window.
    expect(failuresOf('cutflip')).toMatchObject({ failed: 0, runs: 40 });
    expect(
      (parity.expected as { flakyPlatforms: { testId: string }[] }).flakyPlatforms.map(
        (test) => names.find((row) => row.id === test.testId)?.name,
      ),
    ).toContain('cutflip');
  });

  describe('a private project (section 9)', () => {
    // The same string as it would appear inside a JSON document, so escaping cannot hide it.
    const asJson = (value: string): string => JSON.stringify(value).slice(1, -1);

    it('has failure text, full SHAs and run URLs to hide: the positive control', async () => {
      const { failureTexts, projectId } = of('private');
      expect(failureTexts.length).toBeGreaterThan(0);
      const runs = unwrap(
        await admin.from('runs').select('commit_sha, run_url').eq('project_id', projectId),
        'secret runs',
      );
      expect(runs.every((row) => /^[0-9a-f]{40}$/.test(String(row.commit_sha)))).toBe(true);
      expect(runs.every((row) => String(row.run_url).startsWith('https://'))).toBe(true);
    });

    it('returns none of it to anon from any aggregate', async () => {
      const { projectId, failureTexts, shas, runUrls } = of('private');
      const runIds = unwrap(
        await admin.from('runs').select('id').eq('project_id', projectId),
        'secret run ids',
      ).map((row) => String(row.id));
      const testIds = unwrap(
        await admin.from('tests').select('id').eq('project_id', projectId),
        'secret test ids',
      ).map((row) => String(row.id));
      const window = {
        p_project_id: projectId,
        p_since: windowStart(NOW, 30).toISOString(),
        p_until: NOW.toISOString(),
      };
      const answers = [
        await anon.rpc('run_test_tallies', { p_run_ids: runIds }),
        await anon.rpc('run_report_counts', { p_run_ids: runIds }),
        await anon.rpc('flaky_tests', window),
        await anon.rpc('flaky_failures', { ...window, p_test_ids: testIds }),
      ].map((answer) => unwrap(answer, 'anon aggregate'));
      for (const answer of answers) expect(answer.length).toBeGreaterThan(0);
      const serialized = JSON.stringify(answers);
      for (const hidden of [...failureTexts, ...shas, ...runUrls]) {
        expect(serialized).not.toContain(asJson(hidden));
      }
    });
  });
});
