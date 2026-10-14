import type { ProjectPair } from '../admin/sync';
import type { LinkDetailData, OpenAlert, ProjectName } from '../admin/types';
import type { AlertKind } from '../alerts/schema';
import { formatCount, qty } from '../copy/count';
import { joinNames } from '../copy/names';
import {
  dateTimeLabel,
  formatRunDuration,
  relativeLabel,
  shortDate,
  type TimedText,
  type TimeLabel,
} from '../copy/time';
import { DAILY_JOB_TIME } from '../jobs/schedule';
import type { DailyStep, DailySummary } from '../jobs/summary';
import { daysSince } from '../stats/health';
import type { TrackedLinkRow } from '../tracked-links/create';
import type { LinkVisitSummary } from '../visits/stats';
import { projectSlugFromPath } from '../visits/stats';

// Admin's sections as their components take them (design/pages/Admin.dc.html, design/components.md
// "Admin", design/data-map.md "Admin"; spec sections 12, 14 and 15). Pure: the loaders' data
// (lib/admin/data.ts) and now are passed in. Where v16's copy contradicts the spec, the spec's
// facts are worded as briefly as the drawing (decision row of 2026-10-08, v16), and section 13,
// "Admin page as built", lists each such string for v17.

const HOUR_MS = 3_600_000;
/** Spec section 12: a last run more than this old is shown as a warning. */
export const OVERDUE_HOURS = 36;

// ---------- Open alerts ----------

export interface AlertRowView {
  readonly id: string;
  readonly kind: AlertKind;
  readonly kindWord: string;
  /** The row's accessible name, as the design gives it. */
  readonly label: string;
  readonly title: string;
  readonly body: string;
  readonly opened: TimeLabel;
  readonly closes: string;
  readonly canAcknowledge: boolean;
}

export interface AlertsView {
  readonly count: string;
  readonly alerts: readonly AlertRowView[];
}

const KIND_WORD: Record<AlertKind, string> = {
  stale: 'STALE',
  count_drop: 'COUNT DROP',
  empty_run: 'EMPTY REPORT',
  coverage_below_floor: 'BELOW FLOOR',
};

const reportKey = (detail: { job: string; module: string; platform: string }) =>
  `${detail.job}/${detail.module}/${detail.platform}`;

/** Lines % rounded down to one decimal, so it never reads as the floor while under it. */
const pctDown = (pct: number): string => (Math.floor(pct * 10) / 10).toFixed(1);

function alertRow({ alert, projectName, emptyReport }: OpenAlert, now: Date): AlertRowView {
  const common = {
    id: alert.id,
    kind: alert.kind,
    kindWord: KIND_WORD[alert.kind],
    label: `${KIND_WORD[alert.kind].toLowerCase()} alert`,
    opened: dateTimeLabel(new Date(alert.opened_at), now),
    canAcknowledge: alert.kind === 'count_drop',
  };
  switch (alert.kind) {
    case 'stale': {
      const last = new Date(alert.detail.last_report_at);
      const days = daysSince(last, now);
      return {
        ...common,
        title: `${projectName}: no report in ${days} days`,
        body:
          `No report in ${days} days. Expected every ${qty(alert.detail.expected_cadence_days, 'day')}; ` +
          `last report ${shortDate(last, now)}.`,
        closes: `Closes by itself when ${projectName} reports`,
      };
    }
    case 'count_drop': {
      const { baseline, current } = alert.detail;
      const fell = Math.floor(((baseline - current) * 100) / baseline);
      return {
        ...common,
        title: `${projectName}: test count fell ${fell}%`,
        body:
          `${reportKey(alert.detail)}: ${formatCount(baseline)} → ${formatCount(current)} tests ` +
          `(−${fell}%) since the previous default-branch run`,
        closes: 'Closes when the count recovers, or acknowledge it.',
      };
    }
    case 'empty_run': {
      const where =
        emptyReport === null
          ? ''
          : ` on ${emptyReport.branch} (${emptyReport.commitSha.slice(0, 7)})`;
      return {
        ...common,
        title: `${projectName}: a report held no tests`,
        body: `${reportKey(alert.detail)} parsed with 0 tests${where}.`,
        closes: 'Closes by itself when that key reports tests',
      };
    }
    case 'coverage_below_floor':
      return {
        ...common,
        title: `${projectName}: coverage under its floor`,
        body:
          `${alert.detail.module} lines ${pctDown(alert.detail.lines_pct)}% under its ` +
          `${String(alert.detail.floor)}% floor`,
        closes: 'Closes by itself when the module is back at its floor',
      };
  }
}

