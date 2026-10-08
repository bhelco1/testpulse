import type { TimeLabel } from '../copy/time';
import { dateLabel, formatRunDuration, relativeLabel } from '../copy/time';
import { formatCount } from '../copy/count';
import { layerSegments, type LayerSegment } from '../design/layers';
import type { RunStatus } from '../ingest/normalize';
import type { LayerTone } from '../design/layers';
import { LAYER_TONE } from '../design/layers';
import type { HowItsTested } from '../queries/how-its-tested';
import { buildProgressView, type BuildProgressView } from './build-progress';
import { SOURCE_URL } from './site';

// /how-its-tested as its components take it (design/pages/How Its Tested.dc.html,
// design/data-map.md "How it's tested"). Pure: the page passes the loader's result and now.
// The copy is design v12's (v11 items 1, 3 and 4), on design v9's true-today copy (item 4) with
// Bobby's edits of 2026-09-30, each claim checked against the repository (docs/spec.md 13.7).

export const TITLE = 'How it’s tested · testpulse';

export const SPEC_URL = `${SOURCE_URL}/blob/main/docs/spec.md`;
export const ACTIONS_URL = `${SOURCE_URL}/actions`;

const LEDE = [
  'A test dashboard that isn’t tested is just a claim.',
  'testpulse is built test-first.',
  'Its own CI runs every suite on every pull request and reports the results here, alongside everything else.',
] as const;

// testpulse's first report to production (spec section 17, "Self-reporting"): section 04's
// "Since 7 Oct, …" is a fact about the past, so it is fixed here rather than read from the runs.
const SELF_REPORTING_SINCE = new Date('2026-10-07T00:00:00.000Z');

export interface Principle {
  readonly n: string;
  readonly title: string;
  readonly body: string;
}

// Principle 01 ends "or a recorded manual check" (Bobby, 2026-09-30): section 17 marks some
// criteria as manual checks.
export const PRINCIPLES: readonly Principle[] = [
  [
    'Test-first',
    'Every phase starts with failing tests written from its acceptance criteria. A phase is done when each criterion has a passing automated test or a recorded manual check.',
  ],
  [
    'Real fixtures',
    'Parsers are tested against actual result files captured from Ostomate2, RouteServe and testpulse itself: Gradle JUnit XML, Jest JSON, Vitest and Playwright output, JaCoCo and istanbul coverage.',
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

// v9's "Now:" lines: what the pages show today, derived at render (section 11). The daily check
// and the count-drop alert join them in Phase 6.
export const INCIDENTS: readonly Incident[] = [
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
];

export interface StrategyRow {
  readonly name: string;
  readonly tools: readonly string[];
  readonly scope: string;
  /** A section 8 layer's fixed tone; null for a row counted under another layer (bordered). */
  readonly tone: LayerTone | null;
}

// "What runs, and what it covers" (v9 item 4), with Bobby's edits: "the design’s token pairs",
// "walks every page that can show a private project", and a Component row, which section 8 has
// and projects/testpulse.yaml gives the component tests; then design v10's contrast script and
// v12's Unit and Contract scopes. Phase 6 adds alert rules, bot classification, the prune job,
// tracked links, tracked-link tokens and admin sign-in.
export const STRATEGY: readonly StrategyRow[] = [
  {
    name: 'Unit',
    tools: ['Vitest'],
    scope:
      'Parsers against real fixtures, layer resolution, stat calculations, API key hashing. 90% line floor.',
    tone: LAYER_TONE.unit,
  },
  {
    name: 'Contract',
    tools: ['Vitest'],
    scope:
      'The shared GitHub Action every project reports through, run against a local server. Runs in the unit job; counted as Unit.',
    tone: null,
  },
  {
    name: 'Component',
    tools: ['Vitest', 'Testing Library'],
    scope:
      'Each component built from the design, rendered in jsdom: its words, states and links, and its stylesheet against the design’s values.',
    tone: LAYER_TONE.component,
  },
  {
    name: 'Integration',
    tools: ['Vitest', 'local Supabase'],
    scope:
      'The ingestion endpoint end to end against local Supabase: idempotent retries, transactions and rollups, and row-level security checked with the anonymous client, so private projects stay hidden.',
    tone: LAYER_TONE.integration,
  },
  {
    name: 'E2E',
    tools: ['Playwright'],
    scope:
      'A seeded database behind the landing, project, run and test-history pages; visibility rules in the rendered UI; every public page again with JavaScript turned off.',
    tone: LAYER_TONE.e2e,
  },
  {
    name: 'Accessibility',
    tools: ['axe', 'Playwright', 'contrast script'],
    scope:
      'axe on every public page, counted with E2E. A script in the unit job checks the contrast of the design’s token pairs in both themes.',
    tone: null,
  },
  {
    name: 'Visual',
    tools: ['Playwright'],
    scope:
      'Snapshots of each page at desktop and phone widths, light and dark, compared inside a pinned container image so rendering can’t drift. Counted with E2E.',
    tone: null,
  },
  {
    name: 'Leak sweep',
    tools: ['Playwright'],
    scope:
      'Walks every page that can show a private project as a visitor and fails if any private project’s failure text, stack trace or source link appears anywhere. Counted with E2E.',
    tone: null,
  },
];

// The note under the self-report's pyramid (v9 item 4: contract tests count as Unit; v12 item 1:
// no literal figures).
export const PYRAMID_NOTE =
  'Only spec §8 layers are counted. The axe, visual and leak-sweep checks run inside the Playwright suite and count as E2E; the Action’s contract tests run in the unit job and count as Unit. Each test counts once, in the layer testpulse’s layer rules give it, whichever report it arrived in.';

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

/** A row of the coverage card: a CoverageBar and its line-count note. */
export interface SelfCoverage {
  readonly module: string;
  /** Line coverage, 0 to 100, unrounded; CoverageBar rounds it down. */
  readonly pct: number;
  readonly floor: number | null;
  /** "{module}: {covered} of {total} lines covered."; null for a recorded percentage. */
  readonly note: string | null;
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
      /** Module-key order; empty draws no coverage card. */
      readonly coverage: readonly SelfCoverage[];
      readonly projectHref: string;
    };

export interface HowItsTestedView {
  readonly title: string;
  /** The hero paragraph's sentences. */
  readonly lede: readonly string[];
  /** Section 04's "Since {date}, …". */
  readonly since: TimeLabel;
  readonly self: SelfReportView;
  /** "Build progress", section 04's last card in either state. */
  readonly progress: BuildProgressView;
}

function selfReport(data: HowItsTested, now: Date): SelfReportView {
  const run = data.self?.summary.latestRun ?? null;
  if (data.self === null || run === null) return { state: 'not_reporting' };
  const { summary, latestDurationMs, coverage } = data.self;
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
    coverage: coverage.map(({ module, pct, floor, lines }) => ({
      module,
      pct,
      floor,
      note:
        lines === null
          ? null
          : `${module}: ${formatCount(lines.covered)} of ${formatCount(lines.total)} lines covered.`,
    })),
    projectHref: `/p/${encodeURIComponent(summary.project.slug)}`,
  };
}

export function howItsTestedView(data: HowItsTested, now: Date): HowItsTestedView {
  const self = selfReport(data, now);
  return {
    title: TITLE,
    lede: LEDE,
    since: dateLabel(SELF_REPORTING_SINCE, now),
    self,
    progress: buildProgressView(now),
  };
}
