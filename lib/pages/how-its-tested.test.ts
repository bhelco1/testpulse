import { describe, expect, it } from 'vitest';

import type { HowItsTested } from '../queries/how-its-tested';
import type { ProjectSummary } from '../stats/summary';
import {
  ACTIONS_URL,
  howItsTestedView,
  INCIDENTS,
  PRINCIPLES,
  PYRAMID_NOTE,
  SPEC_URL,
  STRATEGY,
} from './how-its-tested';
import { SOURCE_URL } from './site';

// /how-its-tested as its components take it (design/pages/How Its Tested.dc.html; docs/spec.md
// 13.7). The seed-shaped case is testpulse's one seeded run: the Playwright fixture, 1 passed,
// 1 failed and 1 skipped, 242 ms, 13 days before SEED_NOW.

const NOW = new Date('2026-10-05T12:00:00Z');
const FINISHED = new Date('2026-09-22T04:37:33.884Z');

const summary = (overrides: Partial<ProjectSummary> = {}): ProjectSummary => ({
  project: {
    id: 'project-tp',
    slug: 'testpulse',
    name: 'testpulse',
    tagline: 'Dashboard',
    visibility: 'public',
    defaultBranch: 'main',
    declaredSuites: [],
    coverageFloors: {},
    expectedCadenceDays: 8,
  },
  latestRun: {
    id: 'r1',
    status: 'failed',
    finishedAt: FINISHED,
    branch: 'main',
    commitSha: '0123456789abcdef0123456789abcdef01234567',
    passed: 1,
    failed: 1,
    skipped: 1,
    passRate: 0.5,
  },
  totalTests: 3,
  layers: { e2e: 3 },
  coverage: [],
  greenStreak: { current: 0, longest: 0 },
  runsInLast30Days: 1,
  timeToGreen: { recoveries: [], medianMs: null, worstMs: null, stillRed: null },
  health: { daysSinceLastReport: 13, problems: [], marker: { health: 'stale', days: 13 } },
  ...overrides,
});

const seeded: HowItsTested = {
  self: { summary: summary(), latestDurationMs: 242, coverage: [] },
};
const missing: HowItsTested = { self: null };

