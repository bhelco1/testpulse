import type { TimeLabel } from '../copy/time';
import type { PublicClient } from '../supabase/public';

// The live feed's one realtime subscription (spec section 4, decision rows of 2026-09-21 and
// 2026-09-28): INSERT on public.reports, the only published table, through the publishable-key
// client. A report event only says that something arrived; the page is then re-rendered on the
// server through lib/queries, so nothing in the payload is ever read or shown.

/** The feed's connection as the page shows it; "connecting" shows neither "Live" nor "Offline". */
export type LiveState = 'connecting' | 'live' | 'offline';

/**
 * How long a page waits after the last report event before it refreshes (decision 2026-09-29,
 * live feed). A reporter posts a run's reports one after another, routeserve's three within a few
 * seconds, so a burst becomes one refresh; reports minutes apart each get their own.
 */
export const REFRESH_DEBOUNCE_MS = 2_000;

export interface ReportWatch {
  onReport: () => void;
  onState: (state: Exclude<LiveState, 'connecting'>) => void;
}

const REPORTS = { event: 'INSERT', schema: 'public', table: 'reports' } as const;

function refusesBinding(payload: unknown): boolean {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'extension' in payload &&
    payload.extension === 'postgres_changes' &&
    'status' in payload &&
    payload.status === 'error'
  );
}

/**
 * Subscribes to report inserts and returns the function that stops it. Reconnecting is the
 * Supabase client's own: after a dropped socket or a refused join it rejoins with backoff, and
 * each successful rejoin reports SUBSCRIBED again (decision 2026-09-29, live feed).
 */
export function watchReports(client: PublicClient, watch: ReportWatch): () => void {
  let active = true;
  // wait: SUBSCRIBED only once Postgres is listening, so "Live" never shows before a report
  // would reach the page, and a table Realtime will not publish fails the join instead.
  const channel = client
    .channel('live-reports', { config: { postgres_changes_options: { wait: true } } })
    .on('postgres_changes', REPORTS, () => {
      if (active) watch.onReport();
    })
    .on('system', {}, (payload: unknown) => {
      if (active && refusesBinding(payload)) watch.onState('offline');
    })
    .subscribe((status) => {
      if (active) watch.onState(status === 'SUBSCRIBED' ? 'live' : 'offline');
    });
  return () => {
    active = false;
    void client.removeChannel(channel);
  };
}

type FeedConnection =
  { connected?: undefined } | { connected: true } | { connected: false; asOf: TimeLabel };

/** RunFeed's connection props: none while connecting, and the page's data time when offline. */
export function feedConnection(state: LiveState, asOf: TimeLabel): FeedConnection {
  switch (state) {
    case 'connecting':
      return {};
    case 'live':
      return { connected: true };
    case 'offline':
      return { connected: false, asOf };
  }
}
