import { describe, expect, it } from 'vitest';

import type { HowItsTested } from '../queries/how-its-tested';
import type { ProjectSummary } from '../stats/summary';
import { ACTIONS_URL, howItsTestedView, INCIDENTS, PRINCIPLES, SPEC_URL } from './how-its-tested';
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

const seeded: HowItsTested = { self: { summary: summary(), latestDurationMs: 242 } };
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

  describe('the lede', () => {
    it('says testpulse reports here only once it has reported', () => {
      expect(howItsTestedView(seeded, NOW).lede).toEqual([
        'A test dashboard that isn’t tested is just a claim.',
        'testpulse is built test-first, its own CI runs the full suite on every pull request, and it reports its results here alongside everything else.',
      ]);
    });

    it('holds the second sentence back while testpulse is not registered', () => {
      expect(howItsTestedView(missing, NOW).lede).toEqual([
        'A test dashboard that isn’t tested is just a claim.',
      ]);
    });

    it('holds it back while testpulse is registered with no run', () => {
      const view = howItsTestedView(
        { self: { summary: summary({ latestRun: null }), latestDurationMs: null } },
        NOW,
      );
      expect(view.lede).toHaveLength(1);
    });
  });

  it('keeps the design’s five principles, without the claim of all-automated criteria', () => {
    expect(PRINCIPLES.map(({ n, title }) => `${n} ${title}`)).toEqual([
      '01 Test-first',
      '02 Real fixtures',
      '03 Normalize on the server',
      '04 Never fail the caller’s build',
      '05 No swallowed failures',
    ]);
    expect(PRINCIPLES[0]?.body).toBe(
      'Every phase starts with failing tests written from its acceptance criteria.',
    );
    expect(PRINCIPLES.map(({ body }) => body).join(' ')).not.toMatch(/automated test/);
  });

  it('keeps each incident’s true sentence and holds back the Phase 6 alerts', () => {
    expect(INCIDENTS).toEqual([
      {
        icon: 'clock',
        title: 'CI was silently dead for 11 days',
        now: 'Now: each project has an expected cadence.',
      },
      {
        icon: 'slash',
        title: 'E2E reported green without ever passing',
        now: 'Now: a run with zero tests executed is marked Empty and treated as a problem, never as a pass.',
      },
    ]);
  });

  describe('testpulse’s own results', () => {
    it('is “not reporting yet” when there is no testpulse project, as in production', () => {
      expect(howItsTestedView(missing, NOW).self).toEqual({ state: 'not_reporting' });
    });

    it('is “not reporting yet” when testpulse is registered but has no run', () => {
      const view = howItsTestedView(
        { self: { summary: summary({ latestRun: null }), latestDurationMs: null } },
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
        projectHref: '/p/testpulse',
      });
    });

    it('orders layers in section 8 order, as the Pyramid does', () => {
      const view = howItsTestedView(
        {
          self: {
            summary: summary({ totalTests: 5, layers: { e2e: 2, unit: 2, integration: 1 } }),
            latestDurationMs: 1_500,
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
        { self: { summary: summary({ totalTests: 1, layers: { e2e: 1 } }), latestDurationMs: 4 } },
        NOW,
      );
      if (view.self.state !== 'reporting') throw new Error('expected the reporting state');
      expect(view.self.run.testsWord).toBe('test');
      expect(view.self.run.total).toBe('1');
    });
  });
});
