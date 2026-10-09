import { describe, expect, it } from 'vitest';

import { linkVisitDetail, linkVisitSummaries, projectSlugFromPath, type VisitRow } from './stats';

// The admin's per-link figures (spec section 14; design v16 Admin link detail and table, data-map
// "Admin link detail"; decisions of 2026-10-08): first and last seen from entered_at, sessions as
// distinct session_id, visitors as distinct ip_hash, pages viewed with views and summed time,
// time per project from /p/{slug} paths. Bot and preview visits are never counted.

const LINK_A = 'a0000000-0000-4000-8000-000000000001';
const LINK_B = 'b0000000-0000-4000-8000-000000000002';

let next = 0;
const visit = (overrides: Partial<VisitRow>): VisitRow => {
  next += 1;
  return {
    tracked_link_id: LINK_A,
    session_id: 's1',
    path: '/',
    entered_at: `2026-09-18T16:${String(next).padStart(2, '0')}:00+00:00`,
    seconds_on_page: 10,
    user_agent_class: 'browser',
    ip_hash: 'h1',
    ...overrides,
  };
};

describe('projectSlugFromPath', () => {
  it.each([
    ['/p/ostomate2', 'ostomate2'],
    ['/p/ostomate2/', 'ostomate2'],
    ['/p/ostomate2/runs/5f1c2e3d-4b5a-4c6d-8e7f-9a0b1c2d3e4f', 'ostomate2'],
    ['/p/routeserve/tests/abc', 'routeserve'],
    ['/p/routeserve?runs=30', 'routeserve'],
    ['/p/routeserve#flaky', 'routeserve'],
  ])('reads %j as project %j', (path, slug) => {
    expect(projectSlugFromPath(path)).toBe(slug);
  });

  it.each([
    '/',
    '/privacy',
    '/how-its-tested',
    '/p',
    '/p/',
    '/p/Ostomate2',
    '/project/x',
    '/x/p/y',
  ])('reads %j as no project', (path) => {
    expect(projectSlugFromPath(path)).toBeNull();
  });
});

