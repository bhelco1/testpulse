import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { POST } from '../../app/api/v1/reports/route.ts';
import { readIntegrationEnv } from '../../tests/int/env.ts';
import { toOstomate2BackfillRuns } from '../backfill/ostomate2-history.ts';
import { findBackfillTarget, writeBackfill } from '../backfill/write.ts';
import { hashApiKey } from '../projects/keys.ts';
import { addProject } from '../projects/repo.ts';
import { parseProjectFile } from '../projects/schema.ts';
import { createSecretClient } from '../supabase/server.ts';
import { flakyTests } from './flaky.ts';
import { loadStatsInput, type StatsInput } from './load.ts';
import { countsTowardCiOnlyStats } from './rules.ts';
import { timeToGreen } from './time-to-green.ts';
import { coverageTrend, passRateTrend, runCountTrend } from './trends.ts';

// Spec section 17, Phase 4: "Trend queries include backfilled runs; flakiness and
// time-to-green exclude them." Real history, a real CI report, read back as the browser would.

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const fixture = (relativePath: string): string =>
  readFileSync(`${repoRoot}fixtures/${relativePath}`, 'utf8');
const sharedJunit = readdirSync(`${repoRoot}fixtures/ostomate2/junit/jvm/shared`)
  .filter((name) => name.endsWith('.xml'))
  .sort()
  .map((name) => fixture(`ostomate2/junit/jvm/shared/${name}`));
const sharedJacoco = fixture('ostomate2/jacoco/shared.xml');

// After every captured history entry (2026-07-13 to 2026-09-22) and the JUnit fixtures'
// timestamps (2026-09-21), and within 90 days of the first main entry.
const NOW = new Date('2026-10-01T00:00:00Z');
const SHARED_CI_LINES_PCT = (457 / 490) * 100;

