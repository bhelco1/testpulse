import { describe, expect, it } from 'vitest';

import type { OpenAlert } from '../admin/types';
import type { ProjectPair } from '../admin/sync';
import type { TimedText, TimeLabel } from '../copy/time';
import type { DailySummary } from '../jobs/summary';
import type { TrackedLinkRow } from '../tracked-links/create';
import type { LinkVisitDetail, LinkVisitSummary } from '../visits/stats';
import {
  alertsView,
  dailyJobView,
  DIDNT_FINISH_AFTER_MS,
  leadOptions,
  linkDetailView,
  linksView,
  pageLabel,
  projectsView,
} from './admin';

// Admin's sections as their components take them (design/pages/Admin.dc.html, design/components.md
// "Admin", design/data-map.md "Admin"), and the v16 decision row of 2026-10-08 where the spec
// overrides the drawing. Pure: the loaders' data and now are passed in.

const NOW = new Date('2026-10-08T11:00:00Z');
const plain = (parts: TimedText | TimeLabel | null): string | null =>
  parts === null
    ? null
    : 'text' in parts
      ? parts.text
      : parts.map((part) => (typeof part === 'string' ? part : part.text)).join('');

const RS = '00000000-0000-4000-8000-0000000000a2';
const O2 = '00000000-0000-4000-8000-0000000000a1';
const TP = '00000000-0000-4000-8000-0000000000a3';
const RUN = '00000000-0000-4000-8000-0000000000b1';
const REPORT = '00000000-0000-4000-8000-0000000000c1';

function alert(
  kind: OpenAlert['alert']['kind'],
  detail: Record<string, unknown>,
  opened: string,
  projectName: string,
  emptyReport: OpenAlert['emptyReport'] = null,
): OpenAlert {
  return {
    alert: {
      id: `00000000-0000-4000-8000-00000000${String(opened.length).padStart(2, '0')}${kind.length}0`,
      project_id: RS,
      kind,
      detail,
      opened_at: opened,
      resolved_at: null,
      acknowledged_at: null,
    } as OpenAlert['alert'],
    projectName,
    emptyReport,
  };
}

const ALERTS: OpenAlert[] = [
  alert(
    'coverage_below_floor',
    { module: 'packages/shared', floor: 80, lines_pct: 79.98, report_id: REPORT },
    '2026-09-26T09:16:00+00:00',
    'RouteServe',
  ),
  alert(
    'count_drop',
    {
      job: 'e2e',
      module: 'e2e',
      platform: 'chromium',
      baseline: 235,
      current: 180,
      baseline_run_id: RUN,
      run_id: RUN,
    },
    '2026-10-08T04:12:00+00:00',
    'testpulse',
  ),
  alert(
    'stale',
    { last_report_at: '2026-09-26T09:00:00+00:00', expected_cadence_days: 8 },
    '2026-10-04T04:30:00+00:00',
    'RouteServe',
  ),
  alert(
    'empty_run',
    { job: 'ios-e2e', module: 'e2e', platform: 'ios-sim', report_id: REPORT },
    '2026-10-07T23:32:00+00:00',
    'Ostomate2',
    { branch: 'main', commitSha: '0e2d0b4f00aa11bb22cc33dd44ee55ff66778899' },
  ),
];

