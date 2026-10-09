import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// Spec sections 14 and 15, Phase 6 criterion 5 ("No raw IP is stored anywhere"): no column of
// testpulse's own schema can hold an address. visits.ip_hash, a salted HMAC (lib/visits/
// ip-hash.ts), is the one column about addresses, and it is allowed by name. The catalog is read
// through the Supabase CLI against the local stack, as lib/visibility/realtime.int.test.ts does.

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

interface Column {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
}

// Types made for addresses, and names that say address: "ip", "ipv4", "ipv6", "addr" or
// "address" as a whole underscore-separated word, or "forwarded" anywhere. Whole words, so that
// "skipped" or "description" are not taken for "ip".
const ADDRESS_TYPES = new Set(['inet', 'cidr', 'macaddr', 'macaddr8']);
const ADDRESS_NAME = /(^|_)(ip|ipv4|ipv6|addr|address)(_|$)|forwarded/i;
const ALLOWED = new Set(['visits.ip_hash']);

const looksLikeAddress = (column: Column): boolean =>
  ADDRESS_TYPES.has(column.udt_name) ||
  ADDRESS_TYPES.has(column.data_type) ||
  ADDRESS_NAME.test(column.column_name);

function publicColumns(): Column[] {
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
      'select table_name, column_name, data_type, udt_name from information_schema.columns ' +
        "where table_schema = 'public' order by 1, 2",
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(`supabase db query exited ${String(result.status)}: ${result.stderr}`);
  }
  const parsed: unknown = JSON.parse(result.stdout);
  if (!Array.isArray(parsed)) {
    throw new Error(`supabase db query printed an unexpected shape: ${result.stdout}`);
  }
  return parsed as Column[];
}

describe('no raw address column (spec section 15)', () => {
  const columns = publicColumns();
  const key = (column: Column) => `${column.table_name}.${column.column_name}`;

  it('reads every table and view of the public schema', () => {
    const tables = new Set(columns.map((column) => column.table_name));
    for (const table of [
      'projects',
      'runs',
      'reports',
      'tests',
      'results',
      'result_failures',
      'coverage',
      'alerts',
      'tracked_links',
      'visits',
      'heartbeats',
      'rate_limit_buckets',
      'projects_public',
      'runs_public',
    ]) {
      expect(tables).toContain(table);
    }
  });

  it('finds the hashed column by its name, so the rule would find a raw one', () => {
    const ipHash = columns.find((column) => key(column) === 'visits.ip_hash');
    expect(ipHash).toMatchObject({ data_type: 'text' });
    expect(looksLikeAddress(ipHash as Column)).toBe(true);
  });

  it('reads the rule on names and types as intended', () => {
    const column = (column_name: string, udt_name = 'text'): Column => ({
      table_name: 't',
      column_name,
      data_type: udt_name,
      udt_name,
    });
    for (const name of [
      'ip',
      'client_ip',
      'ip_address',
      'remote_addr',
      'ipv6',
      'x_forwarded_for',
    ]) {
      expect(looksLikeAddress(column(name))).toBe(true);
    }
    expect(looksLikeAddress(column('origin', 'inet'))).toBe(true);
    expect(looksLikeAddress(column('peer', 'cidr'))).toBe(true);
    for (const name of ['skipped', 'description', 'zip', 'tip_count', 'shipped_at', 'recipient']) {
      expect(looksLikeAddress(column(name))).toBe(false);
    }
  });

  it('has no column that could hold a raw address besides visits.ip_hash', () => {
    const suspects = columns.filter(looksLikeAddress).map(key);
    expect(suspects.filter((name) => !ALLOWED.has(name))).toEqual([]);
    expect(suspects).toEqual(['visits.ip_hash']);
  });
});
