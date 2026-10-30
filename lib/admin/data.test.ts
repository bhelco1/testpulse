import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  alertStatus,
  loadLastReports,
  loadLatestJob,
  loadLinkDetail,
  loadOpenAlerts,
  readAdminPage,
} from './data.ts';

// Admin's reads with a stand-in client: the queries each sends and how it answers what the
// database can return. lib/admin/admin-actions.int.test.ts reads the same against local Supabase.

interface Call {
  readonly table: string;
  readonly steps: string[];
}

/** A client whose every query records its steps and answers the table's next response. */
function fakeClient(responses: Record<string, { data: unknown; error: unknown }[]>) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, steps: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {};
      const step =
        (name: string) =>
        (...args: unknown[]) => {
          call.steps.push(`${name}(${args.map((arg) => JSON.stringify(arg)).join(', ')})`);
          return builder;
        };
      for (const name of ['select', 'is', 'in', 'eq', 'not', 'lte', 'order', 'limit', 'range']) {
        builder[name] = step(name);
      }
      const answer = () => {
        const next = responses[table]?.shift();
        if (next === undefined) throw new Error(`no response left for ${table}`);
        return next;
      };
      builder.overrideTypes = () => builder;
      builder.maybeSingle = () => Promise.resolve(answer());
      builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(answer()).then(resolve, reject);
      return builder;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

const P = '00000000-0000-4000-8000-0000000000a1';
const REPORT = '00000000-0000-4000-8000-0000000000c1';
const NOW = new Date('2026-10-08T11:00:00Z');
const EMPTY = {
  id: '00000000-0000-4000-8000-0000000000e1',
  project_id: P,
  kind: 'empty_run',
  detail: { job: 'j', module: 'm', platform: 'p', report_id: REPORT },
  opened_at: '2026-10-07T23:32:00+00:00',
  resolved_at: null,
  acknowledged_at: null,
};
const PROJECTS = [{ id: P, name: 'Ostomate2' }];

let logged: string[];
beforeEach(() => {
  logged = [];
  vi.spyOn(console, 'error').mockImplementation((line: string) => logged.push(line));
});
afterEach(() => {
  vi.restoreAllMocks();
});

const REPORTS = {
  data: [{ id: REPORT, runs: { branch: 'main', commit_sha: 'abc1234' } }],
  error: null,
};
const NAMED = { data: PROJECTS, error: null };

describe('loadOpenAlerts', () => {
  it('reads unresolved alerts newest first, then their reports, then their projects', async () => {
    const { client, calls } = fakeClient({
      alerts: [{ data: [EMPTY], error: null }],
      reports: [REPORTS],
      projects: [NAMED],
    });
    expect(await loadOpenAlerts(client)).toEqual([
      {
        alert: EMPTY,
        projectName: 'Ostomate2',
        emptyReport: { branch: 'main', commitSha: 'abc1234' },
      },
    ]);
    expect(calls.map(({ table, steps }) => [table, steps.slice(1)])).toEqual([
      ['alerts', ['is("resolved_at", null)', 'order("opened_at", {"ascending":false})']],
      ['reports', [`in("id", ["${REPORT}"])`]],
      ['projects', [`in("id", ["${P}"])`]],
    ]);
    expect(logged).toEqual([]);
  });

  it('fails the load on an alert whose detail does not parse, naming only its id and kind', async () => {
    const { client } = fakeClient({
      alerts: [{ data: [{ ...EMPTY, detail: { secret: 'value' } }], error: null }],
    });
    const failure = loadOpenAlerts(client);
    await expect(failure).rejects.toThrow(
      `alert ${EMPTY.id} (empty_run): its detail does not parse`,
    );
    await expect(failure).rejects.not.toThrow(/value/);
  });

  it('leaves out, and logs, an alert whose project was deleted after the alerts were read', async () => {
    // The project's deletion took its reports too (on delete cascade).
    const { client } = fakeClient({
      alerts: [{ data: [EMPTY], error: null }],
      reports: [{ data: [], error: null }],
      projects: [{ data: [], error: null }],
    });
    expect(await loadOpenAlerts(client)).toEqual([]);
    expect(logged).toEqual([
      `testpulse admin: alert ${EMPTY.id} left out: its project has been deleted`,
    ]);
  });

  it('fails the load on an empty report missing while its project is still there', async () => {
    const { client } = fakeClient({
      alerts: [{ data: [EMPTY], error: null }],
      reports: [{ data: [], error: null }],
      projects: [NAMED],
    });
    await expect(loadOpenAlerts(client)).rejects.toThrow(
      `alert ${EMPTY.id} (empty_run): its report is missing`,
    );
  });

  it('fails the load when the database refuses a read', async () => {
    const failed = fakeClient({
      alerts: [{ data: null, error: { code: '42501', message: 'denied' } }],
    });
    await expect(loadOpenAlerts(failed.client)).rejects.toThrow('alerts: 42501 denied');
  });
});

