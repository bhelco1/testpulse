import { z } from 'zod';

import { createPublicClient, type PublicClient } from '../supabase/public.ts';

// The version of the data public pages show (decision 2026-11-17), read once per page view and
// never cached: every cached public read is keyed by it. It is how many reports there are and when
// the newest was written. A new report and a re-posted one each add a row with a newer created_at,
// and deleting a project deletes its reports, so every write the pages show changes it, whatever
// path it took (the route, the seed, a backfill, a spec's direct write). The daily prune touches
// no report, so the cron route revalidates the cache itself. Anon may read reports in full
// (section 9), and the version holds a count and a time, nothing hidden.

const VersionSchema = z.object({
  count: z.int().min(0),
  data: z.array(z.object({ created_at: z.iso.datetime({ offset: true }) })).max(1),
});

export async function readDataVersion(
  client: PublicClient = createPublicClient(),
): Promise<string> {
  const { data, error, count } = await client
    .from('reports')
    .select('created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`read the data version: ${error.code} ${error.message}`);
  const parsed = VersionSchema.safeParse({ count, data });
  if (!parsed.success) throw new Error('read the data version returned an unexpected answer');
  const [newest] = parsed.data.data;
  return `${String(parsed.data.count)}:${newest?.created_at ?? ''}`;
}