describe('alertsView', () => {
  it('words each kind as drawn, with the report key and the spec’s closing rules', () => {
    const view = alertsView(ALERTS, NOW);
    expect(view.count).toBe('4 open');
    expect(
      view.alerts.map((row) => ({
        kind: row.kind,
        word: row.kindWord,
        title: row.title,
        body: row.body,
        opened: plain(row.opened),
        closes: row.closes,
        ack: row.canAcknowledge,
      })),
    ).toEqual([
      {
        kind: 'count_drop',
        word: 'COUNT DROP',
        title: 'testpulse: test count fell 23%',
        body: 'e2e/e2e/chromium: 235 → 180 tests (−23%) since the previous default-branch run',
        opened: '8 Oct, 04:12 UTC',
        closes: 'Closes when the count recovers, or acknowledge it.',
        ack: true,
      },
      {
        kind: 'empty_run',
        word: 'EMPTY REPORT',
        title: 'Ostomate2: a report held no tests',
        body: 'ios-e2e/e2e/ios-sim parsed with 0 tests on main (0e2d0b4).',
        opened: '7 Oct, 23:32 UTC',
        closes: 'Closes by itself when that key reports tests',
        ack: false,
      },
      {
        kind: 'stale',
        word: 'STALE',
        title: 'RouteServe: no report in 12 days',
        body: 'No report in 12 days. Expected every 8 days; last report 26 Sep.',
        opened: '4 Oct, 04:30 UTC',
        closes: 'Closes by itself when RouteServe reports',
        ack: false,
      },
      {
        kind: 'coverage_below_floor',
        word: 'BELOW FLOOR',
        title: 'RouteServe: coverage under its floor',
        body: 'packages/shared lines 79.9% under its 80% floor',
        opened: '26 Sep, 09:16 UTC',
        closes: 'Closes by itself when the module is back at its floor',
        ack: false,
      },
    ]);
    expect(view.alerts.map((row) => row.label)).toEqual([
      'count drop alert',
      'empty report alert',
      'stale alert',
      'below floor alert',
    ]);
  });

  it('rounds a drop and a percentage down, and reads none as None', () => {
    const drop = (baseline: number, current: number) =>
      alertsView(
        [
          alert(
            'count_drop',
            {
              job: 'unit',
              module: 'm',
              platform: 'node',
              baseline,
              current,
              baseline_run_id: RUN,
              run_id: RUN,
            },
            '2026-10-08T04:12:00+00:00',
            'X',
          ),
        ],
        NOW,
      ).alerts[0]?.title;
    expect(drop(1000, 799)).toBe('X: test count fell 20%');
    expect(drop(10, 0)).toBe('X: test count fell 100%');
    expect(
      alertsView(
        [
          alert(
            'coverage_below_floor',
            { module: 'unit', floor: 82.5, lines_pct: 70, report_id: REPORT },
            '2026-10-08T04:12:00+00:00',
            'X',
          ),
        ],
        NOW,
      ).alerts[0]?.body,
    ).toBe('unit lines 70.0% under its 82.5% floor');
    expect(alertsView([], NOW)).toEqual({ count: 'None', alerts: [] });
  });

  it('counts a cadence of one day in the singular', () => {
    const [row] = alertsView(
      [
        alert(
          'stale',
          { last_report_at: '2026-10-06T10:00:00+00:00', expected_cadence_days: 1 },
          '2026-10-08T04:12:00+00:00',
          'X',
        ),
      ],
      NOW,
    ).alerts;
    expect(row?.body).toBe('No report in 2 days. Expected every 1 day; last report 6 Oct.');
  });
});

const PROJECT_ROW = {
  tagline: 't',
  description: 'd',
  repo_url: null,
  default_branch: 'main',
  dev_stack: [],
  test_stack: [],
  layer_rules: [{ default: 'unit' as const }],
  name_normalization: {},
  declared_suites: [],
  coverage_floors: {},
  expected_cadence_days: 8,
  retention_days: 180,
};
const row = (
  id: string,
  slug: string,
  name: string,
  visibility: 'public' | 'private',
  sort: number,
) => ({
  ...PROJECT_ROW,
  id,
  slug,
  name,
  visibility,
  sort_order: sort,
});
const PAIRS: ProjectPair[] = [
  {
    slug: 'ostomate2',
    file: null,
    row: row(O2, 'ostomate2', 'Ostomate2', 'public', 10),
    sync: { kind: 'in-sync' },
  },
  {
    slug: 'routeserve',
    file: null,
    row: row(RS, 'routeserve', 'RouteServe', 'private', 20),
    sync: {
      kind: 'differs',
      fields: [
        { field: 'name', yaml: '“RouteServe”', database: '“Routeserve”' },
        { field: 'expected_cadence_days', yaml: '7', database: '8' },
        { field: 'layer_rules', yaml: null, database: null },
      ],
    },
  },
  {
    slug: 'testpulse',
    file: null,
    row: row(TP, 'testpulse', 'testpulse', 'public', 30),
    sync: { kind: 'in-sync' },
  },
  {
    slug: 'demo-shop',
    file: { ...row('', 'demo-shop', 'Demo shop', 'public', 40) } as unknown as ProjectPair['file'],
    row: null,
    sync: { kind: 'not-registered', file: 'projects/demo-shop.yaml' },
  },
  {
    slug: 'legacy',
    file: null,
    row: row('00000000-0000-4000-8000-0000000000a9', 'legacy', 'routeserve-legacy', 'private', 50),
    sync: { kind: 'no-yaml' },
  },
];

