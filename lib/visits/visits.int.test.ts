import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';

import { readIntegrationEnv } from '../../tests/int/env.ts';
import { createSecretClient } from '../supabase/server.ts';
import { createTrackedLink } from '../tracked-links/create.ts';
import { hashClientIp } from './ip-hash.ts';
import { loadLinkVisitDetail, loadLinkVisitSummaries } from './load.ts';
import type { VisitRow } from './stats.ts';
import { classifyUserAgent } from './user-agent.ts';

// Spec sections 5.10 and 14, Phase 6 criterion 4 ("Requests classified as bot or preview are
// stored but excluded from visit counts"), against local Supabase. Nothing logs visits yet, so
// rows are written directly with the secret client, classified and hashed by the real functions,
// and read back through the admin's loaders. Every row carries this file's suffix and is removed.

const NOW = new Date('2026-10-08T15:30:00.000Z');
const PERMISSION_DENIED = '42501';
// A test salt, never a deployed one; addresses are from RFC 5737's documentation ranges.
const SALT = 'int-test-salt-0123456789abcdefghijklmnop';

// One published agent per class (sources in user-agent.test.ts).
const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const SLACK = 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)';
const LINKEDIN =
  'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)';
const GMAIL_PROXY =
  'Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)';

describe('visits and their counts (spec section 14)', () => {
  const env = readIntegrationEnv();
  const admin = createSecretClient(process.env);
  const anon = createClient(env.url, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const suffix = randomUUID().slice(0, 8);
  const session = (name: string) => `visits-${suffix}-${name}`;

  afterAll(async () => {
    await admin.from('visits').delete().like('session_id', `visits-${suffix}-%`);
    await admin.from('tracked_links').delete().like('company', `% int-${suffix}`);
  });

  const newLink = async (name: string): Promise<string> => {
    const result = await createTrackedLink(
      admin,
      { company: `${name} int-${suffix}`, role: 'QA Manager' },
      NOW,
    );
    if (!result.ok) throw new Error('not created');
    return result.link.id;
  };

  const write = async (
    linkId: string | null,
    rows: Array<{
      session: string;
      ip: string;
      ua: string;
      path: string;
      at: string;
      seconds: number | null;
    }>,
  ): Promise<void> => {
    const { error } = await admin.from('visits').insert(
      rows.map((row) => ({
        tracked_link_id: linkId,
        session_id: session(row.session),
        path: row.path,
        entered_at: row.at,
        seconds_on_page: row.seconds,
        user_agent_class: classifyUserAgent(row.ua),
        ip_hash: hashClientIp(row.ip, SALT),
      })),
    );
    if (error) throw new Error(`insert visits: ${error.code} ${error.message}`);
  };

  const stored = async (linkId: string): Promise<VisitRow[]> => {
    const { data, error } = await admin
      .from('visits')
      .select(
        'tracked_link_id, session_id, path, entered_at, seconds_on_page, user_agent_class, ip_hash',
      )
      .eq('tracked_link_id', linkId);
    if (error) throw new Error(`${error.code} ${error.message}`);
    return data as VisitRow[];
  };

  it('stores bot and preview visits but counts only browser visits', async () => {
    const link = await newLink('Acme');
    await write(link, [
      // The previews and scanner arrive first, as when a link is pasted or emailed.
      {
        session: 'slack',
        ip: '198.51.100.20',
        ua: SLACK,
        path: '/',
        at: '2026-09-18T15:59:00Z',
        seconds: null,
      },
      {
        session: 'linkedin',
        ip: '198.51.100.21',
        ua: LINKEDIN,
        path: '/',
        at: '2026-09-18T16:00:00Z',
        seconds: null,
      },
      {
        session: 'gmail',
        ip: '198.51.100.22',
        ua: GMAIL_PROXY,
        path: '/p/ostomate2',
        at: '2026-09-18T16:01:00Z',
        seconds: 3,
      },
      {
        session: 'empty',
        ip: '198.51.100.23',
        ua: '',
        path: '/privacy',
        at: '2026-10-09T00:00:00Z',
        seconds: 1,
      },
      // Two people: one on a desktop over two sessions, one on a phone.
      {
        session: 'a1',
        ip: '192.0.2.10',
        ua: CHROME,
        path: '/',
        at: '2026-09-18T16:02:00Z',
        seconds: 40,
      },
      {
        session: 'a1',
        ip: '192.0.2.10',
        ua: CHROME,
        path: '/p/ostomate2',
        at: '2026-09-18T16:03:00Z',
        seconds: 200,
      },
      {
        session: 'a2',
        ip: '::ffff:192.0.2.10',
        ua: CHROME,
        path: '/p/routeserve',
        at: '2026-09-20T09:00:00Z',
        seconds: null,
      },
      {
        session: 'b1',
        ip: '203.0.113.5',
        ua: SAFARI_IPHONE,
        path: '/p/ostomate2/runs/5f1c2e3d-4b5a-4c6d-8e7f-9a0b1c2d3e4f',
        at: '2026-10-08T10:00:00Z',
        seconds: 95,
      },
    ]);

    const rows = await stored(link);
    expect(rows).toHaveLength(8);
    const classes = rows.map((row) => row.user_agent_class).sort();
    expect(classes).toEqual([
      'bot',
      'bot',
      'browser',
      'browser',
      'browser',
      'browser',
      'preview',
      'preview',
    ]);

    expect(await loadLinkVisitDetail(admin, link)).toEqual({
      firstSeen: new Date('2026-09-18T16:02:00Z'),
      lastSeen: new Date('2026-10-08T10:00:00Z'),
      sessions: 3,
      // The IPv4-mapped spelling hashes as the same visitor.
      visitors: 2,
      pageViews: 4,
      pages: [
        { path: '/', views: 1, seconds: 40, untimedViews: 0 },
        { path: '/p/ostomate2', views: 1, seconds: 200, untimedViews: 0 },
        { path: '/p/routeserve', views: 1, seconds: null, untimedViews: 1 },
        {
          path: '/p/ostomate2/runs/5f1c2e3d-4b5a-4c6d-8e7f-9a0b1c2d3e4f',
          views: 1,
          seconds: 95,
          untimedViews: 0,
        },
      ],
      perProject: [
        { slug: 'ostomate2', views: 2, seconds: 295, untimedViews: 0 },
        { slug: 'routeserve', views: 1, seconds: null, untimedViews: 1 },
      ],
    });

    expect((await loadLinkVisitSummaries(admin)).get(link)).toEqual({
      pageViews: 4,
      sessions: 3,
      visitors: 2,
      lastSeen: new Date('2026-10-08T10:00:00Z'),
      paths: [
        '/',
        '/p/ostomate2',
        '/p/routeserve',
        '/p/ostomate2/runs/5f1c2e3d-4b5a-4c6d-8e7f-9a0b1c2d3e4f',
      ],
    });
  });

  it('shows a link opened only by previews and bots as not yet opened', async () => {
    const link = await newLink('Globex');
    await write(link, [
      {
        session: 'g-slack',
        ip: '198.51.100.30',
        ua: SLACK,
        path: '/',
        at: '2026-09-12T09:00:00Z',
        seconds: null,
      },
      {
        session: 'g-curl',
        ip: '198.51.100.31',
        ua: 'curl/7.64.1',
        path: '/',
        at: '2026-09-12T09:01:00Z',
        seconds: null,
      },
    ]);
    expect(await stored(link)).toHaveLength(2);
    expect(await loadLinkVisitDetail(admin, link)).toEqual({
      firstSeen: null,
      lastSeen: null,
      sessions: 0,
      visitors: 0,
      pageViews: 0,
      pages: [],
      perProject: [],
    });
    expect((await loadLinkVisitSummaries(admin)).has(link)).toBe(false);
  });

  it('keeps a deleted link’s visits, unlinked', async () => {
    const link = await newLink('Initech');
    await write(link, [
      {
        session: 'i1',
        ip: '192.0.2.40',
        ua: CHROME,
        path: '/',
        at: '2026-10-01T13:40:00Z',
        seconds: 52,
      },
      {
        session: 'i-preview',
        ip: '198.51.100.40',
        ua: SLACK,
        path: '/',
        at: '2026-10-01T13:39:00Z',
        seconds: null,
      },
    ]);
    const { error } = await admin.from('tracked_links').delete().eq('id', link);
    expect(error).toBeNull();

    const { data } = await admin
      .from('visits')
      .select('tracked_link_id, session_id')
      .in('session_id', [session('i1'), session('i-preview')]);
    expect(data).toHaveLength(2);
    expect(data?.every((row) => row.tracked_link_id === null)).toBe(true);
    expect((await loadLinkVisitSummaries(admin)).has(link)).toBe(false);
  });

  it('refuses anon any read or write of visits', async () => {
    const read = await anon.from('visits').select('id');
    expect(read.error?.code).toBe(PERMISSION_DENIED);
    const insert = await anon.from('visits').insert({
      session_id: session('anon'),
      path: '/',
      user_agent_class: 'browser',
      ip_hash: hashClientIp('192.0.2.99', SALT),
    });
    expect(insert.error?.code).toBe(PERMISSION_DENIED);
    const { count } = await admin
      .from('visits')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', session('anon'));
    expect(count).toBe(0);
  });
});
