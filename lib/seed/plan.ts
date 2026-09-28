import { createHash } from 'node:crypto';

import type { ReportEvent } from '../ingest/meta.ts';
import type { IngestPayload } from '../ingest/normalize.ts';

// Spec section 16, "Seed data": what the e2e database holds and when each run happened. Pure:
// every instant is computed from `now`, so the e2e harness sets TESTPULSE_FIXED_NOW to SEED_NOW
// and sees the same windows and relative times on every run.
//
// Only the result files are real. The run history around them (IDs, commits, events, branches
// and times) is invented, because the captured fixtures are one run each: nine Ostomate2 runs
// here are the same three files posted nine times.

/** A Monday, 13 days after the testpulse fixture was captured and within 90 days of the history. */
export const SEED_NOW = '2026-10-05T12:00:00.000Z';

export const SEED_SLUGS = ['ostomate2', 'routeserve', 'testpulse'] as const;
export type SeedSlug = (typeof SEED_SLUGS)[number];

export type SeedResults =
  /** `source` is one JUnit XML file, or a directory whose `*.xml` files form one report. */
  | { readonly format: 'junit'; readonly source: string }
  | { readonly format: 'jest'; readonly source: string; readonly pathPrefix: string };

export interface SeedCoverage {
  readonly format: 'jacoco' | 'istanbul';
  readonly source: string;
}

export interface SeedReport {
  readonly job: string;
  readonly module: string;
  readonly platform: string;
  readonly results: SeedResults;
  readonly coverage: SeedCoverage | null;
}

export interface SeedRun {
  readonly slug: SeedSlug;
  readonly ciRunId: string;
  readonly runAttempt: number;
  readonly commitSha: string;
  readonly branch: string;
  readonly event: ReportEvent;
  readonly runUrl: string;
  /** Every report of the run starts here; each keeps the duration its file records. */
  readonly startedAt: string;
  readonly reports: readonly SeedReport[];
}

export interface SeedBackfill {
  readonly slug: SeedSlug;
  readonly source: string;
}

export interface SeedPlan {
  readonly now: string;
  readonly projects: readonly SeedSlug[];
  readonly backfill: readonly SeedBackfill[];
  /** Oldest first, the order ingestion saw them in, which sets each test's first_seen_at. */
  readonly runs: readonly SeedRun[];
}

const DEFAULT_BRANCH = 'main';
const PULL_REQUEST_BRANCH = 'seed/pull-request';
const DAY_MS = 86_400_000;

const REPOS: Readonly<Record<SeedSlug, string>> = {
  ostomate2: 'bhelco1/Ostomate2',
  routeserve: 'bhelco1/routeserve',
  testpulse: 'bhelco1/testpulse',
};

// Eleven digits, like the real GitHub run IDs, in a range per project that no real run in the
// fixtures uses.
const RUN_ID_BASE: Readonly<Record<SeedSlug, number>> = {
  ostomate2: 36_100_000_000,
  routeserve: 36_200_000_000,
  testpulse: 36_300_000_000,
};

const OSTOMATE2_REPORTS: readonly SeedReport[] = [
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
  // Ostomate2's CI also posts ios/shared/ios-sim, but no current capture of it exists
  // (fixtures/README.md, "Known gaps").
  {
    job: 'ios',
    module: 'composeApp',
    platform: 'ios-sim',
    results: { format: 'junit', source: 'fixtures/ostomate2/junit/ios-sim/composeApp' },
    coverage: null,
  },
];

const ROUTESERVE_PATH_PREFIX = '/home/runner/work/routeserve/routeserve/';

function routeserveReport(module: string, workspace: string, coverage: boolean): SeedReport {
  return {
    job: 'test',
    module,
    platform: 'node',
    results: {
      format: 'jest',
      source: `fixtures/routeserve/jest/${coverage ? workspace : `${workspace}-one-failure`}.json`,
      pathPrefix: ROUTESERVE_PATH_PREFIX,
    },
    coverage: coverage
      ? { format: 'istanbul', source: `fixtures/routeserve/istanbul/${workspace}.json` }
      : null,
  };
}

function routeserveReports(sharedFails: boolean): readonly SeedReport[] {
  return [
    routeserveReport('apps/backend', 'backend', true),
    routeserveReport('apps/mobile', 'mobile', true),
    // The one captured routeserve failure has no coverage summary beside it, so a red run
    // reports shared without coverage rather than borrowing the passing capture's.
    routeserveReport('packages/shared', 'shared', !sharedFails),
  ];
}

const TESTPULSE_REPORTS: readonly SeedReport[] = [
  {
    job: 'e2e',
    module: 'e2e',
    platform: 'chromium',
    results: { format: 'junit', source: 'fixtures/testpulse/junit/playwright-one-failure.xml' },
    coverage: null,
  },
];

interface RunSpec {
  /** Whole UTC days before the day of now. */
  readonly daysAgo: number;
  /** UTC time of day, HH:MM. */
  readonly at: string;
  readonly event: ReportEvent;
  readonly pullRequest?: true;
  /** routeserve only: post the captured shared failure instead of the passing shared file. */
  readonly sharedFails?: true;
  /** A re-run of the previous run: same ID and commit, next attempt. */
  readonly rerun?: true;
}

