import { readFileSync } from 'node:fs';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RunResults } from '../../components/RunResults/RunResults.tsx';
import { ReportMetaSchema } from '../ingest/meta.ts';
import { normalizeReport } from '../ingest/normalize.ts';
import { runPageView } from '../pages/run.ts';
import { parseJestJson } from '../parsers/index.ts';
import { loadProjectFile, projectFilePath } from '../projects/files.ts';
import { addProject } from '../projects/repo.ts';
import { loadRunDetail } from '../queries/run.ts';
import { createSeedClient } from '../seed/local.ts';
import { placeReport } from '../seed/plan.ts';
import { createPublicClient } from '../supabase/public.ts';

// Design v8 item 18 and v9 item 12 (decision 2026-10-01): a private project's run page shows a
// failing test's heads, "{platform} · {status} · {time}", since section 9 hides only failure text,
// full SHAs and links. No seeded run fails on two platforms, so this test writes one: the captured
// routeserve failure, reported twice in one run under platforms "node" and "node-24", into a
// private project of its own made from routeserve's file. Read through the publishable-key
// client, as the page reads it, the view and its rendered HTML hold the heads and none of the
// hidden values; read with the secret key, the database holds every one of them, so the absence
// is row-level security and the views, not a missing write.

const SLUG = 'heads-private';
const NOW = new Date('2026-10-05T12:00:00.000Z');
const STARTED = new Date('2026-10-05T11:00:00.000Z');
const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const RUN_URL = 'https://github.com/bhelco1/routeserve/actions/runs/990000001';
const FIXTURE = 'fixtures/routeserve/jest/shared-one-failure.json';
const PLATFORMS = [
  { job: 'test', platform: 'node' },
  { job: 'test-next', platform: 'node-24' },
] as const;

const admin = createSeedClient(process.env, 'the private heads integration test');

async function removeProject(): Promise<void> {
  const { error } = await admin.from('projects').delete().eq('slug', SLUG);
  if (error) throw new Error(`delete ${SLUG}: ${error.code} ${error.message}`);
}

let runId = '';

beforeAll(async () => {
  await removeProject();
  await addProject(admin, { ...loadProjectFile(projectFilePath('routeserve')), slug: SLUG });
  const found = await admin
    .from('projects')
    .select('id, layer_rules, name_normalization')
    .eq('slug', SLUG)
    .single();
  if (found.error) throw new Error(`look up ${SLUG}: ${found.error.message}`);
  const parsed = parseJestJson(readFileSync(FIXTURE, 'utf8'), {
    pathPrefix: '/home/runner/work/routeserve/routeserve/',
  });
  for (const { job, platform } of PLATFORMS) {
    const meta = ReportMetaSchema.parse({
      ci_run_id: '990000001',
      job,
      module: 'packages/shared',
      platform,
      commit_sha: SHA,
      branch: 'main',
      event: 'push',
      run_url: RUN_URL,
    });
    const payload = placeReport(
      normalizeReport(meta, found.data, { format: 'jest-json', report: parsed }, [], STARTED),
      STARTED,
    );
    const { data, error } = await admin.rpc('ingest_report', { payload });
    if (error) throw new Error(`ingest_report ${platform}: ${error.code} ${error.message}`);
    runId = (data as { run_id: string }).run_id;
  }
});

afterAll(removeProject);

describe('a private run that failed on two platforms, read as anon', () => {
  it('holds the hidden values in the database (positive control, secret key)', async () => {
    const run = await admin.from('runs').select('commit_sha, run_url').eq('id', runId).single();
    expect(run.data).toEqual({ commit_sha: SHA, run_url: RUN_URL });
    const failures = await admin
      .from('result_failures')
      .select('message, results!inner(reports!inner(run_id))')
      .eq('results.reports.run_id', runId);
    expect(failures.data).toHaveLength(2);
  });

  it('shows a head per failing platform, and no failure text, full SHA or run URL', async () => {
    const failures = await admin
      .from('result_failures')
      .select('message, detail, results!inner(reports!inner(run_id))')
      .eq('results.reports.run_id', runId);
    const hidden = [
      SHA,
      RUN_URL,
      'github.com/bhelco1/routeserve',
      ...(failures.data ?? []).flatMap(({ message, detail }) =>
        `${String(message)}\n${String(detail)}`
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length >= 12),
      ),
    ];
    expect(hidden.length).toBeGreaterThan(3);

    const detail = await loadRunDetail(SLUG, runId, createPublicClient(), NOW);
    if (detail === null) throw new Error('the run was not found as anon');
    const view = runPageView(detail, NOW);
    const rows = view.results.kind === 'rows' ? view.results.rows : [];
    const failing = rows.find((row) => row.status === 'failed');
    expect(failing?.failures).toEqual([
      expect.objectContaining({ platform: 'node', status: 'failed', message: null, detail: null }),
      expect.objectContaining({
        platform: 'node-24',
        status: 'failed',
        message: null,
        detail: null,
      }),
    ]);

    const html = renderToStaticMarkup(createElement(RunResults, { results: view.results }));
    expect(html).toMatch(/node · Failed · \d+\.\d\d s/);
    expect(html).toMatch(/node-24 · Failed · \d+\.\d\d s/);
    expect(html.match(/Details hidden: private repository/g)).toHaveLength(1);

    const serialized = `${JSON.stringify(detail)}\n${JSON.stringify(view)}\n${html}`;
    for (const value of hidden) expect(serialized).not.toContain(value);
    expect(view.meta.commit.text).toBe(SHA.slice(0, 7));
  });
});