/** Open alerts, newest first. */
export function alertsView(alerts: readonly OpenAlert[], now: Date): AlertsView {
  const rows = [...alerts]
    .sort((a, b) => Date.parse(b.alert.opened_at) - Date.parse(a.alert.opened_at))
    .map((alert) => alertRow(alert, now));
  return { count: rows.length === 0 ? 'None' : `${rows.length} open`, alerts: rows };
}

// ---------- Tracked links ----------

/** A visited page's name: the site's own pages by name, a project's by the project. */
export function pageLabel(path: string, names: ReadonlyMap<string, string>): string {
  if (path === '/') return 'Overview';
  if (path === '/how-its-tested') return 'How it’s tested';
  if (path === '/privacy') return 'Privacy';
  const slug = projectSlugFromPath(path);
  if (slug === null) return 'Other page';
  const name = names.get(slug) ?? slug;
  const rest = path.slice(`/p/${slug}`.length);
  if (rest.startsWith('/runs/')) return `${name} run`;
  if (rest.startsWith('/tests/')) return `${name} test history`;
  return name;
}

const isDrillDown = (label: string) => / (run|test history)$/.test(label);

export interface LinkRowView {
  readonly id: string;
  readonly href: string;
  readonly company: string;
  readonly role: string;
  readonly notes: string | null;
  readonly sent: string;
  readonly opened: { readonly text: string; readonly counted: boolean };
  readonly lastSeen: TimeLabel | null;
  /** The pages opened, by name, without run and test pages, as the design lists them. */
  readonly pages: readonly string[];
  /** `/v/{token}`; the page puts the site's origin in front. */
  readonly path: string;
}

export interface LinksView {
  readonly count: string;
  readonly links: readonly LinkRowView[];
}

const sentText = (link: TrackedLinkRow, now: Date): string =>
  link.sent_at === null ? '—' : shortDate(new Date(link.sent_at), now);

const nameMap = (projects: readonly Pick<ProjectName, 'slug' | 'name'>[]) =>
  new Map(projects.map((project) => [project.slug, project.name]));

export function linksView(
  links: readonly TrackedLinkRow[],
  figures: ReadonlyMap<string, LinkVisitSummary>,
  projects: readonly Pick<ProjectName, 'slug' | 'name'>[],
  now: Date,
): LinksView {
  const names = nameMap(projects);
  return {
    count: qty(links.length, 'link'),
    links: links.map((link) => {
      const seen = figures.get(link.id);
      const labels = (seen?.paths ?? []).map((path) => pageLabel(path, names));
      return {
        id: link.id,
        href: `/admin/links/${link.id}`,
        company: link.company,
        role: link.role,
        notes: link.notes,
        sent: sentText(link, now),
        opened:
          seen === undefined
            ? { text: 'Not yet opened', counted: false }
            : {
                text: `${qty(seen.sessions, 'session')} · ${qty(seen.visitors, 'visitor')}`,
                counted: true,
              },
        lastSeen: seen?.lastSeen ? relativeLabel(seen.lastSeen, now) : null,
        pages: [...new Set(labels.filter((label) => !isDrillDown(label)))],
        path: `/v/${link.token}`,
      };
    }),
  };
}

export interface LinkDetailView {
  readonly company: string;
  readonly role: string;
  /** Null: none given, shown as "—" in --ink-3. */
  readonly contact: string | null;
  /** Null: no lead project, so the link opens the overview. */
  readonly lead: { readonly name: string; readonly private: boolean } | null;
  readonly sent: string;
  readonly notes: string | null;
  readonly path: string;
  readonly opened: boolean;
  readonly firstSeen: TimeLabel | null;
  readonly lastSeen: TimeLabel | null;
  readonly sessions: string;
  readonly visitors: string;
  readonly pages: readonly {
    readonly label: string;
    readonly path: string;
    readonly views: string;
    /** Null: never measured, shown as "—" in --ink-3, never "0 s". */
    readonly time: string | null;
  }[];
  readonly perProject: readonly {
    readonly name: string;
    /** Null: never measured, shown as "—" in --ink-3. */
    readonly time: string | null;
    /** The bar's width: this project's time as a share of the longest. */
    readonly share: string;
  }[];
}

