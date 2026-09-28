import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PublicClient } from '../supabase/public.ts';
import { listPublicProjects } from './projects.ts';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

// The query shape and row handling. That anon may read projects_public, and what it sees for a
// private project, is proven against a real database in projects.int.test.ts.

type Call = readonly [method: string, ...args: unknown[]];

interface Answer {
  readonly data?: unknown;
  readonly error?: { code: string; message: string } | null;
}

function fakeClient(answer: Answer): { client: PublicClient; calls: Call[]; tables: string[] } {
  const calls: Call[] = [];
  const tables: string[] = [];
  const chain: unknown = new Proxy(
    {},
    {
      get: (_, property) => {
        if (property === 'then') {
          return (resolve: (value: unknown) => void) =>
            resolve({ data: answer.data ?? null, error: answer.error ?? null });
        }
        return (...args: unknown[]) => {
          calls.push([String(property), ...args]);
          return chain;
        };
      },
    },
  );
  const client = {
    from: (table: string) => {
      tables.push(table);
      return chain;
    },
  } as unknown as PublicClient;
  return { client, calls, tables };
}

const row = (slug: string, visibility: 'public' | 'private', repoUrl: string | null) => ({
  id: `id-${slug}`,
  slug,
  name: `Name ${slug}`,
  visibility,
  repo_url: repoUrl,
});

describe('listPublicProjects', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(createClient).mockReset();
  });

  it('reads projects_public in dashboard order and returns camel-cased projects', async () => {
    const { client, calls, tables } = fakeClient({
      data: [
        row('ostomate2', 'public', 'https://github.com/example/ostomate2'),
        row('routeserve', 'private', null),
      ],
    });

    const projects = await listPublicProjects(client);

    expect(tables).toEqual(['projects_public']);
    expect(calls).toEqual([
      ['select', 'id, slug, name, visibility, repo_url'],
      ['order', 'sort_order'],
      ['order', 'slug'],
    ]);
    expect(projects).toEqual([
      {
        id: 'id-ostomate2',
        slug: 'ostomate2',
        name: 'Name ostomate2',
        visibility: 'public',
        repoUrl: 'https://github.com/example/ostomate2',
      },
      {
        id: 'id-routeserve',
        slug: 'routeserve',
        name: 'Name routeserve',
        visibility: 'private',
        repoUrl: null,
      },
    ]);
  });

  it('reports a database error with its code', async () => {
    const { client } = fakeClient({ error: { code: '42501', message: 'permission denied' } });

    await expect(listPublicProjects(client)).rejects.toThrow(
      'list public projects: 42501 permission denied',
    );
  });

  it('refuses a row it does not recognise rather than casting it', async () => {
    const { client } = fakeClient({
      data: [{ ...row('x', 'public', null), visibility: 'internal' }],
    });

    await expect(listPublicProjects(client)).rejects.toThrow(
      'list public projects returned an unexpected row',
    );
  });

  it('builds the publishable-key client from the environment when given none', async () => {
    const { client, tables } = fakeClient({ data: [] });
    vi.mocked(createClient).mockReturnValue(client as unknown as ReturnType<typeof createClient>);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_unit_test_placeholder');

    await expect(listPublicProjects()).resolves.toEqual([]);
    expect(vi.mocked(createClient).mock.calls[0]?.[1]).toBe('sb_publishable_unit_test_placeholder');
    expect(tables).toEqual(['projects_public']);
  });
});
