import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { toOstomate2BackfillRuns } from './ostomate2-history.ts';
import { describeBackfill, findBackfillTarget, writeBackfill } from './write.ts';

const runs = toOstomate2BackfillRuns(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../fixtures/ostomate2/history/history.json', import.meta.url)),
      'utf8',
    ),
  ),
  'main',
).slice(0, 3);

const PROJECT_ID = '0b6f6a1e-4c1e-4a55-9d59-3c1f1b1c2d3e';
const OUTAGE = { code: '57P01', message: 'terminating connection due to administrator command' };

interface Answer {
  readonly data?: unknown;
  readonly error?: { code: string; message: string } | null;
}

interface Fake {
  client: SupabaseClient;
  lookups: Array<[table: string, columns: string, column: string, value: string]>;
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>;
}

// The backfill module uses two shapes of the client: one maybeSingle lookup on projects by slug,
// and RPC. The fake records both and answers each from the test's own function.
function fakeClient(answers: { lookup?: Answer; rpc?: (call: number) => Answer }): Fake {
  const lookups: Fake['lookups'] = [];
  const rpcCalls: Fake['rpcCalls'] = [];
  const client = {
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, value: string) => ({
          maybeSingle: async () => {
            lookups.push([table, columns, column, value]);
            const { data = null, error = null } = answers.lookup ?? {};
            return { data, error };
          },
        }),
      }),
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      const { data = null, error = null } = answers.rpc?.(rpcCalls.length - 1) ?? {};
      return { data, error };
    },
  } as unknown as SupabaseClient;
  return { client, lookups, rpcCalls };
}

describe('findBackfillTarget', () => {
  it('looks the project up by slug and returns its id and default branch', async () => {
    const fake = fakeClient({ lookup: { data: { id: PROJECT_ID, default_branch: 'main' } } });
    await expect(findBackfillTarget(fake.client, 'ostomate2')).resolves.toEqual({
      id: PROJECT_ID,
      defaultBranch: 'main',
    });
    expect(fake.lookups).toEqual([['projects', 'id, default_branch', 'slug', 'ostomate2']]);
  });

  it('names the slug when no project has it', async () => {
    const fake = fakeClient({ lookup: { data: null } });
    await expect(findBackfillTarget(fake.client, 'ostomate2')).rejects.toThrow(
      'project "ostomate2" not found; project:add registers it',
    );
  });

  it('surfaces a failed lookup with its code', async () => {
    const fake = fakeClient({ lookup: { error: OUTAGE } });
    await expect(findBackfillTarget(fake.client, 'ostomate2')).rejects.toThrow(
      'look up project "ostomate2": 57P01',
    );
  });
});

describe('writeBackfill', () => {
  const inserted = (call: number): Answer => ({
    data: { inserted: true, run_id: `run-${call}`, status: 'passed' },
  });

  it('calls backfill_run once per run, in order, with the project id added', async () => {
    const fake = fakeClient({ rpc: inserted });
    await writeBackfill(fake.client, PROJECT_ID, runs);
    expect(fake.rpcCalls).toEqual(
      runs.map((run) => ({
        fn: 'backfill_run',
        args: { payload: { project_id: PROJECT_ID, ...run } },
      })),
    );
  });

  it('counts inserted runs and runs already stored by CI or by an earlier backfill', async () => {
    const answers: Answer[] = [
      { data: { inserted: true, run_id: 'run-0', status: 'passed' } },
      { data: { inserted: false, existing_source: 'ci', run_id: 'run-1' } },
      { data: { inserted: false, existing_source: 'backfill', run_id: 'run-2' } },
    ];
    const fake = fakeClient({ rpc: (call) => answers[call] ?? {} });
    await expect(writeBackfill(fake.client, PROJECT_ID, runs)).resolves.toEqual({
      inserted: 1,
      skippedExistingCi: 1,
      skippedExistingBackfill: 1,
    });
  });

  it('stops at the first failed write and names the run', async () => {
    const fake = fakeClient({ rpc: (call) => (call === 1 ? { error: OUTAGE } : inserted(call)) });
    await expect(writeBackfill(fake.client, PROJECT_ID, runs)).rejects.toThrow(
      `backfill_run for run ${runs[1]?.ci_run_id}: 57P01`,
    );
    expect(fake.rpcCalls).toHaveLength(2);
  });

  it('refuses an answer that is not the shape backfill_run returns', async () => {
    const fake = fakeClient({ rpc: () => ({ data: { inserted: 'yes' } }) });
    await expect(writeBackfill(fake.client, PROJECT_ID, runs)).rejects.toThrow(
      `backfill_run for run ${runs[0]?.ci_run_id} returned an unexpected result`,
    );
  });

  it('writes nothing for an empty list', async () => {
    const fake = fakeClient({ rpc: inserted });
    await expect(writeBackfill(fake.client, PROJECT_ID, [])).resolves.toEqual({
      inserted: 0,
      skippedExistingCi: 0,
      skippedExistingBackfill: 0,
    });
    expect(fake.rpcCalls).toEqual([]);
  });
});

describe('describeBackfill', () => {
  it('summarises the import on one line', () => {
    const line = describeBackfill('ostomate2', 'main', 13, {
      inserted: 11,
      skippedExistingCi: 2,
      skippedExistingBackfill: 0,
    });
    expect(line).toBe(
      'backfill ostomate2: 13 runs on main in the file; inserted 11, ' +
        'skipped 2 already reported by CI and 0 already backfilled.',
    );
    expect(line).not.toContain('\n');
  });
});
