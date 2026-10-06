import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { normalizeReport } from '../ingest/normalize.ts';
import { parseJacoco, parseJunit } from '../parsers/index.ts';
import { loadProjectFile } from '../projects/files.ts';
import { placeReport, planSeed, SEED_NOW, SEED_SLUGS, type SeedRun } from './plan.ts';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const now = new Date(SEED_NOW);
const plan = planSeed(now);

const DAY_MS = 86_400_000;
const runsOf = (slug: string): SeedRun[] => plan.runs.filter((run) => run.slug === slug);
const startMs = (run: SeedRun): number => Date.parse(run.startedAt);
const lastOf = (slug: string): SeedRun => {
  const runs = runsOf(slug);
  const last = runs[runs.length - 1];
  if (last === undefined) throw new Error(`no runs for ${slug}`);
  return last;
};
const sources = (run: SeedRun): string[] =>
  run.reports.flatMap((report) => [
    report.results.source,
    ...(report.coverage === null ? [] : [report.coverage.source]),
  ]);
const failsShared = (run: SeedRun): boolean =>
  sources(run).includes('fixtures/routeserve/jest/shared-one-failure.json');

describe('SEED_NOW', () => {
  it('is one fixed UTC instant that the e2e harness can hand to TESTPULSE_FIXED_NOW', () => {
    expect(SEED_NOW).toBe(new Date(SEED_NOW).toISOString());
  });
});