describe('alertStatus', () => {
  // v19 item 6: after a refused acknowledge, whether the alert is still open, was closed by a
  // later report (a count_drop resolved and never acknowledged), or is otherwise closed or gone.
  it('tells an open alert from one a report closed and one acknowledged or gone', async () => {
    const at = '2026-10-08T10:00:00+00:00';
    const { client, calls } = fakeClient({
      alerts: [
        { data: { kind: 'count_drop', resolved_at: null, acknowledged_at: null }, error: null },
        { data: { kind: 'count_drop', resolved_at: at, acknowledged_at: null }, error: null },
        { data: { kind: 'count_drop', resolved_at: at, acknowledged_at: at }, error: null },
        { data: { kind: 'stale', resolved_at: at, acknowledged_at: null }, error: null },
        { data: null, error: null },
        { data: null, error: { code: '08006', message: 'gone' } },
      ],
    });
    expect(await alertStatus(client, EMPTY.id)).toBe('open');
    expect(await alertStatus(client, EMPTY.id)).toBe('closed-by-itself');
    expect(await alertStatus(client, EMPTY.id)).toBe('closed');
    expect(await alertStatus(client, EMPTY.id)).toBe('closed');
    expect(await alertStatus(client, EMPTY.id)).toBe('closed');
    await expect(alertStatus(client, EMPTY.id)).rejects.toThrow('alert: 08006 gone');
    expect(calls[0]?.steps).toEqual([
      'select("kind, resolved_at, acknowledged_at")',
      `eq("id", "${EMPTY.id}")`,
    ]);
  });
});

describe('loadLastReports', () => {
  it('reads each project’s latest CI run finished by now', async () => {
    const { client, calls } = fakeClient({
      runs: [
        { data: [{ finished_at: '2026-10-08T10:56:00+00:00' }], error: null },
        { data: [], error: null },
      ],
    });
    const reports = await loadLastReports(client, [P, 'other'], NOW);
    expect([...reports]).toEqual([
      [P, new Date('2026-10-08T10:56:00Z')],
      ['other', null],
    ]);
    expect(calls[0]?.steps).toEqual([
      'select("finished_at")',
      `eq("project_id", "${P}")`,
      'eq("source", "ci")',
      `lte("finished_at", "${NOW.toISOString()}")`,
      'order("finished_at", {"ascending":false})',
      'limit(1)',
    ]);
  });
});

const FINISHED_RUN = {
  started_at: '2026-10-07T04:12:00.000Z',
  finished_at: '2026-10-07T04:12:03.000Z',
  status: 'ok',
  failed_step: null,
  error: null,
  failed_steps: [],
  heartbeat_written: true,
  projects_checked: 3,
  stale_opened: 0,
  stale_opened_project_ids: [],
  pruned: {
    results: 0,
    result_failures: 0,
    visits: 0,
    tracked_sessions: 0,
    rate_limit_buckets: 0,
    runs_marked_pruned: 0,
  },
  pruned_by_project: [],
  prune_batches: 1,
  prune_complete: true,
};
const UNFINISHED_RUN = {
  ...FINISHED_RUN,
  started_at: '2026-10-08T04:12:00.000Z',
  finished_at: null,
  status: 'failed',
  error: 'The job started and has not finished.',
  projects_checked: null,
  stale_opened: null,
  prune_batches: 0,
  prune_complete: false,
};

describe('loadLatestJob', () => {
  it('reads only the latest run when it finished', async () => {
    const { client, calls } = fakeClient({
      heartbeats: [{ data: [{ summary: FINISHED_RUN }], error: null }],
    });
    expect(await loadLatestJob(client)).toEqual({ latest: FINISHED_RUN, lastFinished: null });
    expect(calls).toHaveLength(1);
  });

  // design/components.md, "Daily job tiles", Didn't finish: while the latest run may still be
  // running, the previous finished run is shown, so it is read too.
  it('reads the latest finished run as well when the latest has no finish', async () => {
    const { client, calls } = fakeClient({
      heartbeats: [
        { data: [{ summary: UNFINISHED_RUN }], error: null },
        { data: [{ summary: FINISHED_RUN }], error: null },
      ],
    });
    expect(await loadLatestJob(client)).toEqual({
      latest: UNFINISHED_RUN,
      lastFinished: FINISHED_RUN,
    });
    expect(calls[1]?.steps).toEqual([
      'select("summary")',
      'not("summary->>finished_at", "is", null)',
      'order("created_at", {"ascending":false})',
      'limit(1)',
    ]);

    const none = fakeClient({
      heartbeats: [
        { data: [{ summary: UNFINISHED_RUN }], error: null },
        { data: [], error: null },
      ],
    });
    expect(await loadLatestJob(none.client)).toEqual({
      latest: UNFINISHED_RUN,
      lastFinished: null,
    });
  });

  it('answers null when no heartbeat has a summary, and refuses one that does not parse', async () => {
    expect(
      await loadLatestJob(fakeClient({ heartbeats: [{ data: [], error: null }] }).client),
    ).toBeNull();
    await expect(
      loadLatestJob(
        fakeClient({ heartbeats: [{ data: [{ summary: { status: 'ok' } }], error: null }] }).client,
      ),
    ).rejects.toThrow();
  });
});

describe('loadLinkDetail', () => {
  it('answers null for an id that is not one, without asking the database', async () => {
    const { client, calls } = fakeClient({});
    expect(await loadLinkDetail(client, 'not-a-uuid')).toBeNull();
    expect(calls).toEqual([]);
  });

  it('answers null for no such link', async () => {
    const { client } = fakeClient({ tracked_links: [{ data: null, error: null }] });
    expect(await loadLinkDetail(client, REPORT)).toBeNull();
  });
});

describe('readAdminPage', () => {
  it('answers null, and logs the cause without a value, when the secret client cannot be made', async () => {
    vi.stubEnv('SUPABASE_SECRET_KEY', '');
    try {
      expect(await readAdminPage({ ok: true, email: 'owner@testpulse.test' }, NOW)).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
    expect(logged).toEqual([
      expect.stringMatching(/^testpulse admin: couldn’t load: Missing .*SUPABASE_SECRET_KEY/),
    ]);
  });
});
