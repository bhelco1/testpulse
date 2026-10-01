import type { StatTileAttention } from '../../components/StatTile/StatTile';
import type { WebProjectCardProps } from '../../components/ProjectCard/ProjectCard';
import type { FeedRun } from '../../components/RunFeedRow/RunFeedRow';
import { formatTrendValue } from '../charts/format';
import { formatCount, qty } from '../copy/count';
import { projectsPassingTile } from '../copy/projects-passing';
import { joinNames } from '../copy/names';
import {
  dateLabel,
  formatRunDuration,
  relativeLabel,
  type TimedText,
  type TimeLabel,
} from '../copy/time';
import { layerSegments } from '../design/layers';
import type { Landing, LandingProject } from '../queries/landing';
import type { LandingHeadline } from '../stats/summary';
import { feedRun, runHref } from './feed';

// The landing page, /, as its components take it (design/pages/Landing.dc.html,
// design/components.md, design/data-map.md "Landing"). Pure: the page passes the loader's result
// and now, so every word and figure here is tested without a database or a clock. Where the
// design's templates are silent, the reading chosen is recorded in docs/spec.md (13.3, 19).

export interface LandingTile {
  readonly label: string;
  readonly value: string;
  readonly sub?: string;
  readonly attention?: StatTileAttention;
  readonly fail?: boolean;
}

export type LandingCard = Omit<WebProjectCardProps, 'variant' | 'loading' | 'headingLevel'>;

export interface ReadyLandingView {
  readonly kind: 'ready';
  /** The hero figure: distinct tests in every project's latest run (section 11, Total tests). */
  readonly heroTotal: string;
  /** The note read after the figure, starting lower-case (components.md, Landing hero). */
  readonly heroNote: TimedText;
  /** Pass rate, Projects reporting, Runs in last 30 days, Projects passing. */
  readonly tiles: readonly LandingTile[];
  readonly cards: readonly LandingCard[];
  readonly recentRuns: readonly FeedRun[];
}

/** No project is registered: the h1 and the "No projects yet" card only (design v8 item 10). */
export type LandingView = ReadyLandingView | { readonly kind: 'none' };

/** The page ErrorState's words when the database does not answer (Landing "error" scenario). */
export const LANDING_ERROR = {
  title: 'Results couldn’t be loaded',
  message:
    'The database didn’t respond. Nothing is shown rather than numbers that might be out of ' +
    'date. Test runs are still being received and will appear when it recovers.',
} as const;

type NameOf = (slug: string) => string;

// components.md StatTile, Pass rate (design v8 item 9). The lead is "Latest runs" when every
// latest run counted and none failed, "{passed} of {passed + failed}" when every one counted and
// one failed, and "{counted projects} only" whenever a latest run is not counted (empty or all
// skipped), failing or not. No rate at all reads "—".
function passRateTile(
  { passRate }: LandingHeadline,
  projects: readonly LandingProject[],
  nameOf: NameOf,
): LandingTile {
  const label = 'Pass rate';
  if (passRate.rate === null) {
    return { label, value: '—', sub: 'No tests passed or failed on the latest runs' };
  }
  const withRun = projects.filter((project) => project.latestRun !== null).length;
  const lead =
    passRate.counted.length < withRun
      ? `${joinNames(passRate.counted.map(nameOf))} only`
      : passRate.failed > 0
        ? `${formatCount(passRate.passed)} of ${formatCount(passRate.passed + passRate.failed)}`
        : 'Latest runs';
  return {
    label,
    value: formatTrendValue(passRate.rate * 100, 'pct'),
    sub: `${lead} · ${formatCount(passRate.skipped)} skipped, excluded`,
  };
}

