import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// The command's refusals, which must happen before it reads the environment or the database.
// The Supabase variables are removed so a refusal that came too late would fail differently.

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const HISTORY = 'fixtures/ostomate2/history/history.json';

function backfill(...args: string[]) {
  const env = { ...process.env };
  delete env.NEXT_PUBLIC_SUPABASE_URL;
  delete env.SUPABASE_SECRET_KEY;
  return spawnSync(process.execPath, ['scripts/backfill.ts', ...args], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
  });
}

describe('npm run backfill', () => {
  it('prints usage and exits 2 without a slug and a file', () => {
    const result = backfill('ostomate2');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Usage: npm run backfill <slug> <file>');
  });

  it('exits 1 for a project with no backfill source', () => {
    const result = backfill('routeserve', HISTORY);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'backfill failed: project "routeserve" has no backfill source; only ostomate2 has one',
    );
    expect(result.stdout).toBe('');
  });

  it('exits 1 naming the file when it is not JSON', () => {
    const file = 'fixtures/ostomate2/jacoco/shared.xml';
    const result = backfill('ostomate2', file);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`backfill failed: ${file} is not JSON:`);
  });

  it('exits 1 naming the file when it cannot be read', () => {
    const file = 'fixtures/ostomate2/history/missing.json';
    const result = backfill('ostomate2', file);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`backfill failed: cannot read ${file}:`);
  });
});
