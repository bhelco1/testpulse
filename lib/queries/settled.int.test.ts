import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { readIntegrationEnv } from '../../tests/int/env.ts';
import { ReportMetaSchema } from '../ingest/meta.ts';
import { normalizeReport } from '../ingest/normalize.ts';
import { parseJunit } from '../parsers/index.ts';
import { loadProjectFile, projectFilePath } from '../projects/files.ts';
import { addProject } from '../projects/repo.ts';
import { placeReport } from '../seed/plan.ts';
import { SETTLE_AFTER_MS } from '../stats/settled.ts';
import { createPublicClient } from '../supabase/public.ts';
import { loadLanding, type Landing } from './landing.ts';
import { loadProjectPage } from './project.ts';
import { loadSiteChrome } from './site.ts';

// Spec section 11, "Latest run" (decision 2026-11-19), against local Supabase and read as anon:
// a project's CI sends one run as several reports minutes apart, and the landing headline, the
// project's card, its project page and the site's project switcher keep the previous settled run
// until the new one has every report key of it, or until 45 minutes have passed since its first
// report. Reports go through ingest_report as the seed sends them (placeReport), each received at
// a planned instant, and every read passes its instant in. The project is private, copied from
// testpulse's file, so the read that tells which run is settled is shown to see nothing the views
// hide: its run rows arrive redacted, and its failure text never reaches the page data.