describe('loadStatsInput over backfilled history and a CI run (spec section 17, Phase 4)', () => {
  const env = readIntegrationEnv();
  const admin = createSecretClient(process.env);
  const anon = createClient(env.url, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const suffix = randomUUID().slice(0, 8);
  const slug = `stats-public-${suffix}`;
  const ciRunId = `stats-${suffix}`;
  // Lives only in this variable and never appears in an assertion message.
  let key: string;
  let input: StatsInput;

  const postShared = async (meta: Record<string, unknown>): Promise<number> => {
    const form = new FormData();
    form.append('meta', JSON.stringify(meta));
    sharedJunit.forEach((text, index) => form.append('junit', new Blob([text]), `junit-${index}`));
    form.append('jacoco', new Blob([sharedJacoco]), 'jacoco.xml');
    const response = await POST(
      new Request('http://testpulse.local/api/v1/reports', {
        method: 'POST',
        body: form,
        headers: { authorization: `Bearer ${key}` },
      }),
    );
    return response.status;
  };

  beforeAll(async () => {
    const ostomate2 = parseProjectFile(
      readFileSync(`${repoRoot}projects/ostomate2.yaml`, 'utf8'),
      'projects/ostomate2.yaml',
    );
    expect(ostomate2.visibility).toBe('public');
    key = await addProject(admin, { ...ostomate2, slug });
    const target = await findBackfillTarget(admin, slug);

    const history: unknown = JSON.parse(fixture('ostomate2/history/history.json'));
    const summary = await writeBackfill(
      admin,
      target.id,
      toOstomate2BackfillRuns(history, target.defaultBranch),
    );
    expect(summary.inserted).toBe(13);

    const meta = {
      ci_run_id: ciRunId,
      job: 'android',
      module: 'shared',
      platform: 'jvm',
      commit_sha: '2ec580f377e52f0a1ae584661ff09b07821ea1e2',
      event: 'push',
    };
    expect(await postShared({ ...meta, branch: 'main' })).toBe(201);
    // A CI run off the default branch, which no stat here may read.
    expect(await postShared({ ...meta, ci_run_id: `${ciRunId}-pr`, branch: 'feature/x' })).toBe(
      201,
    );

    input = await loadStatsInput(anon, slug, NOW);
  });

  afterAll(async () => {
    const deleted = await admin.from('projects').delete().eq('slug', slug);
    if (deleted.error) throw new Error(`cleanup projects: ${deleted.error.message}`);
    if (key !== undefined) {
      const buckets = await admin
        .from('rate_limit_buckets')
        .delete()
        .eq('api_key_hash', hashApiKey(key));
      if (buckets.error) throw new Error(`cleanup rate_limit_buckets: ${buckets.error.message}`);
    }
  });

  it('loads, with the anon client, the 13 backfilled main runs and the main CI run only', () => {
    expect(input.defaultBranch).toBe('main');
    expect(input.runs).toHaveLength(14);
    expect(input.runs.every((run) => run.branch === 'main')).toBe(true);
    expect(input.runs.filter((run) => run.source === 'backfill')).toHaveLength(13);
    expect(input.runs.filter((run) => run.source === 'ci').map((run) => run.ciRunId)).toEqual([
      ciRunId,
    ]);
  });

  it('puts the backfilled runs and the CI run in every trend', () => {
    const options = { defaultBranch: input.defaultBranch, now: NOW, days: 90 } as const;

    const passRate = passRateTrend(input.runs, options);
    expect(passRate.runs).toHaveLength(14);
    expect(passRate.runs.filter((point) => point.source === 'backfill')).toHaveLength(13);
    expect(passRate.runs.filter((point) => point.source === 'ci')).toEqual([
      expect.objectContaining({ passed: 82, failed: 0, passRate: 1 }),
    ]);

    const counts = runCountTrend(input.runs, options);
    expect(counts.reduce((sum, day) => sum + day.runs, 0)).toBe(14);

    const coverage = coverageTrend(input.runs, input.coverage, options);
    expect(coverage.map((trend) => trend.module)).toEqual(['composeApp', 'shared']);
    const [composeApp, shared] = coverage;
    expect(composeApp?.points).toHaveLength(13);
    expect(composeApp?.points.every((p) => p.source === 'backfill' && p.form === 'pct')).toBe(true);
    expect(shared?.points).toHaveLength(14);
    expect(shared?.points.filter((p) => p.source === 'backfill' && p.form === 'pct')).toHaveLength(
      13,
    );
    expect(shared?.points.filter((p) => p.source === 'ci')).toEqual([
      expect.objectContaining({ form: 'counts', linesPct: SHARED_CI_LINES_PCT }),
    ]);
    // The first main entry of the history, read back as recorded.
    expect(shared?.points[0]).toMatchObject({ source: 'backfill', linesPct: 93.2 });
  });

  it('gives time-to-green and flakiness the CI run alone', () => {
    const ciOnly = input.runs.filter((run) => countsTowardCiOnlyStats(run, input.defaultBranch));
    expect(ciOnly.map((run) => run.ciRunId)).toEqual([ciRunId]);

    expect(timeToGreen(input.runs, { defaultBranch: input.defaultBranch, now: NOW })).toEqual({
      recoveries: [],
      medianMs: null,
      worstMs: null,
      stillRed: null,
    });

    const ciRun = ciOnly[0];
    expect(new Set(input.results.map((result) => result.runId))).toEqual(new Set([ciRun?.id]));
    // Flakiness compares a test with itself on one platform, so each result carries its report's.
    expect(new Set(input.results.map((result) => result.platform))).toEqual(new Set(['jvm']));
    expect(flakyTests(input.runs, input.results, { defaultBranch: 'main', now: NOW })).toEqual({
      flakyTestIds: [],
      totalTests: 82,
      flakeRate: 0,
    });
  });

  it('adds the latest CI run before the window for time to green, passing over newer backfilled runs', async () => {
    // The 90-day window from here opens on 2026-09-27: every run is older, and the newest of
    // them is the backfilled 2026-09-22 entry, not the 2026-09-21 CI run.
    const later = await loadStatsInput(anon, slug, new Date('2026-12-25T00:00:00Z'));
    expect(later.runs.map((run) => [run.ciRunId, run.source])).toEqual([[ciRunId, 'ci']]);
    expect(later.coverage).toEqual([]);
    expect(later.results).toEqual([]);
  });

  it('refuses a slug with no project', async () => {
    await expect(loadStatsInput(anon, `missing-${suffix}`, NOW)).rejects.toThrow(
      `project "missing-${suffix}" not found`,
    );
  });
});
