import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

// The two alert functions only the secret-key client may call (spec section 12). The caller
// passes now, from lib/clock.ts, so the database never reads its own clock for them.

const failed = (fn: string, error: { code: string; message: string }): Error =>
  new Error(`${fn}: ${error.code} ${error.message}`);

/** Opens a stale alert for each project overdue at `now`; returns how many it opened. */
export async function checkStale(client: SupabaseClient, now: Date): Promise<number> {
  const { data, error } = await client.rpc('check_stale', { p_now: now.toISOString() });
  if (error) throw failed('check_stale', error);
  const opened = z.int().min(0).safeParse(data);
  if (!opened.success) throw new Error('check_stale returned an unexpected result');
  return opened.data;
}

/**
 * Acknowledges an open count_drop alert, which resolves it at `now`. The database refuses any
 * other kind, an alert already resolved, and an unknown one.
 */
export async function acknowledgeAlert(
  client: SupabaseClient,
  alertId: string,
  now: Date,
): Promise<void> {
  const { error } = await client.rpc('acknowledge_alert', {
    p_alert_id: alertId,
    p_now: now.toISOString(),
  });
  if (error) throw failed('acknowledge_alert', error);
}
