import { readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ReportMetaSchema } from '../ingest/meta.ts';
import { normalizeReport } from '../ingest/normalize.ts';
import { parseJunit } from '../parsers/index.ts';
import { loadProjectFile, projectFilePath } from '../projects/files.ts';
import { addProject } from '../projects/repo.ts';
import { createSeedClient } from '../seed/local.ts';
import { placeReport } from '../seed/plan.ts';
import { createPublicClient } from '../supabase/public.ts';
import { readDataVersion } from './data-version.ts';
import { loadLanding } from './landing.ts';

// The data version every cached public read is keyed by (decision 2026-11-17), read as anon
// against local Supabase: a new report changes it, a re-posted report changes it, deleting a
// project changes it, and reading does not. Reports are written through ingest_report, as the
// route, the seed and the e2e writers all write them.

const SLUG = 'version-public';
const FIXTURE = 'fixtures/testpulse/junit/playwright-one-failure.xml';
const STARTED = new Date('2026-10-05T11:00:00.000Z');

const admin = createSeedClient(process.env, 'the data version integration test');
const anon = createPublicClient();

async function removeProject(): Promise<void> {
  const { error } = await admin.from('projects').delete().eq('slug', SLUG);
  if (error) throw new Error(`delete ${SLUG}: ${error.code} ${error.message}`);
}

async function ingest(ciRunId: string): Promise<void> {
  const found = await admin
    .from('projects')
    .select('id, layer_rules, name_normalization')
    .eq('slug', SLUG)
    .single();
  if (found.error) throw new Error(`look up ${SLUG}: ${found.error.message}`);
  const meta = ReportMetaSchema.parse({
    ci_run_id: ciRunId,
    job: 'e2e',
    module: 'e2e',
    platform: 'chromium',
    commit_sha: 'abcdef0123456789abcdef0123456789abcdef01',
    branch: 'main',
    event: 'push',
  });
  const report = parseJunit([readFileSync(FIXTURE, 'utf8')]);
  const payload = placeReport(
    normalizeReport(meta, found.data, { format: 'junit', report }, [], STARTED),
    STARTED,
  );
  const { error } = await admin.rpc('ingest_report', { payload });
  if (error) throw new Error(`ingest_report ${ciRunId}: ${error.code} ${error.message}`);
}

beforeAll(async () => {
  await removeProject();
  await addProject(admin, { ...loadProjectFile(projectFilePath('testpulse')), slug: SLUG });
});

afterAll(removeProject);

describe('the data version, read as anon', () => {
  it('is how many reports there are and when the newest was written', async () => {
    const version = await readDataVersion(anon);
    const { count } = await admin.from('reports').select('id', { count: 'exact', head: true });

    expect(version).toMatch(/^\d+:\d{4}-\d{2}-\d{2}T[\d:.]+\+00:00$/);
    expect(version.split(':')[0]).toBe(String(count));
  });

  it('does not change when pages read', async () => {
    const before = await readDataVersion(anon);
    await loadLanding(anon, new Date('2026-10-05T12:00:00.000Z'));

    expect(await readDataVersion(anon)).toBe(before);
  });

  it('changes when a report arrives', async () => {
    const before = await readDataVersion(anon);
    await ingest('version-1');

    const after = await readDataVersion(anon);
    expect(after).not.toBe(before);
    expect(Number(after.split(':')[0])).toBe(Number(before.split(':')[0]) + 1);
  });

  it('changes when a report is posted again, replacing the one before', async () => {
    const before = await readDataVersion(anon);
    await ingest('version-1');

    const after = await readDataVersion(anon);
    expect(after).not.toBe(before);
    expect(after.split(':')[0]).toBe(before.split(':')[0]);
  });

  it('changes when a project and its reports are deleted', async () => {
    await ingest('version-2');
    const before = await readDataVersion(anon);
    await removeProject();

    const after = await readDataVersion(anon);
    expect(after).not.toBe(before);
    expect(Number(after.split(':')[0])).toBe(Number(before.split(':')[0]) - 2);
  });
});
