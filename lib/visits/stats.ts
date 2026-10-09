import type { UserAgentClass } from './user-agent.ts';

// The admin's figures for tracked links (spec section 14; design v16 Admin, link detail and
// table; decisions of 2026-10-08). Pure: the visit rows are passed in. Only `browser` visits
// count, in every figure; bot and preview rows are stored but never read into a number here.

export interface VisitRow {
  tracked_link_id: string | null;
  session_id: string;
  path: string;
  entered_at: string;
  seconds_on_page: number | null;
  user_agent_class: UserAgentClass;
  ip_hash: string;
}

/**
 * Views and time on a page or project. `seconds` sums the views whose time is known and is null
 * when none is (the beacon never reported it), which the page shows as unknown, not as 0;
 * `untimedViews` counts the views it left out.
 */
export interface TimedViews {
  views: number;
  seconds: number | null;
  untimedViews: number;
}

export interface PageViewed extends TimedViews {
  path: string;
}

export interface ProjectTime extends TimedViews {
  slug: string;
}

export interface LinkVisitDetail {
  /** entered_at of the first and latest counted view; null before the link is opened. */
  firstSeen: Date | null;
  lastSeen: Date | null;
  /** Distinct session_id. */
  sessions: number;
  /** Distinct ip_hash. */
  visitors: number;
  pageViews: number;
  /** In the order each page was first opened. */
  pages: PageViewed[];
  /** Most time first; projects with no timed view last; then by slug. */
  perProject: ProjectTime[];
}

export interface LinkVisitSummary {
  pageViews: number;
  sessions: number;
  visitors: number;
  lastSeen: Date | null;
  /** Distinct paths, in the order first opened. */
  paths: string[];
}

const counted = (visit: VisitRow): boolean => visit.user_agent_class === 'browser';

// A slug as lib/projects/schema.ts allows it, ended by a path segment, a query or a fragment.
const PROJECT_PATH = /^\/p\/([a-z0-9][a-z0-9-]*)(?:[/?#]|$)/;

/** The project a path belongs to (`/p/{slug}` and everything under it), or null. */
export function projectSlugFromPath(path: string): string | null {
  return PROJECT_PATH.exec(path)?.[1] ?? null;
}

const enteredAt = (visit: VisitRow): number => Date.parse(visit.entered_at);

function inOrderEntered(visits: readonly VisitRow[]): VisitRow[] {
  return visits.filter(counted).sort((a, b) => enteredAt(a) - enteredAt(b));
}

function addView(totals: TimedViews, seconds: number | null): void {
  totals.views += 1;
  if (seconds === null) totals.untimedViews += 1;
  else totals.seconds = (totals.seconds ?? 0) + seconds;
}

const blank = (): TimedViews => ({ views: 0, seconds: null, untimedViews: 0 });

export function linkVisitDetail(visits: readonly VisitRow[]): LinkVisitDetail {
  const ordered = inOrderEntered(visits);
  const pages = new Map<string, PageViewed>();
  const projects = new Map<string, ProjectTime>();

  for (const visit of ordered) {
    const page = pages.get(visit.path) ?? { path: visit.path, ...blank() };
    addView(page, visit.seconds_on_page);
    pages.set(visit.path, page);

    const slug = projectSlugFromPath(visit.path);
    if (slug !== null) {
      const project = projects.get(slug) ?? { slug, ...blank() };
      addView(project, visit.seconds_on_page);
      projects.set(slug, project);
    }
  }

  const first = ordered[0];
  const last = ordered.at(-1);
  return {
    firstSeen: first === undefined ? null : new Date(enteredAt(first)),
    lastSeen: last === undefined ? null : new Date(enteredAt(last)),
    sessions: new Set(ordered.map((visit) => visit.session_id)).size,
    visitors: new Set(ordered.map((visit) => visit.ip_hash)).size,
    pageViews: ordered.length,
    pages: [...pages.values()],
    perProject: [...projects.values()].sort(
      (a, b) =>
        (b.seconds ?? -1) - (a.seconds ?? -1) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
    ),
  };
}

/** The table's row for every link with a counted visit; links without one are absent. */
export function linkVisitSummaries(visits: readonly VisitRow[]): Map<string, LinkVisitSummary> {
  const byLink = new Map<string, VisitRow[]>();
  for (const visit of inOrderEntered(visits)) {
    if (visit.tracked_link_id === null) continue;
    const rows = byLink.get(visit.tracked_link_id) ?? [];
    rows.push(visit);
    byLink.set(visit.tracked_link_id, rows);
  }

  const summaries = new Map<string, LinkVisitSummary>();
  for (const [linkId, rows] of byLink) {
    const detail = linkVisitDetail(rows);
    summaries.set(linkId, {
      pageViews: detail.pageViews,
      sessions: detail.sessions,
      visitors: detail.visitors,
      lastSeen: detail.lastSeen,
      paths: detail.pages.map((page) => page.path),
    });
  }
  return summaries;
}
