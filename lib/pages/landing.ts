import type { StatTileAttention } from '../../components/StatTile/StatTile';
import type { WebProjectCardProps } from '../../components/ProjectCard/ProjectCard';
import type { FeedRun } from '../../components/RunFeedRow/RunFeedRow';
import { formatTrendValue } from '../charts/format';
import { formatCount, qty } from '../copy/count';
import { projectsPassingTile } from '../copy/projects-passing';
import { joinNames } from '../copy/names';
import { dateLabel, formatRunDuration, relativeLabel } from '../copy/time';
import { layerSegments } from '../design/layers';
import type { Landing, LandingProject } from '../queries/landing';
import type { LandingHeadline } from '../stats/summary';
import { feedRun, runHref } from './feed';

// The landing page, /, as its components take it (design/pages/Landing.dc.html,
// design/components.md, design/data-map.md "Landing"). Pure: the page passes the loader's result
// and now, so every word and figure here is tested without a database or a clock. States the
// design does not draw are left out rather than guessed (docs/spec.md section 13.3).

export interface LandingTile {
  readonly label: string;
  readonly value: string;
  readonly sub?: string;
  readonly attention?: StatTileAttention;
  readonly fail?: boolean;
}

export type LandingCard = Omit<WebProjectCardProps, 'variant' | 'loading' | 'headingLevel'>;

export interface LandingView {
  /** The hero figure: distinct tests in every project's latest run (section 11, Total tests). */
  readonly heroTotal: string;
  /** Pass rate, Projects reporting, Runs in last 30 days, Projects passing; undrawn ones left out. */
  readonly tiles: readonly LandingTile[];
  readonly cards: readonly LandingCard[];
  readonly recentRuns: readonly FeedRun[];
}

type NameOf = (slug: string) => string;

// "Latest runs · 0 skipped, excluded" (healthy), "1,189 of 1,190 · 0 skipped, excluded" (a
// failing run) and "RouteServe only · 0 skipped, excluded" (another project's run was empty) are
// the three sub-lines the design draws. Any other mix has no drawn lead, so it has no sub-line.
function passRateTile(
  { passRate }: LandingHeadline,
  projects: readonly LandingProject[],
  nameOf: NameOf,
): LandingTile | null {
  if (passRate.rate === null) return null;
  const value = formatTrendValue(passRate.rate * 100, 'pct');
  const withRun = projects.filter((project) => project.latestRun !== null).length;
  const allCounted = passRate.counted.length === withRun;
  // "{counted projects} only" is a name list (v9 item 6); only one counted project is drawn so
  // far, and the other mixes come with the landing tiles' own PR.
  const lead =
    allCounted && passRate.failed > 0
      ? `${formatCount(passRate.passed)} of ${formatCount(passRate.passed + passRate.failed)}`
      : allCounted
        ? 'Latest runs'
        : passRate.counted.length === 1 && passRate.failed === 0
          ? `${joinNames(passRate.counted.map(nameOf))} only`
          : null;
  if (lead === null) return { label: 'Pass rate', value };
  return {
    label: 'Pass rate',
    value,
    sub: `${lead} · ${formatCount(passRate.skipped)} skipped, excluded`,
  };
}

// Drawn: "2" with every project reporting, and "1 of 2" with "RouteServe silent 12 days" in
// amber. The healthy sub-line ("3 once testpulse reports on itself") is copy with no data
// behind it; several silent projects and a project that has never reported are not drawn.
function projectsReportingTile(
  { projectsReporting }: LandingHeadline,
  nameOf: NameOf,
): LandingTile | null {
  const { reporting, registered, silent, notReporting } = projectsReporting;
  if (notReporting.length > 0) return null;
  const label = 'Projects reporting';
  if (silent.length === 0) return { label, value: formatCount(reporting) };
  const value = `${formatCount(reporting)} of ${formatCount(registered)}`;
  const [only] = silent;
  if (silent.length > 1 || only === undefined) return { label, value };
  return {
    label,
    value,
    attention: { icon: 'stale', text: `${nameOf(only.slug)} silent ${qty(only.days, 'day')}` },
  };
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

export function landingView(landing: Landing, now: Date): LandingView {
  const names = new Map(landing.projects.map(({ project }) => [project.slug, project.name]));
  const nameOf: NameOf = (slug) => names.get(slug) ?? slug;
  const { headline, projects } = landing;
  const passing = projectsPassingTile(headline.projectsPassing);
  const tiles = [
    passRateTile(headline, projects, nameOf),
    projectsReportingTile(headline, nameOf),
    runsTile(headline, nameOf),
    {
      label: passing.label,
      value: passing.value,
      ...(passing.sub === undefined ? {} : { sub: passing.sub }),
      fail: passing.fail,
    },
  ];
  return {
    heroTotal: formatCount(headline.totalTests),
    tiles: tiles.filter((candidate): candidate is LandingTile => candidate !== null),
    cards: projects.map((summary) => card(summary, now)),
    recentRuns: landing.recentRuns.map((run) => feedRun(run, run.project, now)),
  };
}