describe('howItsTestedView', () => {
  it('titles the page', () => {
    expect(howItsTestedView(seeded, NOW).title).toBe('How it’s tested · testpulse');
    expect(howItsTestedView(missing, NOW).title).toBe('How it’s tested · testpulse');
  });

  it('links to the repository, its specification and its Actions tab', () => {
    expect(SOURCE_URL).toBe('https://github.com/bhelco1/testpulse');
    expect(SPEC_URL).toBe('https://github.com/bhelco1/testpulse/blob/main/docs/spec.md');
    expect(ACTIONS_URL).toBe('https://github.com/bhelco1/testpulse/actions');
  });

  // Design v12 (v11 item 1): testpulse reports here, so the lede says so. The same in either
  // state; the not-reporting state is for a reset or an outage.
  it('says testpulse reports its own results here', () => {
    const lede = [
      'A test dashboard that isn’t tested is just a claim.',
      'testpulse is built test-first.',
      'Its own CI runs every suite on every pull request and reports the results here, alongside everything else.',
    ];
    expect(howItsTestedView(seeded, NOW).lede).toEqual(lede);
    expect(howItsTestedView(missing, NOW).lede).toEqual(lede);
  });

  // Section 04's introduction dates self-reporting from its first day in production, 2026-10-07,
  // in the site's date format.
  it('dates self-reporting from 7 Oct', () => {
    expect(howItsTestedView(seeded, NOW).since).toEqual({
      text: '7 Oct',
      datetime: '2026-10-07T00:00:00.000Z',
      title: '7 Oct 2026, 00:00 UTC',
    });
    expect(howItsTestedView(missing, NOW).since.text).toBe('7 Oct');
  });

  // Bobby's edit (decision 2026-09-30): section 17 marks some criteria as manual checks.
  it('keeps the design’s five principles, 01 ending with a recorded manual check', () => {
    expect(PRINCIPLES.map(({ n, title }) => `${n} ${title}`)).toEqual([
      '01 Test-first',
      '02 Real fixtures',
      '03 Normalize on the server',
      '04 Never fail the caller’s build',
      '05 No swallowed failures',
    ]);
    expect(PRINCIPLES[0]?.body).toBe(
      'Every phase starts with failing tests written from its acceptance criteria. A phase is done when each criterion has a passing automated test or a recorded manual check.',
    );
  });

  // Design v12 (v11 item 4): testpulse's own captured files are fixtures too.
  it('names testpulse’s own Vitest and Playwright output among the fixtures', () => {
    expect(PRINCIPLES[1]?.body).toBe(
      'Parsers are tested against actual result files captured from Ostomate2, RouteServe and testpulse itself: Gradle JUnit XML, Jest JSON, Vitest and Playwright output, JaCoCo and istanbul coverage.',
    );
  });

  it('has each incident’s v9 “Now:” line, with no daily check or alert', () => {
    expect(INCIDENTS).toEqual([
      {
        icon: 'clock',
        title: 'CI was silently dead for 11 days',
        now: 'Now: each project has an expected cadence. When a project goes quiet past it, its card and project page say so, for example “No report in 12 days”.',
      },
      {
        icon: 'slash',
        title: 'E2E reported green without ever passing',
        now: 'Now: a run with zero tests executed is marked Empty and shown as a problem, never as a pass.',
      },
    ]);
    expect(JSON.stringify(INCIDENTS)).not.toMatch(/daily check|raises an alert/);
  });

  // v9 item 4's strategy table, with Bobby's edits: "the design’s token pairs", "walks every page
  // that can show a private project", and the Component layer added; then design v10's contrast
  // script and v12's Unit, Contract and Component rows (v11 item 3, v12 item 3).
  it('lists what runs today, the three checks counted with E2E, and nothing from Phase 6', () => {
    expect(STRATEGY.map(({ name, tools, tone }) => [name, tools.join(' + '), tone])).toEqual([
      ['Unit', 'Vitest', 1],
      ['Contract', 'Vitest', null],
      ['Component', 'Vitest + Testing Library', 2],
      ['Integration', 'Vitest + local Supabase', 3],
      ['E2E', 'Playwright', 3],
      ['Accessibility', 'axe + Playwright + contrast script', null],
      ['Visual', 'Playwright', null],
      ['Leak sweep', 'Playwright', null],
    ]);
    const scope = (name: string) => STRATEGY.find((row) => row.name === name)?.scope;
    expect(scope('Unit')).toBe(
      'Parsers against real fixtures, layer resolution, stat calculations, API key hashing. 90% line floor.',
    );
    expect(scope('Contract')).toBe(
      'The shared GitHub Action every project reports through, run against a local server. Runs in the unit job; counted as Unit.',
    );
    expect(scope('Accessibility')).toBe(
      'axe on every public page, counted with E2E. A script in the unit job checks the contrast of the design’s token pairs in both themes.',
    );
    expect(scope('Leak sweep')).toBe(
      'Walks every page that can show a private project as a visitor and fails if any private project’s failure text, stack trace or source link appears anywhere. Counted with E2E.',
    );
    const all = JSON.stringify(STRATEGY);
    for (const phase6 of ['alert', 'bot classification', 'prune', 'tracked', 'admin', 'sign-in']) {
      expect(all.toLowerCase()).not.toContain(phase6);
    }
  });

  // Design v12 item 1: no literal figures; each test counts once, in its layer.
  it('notes under the pyramid how the checks are counted', () => {
    expect(PYRAMID_NOTE).toBe(
      'Only spec §8 layers are counted. The axe, visual and leak-sweep checks run inside the Playwright suite and count as E2E; the Action’s contract tests run in the unit job and count as Unit. Each test counts once, in the layer testpulse’s layer rules give it, whichever report it arrived in.',
    );
    // No figure stands alone: the only digits are the section reference and "E2E".
    expect(PYRAMID_NOTE.replace('spec §8', '')).not.toMatch(/\b\d/);
  });

  // Design v12 item 2 (decided by Bobby, 2026-10-07): in both states, phases 0 to 7 of
  // docs/build-progress.json and nothing else, so no Self-reporting row.
  it('carries the build progress in both states, phases 0 to 7 of its data file', () => {
    for (const data of [missing, seeded]) {
      const { progress } = howItsTestedView(data, NOW);
      expect(progress.asOf.text).toBe('2 Oct');
      expect(progress.phases.map(({ n, label, status }) => `${n} ${label}: ${status}`)).toEqual([
        'Phase 0 Foundations: done',
        'Phase 1 Schema, parsers, ingestion: done',
        'Phase 2 Ostomate2 reporting live: done',
        'Phase 3 RouteServe reporting live: done',
        'Phase 4 Backfill: done',
        'Phase 5 Public site: done',
        'Phase 6 Alerts, tracked links, admin: in_progress',
        'Phase 7 Launch: planned',
      ]);
    }
  });

  describe('testpulse’s own results', () => {
    it('is “not reporting yet” when there is no testpulse project, as in production', () => {
      expect(howItsTestedView(missing, NOW).self).toEqual({ state: 'not_reporting' });
    });

    it('is “not reporting yet” when testpulse is registered but has no run', () => {
      const view = howItsTestedView(
        { self: { summary: summary({ latestRun: null }), latestDurationMs: null, coverage: [] } },
        NOW,
      );
      expect(view.self).toEqual({ state: 'not_reporting' });
    });

    it('shows the seeded run: failed, 1 week ago, 3 tests, E2E only', () => {
      expect(howItsTestedView(seeded, NOW).self).toEqual({
        state: 'reporting',
        run: {
          status: 'failed',
          // 13 UTC days back reads in weeks (design v7 item 16).
          when: {
            text: '1 week ago',
            datetime: '2026-09-22T04:37:33.884Z',
            title: '22 Sep 2026, 04:37 UTC',
          },
          branch: 'main',
          sha: '0123456',
          total: '3',
          testsWord: 'tests',
          failed: 1,
          skipped: 1,
          // 242 ms rounds to whole seconds, as the landing card prints it.
          duration: '0 s',
        },
        layers: [{ label: 'E2E', count: 3, tone: 3 }],
        total: 3,
        coverage: [],
        projectHref: '/p/testpulse',
      });
    });

    // Design v12 item 1 (decided by Bobby, 2026-10-07): distinct tests per layer, Unit and
    // Component as separate rows; the figures are production's of 7 Oct, read from data.
    it('counts distinct tests with Unit and Component as separate layers', () => {
      const view = howItsTestedView(
        {
          self: {
            summary: summary({
              totalTests: 2598,
              layers: { unit: 1528, component: 655, integration: 180, e2e: 235 },
            }),
            latestDurationMs: 1_073_000,
            coverage: [],
          },
        },
        NOW,
      );
      if (view.self.state !== 'reporting') throw new Error('expected the reporting state');
      expect(view.self.run.total).toBe('2,598');
      expect(view.self.total).toBe(2598);
      expect(view.self.layers).toEqual([
        { label: 'Unit', count: 1528, tone: 1 },
        { label: 'Component', count: 655, tone: 2 },
        { label: 'Integration', count: 180, tone: 3 },
        { label: 'E2E', count: 235, tone: 3 },
      ]);
      // Whole seconds, as the landing card prints a run's duration; the mock's "6 min" is SAMPLE.
      expect(view.self.run.duration).toBe('1073 s');
    });

    // Design v12 item 10 (data-map v11): a CoverageBar row per module and its line counts.
    it('gives each coverage module its row and its line-count note', () => {
      const view = howItsTestedView(
        {
          self: {
            summary: summary(),
            latestDurationMs: 242,
            coverage: [
              {
                module: 'unit',
                runId: 'r1',
                pct: (3125 / 3141) * 100,
                floor: 90,
                belowFloor: false,
                lines: { covered: 3125, total: 3141 },
              },
              {
                module: 'zz-imported',
                runId: 'r0',
                pct: 80,
                floor: null,
                belowFloor: false,
                lines: null,
              },
            ],
          },
        },
        NOW,
      );
      if (view.self.state !== 'reporting') throw new Error('expected the reporting state');
      expect(view.self.coverage).toEqual([
        {
          module: 'unit',
          pct: (3125 / 3141) * 100,
          floor: 90,
          note: 'unit: 3,125 of 3,141 lines covered.',
        },
        // A recorded percentage has no line counts, so no note is drawn for it.
        { module: 'zz-imported', pct: 80, floor: null, note: null },
      ]);
    });

    it('orders layers in section 8 order, as the Pyramid does', () => {
      const view = howItsTestedView(
        {
          self: {
            summary: summary({ totalTests: 5, layers: { e2e: 2, unit: 2, integration: 1 } }),
            latestDurationMs: 1_500,
            coverage: [],
          },
        },
        NOW,
      );
      if (view.self.state !== 'reporting') throw new Error('expected the reporting state');
      expect(view.self.layers.map(({ label }) => label)).toEqual(['Unit', 'Integration', 'E2E']);
      expect(view.self.run.duration).toBe('2 s');
    });

    it('reads one test in the singular', () => {
      const view = howItsTestedView(
        {
          self: {
            summary: summary({ totalTests: 1, layers: { e2e: 1 } }),
            latestDurationMs: 4,
            coverage: [],
          },
        },
        NOW,
      );
      if (view.self.state !== 'reporting') throw new Error('expected the reporting state');
      expect(view.self.run.testsWord).toBe('test');
      expect(view.self.run.total).toBe('1');
    });
  });
});