describe('projectsView', () => {
  const reports = new Map<string, Date | null>([
    [O2, new Date('2026-10-08T10:56:00Z')],
    [RS, new Date('2026-09-29T09:00:00Z')],
    [TP, null],
    ['00000000-0000-4000-8000-0000000000a9', new Date('2026-02-03T09:00:00Z')],
  ]);
  const rows = projectsView(PAIRS, reports, NOW);

  it('gives each project its visibility, last report with the stale tone, and sync state', () => {
    expect(
      rows.map((p) => ({
        name: p.name,
        vis: p.visibility,
        report: plain(p.report.when),
        stale: p.report.stale,
        sync: p.sync.word,
        tone: p.sync.tone,
        detail: p.sync.detail,
        command: p.sync.command,
        rotate: p.rotateSlug,
      })),
    ).toEqual([
      {
        name: 'Ostomate2',
        vis: 'Public',
        report: '4 min ago',
        stale: false,
        sync: '✓ In sync',
        tone: 'pass',
        detail: null,
        command: null,
        rotate: 'ostomate2',
      },
      {
        name: 'RouteServe',
        vis: 'Private',
        report: '1 week ago',
        stale: true,
        sync: '≠ Differs',
        tone: 'attn',
        detail:
          'name: YAML “RouteServe”, database “Routeserve” · expected_cadence_days: YAML 7, ' +
          'database 8 · layer_rules differs',
        command: null,
        rotate: 'routeserve',
      },
      {
        name: 'testpulse',
        vis: 'Public',
        report: null,
        stale: false,
        sync: '✓ In sync',
        tone: 'pass',
        detail: null,
        command: null,
        rotate: 'testpulse',
      },
      {
        name: 'Demo shop',
        vis: 'Public',
        report: null,
        stale: false,
        sync: '+ Not registered',
        tone: 'attn',
        detail: 'projects/demo-shop.yaml has no database row. Register it with ',
        command: 'npm run project:add demo-shop',
        rotate: null,
      },
      {
        name: 'routeserve-legacy',
        vis: 'Private',
        report: '3 Feb',
        stale: true,
        sync: '? No YAML',
        tone: 'attn',
        detail: 'A database row with no projects/*.yaml file. The sync leaves it as it is.',
        command: null,
        rotate: 'legacy',
      },
    ]);
  });

  it('reads stale only once the whole days since the report exceed the cadence', () => {
    const at = (iso: string) =>
      projectsView([PAIRS[0] as ProjectPair], new Map([[O2, new Date(iso)]]), NOW)[0]?.report.stale;
    expect(at('2026-09-29T11:00:00.001Z')).toBe(false);
    expect(at('2026-09-29T11:00:00Z')).toBe(true);
  });

  it('offers every registered project as a lead, private ones marked', () => {
    expect(leadOptions(PAIRS)).toEqual([
      { slug: 'ostomate2', label: 'Ostomate2', private: false },
      { slug: 'routeserve', label: 'RouteServe (private)', private: true },
      { slug: 'testpulse', label: 'testpulse', private: false },
      { slug: 'legacy', label: 'routeserve-legacy (private)', private: true },
    ]);
  });
});

const NAMES = [
  { id: O2, slug: 'ostomate2', name: 'Ostomate2', visibility: 'public' as const },
  { id: RS, slug: 'routeserve', name: 'RouteServe', visibility: 'private' as const },
];

describe('pageLabel', () => {
  it('names the site’s pages, and a project’s by the project', () => {
    const names = new Map(NAMES.map((p) => [p.slug, p.name]));
    expect(
      [
        '/',
        '/how-its-tested',
        '/privacy',
        '/p/ostomate2',
        '/p/ostomate2/runs/abc',
        '/p/routeserve/tests/k',
        '/p/gone',
        '/elsewhere',
        '/no-such-page',
      ].map((path) => pageLabel(path, names)),
    ).toEqual([
      'Overview',
      'How it’s tested',
      'Privacy',
      'Ostomate2',
      'Ostomate2 run',
      'RouteServe test history',
      'gone',
      'Other page',
      'Other page',
    ]);
  });
});

