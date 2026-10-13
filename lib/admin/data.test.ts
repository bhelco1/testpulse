import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
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

describe('loadOpenAlerts', () => {
  it('reads unresolved alerts newest first, with an empty report’s branch and commit', async () => {
    const { client, calls } = fakeClient({
      alerts: [{ data: [EMPTY], error: null }],
      reports: [
        { data: [{ id: REPORT, runs: { branch: 'main', commit_sha: 'abc1234' } }], error: null },
      ],
    });
    expect(await loadOpenAlerts(client, PROJECTS)).toEqual([
      {
        alert: EMPTY,
        projectName: 'Ostomate2',
        emptyReport: { branch: 'main', commitSha: 'abc1234' },
      },
    ]);
    expect(calls.map(({ table, steps }) => [table, steps.slice(1)])).toEqual([
      ['alerts', ['is("resolved_at", null)', 'order("opened_at", {"ascending":false})']],
      ['reports', [`in("id", ["${REPORT}"])`]],
    ]);
  });

  it('leaves out, and logs, an alert whose project or report this load did not read', async () => {
    const missingReport = fakeClient({
      alerts: [{ data: [EMPTY], error: null }],
      reports: [{ data: [], error: null }],
    });
    expect(await loadOpenAlerts(missingReport.client, PROJECTS)).toEqual([]);
    const noProject = fakeClient({
      alerts: [{ data: [EMPTY], error: null }],
      reports: [
        { data: [{ id: REPORT, runs: { branch: 'main', commit_sha: 'abc1234' } }], error: null },
      ],
    });
    expect(await loadOpenAlerts(noProject.client, [])).toEqual([]);
    expect(logged).toEqual([
      `testpulse admin: alert ${EMPTY.id} left out: its report was not read`,
      `testpulse admin: alert ${EMPTY.id} left out: its project was not read`,
    ]);
    const failed = fakeClient({
      alerts: [{ data: null, error: { code: '42501', message: 'denied' } }],
    });
    await expect(loadOpenAlerts(failed.client, PROJECTS)).rejects.toThrow('alerts: 42501 denied');
  });
});

describe('an alert whose detail does not parse', () => {
  it('is left out and logged by its id, and the rest are read', async () => {
    const stale = {
      ...EMPTY,
      id: '00000000-0000-4000-8000-0000000000e2',
      kind: 'stale',
      detail: { last_report_at: '2026-10-01T00:00:00+00:00', expected_cadence_days: 8 },
    };
    const { client } = fakeClient({
      alerts: [{ data: [{ ...EMPTY, detail: {} }, stale], error: null }],
    });
    expect(await loadOpenAlerts(client, PROJECTS)).toEqual([
      { alert: stale, projectName: 'Ostomate2', emptyReport: null },
    ]);
    expect(logged).toEqual([
      `testpulse admin: alert ${EMPTY.id} left out: its detail does not parse`,
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

describe('loadLatestJob', () => {
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