// Ostomate2's CI went live on 2026-09-22, the day of the last history entry the backfill imports.
const OSTOMATE2_RUNS: readonly RunSpec[] = [
  { daysAgo: 11, at: '14:05', event: 'push' },
  { daysAgo: 10, at: '18:40', event: 'push' },
  { daysAgo: 8, at: '05:17', event: 'schedule' },
  { daysAgo: 6, at: '16:22', event: 'pull_request', pullRequest: true },
  { daysAgo: 6, at: '19:03', event: 'push' },
  { daysAgo: 4, at: '11:48', event: 'workflow_dispatch' },
  { daysAgo: 3, at: '20:31', event: 'push' },
  { daysAgo: 1, at: '05:17', event: 'schedule' },
  { daysAgo: 0, at: '09:26', event: 'push' },
];

// routeserve went live on 2026-09-24 (spec section 17, Phase 3); its weekly schedule is Sunday
// 06:43 UTC. Red three times and back, once by a re-run of the same commit, then red at now.
const ROUTESERVE_RUNS: readonly RunSpec[] = [
  { daysAgo: 11, at: '17:12', event: 'push' },
  { daysAgo: 9, at: '15:30', event: 'push', sharedFails: true },
  { daysAgo: 9, at: '16:14', event: 'push' },
  { daysAgo: 8, at: '06:43', event: 'schedule' },
  { daysAgo: 6, at: '13:05', event: 'push', sharedFails: true },
  { daysAgo: 6, at: '13:31', event: 'push', rerun: true },
  { daysAgo: 4, at: '10:20', event: 'pull_request', pullRequest: true },
  { daysAgo: 3, at: '09:55', event: 'push', sharedFails: true },
  { daysAgo: 3, at: '14:02', event: 'push' },
  { daysAgo: 1, at: '06:43', event: 'schedule' },
  { daysAgo: 0, at: '08:12', event: 'push', sharedFails: true },
];

// The Playwright fixture was captured at 04:37 UTC on 2026-09-22; testpulse has not reported
// since, so at now it is stale.
const TESTPULSE_RUNS: readonly RunSpec[] = [{ daysAgo: 13, at: '04:37', event: 'push' }];

function instant(now: Date, daysAgo: number, at: string): Date {
  const [hours, minutes] = at.split(':').map(Number);
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(day - daysAgo * DAY_MS + ((hours ?? 0) * 60 + (minutes ?? 0)) * 60_000);
}

// Obviously not a real commit of any repository, and the same on every seed.
const commitSha = (slug: SeedSlug, index: number): string =>
  createHash('sha1').update(`testpulse seed ${slug} commit ${index}`).digest('hex');

function planRuns(
  now: Date,
  slug: SeedSlug,
  specs: readonly RunSpec[],
  reports: (spec: RunSpec) => readonly SeedReport[],
): SeedRun[] {
  const runs: SeedRun[] = [];
  let commits = 0;
  let head = '';
  let runNumber = 0;
  for (const spec of specs) {
    const previous = runs[runs.length - 1];
    let ciRunId: string;
    let runAttempt = 1;
    let sha: string;
    if (spec.rerun === true && previous !== undefined) {
      ciRunId = previous.ciRunId;
      runAttempt = previous.runAttempt + 1;
      sha = previous.commitSha;
    } else {
      runNumber += 1;
      ciRunId = String(RUN_ID_BASE[slug] + runNumber);
      // A push or a pull request brings a new commit; a scheduled or manual run tests the head.
      if (spec.event === 'push' || spec.event === 'pull_request' || head === '') {
        commits += 1;
        sha = commitSha(slug, commits);
      } else {
        sha = head;
      }
    }
    if (spec.pullRequest !== true) head = sha;
    runs.push({
      slug,
      ciRunId,
      runAttempt,
      commitSha: sha,
      branch: spec.pullRequest === true ? PULL_REQUEST_BRANCH : DEFAULT_BRANCH,
      event: spec.event,
      runUrl: `https://github.com/${REPOS[slug]}/actions/runs/${ciRunId}`,
      startedAt: instant(now, spec.daysAgo, spec.at).toISOString(),
      reports: reports(spec),
    });
  }
  return runs;
}

export function planSeed(now: Date): SeedPlan {
  const runs = [
    ...planRuns(now, 'ostomate2', OSTOMATE2_RUNS, () => OSTOMATE2_REPORTS),
    ...planRuns(now, 'routeserve', ROUTESERVE_RUNS, (spec) =>
      routeserveReports(spec.sharedFails === true),
    ),
    ...planRuns(now, 'testpulse', TESTPULSE_RUNS, () => TESTPULSE_REPORTS),
  ].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  return {
    now: now.toISOString(),
    projects: [...SEED_SLUGS],
    backfill: [{ slug: 'ostomate2', source: 'fixtures/ostomate2/history/history.json' }],
    runs,
  };
}

/**
 * Moves one normalized report to the planned start. Ingestion takes a report's start from the
 * file (spec 5.2), and every fixture records the moment it was captured, so without this every
 * posting of a fixture would land on that same instant. Only the three times change: the
 * duration, results, coverage and run metadata stay exactly what normalizeReport produced.
 */
export function placeReport(payload: IngestPayload, startedAt: Date): IngestPayload {
  const start = startedAt.getTime();
  if (Number.isNaN(start)) {
    throw new Error('the planned started_at is not a point in time');
  }
  const duration = Date.parse(payload.report.finished_at) - Date.parse(payload.report.started_at);
  const finishedAt = new Date(start + duration).toISOString();
  return {
    ...payload,
    received_at: finishedAt,
    report: { ...payload.report, started_at: startedAt.toISOString(), finished_at: finishedAt },
  };
}