// A time the beacon never reported is unknown, not 0 (decision row of 2026-10-08).
const seconds = (value: number | null): string | null =>
  value === null ? null : formatRunDuration(value * 1000);

export function linkDetailView(
  { link, figures, projects }: LinkDetailData,
  now: Date,
): LinkDetailView {
  const names = nameMap(projects);
  const lead =
    link.lead_project_slug === null
      ? null
      : (projects.find((project) => project.slug === link.lead_project_slug) ?? null);
  const longest = Math.max(0, ...figures.perProject.map((project) => project.seconds ?? 0));
  return {
    company: link.company,
    role: link.role,
    contact: link.contact,
    lead:
      link.lead_project_slug === null
        ? null
        : lead === null
          ? { name: link.lead_project_slug, private: false }
          : { name: lead.name, private: lead.visibility === 'private' },
    sent: sentText(link, now),
    notes: link.notes,
    path: `/v/${link.token}`,
    opened: figures.firstSeen !== null,
    firstSeen: figures.firstSeen === null ? null : dateTimeLabel(figures.firstSeen, now),
    lastSeen: figures.lastSeen === null ? null : relativeLabel(figures.lastSeen, now),
    sessions: formatCount(figures.sessions),
    visitors: formatCount(figures.visitors),
    pages: figures.pages.map((page) => ({
      label: pageLabel(page.path, names),
      path: page.path,
      views: formatCount(page.views),
      time: seconds(page.seconds),
    })),
    perProject: figures.perProject.map((project) => ({
      name: names.get(project.slug) ?? project.slug,
      time: seconds(project.seconds),
      share:
        project.seconds === null || longest === 0
          ? '0%'
          : `${Math.round((project.seconds * 100) / longest)}%`,
    })),
  };
}

// ---------- Projects ----------

export type SyncTone = 'pass' | 'attn';

export interface ProjectRowView {
  readonly slug: string;
  readonly name: string;
  readonly visibility: 'Public' | 'Private';
  readonly private: boolean;
  /** The latest CI report; null when there is none, shown as "—". */
  readonly report: { readonly when: TimeLabel | null; readonly stale: boolean };
  readonly sync: {
    readonly word: string;
    readonly tone: SyncTone;
    readonly detail: string | null;
    /** A command the detail ends with, drawn in mono and followed by a full stop. */
    readonly command: string | null;
  };
  /** The slug to rotate the key of; null when there is no row, so no key. */
  readonly rotateSlug: string | null;
}

function syncWords(pair: ProjectPair): ProjectRowView['sync'] {
  const { sync } = pair;
  switch (sync.kind) {
    case 'in-sync':
      return { word: '✓ In sync', tone: 'pass', detail: null, command: null };
    case 'differs':
      return {
        word: '≠ Differs',
        tone: 'attn',
        detail: sync.fields
          .map(({ field, yaml, database }) =>
            yaml === null || database === null
              ? `${field} differs`
              : `${field}: YAML ${yaml}, database ${database}`,
          )
          .join(' · '),
        command: null,
      };
    case 'not-registered':
      return {
        word: '+ Not registered',
        tone: 'attn',
        detail: `${sync.file} has no database row. Register it with `,
        command: `npm run project:add ${pair.slug}`,
      };
    case 'no-yaml':
      return {
        word: '? No YAML',
        tone: 'attn',
        detail: 'A database row with no projects/*.yaml file. The sync leaves it as it is.',
        command: null,
      };
  }
}