const LINK: TrackedLinkRow = {
  id: '00000000-0000-4000-8000-0000000000d1',
  created_at: '2026-10-01T00:00:00+00:00',
  token: 'Qm8r2LxT0aZe',
  company: 'Acme Health',
  role: 'Director of Quality Engineering',
  contact: 'Dana Ruiz, dana.ruiz@acme.example',
  sent_at: '2026-09-18T00:00:00+00:00',
  notes: 'Met at the QA leaders meetup.',
  lead_project_slug: 'routeserve',
};
const UNOPENED: TrackedLinkRow = {
  ...LINK,
  id: '00000000-0000-4000-8000-0000000000d2',
  token: 'Tb9eJx3mRq6u',
  company: 'Globex',
  role: 'QA Manager',
  contact: null,
  sent_at: null,
  notes: null,
  lead_project_slug: null,
};

describe('linksView', () => {
  const figures = new Map<string, LinkVisitSummary>([
    [
      LINK.id,
      {
        pageViews: 8,
        sessions: 3,
        visitors: 2,
        lastSeen: new Date('2026-10-08T09:00:00Z'),
        paths: ['/', '/p/ostomate2', '/p/ostomate2/runs/abc', '/p/routeserve', '/how-its-tested'],
      },
    ],
  ]);

  it('reads an opened link’s figures and pages, and an unopened one as not yet opened', () => {
    const view = linksView([LINK, UNOPENED], figures, NAMES, NOW);
    expect(view.count).toBe('2 links');
    expect(
      view.links.map((l) => ({
        href: l.href,
        company: l.company,
        role: l.role,
        notes: l.notes,
        sent: l.sent,
        opened: l.opened,
        last: plain(l.lastSeen),
        pages: l.pages,
        path: l.path,
      })),
    ).toEqual([
      {
        href: `/admin/links/${LINK.id}`,
        company: 'Acme Health',
        role: 'Director of Quality Engineering',
        notes: 'Met at the QA leaders meetup.',
        sent: '18 Sep',
        opened: { text: '3 sessions · 2 visitors', counted: true },
        last: '2 h ago',
        pages: ['Overview', 'Ostomate2', 'RouteServe', 'How it’s tested'],
        path: '/v/Qm8r2LxT0aZe',
      },
      {
        href: `/admin/links/${UNOPENED.id}`,
        company: 'Globex',
        role: 'QA Manager',
        notes: null,
        // No sent date: the component shows "—" in --ink-3 (v18 item 11).
        sent: null,
        opened: { text: 'Not yet opened', counted: false },
        last: null,
        pages: [],
        path: '/v/Tb9eJx3mRq6u',
      },
    ]);
  });

  it('reads no links as None (v18 item 10)', () => {
    expect(linksView([], figures, NAMES, NOW)).toEqual({ count: 'None', links: [] });
  });

  it('counts one session, visitor and link in the singular', () => {
    const one = new Map([
      [LINK.id, { pageViews: 1, sessions: 1, visitors: 1, lastSeen: NOW, paths: ['/'] }],
    ]);
    const view = linksView([LINK], one, NAMES, NOW);
    expect(view.count).toBe('1 link');
    expect(view.links[0]?.opened.text).toBe('1 session · 1 visitor');
  });
});