describe('planSeed', () => {
  it('is deterministic', () => {
    expect(planSeed(new Date(SEED_NOW))).toEqual(plan);
  });

  it('derives every run time from now, so a later now moves every run by the same amount', () => {
    const later = planSeed(new Date(now.getTime() + 3 * DAY_MS));
    expect(later.now).toBe(new Date(now.getTime() + 3 * DAY_MS).toISOString());
    expect(later.runs.map((run) => startMs(run) - 3 * DAY_MS)).toEqual(plan.runs.map(startMs));
    expect(later.runs.map((run) => ({ ...run, startedAt: '' }))).toEqual(
      plan.runs.map((run) => ({ ...run, startedAt: '' })),
    );
  });

  it('seeds the three projects from their committed project files, public and private', () => {
    expect(plan.projects).toEqual([...SEED_SLUGS]);
    expect(SEED_SLUGS).toEqual(['ostomate2', 'routeserve', 'testpulse']);
    const visibility = plan.projects.map(
      (slug) => loadProjectFile(`${repoRoot}projects/${slug}.yaml`).visibility,
    );
    expect(visibility).toEqual(['public', 'private', 'public']);
  });

  it('imports the Ostomate2 dashboard history and nothing else through backfill', () => {
    expect(plan.backfill).toEqual([
      { slug: 'ostomate2', source: 'fixtures/ostomate2/history/history.json' },
    ]);
  });

  it('plans 9 Ostomate2 runs, 11 routeserve runs and 1 testpulse run, oldest first', () => {
    expect(runsOf('ostomate2')).toHaveLength(9);
    expect(runsOf('routeserve')).toHaveLength(11);
    expect(runsOf('testpulse')).toHaveLength(1);
    const starts = plan.runs.map(startMs);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('names only committed fixture files, read as they are', () => {
    const named = new Set(plan.runs.flatMap(sources));
    for (const source of named) {
      expect(source.startsWith('fixtures/'), source).toBe(true);
      expect(existsSync(`${repoRoot}${source}`), source).toBe(true);
    }
    const directories = [...named].filter((source) =>
      statSync(`${repoRoot}${source}`).isDirectory(),
    );
    for (const directory of directories) {
      expect(readdirSync(`${repoRoot}${directory}`).some((name) => name.endsWith('.xml'))).toBe(
        true,
      );
    }
  });

  it('keeps every run inside the 30 days before now and finishes it well before now', () => {
    for (const run of plan.runs) {
      expect(startMs(run), run.ciRunId).toBeGreaterThan(now.getTime() - 30 * DAY_MS);
      // The longest captured report runs for minutes; an hour keeps every finish before now.
      expect(startMs(run), run.ciRunId).toBeLessThan(now.getTime() - 60 * 60_000);
    }
  });

  it('gives each run a unique ci_run_id and attempt, with a GitHub Actions URL naming it', () => {
    const keys = plan.runs.map((run) => `${run.slug} ${run.ciRunId} ${run.runAttempt}`);
    expect(new Set(keys).size).toBe(keys.length);
    const repos = { ostomate2: 'Ostomate2', routeserve: 'routeserve', testpulse: 'testpulse' };
    for (const run of plan.runs) {
      expect(run.runUrl).toBe(
        `https://github.com/bhelco1/${repos[run.slug]}/actions/runs/${run.ciRunId}`,
      );
      expect(run.commitSha).toMatch(/^[0-9a-f]{40}$/);
    }
  });

  it('reuses the branch head for scheduled, manual and re-run attempts, and a new commit for a push', () => {
    for (const slug of ['ostomate2', 'routeserve'] as const) {
      let head: string | undefined;
      const seen = new Set<string>();
      for (const run of runsOf(slug).filter((candidate) => candidate.branch === 'main')) {
        if (run.event === 'push' && run.runAttempt === 1) {
          expect(seen.has(run.commitSha), run.ciRunId).toBe(false);
        } else {
          expect(run.commitSha, run.ciRunId).toBe(head);
        }
        head = run.commitSha;
        seen.add(run.commitSha);
      }
    }
  });

  it('covers every event, with one pull request run off the default branch per reporting project', () => {
    expect(new Set(plan.runs.map((run) => run.event))).toEqual(
      new Set(['push', 'pull_request', 'schedule', 'workflow_dispatch']),
    );
    for (const slug of ['ostomate2', 'routeserve']) {
      const offMain = runsOf(slug).filter((run) => run.branch !== 'main');
      expect(offMain.map((run) => run.event)).toEqual(['pull_request']);
    }
    expect(runsOf('testpulse').map((run) => [run.branch, run.event])).toEqual([['main', 'push']]);
  });

  it('reports Ostomate2 as its CI does: JVM shared and composeApp with JaCoCo, iOS simulator composeApp', () => {
    for (const run of runsOf('ostomate2')) {
      expect(run.reports).toEqual([
        {
          job: 'android',
          module: 'shared',
          platform: 'jvm',
          results: { format: 'junit', source: 'fixtures/ostomate2/junit/jvm/shared' },
          coverage: { format: 'jacoco', source: 'fixtures/ostomate2/jacoco/shared.xml' },
        },
        {
          job: 'android',
          module: 'composeApp',
          platform: 'jvm',
          results: { format: 'junit', source: 'fixtures/ostomate2/junit/jvm/composeApp' },
          coverage: { format: 'jacoco', source: 'fixtures/ostomate2/jacoco/composeApp.xml' },
        },
        {
          job: 'ios',
          module: 'composeApp',
          platform: 'ios-sim',
          results: { format: 'junit', source: 'fixtures/ostomate2/junit/ios-sim/composeApp' },
          coverage: null,
        },
      ]);
    }
  });

  it('reports routeserve as its CI does, with the captured failure in place of shared on red runs', () => {
    const prefix = '/home/runner/work/routeserve/routeserve/';
    for (const run of runsOf('routeserve')) {
      const fails = failsShared(run);
      expect(run.reports).toEqual([
        {
          job: 'test',
          module: 'apps/backend',
          platform: 'node',
          results: {
            format: 'jest',
            source: 'fixtures/routeserve/jest/backend.json',
            pathPrefix: prefix,
          },
          coverage: { format: 'istanbul', source: 'fixtures/routeserve/istanbul/backend.json' },
        },
        {
          job: 'test',
          module: 'apps/mobile',
          platform: 'node',
          results: {
            format: 'jest',
            source: 'fixtures/routeserve/jest/mobile.json',
            pathPrefix: prefix,
          },
          coverage: { format: 'istanbul', source: 'fixtures/routeserve/istanbul/mobile.json' },
        },
        {
          job: 'test',
          module: 'packages/shared',
          platform: 'node',
          results: {
            format: 'jest',
            source: fails
              ? 'fixtures/routeserve/jest/shared-one-failure.json'
              : 'fixtures/routeserve/jest/shared.json',
            pathPrefix: prefix,
          },
          // The failing file was captured without coverage, so none is claimed for it.
          coverage: fails
            ? null
            : { format: 'istanbul', source: 'fixtures/routeserve/istanbul/shared.json' },
        },
      ]);
    }
  });

  it('turns routeserve red four times on main, recovers from three and ends red', () => {
    const main = runsOf('routeserve').filter((run) => run.branch === 'main');
    expect(main.map((run) => (failsShared(run) ? 'fail' : 'pass'))).toEqual([
      'pass',
      'fail',
      'pass',
      'pass',
      'fail',
      'pass',
      'fail',
      'pass',
      'pass',
      'fail',
    ]);
  });

  it('re-runs one red routeserve commit green, which is what makes a test flaky', () => {
    const reruns = runsOf('routeserve').filter((run) => run.runAttempt > 1);
    expect(reruns).toHaveLength(1);
    const [rerun] = reruns;
    const first = runsOf('routeserve').find(
      (run) => run.ciRunId === rerun?.ciRunId && run.runAttempt === 1,
    );
    expect(rerun?.runAttempt).toBe(2);
    expect(first && failsShared(first)).toBe(true);
    expect(rerun && failsShared(rerun)).toBe(false);
    expect(rerun?.commitSha).toBe(first?.commitSha);
    expect(startMs(rerun as SeedRun)).toBeGreaterThan(startMs(first as SeedRun));
  });

  it('posts the one captured public failure as testpulse, which then stops reporting', () => {
    const [only] = runsOf('testpulse');
    expect(only?.reports).toEqual([
      {
        job: 'e2e',
        module: 'e2e',
        platform: 'chromium',
        results: { format: 'junit', source: 'fixtures/testpulse/junit/playwright-one-failure.xml' },
        coverage: null,
      },
    ]);
    // Stale: more days since its last report than its expected_cadence_days.
    const cadence = loadProjectFile(`${repoRoot}projects/testpulse.yaml`).expected_cadence_days;
    expect(now.getTime() - startMs(only as SeedRun)).toBeGreaterThan((cadence + 1) * DAY_MS);
  });

  it('keeps Ostomate2 and routeserve fresh: each reported within the last day', () => {
    for (const slug of ['ostomate2', 'routeserve']) {
      expect(now.getTime() - startMs(lastOf(slug))).toBeLessThan(DAY_MS);
    }
  });

  it('starts routeserve at its go-live and Ostomate2 after the last imported history entry', () => {
    const history = JSON.parse(
      readFileSync(`${repoRoot}fixtures/ostomate2/history/history.json`, 'utf8'),
    ) as Array<{ generatedAt: string }>;
    const lastImported = Math.max(...history.map((entry) => Date.parse(entry.generatedAt)));
    expect(startMs(runsOf('ostomate2')[0] as SeedRun)).toBeGreaterThan(lastImported);
    expect(runsOf('routeserve')[0]?.startedAt.slice(0, 10)).toBe('2026-09-24');
  });
});

describe('placeReport', () => {
  const dir = `${repoRoot}fixtures/ostomate2/junit/jvm/shared`;
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.xml'))
    .sort()
    .map((name) => readFileSync(`${dir}/${name}`, 'utf8'));
  const project = {
    id: '0b6f6a1e-4c1e-4a55-9d59-3c1f1b1c2d3e',
    layer_rules: [{ default: 'unit' }],
    name_normalization: {},
  };
  const payload = normalizeReport(
    {
      ci_run_id: '1',
      run_attempt: 1,
      job: 'android',
      module: 'shared',
      platform: 'jvm',
      commit_sha: '2ec580f377e52f0a1ae584661ff09b07821ea1e2',
      branch: 'main',
      event: 'push',
    },
    project,
    { format: 'junit', report: parseJunit(files) },
    [
      {
        format: 'jacoco',
        coverage: parseJacoco(
          readFileSync(`${repoRoot}fixtures/ostomate2/jacoco/shared.xml`, 'utf8'),
        ),
      },
    ],
    new Date('2026-09-21T20:00:00.000Z'),
  );
  const at = new Date('2026-10-01T11:48:00.000Z');
  const placed = placeReport(payload, at);

  // Ingestion dates a report by its receipt (decision 2026-10-05), so the seed places a report by
  // receiving it when the planned run would have finished: the planned start plus its duration.
  it('receives the report at the planned start plus its duration', () => {
    expect(payload.report.duration_ms).toBeGreaterThan(0);
    expect(placed.received_at).toBe(
      new Date(at.getTime() + payload.report.duration_ms).toISOString(),
    );
    expect(placed.report.duration_ms).toBe(payload.report.duration_ms);
  });

  it('changes nothing else: results, coverage and run metadata are what ingestion produced', () => {
    expect({ ...placed, received_at: '' }).toEqual({ ...payload, received_at: '' });
    expect(placed.tests).toHaveLength(82);
  });

  it('refuses an instant a timestamp column cannot hold', () => {
    expect(() => placeReport(payload, new Date(Number.NaN))).toThrow(/started_at/);
  });
});
