import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { acknowledgeAlert, checkStale } from './rpc.ts';

// The wrappers pass the caller's now, never the clock's, and say which function failed. What the
// functions do is proven against Postgres in lib/alerts/alerts.int.test.ts.

const ALERT_ID = '5d0c9a8e-2b7f-4f1a-9e3c-7a6b5c4d3e2f';
const NOW = new Date('2026-10-08T06:00:00.000Z');

interface Answer {
  readonly data?: unknown;
  readonly error?: { code: string; message: string } | null;
}

function fakeClient(answer: Answer) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return { data: answer.data ?? null, error: answer.error ?? null };
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe('checkStale', () => {
  it('calls check_stale with the given now and returns how many alerts it opened', async () => {
    const fake = fakeClient({ data: 2 });
    await expect(checkStale(fake.client, NOW)).resolves.toBe(2);
    expect(fake.calls).toEqual([
      { fn: 'check_stale', args: { p_now: '2026-10-08T06:00:00.000Z' } },
    ]);
  });

  it('names the function and the code when the call fails', async () => {
    const fake = fakeClient({ error: { code: '42501', message: 'permission denied' } });
    await expect(checkStale(fake.client, NOW)).rejects.toThrow(
      'check_stale: 42501 permission denied',
    );
  });

  it('refuses an answer that is not a count', async () => {
    const fake = fakeClient({ data: 'two' });
    await expect(checkStale(fake.client, NOW)).rejects.toThrow(
      'check_stale returned an unexpected result',
    );
  });
});

describe('acknowledgeAlert', () => {
  it('calls acknowledge_alert with the alert and the given now', async () => {
    const fake = fakeClient({});
    await expect(acknowledgeAlert(fake.client, ALERT_ID, NOW)).resolves.toBeUndefined();
    expect(fake.calls).toEqual([
      {
        fn: 'acknowledge_alert',
        args: { p_alert_id: ALERT_ID, p_now: '2026-10-08T06:00:00.000Z' },
      },
    ]);
  });

  it("passes the database's refusal on", async () => {
    const fake = fakeClient({
      error: { code: 'P0001', message: `acknowledge_alert: alert ${ALERT_ID} is already resolved` },
    });
    await expect(acknowledgeAlert(fake.client, ALERT_ID, NOW)).rejects.toThrow(
      `acknowledge_alert: P0001 acknowledge_alert: alert ${ALERT_ID} is already resolved`,
    );
  });
});