describe('linkDetailView', () => {
  const opened: LinkVisitDetail = {
    firstSeen: new Date('2026-09-18T16:02:00Z'),
    lastSeen: new Date('2026-10-08T09:00:00Z'),
    sessions: 3,
    visitors: 2,
    pageViews: 6,
    pages: [
      { path: '/', views: 2, seconds: 74, untimedViews: 0 },
      { path: '/p/ostomate2', views: 3, seconds: 412, untimedViews: 1 },
      { path: '/p/routeserve', views: 1, seconds: null, untimedViews: 1 },
    ],
    perProject: [
      { slug: 'ostomate2', views: 3, seconds: 412, untimedViews: 1 },
      { slug: 'routeserve', views: 1, seconds: 41, untimedViews: 0 },
      { slug: 'gone', views: 1, seconds: null, untimedViews: 1 },
    ],
  };

  it('gives the details, figures, pages and time per project', () => {
    const view = linkDetailView({ link: LINK, figures: opened, projects: NAMES }, NOW);
    expect({
      ...view,
      firstSeen: plain(view.firstSeen),
      lastSeen: plain(view.lastSeen),
    }).toEqual({
      company: 'Acme Health',
      role: 'Director of Quality Engineering',
      contact: 'Dana Ruiz, dana.ruiz@acme.example',
      lead: { name: 'RouteServe', private: true },
      sent: '18 Sep',
      notes: 'Met at the QA leaders meetup.',
      path: '/v/Qm8r2LxT0aZe',
      opened: true,
      firstSeen: '18 Sep, 16:02 UTC',
      lastSeen: '2 h ago',
      sessions: '3',
      visitors: '2',
      pages: [
        { label: 'Overview', path: '/', views: '2', time: '1m 14s' },
        { label: 'Ostomate2', path: '/p/ostomate2', views: '3', time: '6m 52s' },
        { label: 'RouteServe', path: '/p/routeserve', views: '1', time: null },
      ],
      perProject: [
        { name: 'Ostomate2', time: '6m 52s', share: '100%' },
        { name: 'RouteServe', time: '41 s', share: '10%' },
        { name: 'gone', time: null, share: '0%' },
      ],
    });
  });

  it('reads an unopened link with no lead, contact, date or notes', () => {
    const view = linkDetailView(
      {
        link: UNOPENED,
        figures: {
          firstSeen: null,
          lastSeen: null,
          sessions: 0,
          visitors: 0,
          pageViews: 0,
          pages: [],
          perProject: [],
        },
        projects: NAMES,
      },
      NOW,
    );
    expect(view).toMatchObject({
      contact: null,
      lead: null,
      sent: null,
      notes: null,
      opened: false,
      firstSeen: null,
      lastSeen: null,
      sessions: '0',
      visitors: '0',
      pages: [],
      perProject: [],
    });
  });

  it('names a lead project that no longer exists by its slug', () => {
    const view = linkDetailView(
      {
        link: { ...LINK, lead_project_slug: 'retired' },
        figures: opened,
        projects: NAMES,
      },
      NOW,
    );
    expect(view.lead).toEqual({ name: 'retired', private: false });
  });
});

const ON_TIME: DailySummary = {
  started_at: '2026-10-08T04:12:00.000Z',
  finished_at: '2026-10-08T04:12:03.000Z',
  status: 'ok',
  failed_step: null,
  error: null,
  failed_steps: [],
  heartbeat_written: true,
  projects_checked: 3,
  stale_opened: 1,
  stale_opened_project_ids: [RS],
  pruned: {
    results: 0,
    result_failures: 0,
    visits: 0,
    tracked_sessions: 0,
    rate_limit_buckets: 12,
    runs_marked_pruned: 0,
  },
  pruned_by_project: [],
  prune_batches: 2,
  prune_complete: true,
};

const tiles = (view: ReturnType<typeof dailyJobView>) =>
  view.tiles.map((tile) => [tile.label, plain(tile.value), plain(tile.sub), tile.tone]);

/** A finished run is the latest; the loader reads no other then. */
const ran = (summary: DailySummary) => ({ latest: summary, lastFinished: null });

/** The row the job writes before its steps run, as a run stopped by the platform leaves it. */
const STARTED: DailySummary = {
  ...ON_TIME,
  finished_at: null,
  status: 'failed',
  error: 'The job started and has not finished.',
  projects_checked: null,
  stale_opened: null,
  stale_opened_project_ids: [],
  pruned: { ...ON_TIME.pruned, rate_limit_buckets: 0 },
  prune_batches: 0,
  prune_complete: false,
};

