import type { SupabaseClient } from '@supabase/supabase-js';

import {
  type LinkVisitDetail,
  linkVisitDetail,
  type LinkVisitSummary,
  linkVisitSummaries,
  type VisitRow,
} from './stats.ts';

// The admin's reads of visits (spec section 14), for the admin page of a later PR. visits is
// closed to anon and authenticated (initial schema), so the caller passes the secret client, and
// only after it has checked the admin session. Only browser visits are read; the aggregation in
// stats.ts drops any other row too, so the figures never depend on this filter alone.

/** PostgREST answers at most 1,000 rows by default, so visits are read in pages of that size. */
export const VISIT_PAGE_SIZE = 1000;

const VISIT_COLUMNS =
  'tracked_link_id, session_id, path, entered_at, seconds_on_page, user_agent_class, ip_hash';

type Filter = (query: ReturnType<ReturnType<SupabaseClient['from']>['select']>) => typeof query;

async function readBrowserVisits(client: SupabaseClient, filter: Filter): Promise<VisitRow[]> {
  const rows: VisitRow[] = [];
  for (let from = 0; ; from += VISIT_PAGE_SIZE) {
    const query = filter(client.from('visits').select(VISIT_COLUMNS))
      .eq('user_agent_class', 'browser')
      .order('id', { ascending: true })
      .range(from, from + VISIT_PAGE_SIZE - 1);
    const { data, error } = await query.overrideTypes<VisitRow[], { merge: false }>();
    if (error) throw new Error(`visits: ${error.code} ${error.message}`);
    rows.push(...data);
    if (data.length < VISIT_PAGE_SIZE) return rows;
  }
}

/** The link detail's figures for one tracked link. */
export async function loadLinkVisitDetail(
  client: SupabaseClient,
  trackedLinkId: string,
): Promise<LinkVisitDetail> {
  return linkVisitDetail(
    await readBrowserVisits(client, (query) => query.eq('tracked_link_id', trackedLinkId)),
  );
}

/** The table's figures for every tracked link with a counted visit. */
export async function loadLinkVisitSummaries(
  client: SupabaseClient,
): Promise<Map<string, LinkVisitSummary>> {
  return linkVisitSummaries(
    await readBrowserVisits(client, (query) => query.not('tracked_link_id', 'is', null)),
  );
}