const env = readIntegrationEnv();
const admin = createClient(env.url, env.secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createPublicClient();

const suffix = randomUUID().slice(0, 8);
const slug = `settled-${suffix}`;

const MINUTE = 60_000;
// Other integration files date their runs before 2026-10-04 or around SEED_NOW; this one's are
// well after, so nothing else is newer at the instants it reads.
const T0 = Date.parse('2027-03-01T09:00:00.000Z');
const instant = (offsetMinutes: number) => new Date(T0 + offsetMinutes * MINUTE);

const FIXTURES = {
  unit: { job: 'checks', module: 'unit', file: 'vitest-unit.xml' },
  integration: { job: 'integration', module: 'integration', file: 'vitest-integration.xml' },
  e2e: { job: 'e2e', module: 'e2e', file: 'playwright-e2e.xml' },
  e2eFailing: { job: 'e2e', module: 'e2e', file: 'playwright-one-failure.xml' },
} as const;

const FAILURE_TEXT = 'expect(received).toBe(expected)';

const ProjectRowSchema = z.object({
  id: z.string(),
  layer_rules: z.unknown(),
  name_normalization: z.unknown(),
});
let project: z.output<typeof ProjectRowSchema>;

async function send(
  ciRunId: string,
  fixture: keyof typeof FIXTURES,
  startedAtMinutes: number,
): Promise<void> {
  const { job, module, file } = FIXTURES[fixture];
  const meta = ReportMetaSchema.parse({
    ci_run_id: `${slug}-${ciRunId}`,
    job,
    module,
    platform: job === 'e2e' ? 'chromium' : 'node',
    commit_sha: randomUUID().replace(/-/g, '') + '00000000',
    branch: 'main',
    event: 'push',
    run_url: `https://github.com/example/${slug}/actions/runs/${ciRunId}`,
  });
  const startedAt = instant(startedAtMinutes);
  const results = {
    format: 'junit' as const,
    report: parseJunit([readFileSync(`fixtures/testpulse/junit/${file}`, 'utf8')]),
  };
  const payload = placeReport(normalizeReport(meta, project, results, [], startedAt), startedAt);
  const { error } = await admin.rpc('ingest_report', { payload });
  if (error) throw new Error(`ingest_report: ${error.code} ${error.message}`);
}

/** When the run's first report was received, as stored. */
async function firstReceipt(ciRunId: string): Promise<Date> {
  const { data, error } = await admin
    .from('reports')
    .select('received_at, runs!inner(ci_run_id, project_id)')
    .eq('runs.project_id', project.id)
    .eq('runs.ci_run_id', `${slug}-${ciRunId}`)
    .order('received_at')
    .limit(1)
    .single();
  if (error) throw new Error(`first receipt: ${error.code} ${error.message}`);
  return new Date(z.object({ received_at: z.string() }).parse(data).received_at);
}

async function view(at: Date) {
  const landing: Landing = await loadLanding(anon, at);
  const card = landing.projects.find((entry) => entry.project.slug === slug);
  if (card === undefined) throw new Error('the project has no card');
  const page = await loadProjectPage(slug, {}, anon, at);
  const chrome = await loadSiteChrome(anon, at);
  return {
    landing,
    card,
    page,
    switcher: chrome.projects.find((entry) => entry.slug === slug),
    // The parts a visitor reads at a glance, which must hold still while a run arrives.
    shown: {
      headlineTotal: landing.headline.totalTests,
      headlinePassRate: landing.headline.passRate,
      // Projects passing's counts; its red durations move with the clock, as they should.
      projectsPassing: [
        landing.headline.projectsPassing.passing,
        landing.headline.projectsPassing.withRun,
      ],
      cardRed: card.timeToGreen.stillRed?.failedRunId ?? null,
      cardRun: card.latestRun?.id,
      cardStatus: card.latestRun?.status,
      cardTotal: card.totalTests,
      cardLayers: card.layers,
      cardReports: card.latestRunDetail?.reports.length,
      pageRun: page?.summary.latestRun?.id,
      pageReports: page?.latestRun?.reports.length,
      flakeDenominator: page?.flaky.totalTests,
      switcher: chrome.projects.find((entry) => entry.slug === slug),
    },
  };
}

const runIdOf = async (ciRunId: string): Promise<string> => {
  const { data, error } = await admin
    .from('runs')
    .select('id')
    .eq('project_id', project.id)
    .eq('ci_run_id', `${slug}-${ciRunId}`)
    .single();
  if (error) throw new Error(`run id: ${error.code} ${error.message}`);
  return z.object({ id: z.string() }).parse(data).id;
};

describe('the latest run while a run’s reports arrive, read as anon (decision 2026-11-19)', () => {
  beforeAll(async () => {
    const file = loadProjectFile(projectFilePath('testpulse'));
    await addProject(admin, { ...file, slug, name: `Settled ${suffix}`, visibility: 'private' });
    const { data, error } = await admin
      .from('projects')
      .select('id, layer_rules, name_normalization')
      .eq('slug', slug)
      .single();
    if (error) throw new Error(`look up ${slug}: ${error.code} ${error.message}`);
    project = ProjectRowSchema.parse(data);

    // r1, the first run: unit, integration and chromium e2e, whose captured file holds failures.
    // Each is received its tests' summed time after it starts: unit about 2 minutes,
    // integration 8 s, e2e 87 minutes, the failing e2e under 1 s.
    await send('r1', 'unit', -100);
    await send('r1', 'integration', -97);
    await send('r1', 'e2e', -90);
  }, 120_000);

  afterAll(async () => {
    const { error } = await admin.from('projects').delete().eq('slug', slug);
    if (error) throw new Error(`cleanup: ${error.code} ${error.message}`);
  });

  let settledOnR1: Awaited<ReturnType<typeof view>>['shown'];

  it('shows the first run once it has reported', async () => {
    const r1 = await runIdOf('r1');
    const { shown, card } = await view(instant(5));

    expect(shown).toMatchObject({
      cardRun: r1,
      cardStatus: 'failed',
      cardReports: 3,
      pageRun: r1,
      pageReports: 3,
      switcher: { status: 'failed', latestRunId: r1 },
    });
    // The captured files' distinct tests: 1,513 unit and 655 component, 180 integration, 235 e2e.
    expect(card.totalTests).toBe(2583);
    expect(shown.flakeDenominator).toBe(card.totalTests);
    settledOnR1 = shown;
  });

  it('keeps showing it while r2’s reports arrive: the headline and the card hold still', async () => {
    await send('r2', 'unit', 60);
    expect((await view(instant(63))).shown).toEqual(settledOnR1);

    await send('r2', 'integration', 64);
    const arriving = await view(instant(65));
    expect(arriving.shown).toEqual(settledOnR1);

    // The run list is out of scope: it lists r2 as it arrives.
    const r2 = await runIdOf('r2');
    expect(arriving.page?.runs.items[0]?.id).toBe(r2);
  });

  let settledOnR2: Awaited<ReturnType<typeof view>>['shown'];

  it('moves to r2 once its last expected report arrives', async () => {
    await send('r2', 'e2eFailing', 70);
    const r2 = await runIdOf('r2');
    const { shown, card } = await view(instant(71));

    // r2's e2e is the 3-test failing file in place of r1's passing suite.
    const e2eDelta = settledOnR1.cardTotal - card.totalTests;
    expect(e2eDelta).toBeGreaterThan(0);
    expect(shown).toMatchObject({
      cardRun: r2,
      cardStatus: 'failed',
      cardReports: 3,
      pageRun: r2,
      flakeDenominator: card.totalTests,
      switcher: { status: 'failed', latestRunId: r2 },
      headlineTotal: settledOnR1.headlineTotal - e2eDelta,
    });
    expect(card.latestRun?.failed).toBe(1);
    expect(card.timeToGreen.stillRed).not.toBeNull();
    settledOnR2 = shown;
  });

  it('keeps r2 while r3 is missing its e2e report, until 45 minutes after r3’s first report', async () => {
    await send('r3', 'unit', 120);
    await send('r3', 'integration', 122);
    const first = (await firstReceipt('r3')).getTime();

    const before = await view(new Date(first + SETTLE_AFTER_MS - 1));
    expect(before.shown).toEqual(settledOnR2);

    const r3 = await runIdOf('r3');
    const after = await view(new Date(first + SETTLE_AFTER_MS));
    // r3 has unit and integration only: its total drops by r2's 3 e2e tests, and it passed.
    expect(after.shown).toMatchObject({
      cardRun: r3,
      cardStatus: 'passed',
      cardReports: 2,
      pageRun: r3,
      flakeDenominator: after.card.totalTests,
      switcher: { status: 'passed', latestRunId: r3 },
      headlineTotal: settledOnR2.headlineTotal - 3,
    });
    expect(after.card.totalTests).toBe(settledOnR2.cardTotal - 3);
    expect(after.card.timeToGreen.stillRed).toBeNull();
  });

  it('shows the private project’s runs redacted and none of its failure text', async () => {
    // As of r2, the failing run on the card.
    const { landing, page, card } = await view(instant(71));

    expect(card.latestRun?.failed).toBe(1);
    expect(card.latestRunDetail?.failing).toHaveLength(1);
    expect(card.project.visibility).toBe('private');
    expect(card.latestRun?.commitSha).toHaveLength(7);
    expect(page?.runs.items.every((run) => run.runUrl === null)).toBe(true);
    expect(JSON.stringify({ landing, page })).not.toContain(FAILURE_TEXT);
  });
});
