import type { Alert } from '../alerts/schema.ts';
import type { DailySummary } from '../jobs/summary.ts';
import type { TrackedLinkRow } from '../tracked-links/create.ts';
import type { LinkVisitDetail, LinkVisitSummary } from '../visits/stats.ts';
import type { ProjectPair } from './sync.ts';

// What admin's loaders (lib/admin/data.ts) read, as lib/pages/admin.ts maps it into the page. Types
// only, so the mapping and its tests never import the secret client.

/** An open alert with what its row on the page needs beyond the alert itself. */
export interface OpenAlert {
  readonly alert: Alert;
  /** The project's display name. */
  readonly projectName: string;
  /** For empty_run: the run the empty report belongs to. */
  readonly emptyReport: { readonly branch: string; readonly commitSha: string } | null;
}

/** A project's name and visibility, for lead projects, page names and the job's stale names. */
export interface ProjectName {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly visibility: 'public' | 'private';
}

export interface AdminPageData {
  readonly alerts: readonly OpenAlert[];
  /** Newest first. */
  readonly links: readonly TrackedLinkRow[];
  /** Counted visits per link id; a link with none is absent. */
  readonly linkFigures: ReadonlyMap<string, LinkVisitSummary>;
  readonly projects: readonly ProjectPair[];
  /** The latest CI report's finished_at per project id, at or before now; null if none. */
  readonly lastReports: ReadonlyMap<string, Date | null>;
  /** The latest daily job's summary, with the heartbeat it is stored on; null if it never ran. */
  readonly job: DailySummary | null;
}

export interface LinkDetailData {
  readonly link: TrackedLinkRow;
  readonly figures: LinkVisitDetail;
  readonly projects: readonly ProjectName[];
}

// What admin's actions answer (lib/admin/actions.ts), here so client components can name them
// without importing the module that makes the secret client.

/** Refused for want of a session (the drawn session-ended state), or failed. */
export type Refused = { readonly status: 'session-ended' } | { readonly status: 'error' };

export type CreateLinkResult =
  | { readonly status: 'created'; readonly id: string; readonly url: string }
  | { readonly status: 'invalid'; readonly fields: readonly ('company' | 'role')[] }
  | Refused;
export type AcknowledgeResult = { readonly status: 'acknowledged' } | Refused;
export type RotateKeyResult = { readonly status: 'rotated'; readonly key: string } | Refused;
export type DeleteLinkResult = { readonly status: 'deleted' } | Refused;
