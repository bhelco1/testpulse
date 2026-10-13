import { describe, expect, it, vi } from 'vitest';

import type { PublicClient } from '../supabase/public.ts';
import { loadLeadProject } from './lead.ts';

// The landing page's one read about a tracked visitor (spec sections 9 and 13.3): the lead
// project's slug for the session, through lead_project_for_session as anon, or null. What the
// function can and cannot return is proven against local Supabase in
// lib/tracked-links/sessions.int.test.ts.

const SESSION = '0b7c6f2e-4f1a-4c39-9a51-2d6f3e8b9c10';

function client(answer: { data?: unknown; error?: { code: string; message: string } | null }) {
  const rpc = vi.fn<(fn: string, args: unknown) => Promise<unknown>>(async () => ({
    data: answer.data ?? null,
    error: answer.error ?? null,
  }));
  return { client: { rpc } as unknown as PublicClient, rpc };
}

describe('loadLeadProject', () => {
  it('asks lead_project_for_session for the session and answers its slug', async () => {
    const fake = client({ data: 'routeserve' });
    expect(await loadLeadProject(SESSION, fake.client)).toBe('routeserve');
    expect(fake.rpc).toHaveBeenCalledWith('lead_project_for_session', { p_session_id: SESSION });
  });

  it('answers null when the session has no lead', async () => {
    expect(await loadLeadProject(SESSION, client({ data: null }).client)).toBeNull();
  });

  it('asks nothing without a session', async () => {
    const fake = client({ data: 'routeserve' });
    expect(await loadLeadProject(null, fake.client)).toBeNull();
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it('throws a database error rather than reading it as no lead', async () => {
    const fake = client({ error: { code: '42501', message: 'permission denied' } });
    await expect(loadLeadProject(SESSION, fake.client)).rejects.toThrow(
      'lead_project_for_session: 42501 permission denied',
    );
  });

  it.each([
    ['an object', { slug: 'routeserve', company: 'Acme' }],
    ['a number', 7],
    ['an empty string', ''],
  ])('refuses an answer that is %s', async (_label, data) => {
    await expect(loadLeadProject(SESSION, client({ data }).client)).rejects.toThrow(
      'lead_project_for_session returned an unexpected value',
    );
  });
});
