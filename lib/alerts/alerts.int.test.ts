import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createClient, type PostgrestSingleResponse } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { POST } from '../../app/api/v1/reports/route.ts';
import { readIntegrationEnv } from '../../tests/int/env.ts';
import { toOstomate2BackfillRuns } from '../backfill/ostomate2-history.ts';
import { type CoverageInput, normalizeReport } from '../ingest/normalize.ts';
import { parseIstanbulSummary, parseJacoco, parseJunit } from '../parsers/index.ts';
import { addProject } from '../projects/repo.ts';
import { parseProjectFile } from '../projects/schema.ts';
import { loadSummaryInput, PROJECT_COLUMNS, ProjectRowSchema } from '../queries/project-summary.ts';
import { projectHealth } from '../stats/health.ts';
import { createPublicClient } from '../supabase/public.ts';
import { createSecretClient } from '../supabase/server.ts';
import { acknowledgeAlert, checkStale } from './rpc.ts';
import { type Alert, AlertSchema } from './schema.ts';

// Spec section 12, Phase 6 criterion 1: each alert opens and resolves under its defined
// conditions. Reports go through ingest_report as the route sends them (normalizeReport over real
// fixtures), with the receipt time passed in so each step's order and the stale boundary are
// exact; one count_drop step goes through POST /api/v1/reports itself. A smaller report is a
// subset of a real report's files: Gradle writes one file per test class.

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const fixture = (path: string): string => readFileSync(`${repoRoot}fixtures/${path}`, 'utf8');
const shared = (testClass: string): string =>
  fixture(`ostomate2/junit/jvm/shared/TEST-com.ostomate.app.${testClass}.xml`);

// Test counts per file: 4, 6, 1, 7 (fixtures/README.md: 82 tests in the 10 shared files).
const CHANGE_SOURCE = shared('data.ChangeSourceTest');
const DIAGNOSTIC_LOG = shared('data.diagnostics.DiagnosticLogTest');
const MIGRATION = shared('data.db.MigrationTest');
const CALENDAR = shared('domain.CalendarAggregatorTest');
const TEN = [CHANGE_SOURCE, DIAGNOSTIC_LOG];
const EIGHT = [MIGRATION, CALENDAR];
const SEVEN = [CALENDAR];
const FOUR = [CHANGE_SOURCE];
const ONE = [MIGRATION];

// Lines 457 of 490 (93.265…%), 497 of 527 (94.307…%), and 102 of 102 (100%).
const JACOCO_SHARED: CoverageInput = {
  format: 'jacoco',
  coverage: parseJacoco(fixture('ostomate2/jacoco/shared.xml')),
};
const JACOCO_COMPOSE_APP: CoverageInput = {
  format: 'jacoco',
  coverage: parseJacoco(fixture('ostomate2/jacoco/composeApp.xml')),
};
const ISTANBUL_FULL: CoverageInput = {
  format: 'istanbul',
  coverage: parseIstanbulSummary(fixture('routeserve/istanbul/shared.json')),
};

const historyRun = (() => {
  const [first] = toOstomate2BackfillRuns(
    JSON.parse(fixture('ostomate2/history/history.json')),
    'main',
  );
  if (first === undefined) throw new Error('the history fixture has no main run');
  return first;
})();

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const at = (base: string, offsetMs: number): Date => new Date(Date.parse(base) + offsetMs);
const PERMISSION_DENIED = '42501';

