import type { TimeLabel } from '../copy/time';
import { formatRunDuration, relativeLabel } from '../copy/time';
import { formatCount } from '../copy/count';
import { layerSegments, type LayerSegment } from '../design/layers';
import type { RunStatus } from '../ingest/normalize';
import type { HowItsTested } from '../queries/how-its-tested';
import { SOURCE_URL } from './site';

// /how-its-tested as its components take it (design/pages/How Its Tested.dc.html,
// design/data-map.md "How it's tested"). Pure: the page passes the loader's result and now.
// The copy is the design's, word for word. Where the design's copy states something about
// testpulse that is not true today, the sentence that says it is held back rather than reworded
// (docs/spec.md 13.7): the strategy table and "Build progress" whole, and single sentences below.

export const TITLE = 'How it’s tested · testpulse';

export const SPEC_URL = `${SOURCE_URL}/blob/main/docs/spec.md`;
export const ACTIONS_URL = `${SOURCE_URL}/actions`;

const LEDE_OPENING = 'A test dashboard that isn’t tested is just a claim.';
// True only once testpulse has reported here (Phase 7 in production).
const LEDE_SELF =
  'testpulse is built test-first, its own CI runs the full suite on every pull request, and it reports its results here alongside everything else.';

export interface Principle {
  readonly n: string;
  readonly title: string;
  readonly body: string;
}

// Principle 01's second sentence, "A phase is done when each criterion has a passing automated
// test.", is held back: section 17 marks some criteria as manual checks.
export const PRINCIPLES: readonly Principle[] = [
  ['Test-first', 'Every phase starts with failing tests written from its acceptance criteria.'],
  [
    'Real fixtures',
    'Parsers are tested against actual result files captured from Ostomate2 and RouteServe: Gradle JUnit XML, Jest JSON, JaCoCo and istanbul coverage.',
  ],
  [
    'Normalize on the server',
    'Projects send the files their tools already produce. testpulse does the parsing, so a project’s CI step stays a few lines long.',
  ],
  [
    'Never fail the caller’s build',
    'If testpulse is down, a project’s CI stays green. The reporting step always exits 0 and logs a warning.',
  ],
  [
    'No swallowed failures',
    'In testpulse’s own pipeline, nothing is allowed to fail quietly. No || true, no continue-on-error on test steps.',
  ],
].map(([title, body], index) => ({
  n: String(index + 1).padStart(2, '0'),
  title: title ?? '',
  body: body ?? '',
}));

export interface Incident {
  readonly icon: 'clock' | 'slash';
  readonly title: string;
  readonly now: string;
}

// Each "Now:" line's second sentence is held back: the daily stale check and the count-drop
// alert are Phase 6 (section 12) and not built.
export const INCIDENTS: readonly Incident[] = [
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
];

export interface SelfRun {
  readonly status: RunStatus;
  readonly when: TimeLabel;
  readonly branch: string;
  /** 7 characters, as the mock draws it. */
  readonly sha: string;
  readonly total: string;
  /** "test" at 1, as ProjectCard's sub-line reads. */
  readonly testsWord: 'test' | 'tests';
  readonly failed: number;
  readonly skipped: number;
  readonly duration: string;
}

export type SelfReportView =
  | { readonly state: 'not_reporting' }
  | {
      readonly state: 'reporting';
      readonly run: SelfRun;
      /** From layerSegments: section 8 order, fixed tones. */
      readonly layers: readonly LayerSegment[];
      /** Distinct tests in the latest run; each layer's share is of this. */
      readonly total: number;
      readonly projectHref: string;
    };

export interface HowItsTestedView {
  readonly title: string;
  /** The hero paragraph's sentences. */
  readonly lede: readonly string[];
  readonly self: SelfReportView;
}

function selfReport(data: HowItsTested, now: Date): SelfReportView {
  const run = data.self?.summary.latestRun ?? null;
  if (data.self === null || run === null) return { state: 'not_reporting' };
  const { summary, latestDurationMs } = data.self;
  return {
    state: 'reporting',
    run: {
      status: run.status,
      when: relativeLabel(run.finishedAt, now),
      branch: run.branch,
      sha: run.commitSha.slice(0, 7),
      // Distinct tests, as the landing card counts them (design v6 item 10).
      total: formatCount(summary.totalTests),
      testsWord: summary.totalTests === 1 ? 'test' : 'tests',
      failed: run.failed,
      skipped: run.skipped,
      duration: formatRunDuration(latestDurationMs ?? 0),
    },
    layers: layerSegments(summary.layers),
    total: summary.totalTests,
    projectHref: `/p/${encodeURIComponent(summary.project.slug)}`,
  };
}

export function howItsTestedView(data: HowItsTested, now: Date): HowItsTestedView {
  const self = selfReport(data, now);
  return {
    title: TITLE,
    lede: self.state === 'reporting' ? [LEDE_OPENING, LEDE_SELF] : [LEDE_OPENING],
    self,
  };
}