// components.md StatTile, Projects reporting (design v8 item 8): "{r} of {n}", n counting every
// registered project, including one that has never reported. Silent projects come first, longest
// silent first, then the never-reported ones as one name list; amber whenever r < n.
function projectsReportingTile(
  { projectsReporting }: LandingHeadline,
  nameOf: NameOf,
): LandingTile {
  const { reporting, registered, silent, notReporting } = projectsReporting;
  const label = 'Projects reporting';
  const value = `${formatCount(reporting)} of ${formatCount(registered)}`;
  if (silent.length === 0 && notReporting.length === 0) {
    return { label, value, sub: 'All within their expected cadence' };
  }
  const longestFirst = [...silent].sort((a, b) => b.days - a.days);
  const [first, ...more] = longestFirst;
  const silentPart =
    first === undefined
      ? []
      : more.length === 0
        ? [`${nameOf(first.slug)} silent ${qty(first.days, 'day')}`]
        : [
            `Silent: ${longestFirst.map(({ slug, days }) => `${nameOf(slug)} ${qty(days, 'day')}`).join(' · ')}`,
          ];
  const parts =
    notReporting.length === 0
      ? silentPart
      : [...silentPart, `${joinNames(notReporting.map(nameOf))} not reporting yet`];
  return { label, value, attention: { icon: 'stale', text: parts.join(' · ') } };
}

function runsTile({ runsInLast30Days }: LandingHeadline, nameOf: NameOf): LandingTile {
  const perProject = runsInLast30Days.byProject
    .map(({ slug, runs }) => `${nameOf(slug)} ${formatCount(runs)}`)
    .join(' · ');
  return {
    label: 'Runs in last 30 days',
    value: formatCount(runsInLast30Days.total),
    ...(perProject === '' ? {} : { sub: perProject }),
  };
}

function card(summary: LandingProject, now: Date): LandingCard {
  const { project, latestRun: run, latestRunDetail: detail } = summary;
  return {
    project: {
      name: project.name,
      tagline: project.tagline,
      visibility: project.visibility,
      href: `/p/${encodeURIComponent(project.slug)}`,
    },
    latestRun:
      run === null
        ? null
        : {
            status: run.status,
            // A stale card shows its last run's date, not a relative time (design v8 item 14).
            when:
              summary.health.marker.health === 'stale'
                ? dateLabel(run.finishedAt, now)
                : relativeLabel(run.finishedAt, now),
            branch: run.branch,
            sha: run.commitSha,
            href: runHref(project.slug, run.id),
            // Distinct tests, as the Pass rate tile counts them (design v6 item 10).
            total: summary.totalTests,
            failed: run.failed,
            skipped: run.skipped,
            duration: formatRunDuration(detail?.durationMs ?? 0),
          },
    layers: layerSegments(summary.layers),
    coverage: summary.coverage.map(({ module, pct, floor }) => ({ module, pct, floor })),
    reports: (detail?.reports ?? []).map((report) => ({
      key: `${report.job}/${report.module}/${report.platform}`,
      total: report.total,
    })),
    declared: project.declaredSuites,
    health: summary.health.marker,
    failing: (detail?.failing ?? []).map(({ suite, name, platform }) => ({
      suite,
      name,
      platform,
    })),
  };
}

const NUMBER_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

/** "one" to "nine" in words, digits from 10 (components.md, Landing hero). */
export const countWords = (count: number): string => NUMBER_WORDS[count - 1] ?? formatCount(count);

const projectsPhrase = (count: number): string =>
  count === 1 ? 'one project' : `${countWords(count)} projects`;

