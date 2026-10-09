import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { createTrackedLink, TOKEN_ATTEMPTS } from './create';

// Creating a tracked link (spec section 14, Phase 6 criterion 3) with a fake client: what is
// written, the lead project check, and the retry on a token collision. Against Postgres it is
// proven in lib/tracked-links/tracked-links.int.test.ts.

const NOW = new Date('2026-10-08T15:30:00.000Z');

interface Answer {
  data?: unknown;
  error?: { code: string; message: string } | null;
}
type Call = { table: string; calls: Array<[string, ...unknown[]]> };

function fakeClient(respond: (call: Call, index: number) => Answer) {
  const calls: Call[] = [];
  const chain = (call: Call): unknown =>
    new Proxy(
      {},
      {
        get: (_, property) => {
          if (property === 'then') {
            return (resolve: (value: unknown) => void) => {
              calls.push(call);
              const { data = null, error = null } = respond(call, calls.length - 1);
              resolve({ data, error });
            };
          }
          return (...args: unknown[]) =>
            chain({ ...call, calls: [...call.calls, [String(property), ...args]] });
        },
      },
    );
  const client = {
    from: (table: string) => chain({ table, calls: [] }),
  } as unknown as SupabaseClient;
  return { client, calls };
}

const inserted = (call: Call): Record<string, unknown> => {
  const insert = call.calls.find(([method]) => method === 'insert');
  return (insert?.[1] ?? {}) as Record<string, unknown>;
};

const row = (values: Record<string, unknown>) => ({
  id: '5f1c2e3d-4b5a-4c6d-8e7f-9a0b1c2d3e4f',
  created_at: NOW.toISOString(),
  ...values,
});

const COLLISION = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "tracked_links_token_key"',
};

const sequence = (...tokens: string[]) => {
  let index = 0;
  return () => tokens[index++] ?? 'ZZZZZZZZZZZZ';
};

describe('createTrackedLink', () => {
  it('validates, then inserts the link with a generated token and the caller’s now', async () => {
    const fake = fakeClient((call) => ({ data: row(inserted(call)) }));
    const result = await createTrackedLink(
      fake.client,
      {
        company: ' Acme Health ',
        role: 'Director of Quality Engineering',
        sent_on: '2026-09-18',
        notes: 'Met at the meetup.',
      },
      NOW,
      { generateToken: sequence('Qm8r2LxT0aZe') },
    );
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.table).toBe('tracked_links');
    expect(inserted(fake.calls[0] as Call)).toEqual({
      token: 'Qm8r2LxT0aZe',
      company: 'Acme Health',
      role: 'Director of Quality Engineering',
      contact: null,
      sent_at: '2026-09-18T00:00:00.000Z',
      notes: 'Met at the meetup.',
      lead_project_slug: null,
      created_at: NOW.toISOString(),
    });
    expect(result).toEqual({
      ok: true,
      link: expect.objectContaining({ token: 'Qm8r2LxT0aZe', company: 'Acme Health' }),
    });
  });

  it('refuses invalid input before touching the database', async () => {
    const fake = fakeClient(() => ({}));
    await expect(
      createTrackedLink(fake.client, { company: 'Acme' }, NOW, {
        generateToken: sequence('Qm8r2LxT0aZe'),
      }),
    ).rejects.toThrow(/role/);
    expect(fake.calls).toHaveLength(0);
  });

  it('checks a lead project exists, whatever its visibility, before inserting', async () => {
    const fake = fakeClient((call) =>
      call.table === 'projects' ? { data: { slug: 'routeserve' } } : { data: row(inserted(call)) },
    );
    const result = await createTrackedLink(
      fake.client,
      { company: 'Globex', role: 'QA Manager', lead_project_slug: 'routeserve' },
      NOW,
      { generateToken: sequence('Tb9eJx3mRq6u') },
    );
    expect(result.ok).toBe(true);
    const [lookup, insert] = fake.calls;
    expect(lookup?.table).toBe('projects');
    expect(lookup?.calls).toContainEqual(['eq', 'slug', 'routeserve']);
    // No visibility filter: a private project may lead.
    expect(lookup?.calls.flat()).not.toContain('visibility');
    expect(inserted(insert as Call).lead_project_slug).toBe('routeserve');
  });

  it('answers unknown_lead_project, and inserts nothing, for a slug with no project', async () => {
    const fake = fakeClient(() => ({ data: null }));
    const result = await createTrackedLink(
      fake.client,
      { company: 'Globex', role: 'QA Manager', lead_project_slug: 'no-such-project' },
      NOW,
      { generateToken: sequence('Tb9eJx3mRq6u') },
    );
    expect(result).toEqual({ ok: false, reason: 'unknown_lead_project' });
    expect(fake.calls.map((call) => call.table)).toEqual(['projects']);
  });

  it('draws a new token and tries again when the token is already taken', async () => {
    const fake = fakeClient((call, index) =>
      index < 2 ? { error: COLLISION } : { data: row(inserted(call)) },
    );
    const result = await createTrackedLink(fake.client, { company: 'A', role: 'B' }, NOW, {
      generateToken: sequence('AAAAAAAAAAAA', 'BBBBBBBBBBBB', 'CCCCCCCCCCCC'),
    });
    expect(fake.calls.map((call) => inserted(call).token)).toEqual([
      'AAAAAAAAAAAA',
      'BBBBBBBBBBBB',
      'CCCCCCCCCCCC',
    ]);
    expect(result).toEqual({
      ok: true,
      link: expect.objectContaining({ token: 'CCCCCCCCCCCC' }),
    });
  });

  it(`gives up after ${String(TOKEN_ATTEMPTS)} collisions`, async () => {
    const fake = fakeClient(() => ({ error: COLLISION }));
    await expect(
      createTrackedLink(fake.client, { company: 'A', role: 'B' }, NOW, {
        generateToken: sequence('AAAAAAAAAAAA'),
      }),
    ).rejects.toThrow(`no unused token after ${String(TOKEN_ATTEMPTS)} attempts`);
    expect(fake.calls).toHaveLength(TOKEN_ATTEMPTS);
  });

  it('does not retry any other unique violation or error', async () => {
    const other = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "tracked_links_pkey"',
    };
    const fake = fakeClient(() => ({ error: other }));
    await expect(
      createTrackedLink(fake.client, { company: 'A', role: 'B' }, NOW, {
        generateToken: sequence('AAAAAAAAAAAA'),
      }),
    ).rejects.toThrow('tracked_links_pkey');
    expect(fake.calls).toHaveLength(1);
  });

  it('reports a failed lead project lookup rather than reading it as unknown', async () => {
    const fake = fakeClient(() => ({ error: { code: '42501', message: 'permission denied' } }));
    await expect(
      createTrackedLink(
        fake.client,
        { company: 'A', role: 'B', lead_project_slug: 'routeserve' },
        NOW,
      ),
    ).rejects.toThrow('42501');
  });
});