function unwrap<T>(result: PostgrestSingleResponse<T>, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.code} ${result.error.message}`);
  return result.data;
}

describe('integrity alerts (spec section 12)', () => {
  const env = readIntegrationEnv();
  const admin = createSecretClient(process.env);
  const anon = createClient(env.url, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const suffix = randomUUID().slice(0, 8);
  const ostomate2 = parseProjectFile(
    readFileSync(`${repoRoot}projects/ostomate2.yaml`, 'utf8'),
    'projects/ostomate2.yaml',
  );

  const register = async (
    name: string,
    floors: Record<string, number> = {},
  ): Promise<{ id: string; slug: string; key: string }> => {
    const slug = `alerts-${name}-${suffix}`;
    const key = await addProject(admin, { ...ostomate2, slug, coverage_floors: floors });
    const row = unwrap(
      await admin.from('projects').select('id').eq('slug', slug).single(),
      'select project',
    );
    return { id: row.id as string, slug, key };
  };

  interface Report {
    readonly ciRunId: string;
    readonly receivedAt: Date;
    readonly files: readonly string[];
    readonly branch?: string;
    readonly event?: 'push' | 'pull_request' | 'schedule';
    readonly module?: string;
    readonly coverage?: readonly CoverageInput[];
  }

  const ingest = async (projectId: string, report: Report) => {
    const payload = normalizeReport(
      {
        ci_run_id: `${suffix}-${report.ciRunId}`,
        run_attempt: 1,
        job: 'android',
        module: report.module ?? 'shared',
        platform: 'jvm',
        commit_sha: '2ec580f377e52f0a1ae584661ff09b07821ea1e2',
        branch: report.branch ?? 'main',
        event: report.event ?? 'push',
      },
      { id: projectId, layer_rules: [{ default: 'unit' }], name_normalization: {} },
      { format: 'junit', report: parseJunit(report.files) },
      report.coverage ?? [],
      report.receivedAt,
    );
    const result = await admin.rpc('ingest_report', { payload });
    if (result.error) throw new Error(`ingest_report: ${result.error.message}`);
    return result.data as { run_id: string; report_id: string };
  };

  const backfill = async (projectId: string, finishedAt: Date) => {
    const result = await admin.rpc('backfill_run', {
      payload: {
        project_id: projectId,
        ...historyRun,
        started_at: finishedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
      },
    });
    if (result.error) throw new Error(`backfill_run: ${result.error.message}`);
    expect(result.data).toMatchObject({ inserted: true });
  };

  // Every alert a test reads is parsed with the schema that defines its detail (lib/alerts).
  const alertsOf = async (projectId: string, kind: Alert['kind']): Promise<Alert[]> => {
    const rows: unknown[] = unwrap(
      await admin
        .from('alerts')
        .select('id, project_id, kind, detail, opened_at, resolved_at, acknowledged_at')
        .eq('project_id', projectId)
        .eq('kind', kind)
        .order('opened_at'),
      'select alerts',
    );
    return rows.map((row) => AlertSchema.parse(row));
  };
  const openOf = async (projectId: string, kind: Alert['kind']) =>
    (await alertsOf(projectId, kind)).filter((alert) => alert.resolved_at === null);

  const runId = async (projectId: string, ciRunId: string): Promise<string> =>
    unwrap(
      await admin
        .from('runs')
        .select('id')
        .eq('project_id', projectId)
        .eq('ci_run_id', `${suffix}-${ciRunId}`)
        .single(),
      'select run',
    ).id as string;

  const iso = (value: string | null): string | null =>
    value === null ? null : new Date(value).toISOString();

  afterAll(async () => {
    unwrap(
      await admin.from('projects').delete().like('slug', `alerts-%-${suffix}`),
      'cleanup projects',
    );
  });

  describe('stale', () => {
    // Before any other test's data, so check_stale's p_now sees only this file's reports:
    // a project whose runs all finished after p_now has not reported as of p_now (section 11).
    const LAST = '2001-02-03T04:05:06.789Z';
    const flips = at(LAST, 9 * DAY_MS);
    let project: { id: string; slug: string };

    // The public health rule, read exactly as the project page reads it, at the same instant.
    const publicHealth = async (now: Date) => {
      const publicClient = createPublicClient(process.env);
      const row = unwrap(
        await publicClient
          .from('projects_public')
          .select(PROJECT_COLUMNS)
          .eq('id', project.id)
          .single(),
        'select projects_public',
      );
      const summaryProject = ProjectRowSchema.parse(row);
      const input = await loadSummaryInput(publicClient, summaryProject, now);
      return projectHealth({
        lastReportAt: input.lastReportAt,
        expectedCadenceDays: summaryProject.expectedCadenceDays,
        latestRun: null,
        coverage: [],
        now,
      });
    };

    beforeAll(async () => {
      project = await register('stale');
      // A pull request run is a report (section 11): the last one decides, on any branch.
      await ingest(project.id, {
        ciRunId: 'st-main',
        receivedAt: at(LAST, -2 * DAY_MS),
        files: ONE,
      });
      await ingest(project.id, {
        ciRunId: 'st-pr',
        receivedAt: new Date(LAST),
        files: ONE,
        branch: 'feature/stale',
        event: 'pull_request',
      });
    });

    it('opens nothing 1 ms before the instant the public health marker turns stale', async () => {
      const before = at(flips.toISOString(), -1);
      expect((await publicHealth(before)).problems).not.toContain('stale');

      expect(await checkStale(admin, before)).toBe(0);
      expect(await alertsOf(project.id, 'stale')).toEqual([]);
    });

    it('opens one alert at that instant, as the health marker turns stale', async () => {
      const health = await publicHealth(flips);
      expect(health.problems).toContain('stale');
      expect(health.daysSinceLastReport).toBe(9);

      expect(await checkStale(admin, flips)).toBe(1);
      const alerts = await alertsOf(project.id, 'stale');
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatchObject({ resolved_at: null, acknowledged_at: null });
      expect(iso(alerts[0]?.opened_at ?? null)).toBe(flips.toISOString());
      expect(alerts[0]?.detail).toMatchObject({ expected_cadence_days: 8 });
      expect(iso((alerts[0]?.detail as { last_report_at: string }).last_report_at)).toBe(LAST);
    });

    it('never opens a second while one is open', async () => {
      expect(await checkStale(admin, at(LAST, 10 * DAY_MS))).toBe(0);
      expect(await openOf(project.id, 'stale')).toHaveLength(1);
    });

    it('does not count imported history as a report, so a backfill neither resolves nor resets it', async () => {
      await backfill(project.id, at(LAST, 9 * DAY_MS + HOUR_MS));
      expect((await publicHealth(at(LAST, 11 * DAY_MS))).problems).toContain('stale');

      expect(await checkStale(admin, at(LAST, 11 * DAY_MS))).toBe(0);
      const open = await openOf(project.id, 'stale');
      expect(open).toHaveLength(1);
      expect(iso((open[0]?.detail as { last_report_at: string }).last_report_at)).toBe(LAST);
    });

    it('resolves when the next report arrives, on any branch', async () => {
      const arrival = at(LAST, 12 * DAY_MS);
      await ingest(project.id, {
        ciRunId: 'st-next',
        receivedAt: arrival,
        files: ONE,
        branch: 'feature/back',
        event: 'pull_request',
      });

      const alerts = await alertsOf(project.id, 'stale');
      expect(alerts).toHaveLength(1);
      expect(iso(alerts[0]?.resolved_at ?? null)).toBe(arrival.toISOString());
      expect(alerts[0]?.acknowledged_at).toBeNull();
    });

    it('opens nothing for a project that has not reported as of now', async () => {
      const silent = await register('stale-silent');
      // Its only report is after p_now, so as of p_now it has never reported.
      await ingest(silent.id, {
        ciRunId: 'st-later',
        receivedAt: at(LAST, 30 * DAY_MS),
        files: ONE,
      });

      await checkStale(admin, at(LAST, 20 * DAY_MS));
      expect(await alertsOf(silent.id, 'stale')).toEqual([]);
    });

    it('reads the last report at or before now, as the health rule does', async () => {
      const later = await register('stale-later');
      await ingest(later.id, { ciRunId: 'st-a', receivedAt: at(LAST, 40 * DAY_MS), files: ONE });
      await ingest(later.id, { ciRunId: 'st-b', receivedAt: at(LAST, 60 * DAY_MS), files: ONE });

      // At day 49 the day-60 report has not happened yet: 9 days since day 40.
      await checkStale(admin, at(LAST, 49 * DAY_MS));
      const [alert] = await alertsOf(later.id, 'stale');
      expect(iso((alert?.detail as { last_report_at: string }).last_report_at)).toBe(
        at(LAST, 40 * DAY_MS).toISOString(),
      );
    });
  });

  describe('count_drop', () => {
    const T0 = '2026-09-01T00:00:00.000Z';
    const step = (n: number): Date => at(T0, n * HOUR_MS);
    let project: { id: string; key: string };

    beforeAll(async () => {
      project = await register('count');
    });

    it('never opens on the first report for a key', async () => {
      await ingest(project.id, { ciRunId: 'cd-1', receivedAt: step(1), files: TEN });
      expect(await alertsOf(project.id, 'count_drop')).toEqual([]);
    });

    it('does not open on a drop of exactly 20% (10 to 8)', async () => {
      await ingest(project.id, { ciRunId: 'cd-2', receivedAt: step(2), files: EIGHT });
      expect(await alertsOf(project.id, 'count_drop')).toEqual([]);
    });

    it('ignores other branches and imported history as the previous run', async () => {
      await ingest(project.id, { ciRunId: 'cd-3', receivedAt: step(3), files: TEN });
      // Neither of these opens an alert, nor becomes the baseline the next report is compared with.
      await ingest(project.id, {
        ciRunId: 'cd-4',
        receivedAt: step(4),
        files: ONE,
        branch: 'feature/smaller',
      });
      await backfill(project.id, step(5));
      expect(await alertsOf(project.id, 'count_drop')).toEqual([]);
    });

    it('opens on a drop of more than 20% versus the previous default-branch CI run (10 to 7)', async () => {
      await ingest(project.id, { ciRunId: 'cd-6', receivedAt: step(6), files: SEVEN });

      const alerts = await alertsOf(project.id, 'count_drop');
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatchObject({ resolved_at: null, acknowledged_at: null });
      expect(iso(alerts[0]?.opened_at ?? null)).toBe(step(6).toISOString());
      expect(alerts[0]?.detail).toEqual({
        job: 'android',
        module: 'shared',
        platform: 'jvm',
        baseline: 10,
        current: 7,
        baseline_run_id: await runId(project.id, 'cd-3'),
        run_id: await runId(project.id, 'cd-6'),
      });
    });

    it('does not open a second when the same report is re-posted', async () => {
      await ingest(project.id, { ciRunId: 'cd-6', receivedAt: step(6.5), files: SEVEN });
      expect(await alertsOf(project.id, 'count_drop')).toHaveLength(1);
    });

    it('re-points the open alert at a later report still under 80% of its baseline', async () => {
      // 4 is a drop from 7 as well; the alert keeps the count it first dropped from.
      await ingest(project.id, { ciRunId: 'cd-7', receivedAt: step(7), files: FOUR });
      // A key the previous run did not report has nothing to drop from.
      await ingest(project.id, {
        ciRunId: 'cd-7',
        receivedAt: step(7),
        files: ONE,
        module: 'composeApp',
      });
      await ingest(project.id, { ciRunId: 'cd-8', receivedAt: step(8), files: SEVEN });

      const alerts = await alertsOf(project.id, 'count_drop');
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.resolved_at).toBeNull();
      expect(alerts[0]?.detail).toMatchObject({
        module: 'shared',
        baseline: 10,
        current: 7,
        baseline_run_id: await runId(project.id, 'cd-3'),
        run_id: await runId(project.id, 'cd-8'),
      });
    });

    it('ignores a smaller report on another branch while open', async () => {
      await ingest(project.id, {
        ciRunId: 'cd-9',
        receivedAt: step(9),
        files: ONE,
        branch: 'feature/smaller',
      });
      const [alert] = await alertsOf(project.id, 'count_drop');
      expect(alert?.detail).toMatchObject({ current: 7, run_id: await runId(project.id, 'cd-8') });
    });

    it('resolves when a default-branch report reaches exactly 80% of the baseline (8 of 10)', async () => {
      await ingest(project.id, { ciRunId: 'cd-10', receivedAt: step(10), files: EIGHT });

      const alerts = await alertsOf(project.id, 'count_drop');
      expect(alerts).toHaveLength(1);
      expect(iso(alerts[0]?.resolved_at ?? null)).toBe(step(10).toISOString());
      expect(alerts[0]?.acknowledged_at).toBeNull();
    });

    describe('acknowledge_alert', () => {
      let alertId: string;

      it('opens a new alert on a later drop (8 to 4)', async () => {
        await ingest(project.id, { ciRunId: 'cd-11', receivedAt: step(11), files: FOUR });
        const open = await openOf(project.id, 'count_drop');
        expect(open).toHaveLength(1);
        expect(open[0]?.detail).toMatchObject({
          baseline: 8,
          current: 4,
          baseline_run_id: await runId(project.id, 'cd-10'),
        });
        alertId = open[0]?.id ?? '';
      });

      it('acknowledges it: acknowledged and resolved at the given instant', async () => {
        await acknowledgeAlert(admin, alertId, step(12));

        const alert = (await alertsOf(project.id, 'count_drop')).find((a) => a.id === alertId);
        expect(iso(alert?.acknowledged_at ?? null)).toBe(step(12).toISOString());
        expect(iso(alert?.resolved_at ?? null)).toBe(step(12).toISOString());
      });

      it('refuses an alert that is already resolved', async () => {
        await expect(acknowledgeAlert(admin, alertId, step(13))).rejects.toThrow(
          `acknowledge_alert: alert ${alertId} is already resolved`,
        );
        const alert = (await alertsOf(project.id, 'count_drop')).find((a) => a.id === alertId);
        expect(iso(alert?.acknowledged_at ?? null)).toBe(step(12).toISOString());
      });

      it('refuses an alert that does not exist', async () => {
        const missing = randomUUID();
        await expect(acknowledgeAlert(admin, missing, step(13))).rejects.toThrow(
          `acknowledge_alert: alert ${missing} does not exist`,
        );
      });

      it.each(['stale', 'empty_run', 'coverage_below_floor'] as const)(
        'refuses a %s alert, which resolves only by itself',
        async (kind) => {
          const row = unwrap(
            await admin
              .from('alerts')
              .insert({
                project_id: project.id,
                kind,
                detail: {},
                opened_at: step(13).toISOString(),
              })
              .select('id')
              .single(),
            'insert alert',
          );
          await expect(acknowledgeAlert(admin, row.id as string, step(14))).rejects.toThrow(
            `acknowledge_alert: alert ${row.id as string} is ${kind}, and only count_drop can be acknowledged`,
          );
          const after = unwrap(
            await admin
              .from('alerts')
              .select('resolved_at, acknowledged_at')
              .eq('id', row.id as string)
              .single(),
            'select alert',
          );
          expect(after).toEqual({ resolved_at: null, acknowledged_at: null });
          unwrap(
            await admin
              .from('alerts')
              .delete()
              .eq('id', row.id as string),
            'delete alert',
          );
        },
      );

      it('does not reopen after acknowledging while the count holds', async () => {
        await ingest(project.id, { ciRunId: 'cd-12', receivedAt: step(15), files: FOUR });
        expect(await openOf(project.id, 'count_drop')).toEqual([]);
      });
    });

    it('opens through POST /api/v1/reports, from the route to the database', async () => {
      // The route dates the report by its own clock, which is after every step above.
      const form = new FormData();
      form.append(
        'meta',
        JSON.stringify({
          ci_run_id: `${suffix}-cd-post`,
          job: 'android',
          module: 'shared',
          platform: 'jvm',
          commit_sha: '2ec580f377e52f0a1ae584661ff09b07821ea1e2',
          branch: 'main',
          event: 'push',
        }),
      );
      form.append('junit', new Blob([MIGRATION]), 'junit-1');
      const response = await POST(
        new Request('http://testpulse.local/api/v1/reports', {
          method: 'POST',
          body: form,
          headers: { authorization: `Bearer ${project.key}` },
        }),
      );
      expect(response.status).toBe(201);

      const open = await openOf(project.id, 'count_drop');
      expect(open).toHaveLength(1);
      expect(open[0]?.detail).toMatchObject({
        baseline: 4,
        current: 1,
        baseline_run_id: await runId(project.id, 'cd-12'),
        run_id: await runId(project.id, 'cd-post'),
      });
    });
  });

  describe('coverage_below_floor', () => {
    const T0 = '2026-09-02T00:00:00.000Z';
    const step = (n: number): Date => at(T0, n * HOUR_MS);
    let project: { id: string };

    beforeAll(async () => {
      project = await register('coverage', { shared: 100 });
    });

    it('opens when a default-branch report carries a module under its floor (93.26% < 100%)', async () => {
      const { report_id } = await ingest(project.id, {
        ciRunId: 'cov-1',
        receivedAt: step(1),
        files: ONE,
        coverage: [JACOCO_SHARED],
      });

      const alerts = await alertsOf(project.id, 'coverage_below_floor');
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatchObject({ resolved_at: null, acknowledged_at: null });
      expect(iso(alerts[0]?.opened_at ?? null)).toBe(step(1).toISOString());
      expect(alerts[0]?.detail).toEqual({
        module: 'shared',
        floor: 100,
        lines_pct: 93.26,
        report_id,
      });
    });

    it('re-points the open alert at the next report still under the floor', async () => {
      const { report_id } = await ingest(project.id, {
        ciRunId: 'cov-2',
        receivedAt: step(2),
        files: ONE,
        coverage: [JACOCO_COMPOSE_APP],
      });

      const alerts = await alertsOf(project.id, 'coverage_below_floor');
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.resolved_at).toBeNull();
      expect(alerts[0]?.detail).toEqual({
        module: 'shared',
        floor: 100,
        lines_pct: 94.3,
        report_id,
      });
    });

    it('ignores other branches, imported history and modules without a floor', async () => {
      await ingest(project.id, {
        ciRunId: 'cov-3',
        receivedAt: step(3),
        files: ONE,
        branch: 'feature/covered',
        coverage: [ISTANBUL_FULL],
      });
      await backfill(project.id, step(4));
      await ingest(project.id, {
        ciRunId: 'cov-5',
        receivedAt: step(5),
        files: ONE,
        module: 'composeApp',
        coverage: [JACOCO_COMPOSE_APP],
      });

      const alerts = await alertsOf(project.id, 'coverage_below_floor');
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.resolved_at).toBeNull();
      expect(alerts[0]?.detail).toMatchObject({ module: 'shared', lines_pct: 94.3 });
    });

    it('leaves the alert alone for a default-branch report without coverage', async () => {
      await ingest(project.id, { ciRunId: 'cov-6', receivedAt: step(6), files: ONE });
      expect(await openOf(project.id, 'coverage_below_floor')).toHaveLength(1);
    });

    it('resolves when the next default-branch report is at the floor (100% of 100%)', async () => {
      await ingest(project.id, {
        ciRunId: 'cov-7',
        receivedAt: step(7),
        files: ONE,
        coverage: [ISTANBUL_FULL],
      });

      const alerts = await alertsOf(project.id, 'coverage_below_floor');
      expect(alerts).toHaveLength(1);
      expect(iso(alerts[0]?.resolved_at ?? null)).toBe(step(7).toISOString());
    });
  });

  describe('access (spec section 9)', () => {
    it('refuses anon a stale check', async () => {
      const result = await anon.rpc('check_stale', { p_now: new Date().toISOString() });
      expect(result.error?.code).toBe(PERMISSION_DENIED);
    });

    it('refuses anon an acknowledgement', async () => {
      const result = await anon.rpc('acknowledge_alert', {
        p_alert_id: randomUUID(),
        p_now: new Date().toISOString(),
      });
      expect(result.error?.code).toBe(PERMISSION_DENIED);
    });

    it('refuses anon the alerts table, the new column included', async () => {
      const result = await anon.from('alerts').select('id, acknowledged_at').limit(1);
      expect(result.error?.code).toBe(PERMISSION_DENIED);
      expect(result.data).toBeNull();
    });
  });
});