describe('dailyJobView', () => {
  it('reads a run on time from its summary', () => {
    const view = dailyJobView(ran(ON_TIME), NAMES, NOW);
    expect(view.notice).toBeNull();
    expect(tiles(view)).toEqual([
      ['Last run', '8 Oct, 04:12 UTC', '6 h ago · next around 04:00 UTC', 'normal'],
      ['Heartbeat', '✓ Written', 'Database kept awake', 'pass'],
      ['Stale check', '1 opened', 'Opened: RouteServe', 'normal'],
      [
        'Prune',
        '12 rows removed',
        'Results 0 · failure text 0 · visits 0 · tracked sessions 0 · rate-limit buckets 12',
        'normal',
      ],
    ]);
  });

  it('names how many projects were checked when it opened no alert', () => {
    const view = dailyJobView(
      ran({ ...ON_TIME, stale_opened: 0, stale_opened_project_ids: [] }),
      NAMES,
      NOW,
    );
    expect(tiles(view)[2]).toEqual(['Stale check', '0 opened', '3 projects checked', 'normal']);
  });

  it('warns once the last run is more than 36 hours old', () => {
    expect(dailyJobView(ran(ON_TIME), NAMES, new Date('2026-10-09T16:12:00Z')).notice).toBeNull();
    const view = dailyJobView(ran(ON_TIME), NAMES, new Date('2026-10-10T05:00:00Z'));
    expect(view.notice).toEqual({
      tone: 'attn',
      title: 'The daily job is overdue',
      body:
        'Its last run was 48 hours ago; it should run every 24 hours. Until it runs, no ' +
        'heartbeat is written, stale projects aren’t flagged and nothing is pruned. Check the ' +
        'cron in Vercel.',
    });
    expect(tiles(view)).toEqual([
      ['Last run', '◷ 8 Oct, 04:12 UTC', '2 days ago · expected every 24 h', 'attn'],
      ['Heartbeat', '✓ Written', 'From that run · Database kept awake', 'pass'],
      ['Stale check', '1 opened', 'From that run · Opened: RouteServe', 'normal'],
      [
        'Prune',
        '12 rows removed',
        'From that run · Results 0 · failure text 0 · visits 0 · tracked sessions 0 · ' +
          'rate-limit buckets 12',
        'normal',
      ],
    ]);
  });

  it('says when the job has never run', () => {
    const view = dailyJobView(null, NAMES, NOW);
    expect(view.notice).toEqual({
      tone: 'neutral',
      title: 'The daily job hasn’t run yet',
      body:
        'Its first run is due around 04:00 UTC. If this still shows 36 hours after the deploy, ' +
        'check the cron in Vercel.',
    });
    expect(tiles(view)).toEqual(
      ['Last run', 'Heartbeat', 'Stale check', 'Prune'].map((label) => [
        label,
        'Never run',
        'No run summary yet',
        'muted',
      ]),
    );
  });

  it('names the failed step, and the rows a failed prune had already removed', () => {
    const failed = (pruned: Partial<DailySummary['pruned']>): DailySummary => ({
      ...ON_TIME,
      status: 'failed',
      failed_step: 'prune',
      failed_steps: ['prune'],
      error: '57014 canceling statement due to statement timeout',
      pruned: { ...ON_TIME.pruned, rate_limit_buckets: 0, ...pruned },
      prune_complete: false,
    });
    const none = dailyJobView(ran(failed({})), NAMES, NOW);
    expect(none.notice).toEqual({
      tone: 'fail',
      title: 'The last run failed at the prune step',
      body:
        'Heartbeat and stale check finished. Prune stopped with “57014 canceling statement due ' +
        'to statement timeout” after removing 0 rows; rows removed before the failure stay ' +
        'removed. The next run tries again around 04:00 UTC.',
    });
    expect(tiles(none)).toEqual([
      ['Last run', '✕ Failed at prune', '8 Oct, 04:12 UTC · 6 h ago', 'fail'],
      ['Heartbeat', '✓ Written', 'Database kept awake', 'pass'],
      ['Stale check', '1 opened', 'Opened: RouteServe', 'normal'],
      ['Prune', '✕ Failed', 'Removed 0 rows before failing', 'fail'],
    ]);

    const some = dailyJobView(ran(failed({ results: 5000 })), NAMES, NOW);
    expect(some.notice?.body).toBe(
      'Heartbeat and stale check finished. Prune stopped with “57014 canceling statement due to ' +
        'statement timeout” after removing 5,000 results; rows removed before the failure stay ' +
        'removed. The next run tries again around 04:00 UTC.',
    );
    expect(tiles(some)[3]).toEqual([
      'Prune',
      '✕ Failed',
      'Removed 5,000 results before failing',
      'fail',
    ]);

    // v18 item 3: the non-zero kinds only, joined with " · " as the Prune sub joins them.
    const sessions = dailyJobView(ran(failed({ results: 5000, tracked_sessions: 40 })), NAMES, NOW);
    expect(tiles(sessions)[3]?.[2]).toBe(
      'Removed 5,000 results · 40 tracked sessions before failing',
    );
    expect(sessions.notice?.body).toContain(
      'after removing 5,000 results · 40 tracked sessions; rows removed before the failure stay ' +
        'removed.',
    );

    const each = dailyJobView(
      ran(
        failed({
          results: 5000,
          result_failures: 1,
          visits: 0,
          tracked_sessions: 2,
          rate_limit_buckets: 1,
        }),
      ),
      NAMES,
      NOW,
    );
    expect(tiles(each)[3]?.[2]).toBe(
      'Removed 5,000 results · 1 failure text · 2 tracked sessions · 1 rate-limit bucket ' +
        'before failing',
    );
  });

  it('marks every failed step, naming the first', () => {
    const view = dailyJobView(
      ran({
        ...ON_TIME,
        status: 'failed',
        failed_step: 'stale_check',
        failed_steps: ['stale_check', 'prune'],
        error: 'PGRST301 connection reset',
        projects_checked: null,
        stale_opened: null,
        stale_opened_project_ids: [],
        pruned: { ...ON_TIME.pruned, rate_limit_buckets: 0 },
        prune_complete: false,
      }),
      NAMES,
      NOW,
    );
    expect(view.notice?.title).toBe('The last run failed at the stale check step');
    expect(view.notice?.body).toBe(
      'Heartbeat finished. Stale check stopped with “PGRST301 connection reset”. The next run ' +
        'tries again around 04:00 UTC.',
    );
    expect(tiles(view).slice(2)).toEqual([
      ['Stale check', '✕ Failed', 'Stopped with the error above', 'fail'],
      ['Prune', '✕ Failed', 'Removed 0 rows before failing', 'fail'],
    ]);
  });

  // v18 item 6, as the job is built: it runs every step after a failed heartbeat, so the later
  // tiles read their results and the notice says they finished, never "Not run" (decision row of
  // 2026-10-14, b).
  it('reads a failed heartbeat, with the later steps’ results as they ran', () => {
    const heartbeatFailed: DailySummary = {
      ...ON_TIME,
      status: 'failed',
      failed_step: 'heartbeat',
      failed_steps: ['heartbeat'],
      error: 'fetch failed',
    };
    const view = dailyJobView(ran(heartbeatFailed), NAMES, NOW);
    expect(view.notice).toEqual({
      tone: 'fail',
      title: 'The last run failed at the heartbeat step',
      body:
        'Heartbeat stopped with “fetch failed” before writing its row, so this run didn’t keep ' +
        'the database awake. Stale check and prune finished. The next run tries again around ' +
        '04:00 UTC.',
    });
    expect(tiles(view)).toEqual([
      ['Last run', '✕ Failed at heartbeat', '8 Oct, 04:12 UTC · 6 h ago', 'fail'],
      ['Heartbeat', '✕ Not written', 'Stopped with an error', 'fail'],
      ['Stale check', '1 opened', 'Opened: RouteServe', 'normal'],
      [
        'Prune',
        '12 rows removed',
        'Results 0 · failure text 0 · visits 0 · tracked sessions 0 · rate-limit buckets 12',
        'normal',
      ],
    ]);
    expect(tiles(view).flat()).not.toContain('Not run');

    // A later step that failed as well is marked, and only the steps that finished are named.
    const both = dailyJobView(
      ran({
        ...heartbeatFailed,
        failed_steps: ['heartbeat', 'prune'],
        pruned: { ...ON_TIME.pruned, rate_limit_buckets: 0 },
        prune_complete: false,
      }),
      NAMES,
      NOW,
    );
    expect(both.notice?.body).toBe(
      'Heartbeat stopped with “fetch failed” before writing its row, so this run didn’t keep ' +
        'the database awake. Stale check finished. The next run tries again around 04:00 UTC.',
    );
    expect(tiles(both)[3]).toEqual(['Prune', '✕ Failed', 'Removed 0 rows before failing', 'fail']);

    const none = dailyJobView(
      ran({
        ...heartbeatFailed,
        failed_steps: ['heartbeat', 'stale_check', 'prune'],
        projects_checked: null,
        stale_opened: null,
        stale_opened_project_ids: [],
      }),
      NAMES,
      NOW,
    );
    expect(none.notice?.body).toBe(
      'Heartbeat stopped with “fetch failed” before writing its row, so this run didn’t keep ' +
        'the database awake. The next run tries again around 04:00 UTC.',
    );
  });

  it('reads a run that finished without writing its heartbeat row', () => {
    const view = dailyJobView(ran({ ...ON_TIME, heartbeat_written: false }), NAMES, NOW);
    expect(view.notice).toEqual({
      tone: 'fail',
      title: 'The last run didn’t write a heartbeat',
      body:
        'The run finished without an error, but its heartbeat row isn’t in the database, so ' +
        'this run didn’t keep the database awake. The other steps finished. The next run tries ' +
        'again around 04:00 UTC.',
    });
    expect(tiles(view)).toEqual([
      ['Last run', '8 Oct, 04:12 UTC', '6 h ago · next around 04:00 UTC', 'normal'],
      ['Heartbeat', '✕ Not written', 'No heartbeat row from this run', 'fail'],
      ['Stale check', '1 opened', 'Opened: RouteServe', 'normal'],
      [
        'Prune',
        '12 rows removed',
        'Results 0 · failure text 0 · visits 0 · tracked sessions 0 · rate-limit buckets 12',
        'normal',
      ],
    ]);
  });

  // v18 item 7, at 5 minutes rather than the drawn 15 (decision row of 2026-10-14, a): the cron
  // route's maxDuration, after which the platform has stopped the run.
  it('reads a run with no finish, started more than 5 minutes ago, as not finished', () => {
    expect(DIDNT_FINISH_AFTER_MS).toBe(5 * 60_000);
    const view = dailyJobView({ latest: STARTED, lastFinished: null }, NAMES, NOW);
    expect(view.notice).toEqual({
      tone: 'fail',
      title: 'The last run didn’t finish',
      body:
        'It started 8 Oct, 04:12 UTC and never recorded a finish, so it was stopped partway and ' +
        'its step results weren’t saved. Rows a prune removed before it stopped stay removed. ' +
        'The next run tries again around 04:00 UTC; if this repeats, check the cron’s logs in ' +
        'Vercel.',
    });
    expect(tiles(view)).toEqual([
      ['Last run', '✕ Didn’t finish', 'Started 8 Oct, 04:12 UTC · 6 h ago', 'fail'],
      ['Heartbeat', 'No result', 'Not recorded before the run stopped', 'muted'],
      ['Stale check', 'No result', 'Not recorded before the run stopped', 'muted'],
      ['Prune', 'No result', 'Not recorded before the run stopped', 'muted'],
    ]);
  });

  it('shows the previous finished run while the latest is still within its 5 minutes', () => {
    const started = Date.parse(STARTED.started_at);
    const at = (ms: number) => new Date(started + ms);
    const previous: DailySummary = {
      ...ON_TIME,
      started_at: '2026-10-07T04:12:00.000Z',
      finished_at: '2026-10-07T04:12:03.000Z',
    };
    const running = { latest: STARTED, lastFinished: previous };

    const within = dailyJobView(running, NAMES, at(DIDNT_FINISH_AFTER_MS));
    expect(within.notice).toBeNull();
    expect(tiles(within)[0]).toEqual([
      'Last run',
      '7 Oct, 04:12 UTC',
      'yesterday · next around 04:00 UTC',
      'normal',
    ]);
    expect(tiles(within)[1]).toEqual(['Heartbeat', '✓ Written', 'Database kept awake', 'pass']);

    const after = dailyJobView(running, NAMES, at(DIDNT_FINISH_AFTER_MS + 1));
    expect(after.notice?.title).toBe('The last run didn’t finish');

    // A first run still under way: nothing has finished yet.
    const first = dailyJobView({ latest: STARTED, lastFinished: null }, NAMES, at(60_000));
    expect(first.notice?.title).toBe('The daily job hasn’t run yet');
  });

  it('takes the overdue notice’s place, counting from the unfinished run’s start', () => {
    const view = dailyJobView(
      { latest: STARTED, lastFinished: null },
      NAMES,
      new Date('2026-10-10T05:00:00Z'),
    );
    expect(view.notice?.title).toBe('The last run didn’t finish');
    expect(tiles(view)[0]).toEqual([
      'Last run',
      '✕ Didn’t finish',
      'Started 8 Oct, 04:12 UTC · 2 days ago',
      'fail',
    ]);
    expect(
      tiles(view)
        .slice(1)
        .map((tile) => tile[2]),
    ).toEqual(Array(3).fill('Not recorded before the run stopped'));
  });
});
