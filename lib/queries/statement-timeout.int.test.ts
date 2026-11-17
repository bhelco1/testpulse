import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

// The catalog, read through the Supabase CLI as lib/jobs/daily.int.test.ts does; --local pins it
// to the local stack.
function roleSettings(): unknown {
  const result = spawnSync(
    'supabase',
    [
      'db',
      'query',
      '--local',
      '--agent',
      'no',
      '--output-format',
      'json',
      'select r.rolname as role, s.setconfig as settings from pg_roles r ' +
        'left join pg_db_role_setting s on s.setrole = r.oid and s.setdatabase = 0 ' +
        "where r.rolname in ('anon', 'authenticated') order by 1",
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(`supabase db query exited ${String(result.status)}: ${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

describe('statement timeouts (decision 2026-11-17)', () => {
  it('gives anon 8 seconds, as authenticated has, so overlapping page reads are not cancelled', () => {
    expect(roleSettings()).toEqual([
      { role: 'anon', settings: ['statement_timeout=8s'] },
      { role: 'authenticated', settings: ['statement_timeout=8s'] },
    ]);
  });
});
