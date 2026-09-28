import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// The command's refusals, which must happen before it builds a client or touches a database.

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const SECRET = 'sb_secret_not-a-real-key-used-only-in-this-test';

function seed(env: Record<string, string | undefined>, ...args: string[]) {
  const base = { ...process.env };
  delete base.NEXT_PUBLIC_SUPABASE_URL;
  delete base.SUPABASE_SECRET_KEY;
  return spawnSync(process.execPath, ['scripts/seed.ts', ...args], {
    cwd: repoRoot,
    env: { ...base, ...env },
    encoding: 'utf8',
  });
}

describe('npm run db:seed', () => {
  it('prints usage and exits 2 when given arguments', () => {
    const result = seed({}, 'ostomate2');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Usage: npm run db:seed');
  });

  it('refuses a hosted Supabase and exits 1 without writing or echoing the key', () => {
    const result = seed({
      NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
      SUPABASE_SECRET_KEY: SECRET,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('db:seed failed: db:seed only writes to a local Supabase');
    expect(result.stdout).toBe('');
    expect(result.stderr).not.toContain(SECRET);
  });

  it('refuses to run without a Supabase URL', () => {
    const result = seed({ SUPABASE_SECRET_KEY: SECRET });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('NEXT_PUBLIC_SUPABASE_URL is not set');
  });
});
