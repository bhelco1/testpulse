// Node runs this file directly with type stripping, which needs the real extension on imports.
import { readFileSync } from 'node:fs';

import { backfillSourceFor } from '../lib/backfill/sources.ts';
import { describeBackfill, findBackfillTarget, writeBackfill } from '../lib/backfill/write.ts';
import { createSecretClient } from '../lib/supabase/server.ts';

const [slug, filePath] = process.argv.slice(2);
if (slug === undefined || filePath === undefined || process.argv.length > 4) {
  console.error('Usage: npm run backfill <slug> <file>   (spec section 17, Phase 4)');
  process.exit(2);
}

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function readJson(path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    throw new Error(`cannot read ${path}: ${message(error)}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} is not JSON: ${message(error)}`);
  }
}

try {
  // Everything that needs no database is checked first, so a wrong slug or file costs nothing.
  const toRuns = backfillSourceFor(slug);
  const file = readJson(filePath);
  const client = createSecretClient();
  const target = await findBackfillTarget(client, slug);
  const runs = toRuns(file, target.defaultBranch);
  const summary = await writeBackfill(client, target.id, runs);
  console.log(describeBackfill(slug, target.defaultBranch, runs.length, summary));
} catch (error) {
  console.error(`backfill failed: ${message(error)}`);
  process.exit(1);
}
