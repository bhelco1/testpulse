import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// SQL as the local database's owner, through the Supabase CLI (--local pins it to the local
// stack), for what the API cannot do: read the catalog, call a procedure, hold a lock. One
// statement per call; the CLI refuses several.

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const args = (query: string) => [
  'db',
  'query',
  '--local',
  '--agent',
  'no',
  '--output-format',
  'json',
  query,
];

/** Runs one statement and answers its rows. */
export function sql(query: string): Array<Record<string, unknown>> {
  const result = spawnSync('supabase', args(query), { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`supabase db query exited ${String(result.status)}: ${result.stderr}`);
  }
  // A statement with no rows (CALL, say) prints its command tag instead of JSON.
  let rows: unknown;
  try {
    rows = JSON.parse(result.stdout);
  } catch {
    return [];
  }
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
}

/** Starts one statement in its own session and answers when it ends, whatever its outcome. */
export function sqlInBackground(query: string): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn('supabase', args(query), { cwd: repoRoot, stdio: 'ignore' });
    child.on('exit', () => resolve());
    child.on('error', () => resolve());
  });
}