describe('linkVisitDetail', () => {
  it('answers the not-yet-opened state for no visits', () => {
    expect(linkVisitDetail([])).toEqual({
      firstSeen: null,
      lastSeen: null,
      sessions: 0,
      visitors: 0,
      pageViews: 0,
      pages: [],
      perProject: [],
    });
  });

  it('counts the design sample: 3 sessions, 2 visitors, 5 pages, 2 projects', () => {
    // Admin.dc.html's "Acme Health (opened)": Overview 2 views 74 s, Ostomate2 3 views 412 s,
    // an Ostomate2 run 1 view 95 s, RouteServe 1 view 41 s, How it's tested 1 view 188 s;
    // Ostomate2 507 s and RouteServe 41 s.
    const run = '/p/ostomate2/runs/5f1c2e3d-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
    const visits = [
      visit({
        session_id: 's1',
        ip_hash: 'h1',
        path: '/',
        seconds_on_page: 40,
        entered_at: '2026-09-18T16:02:00Z',
      }),
      visit({
        session_id: 's1',
        ip_hash: 'h1',
        path: '/p/ostomate2',
        seconds_on_page: 200,
        entered_at: '2026-09-18T16:03:00Z',
      }),
      visit({
        session_id: 's1',
        ip_hash: 'h1',
        path: run,
        seconds_on_page: 95,
        entered_at: '2026-09-18T16:07:00Z',
      }),
      visit({
        session_id: 's2',
        ip_hash: 'h1',
        path: '/p/ostomate2',
        seconds_on_page: 112,
        entered_at: '2026-09-20T09:00:00Z',
      }),
      visit({
        session_id: 's2',
        ip_hash: 'h1',
        path: '/p/routeserve',
        seconds_on_page: 41,
        entered_at: '2026-09-20T09:02:00Z',
      }),
      visit({
        session_id: 's3',
        ip_hash: 'h2',
        path: '/',
        seconds_on_page: 34,
        entered_at: '2026-10-08T10:00:00Z',
      }),
      visit({
        session_id: 's3',
        ip_hash: 'h2',
        path: '/p/ostomate2',
        seconds_on_page: 100,
        entered_at: '2026-10-08T10:01:00Z',
      }),
      visit({
        session_id: 's3',
        ip_hash: 'h2',
        path: '/how-its-tested',
        seconds_on_page: 188,
        entered_at: '2026-10-08T10:03:00Z',
      }),
    ];
    expect(linkVisitDetail(visits)).toEqual({
      firstSeen: new Date('2026-09-18T16:02:00Z'),
      lastSeen: new Date('2026-10-08T10:03:00Z'),
      sessions: 3,
      visitors: 2,
      pageViews: 8,
      pages: [
        { path: '/', views: 2, seconds: 74, untimedViews: 0 },
        { path: '/p/ostomate2', views: 3, seconds: 412, untimedViews: 0 },
        { path: run, views: 1, seconds: 95, untimedViews: 0 },
        { path: '/p/routeserve', views: 1, seconds: 41, untimedViews: 0 },
        { path: '/how-its-tested', views: 1, seconds: 188, untimedViews: 0 },
      ],
      perProject: [
        { slug: 'ostomate2', views: 4, seconds: 507, untimedViews: 0 },
        { slug: 'routeserve', views: 1, seconds: 41, untimedViews: 0 },
      ],
    });
  });

  it('never counts bot or preview visits in any figure', () => {
    const browser = visit({
      session_id: 's1',
      ip_hash: 'h1',
      path: '/',
      entered_at: '2026-09-18T16:02:00Z',
    });
    const noise = [
      visit({
        user_agent_class: 'bot',
        session_id: 'bot-s',
        ip_hash: 'bot-h',
        path: '/p/ostomate2',
        entered_at: '2026-09-18T16:00:00Z',
      }),
      visit({
        user_agent_class: 'preview',
        session_id: 'pre-s',
        ip_hash: 'pre-h',
        path: '/privacy',
        entered_at: '2026-09-19T08:00:00Z',
      }),
    ];
    expect(linkVisitDetail([...noise, browser])).toEqual(linkVisitDetail([browser]));
    expect(linkVisitDetail(noise)).toEqual(linkVisitDetail([]));
  });

  it('reads time as unknown, not 0, when no view of a page was timed', () => {
    const detail = linkVisitDetail([
      visit({ path: '/', seconds_on_page: null }),
      visit({ path: '/p/routeserve', seconds_on_page: null }),
      visit({ path: '/p/routeserve', seconds_on_page: null }),
    ]);
    expect(detail.pages).toEqual([
      { path: '/', views: 1, seconds: null, untimedViews: 1 },
      { path: '/p/routeserve', views: 2, seconds: null, untimedViews: 2 },
    ]);
    expect(detail.perProject).toEqual([
      { slug: 'routeserve', views: 2, seconds: null, untimedViews: 2 },
    ]);
  });

  it('sums the timed views and counts the untimed ones apart when a page has both', () => {
    const detail = linkVisitDetail([
      visit({ path: '/', seconds_on_page: 30 }),
      visit({ path: '/', seconds_on_page: null }),
      visit({ path: '/', seconds_on_page: 0 }),
    ]);
    expect(detail.pages).toEqual([{ path: '/', views: 3, seconds: 30, untimedViews: 1 }]);
  });

  it('keeps a timed 0 as 0 seconds', () => {
    expect(linkVisitDetail([visit({ path: '/', seconds_on_page: 0 })]).pages).toEqual([
      { path: '/', views: 1, seconds: 0, untimedViews: 0 },
    ]);
  });

  it('lists projects by time, untimed ones last, then by slug', () => {
    const detail = linkVisitDetail([
      visit({ path: '/p/zeta', seconds_on_page: null }),
      visit({ path: '/p/beta', seconds_on_page: 5 }),
      visit({ path: '/p/alpha', seconds_on_page: 5 }),
      visit({ path: '/p/gamma', seconds_on_page: 50 }),
    ]);
    expect(detail.perProject.map((project) => project.slug)).toEqual([
      'gamma',
      'alpha',
      'beta',
      'zeta',
    ]);
  });

  it('lists pages in the order they were first opened, whatever order the rows arrive in', () => {
    const detail = linkVisitDetail([
      visit({ path: '/privacy', entered_at: '2026-09-18T16:30:00Z' }),
      visit({ path: '/', entered_at: '2026-09-18T16:10:00Z' }),
      visit({ path: '/privacy', entered_at: '2026-09-18T16:05:00Z' }),
    ]);
    expect(detail.pages.map((page) => page.path)).toEqual(['/privacy', '/']);
    expect(detail.firstSeen).toEqual(new Date('2026-09-18T16:05:00Z'));
    expect(detail.lastSeen).toEqual(new Date('2026-09-18T16:30:00Z'));
  });

  it('counts one session across visitors and one visitor across sessions', () => {
    const detail = linkVisitDetail([
      visit({ session_id: 's1', ip_hash: 'h1' }),
      visit({ session_id: 's1', ip_hash: 'h2' }),
      visit({ session_id: 's2', ip_hash: 'h2' }),
    ]);
    expect(detail.sessions).toBe(2);
    expect(detail.visitors).toBe(2);
  });
});

describe('linkVisitSummaries', () => {
  it('gives each link its page views, sessions, visitors, last seen and distinct paths', () => {
    const summaries = linkVisitSummaries([
      visit({
        tracked_link_id: LINK_A,
        session_id: 's1',
        ip_hash: 'h1',
        path: '/',
        entered_at: '2026-09-18T16:02:00Z',
      }),
      visit({
        tracked_link_id: LINK_A,
        session_id: 's2',
        ip_hash: 'h1',
        path: '/p/ostomate2',
        entered_at: '2026-10-08T10:00:00Z',
      }),
      visit({
        tracked_link_id: LINK_A,
        session_id: 's2',
        ip_hash: 'h1',
        path: '/',
        entered_at: '2026-10-08T10:05:00Z',
      }),
      visit({
        tracked_link_id: LINK_B,
        session_id: 's9',
        ip_hash: 'h9',
        path: '/',
        entered_at: '2026-10-01T13:40:00Z',
      }),
    ]);
    expect(summaries.get(LINK_A)).toEqual({
      pageViews: 3,
      sessions: 2,
      visitors: 1,
      lastSeen: new Date('2026-10-08T10:05:00Z'),
      paths: ['/', '/p/ostomate2'],
    });
    expect(summaries.get(LINK_B)).toEqual({
      pageViews: 1,
      sessions: 1,
      visitors: 1,
      lastSeen: new Date('2026-10-01T13:40:00Z'),
      paths: ['/'],
    });
  });

  it('leaves out anonymous visits and bot and preview visits', () => {
    const summaries = linkVisitSummaries([
      visit({ tracked_link_id: null }),
      visit({ tracked_link_id: LINK_A, user_agent_class: 'bot' }),
      visit({ tracked_link_id: LINK_B, user_agent_class: 'preview' }),
    ]);
    expect(summaries.size).toBe(0);
  });
});