export function projectsView(
  pairs: readonly ProjectPair[],
  lastReports: ReadonlyMap<string, Date | null>,
  now: Date,
): ProjectRowView[] {
  return pairs.map((pair) => {
    const source = pair.row ?? pair.file;
    if (source === null) throw new Error(`project ${pair.slug} has neither a file nor a row`);
    const last = pair.row === null ? null : (lastReports.get(pair.row.id) ?? null);
    const cadence = source.expected_cadence_days;
    return {
      slug: pair.slug,
      name: source.name,
      visibility: source.visibility === 'private' ? 'Private' : 'Public',
      private: source.visibility === 'private',
      report: {
        when: last === null ? null : relativeLabel(last, now),
        stale: last !== null && daysSince(last, now) > cadence,
      },
      sync: syncWords(pair),
      rotateSlug: pair.row === null ? null : pair.slug,
    };
  });
}

export interface LeadOption {
  readonly slug: string;
  readonly label: string;
  readonly private: boolean;
}

/** Every registered project, public or private, as a lead project (decision row of 2026-10-12). */
export function leadOptions(pairs: readonly ProjectPair[]): LeadOption[] {
  return pairs.flatMap(({ row }) =>
    row === null
      ? []
      : [
          {
            slug: row.slug,
            label: row.visibility === 'private' ? `${row.name} (private)` : row.name,
            private: row.visibility === 'private',
          },
        ],
  );
}

// ---------- Daily job ----------

export type TileTone = 'normal' | 'pass' | 'attn' | 'fail' | 'muted';

export interface JobTileView {
  readonly label: string;
  readonly value: TimedText;
  readonly sub: TimedText;
  readonly tone: TileTone;
}

export interface DailyJobView {
  readonly notice: {
    readonly tone: 'attn' | 'neutral' | 'fail';
    readonly title: string;
    readonly body: string;
  } | null;
  readonly tiles: readonly JobTileView[];
}

const STEP_NAME: Record<DailyStep, string> = {
  heartbeat: 'heartbeat',
  stale_check: 'stale check',
  prune: 'prune',
};
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const LABELS = ['Last run', 'Heartbeat', 'Stale check', 'Prune'] as const;
const NEXT_RUN = `around ${DAILY_JOB_TIME}`;

function rowsRemoved(summary: DailySummary): number {
  const p = summary.pruned;
  return p.results + p.result_failures + p.visits + p.tracked_sessions + p.rate_limit_buckets;
}

// v17 (components.md "Daily job tiles"): what a failed prune removed, each non-zero kind in the
// Prune sub's order, or "0 rows" when none. Its batches each commit, so these stay removed.
function removedCounts(summary: DailySummary): string {
  const p = summary.pruned;
  const kinds = [
    [p.results, 'result'],
    [p.result_failures, 'failure text'],
    [p.visits, 'visit'],
    [p.tracked_sessions, 'tracked session'],
    [p.rate_limit_buckets, 'rate-limit bucket'],
  ] as const;
  const counts = kinds.filter(([n]) => n > 0).map(([n, unit]) => qty(n, unit));
  return counts.length === 0 ? '0 rows' : joinNames(counts);
}

