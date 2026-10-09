import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { loadLinkVisitDetail, loadLinkVisitSummaries, VISIT_PAGE_SIZE } from './load';
import type { VisitRow } from './stats';

// The admin's visit reads (spec section 14) with a fake client: the filters, paging past the
// API's row limit, and errors. Against Postgres they are proven in lib/visits/visits.int.test.ts.

const LINK = 'a0000000-0000-4000-8000-000000000001';

type Call = Array<[string, ...unknown[]]>;

function fakeClient(
  pages: Array<{ data?: VisitRow[]; error?: { code: string; message: string } }>,
) {
  const calls: Call[] = [];
  const chain = (call: Call): unknown =>
    new Proxy(
      {},
      {
        get: (_, property) => {
          if (property === 'then') {
            return (resolve: (value: unknown) => void) => {
              calls.push(call);
              const page = pages[calls.length - 1] ?? { data: [] };
              resolve({ data: page.data ?? null, error: page.error ?? null });
            };
          }
          return (...args: unknown[]) => chain([...call, [String(property), ...args]]);
        },
      },
    );
  const client = {
    from: (table: string) => chain([['from', table]]),
  } as unknown as SupabaseClient;
  return { client, calls };
}

const row = (overrides: Partial<VisitRow> = {}): VisitRow => ({
  tracked_link_id: LINK,
  session_id: 's1',
  path: '/',
  entered_at: '2026-09-18T16:02:00+00:00',
  seconds_on_page: 10,
  user_agent_class: 'browser',
  ip_hash: 'h1',
  ...overrides,
});

describe('loadLinkVisitDetail', () => {
  it('reads only the link’s browser visits from the visits table, in stable pages', async () => {
    const fake = fakeClient([{ data: [row()] }]);
    const detail = await loadLinkVisitDetail(fake.client, LINK);
    expect(detail.pageViews).toBe(1);
    const [call] = fake.calls;
    expect(call).toContainEqual(['from', 'visits']);
    expect(call).toContainEqual(['eq', 'tracked_link_id', LINK]);
    expect(call).toContainEqual(['eq', 'user_agent_class', 'browser']);
    expect(call).toContainEqual(['order', 'id', { ascending: true }]);
    expect(call).toContainEqual(['range', 0, VISIT_PAGE_SIZE - 1]);
  });

  it('keeps reading while a page comes back full', async () => {
    const full = Array.from({ length: VISIT_PAGE_SIZE }, (_, index) =>
      row({ session_id: `s${String(index)}` }),
    );
    const fake = fakeClient([{ data: full }, { data: [row({ session_id: 'last' })] }]);
    const detail = await loadLinkVisitDetail(fake.client, LINK);
    expect(detail.pageViews).toBe(VISIT_PAGE_SIZE + 1);
    expect(fake.calls[1]).toContainEqual(['range', VISIT_PAGE_SIZE, 2 * VISIT_PAGE_SIZE - 1]);
    expect(fake.calls).toHaveLength(2);
  });

  it('still drops a bot or preview row that reaches it', async () => {
    const fake = fakeClient([{ data: [row(), row({ user_agent_class: 'bot', session_id: 'b' })] }]);
    expect((await loadLinkVisitDetail(fake.client, LINK)).sessions).toBe(1);
  });

  it('throws a database error with its code', async () => {
    const fake = fakeClient([{ error: { code: '42501', message: 'permission denied' } }]);
    await expect(loadLinkVisitDetail(fake.client, LINK)).rejects.toThrow('visits: 42501');
  });
});

describe('loadLinkVisitSummaries', () => {
  it('reads browser visits of every tracked link and summarises each', async () => {
    const fake = fakeClient([{ data: [row()] }]);
    const summaries = await loadLinkVisitSummaries(fake.client);
    expect(summaries.get(LINK)?.pageViews).toBe(1);
    const [call] = fake.calls;
    expect(call).toContainEqual(['not', 'tracked_link_id', 'is', null]);
    expect(call).toContainEqual(['eq', 'user_agent_class', 'browser']);
  });
});