// Sentence 2 of the note: failing on one project, failing on several, else the pass rate. "its"
// and "the latest run" when one project is counted, so the sentence is true of what is counted.
function resultSentence(counted: readonly LandingProject[], headline: LandingHeadline): string {
  const skipped = `${formatCount(headline.passRate.skipped)} skipped.`;
  const failing = counted.filter((project) => (project.latestRun?.failed ?? 0) > 0);
  const failed = formatCount(failing.reduce((sum, p) => sum + (p.latestRun?.failed ?? 0), 0));
  const [onlyFailing] = failing;
  if (failing.length === 1 && onlyFailing !== undefined) {
    return `${failed} failing on ${onlyFailing.project.name}’s latest run, ${skipped}`;
  }
  if (failing.length > 1) {
    return `${failed} failing across ${countWords(failing.length)} projects’ latest runs, ${skipped}`;
  }
  const where = counted.length === 1 ? 'its latest run' : 'the latest runs';
  const { rate } = headline.passRate;
  return rate === null
    ? `None passed or failed on ${where}, ${skipped}`
    : `${formatTrendValue(rate * 100, 'pct')} passing on ${where}, ${skipped}`;
}

function heroNote(
  projects: readonly LandingProject[],
  headline: LandingHeadline,
  now: Date,
): TimedText {
  const names = (list: readonly LandingProject[]) =>
    joinNames(list.map(({ project }) => project.name));
  const withRun = projects.filter((project) => project.latestRun !== null);
  const counted = withRun.filter((project) => project.totalTests > 0);
  const empty = withRun.filter((project) => project.totalTests === 0);
  const [onlyEmpty] = empty;
  const parts: (string | TimeLabel)[] = [];

  if (counted.length > 0) {
    parts.push(`automated tests across ${projectsPhrase(counted.length)}. `);
    parts.push(resultSentence(counted, headline));
    if (empty.length === 1 && onlyEmpty !== undefined) {
      parts.push(` ${onlyEmpty.project.name}’s latest run had no tests, so it isn’t counted.`);
    } else if (empty.length > 1) {
      parts.push(` Latest runs of ${names(empty)} had no tests, so they aren’t counted.`);
    }
  } else if (empty.length === 1 && onlyEmpty !== undefined) {
    parts.push(
      `automated tests on the latest run. ${onlyEmpty.project.name}’s latest run had no tests, ` +
        'so nothing is counted.',
    );
  } else if (empty.length > 1) {
    parts.push(
      `automated tests on the latest runs. The latest runs of ${names(empty)} had no tests, so ` +
        'nothing is counted.',
    );
  } else {
    parts.push('automated tests so far.');
  }

  const stale = projects.filter((project) => project.health.problems.includes('stale'));
  const [onlyStale] = stale;
  if (stale.length === 1 && onlyStale?.lastReportAt) {
    parts.push(
      ` ${onlyStale.project.name} hasn’t reported since `,
      dateLabel(onlyStale.lastReportAt, now),
      '.',
    );
  } else if (stale.length > 1) {
    parts.push(` ${names(stale)} haven’t reported recently.`);
  }

  const never = projects.filter((project) => project.health.daysSinceLastReport === null);
  if (never.length === 1) parts.push(` ${names(never)} hasn’t reported yet.`);
  else if (never.length > 1) parts.push(` ${names(never)} haven’t reported yet.`);
  return parts;
}

export function landingView(landing: Landing, now: Date): LandingView {
  const { headline, projects } = landing;
  if (projects.length === 0) return { kind: 'none' };
  const names = new Map(projects.map(({ project }) => [project.slug, project.name]));
  const nameOf: NameOf = (slug) => names.get(slug) ?? slug;
  const passing = projectsPassingTile(headline.projectsPassing);
  return {
    kind: 'ready',
    heroTotal: formatCount(headline.totalTests),
    heroNote: heroNote(projects, headline, now),
    tiles: [
      passRateTile(headline, projects, nameOf),
      projectsReportingTile(headline, nameOf),
      runsTile(headline, nameOf),
      {
        label: passing.label,
        value: passing.value,
        ...(passing.sub === undefined ? {} : { sub: passing.sub }),
        fail: passing.fail,
      },
    ],
    cards: projects.map((summary) => card(summary, now)),
    recentRuns: landing.recentRuns.map((run) => feedRun(run, run.project, now)),
  };
}