export function dailyJobView(
  summary: DailySummary | null,
  projects: readonly Pick<ProjectName, 'id' | 'name'>[],
  now: Date,
): DailyJobView {
  if (summary === null) {
    return {
      notice: {
        tone: 'neutral',
        title: 'The daily job hasn’t run yet',
        body:
          `Its first run is due ${NEXT_RUN}. If this still shows 36 hours after the deploy, ` +
          'check the cron in Vercel.',
      },
      tiles: LABELS.map((label) => ({
        label,
        value: ['Never run'],
        sub: ['No run summary yet'],
        tone: 'muted',
      })),
    };
  }

  const started = new Date(summary.started_at);
  const at = dateTimeLabel(started, now);
  const ago = relativeLabel(started, now);
  const hours = Math.floor((now.getTime() - started.getTime()) / HOUR_MS);
  const overdue = now.getTime() - started.getTime() > OVERDUE_HOURS * HOUR_MS;
  const unfinished = summary.status === 'failed' && summary.failed_step === null;
  const failed = new Set(summary.failed_steps);
  const removed = rowsRemoved(summary);

  const lastRun: JobTileView = unfinished
    ? { label: 'Last run', value: ['✕ Didn’t finish'], sub: [at, ' · ', ago], tone: 'fail' }
    : summary.failed_step !== null
      ? {
          label: 'Last run',
          value: [`✕ Failed at ${STEP_NAME[summary.failed_step]}`],
          sub: [at, ' · ', ago],
          tone: 'fail',
        }
      : overdue
        ? {
            label: 'Last run',
            value: ['◷ ', at],
            sub: [ago, ' · expected every 24 h'],
            tone: 'attn',
          }
        : { label: 'Last run', value: [at], sub: [ago, ` · next ${NEXT_RUN}`], tone: 'normal' };

  const notRecorded = (label: string): JobTileView => ({
    label,
    value: ['—'],
    sub: ['Not recorded'],
    tone: 'muted',
  });
  const stopped = (label: string, sub: string): JobTileView => ({
    label,
    value: ['✕ Failed'],
    sub: [sub],
    tone: 'fail',
  });

  const heartbeat: JobTileView = failed.has('heartbeat')
    ? stopped('Heartbeat', 'Stopped with the error above')
    : summary.heartbeat_written
      ? { label: 'Heartbeat', value: ['✓ Written'], sub: ['Database kept awake'], tone: 'pass' }
      : {
          label: 'Heartbeat',
          value: ['✕ Not written'],
          sub: ['Database not touched'],
          tone: 'fail',
        };

  const names = new Map(projects.map((project) => [project.id, project.name]));
  const opened = summary.stale_opened;
  const staleCheck: JobTileView = failed.has('stale_check')
    ? stopped('Stale check', 'Stopped with the error above')
    : opened === null || summary.projects_checked === null
      ? notRecorded('Stale check')
      : {
          label: 'Stale check',
          value: [`${formatCount(opened)} opened`],
          sub: [
            opened > 0
              ? `Opened: ${joinNames(summary.stale_opened_project_ids.map((id) => names.get(id) ?? id))}`
              : `${qty(summary.projects_checked, 'project')} checked`,
          ],
          tone: 'normal',
        };

  const p = summary.pruned;
  const prune: JobTileView = failed.has('prune')
    ? stopped('Prune', `Removed ${removedCounts(summary)} before failing`)
    : unfinished
      ? notRecorded('Prune')
      : {
          label: 'Prune',
          value: [`${qty(removed, 'row')} removed`],
          sub: [
            `Results ${formatCount(p.results)} · failure text ${formatCount(p.result_failures)} · ` +
              `visits ${formatCount(p.visits)} · tracked sessions ${formatCount(p.tracked_sessions)} · ` +
              `rate-limit buckets ${formatCount(p.rate_limit_buckets)}`,
          ],
          tone: 'normal',
        };

  const fromThatRun = (tile: JobTileView): JobTileView =>
    overdue && tile.tone !== 'muted' ? { ...tile, sub: ['From that run · ', ...tile.sub] } : tile;

  let notice: DailyJobView['notice'] = null;
  if (overdue) {
    notice = {
      tone: 'attn',
      title: 'The daily job is overdue',
      body:
        `Its last run was ${hours} hours ago; it should run every 24 hours. Until it runs, no ` +
        'heartbeat is written, stale projects aren’t flagged and nothing is pruned. Check the ' +
        'cron in Vercel.',
    };
  } else if (unfinished) {
    notice = {
      tone: 'fail',
      title: 'The last run didn’t finish',
      body:
        `It started at ${at.text} and recorded no end, so the platform may have stopped it. ` +
        `The next run tries again ${NEXT_RUN}.`,
    };
  } else if (summary.failed_step !== null) {
    const step = STEP_NAME[summary.failed_step];
    const finished = (['heartbeat', 'stale_check', 'prune'] as const)
      .filter((each) => !failed.has(each))
      .map((each) => STEP_NAME[each]);
    const outcome =
      summary.failed_step !== 'prune'
        ? '.'
        : ` after removing ${removedCounts(summary)}; rows removed before the failure stay removed.`;
    notice = {
      tone: 'fail',
      title: `The last run failed at the ${step} step`,
      body:
        (finished.length > 0 ? `${capital(joinNames(finished))} finished. ` : '') +
        `${capital(step)} stopped with “${summary.error ?? ''}”${outcome} ` +
        `The next run tries again ${NEXT_RUN}.`,
    };
  }

  return {
    notice,
    tiles: [lastRun, fromThatRun(heartbeat), fromThatRun(staleCheck), fromThatRun(prune)],
  };
}
