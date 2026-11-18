import { appendFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

// A preload for a `next start` of its own (tests/e2e/shared-reads.spec.ts): every request the
// server sends to the Supabase project is appended, method and path with its query, as one line
// of the file READ_LOG names, so the spec can count the database reads its page loads cost. The
// request itself goes through untouched. Loaded with NODE_OPTIONS=--import before Next.js patches
// fetch, as tests/e2e/support/no-database.ts is; no other server under test loads it.
//
// With SLOW_READS_MS set, every request but the one line FAST_READ names (the data version's
// probe) is held that long before it is sent, so a page view that waits on any database read
// takes at least that long, and one served from the cache does not.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const log = process.env.TESTPULSE_E2E_READ_LOG;
const slowReadsMs = Number(process.env.TESTPULSE_E2E_SLOW_READS_MS ?? '0');
const fastRead = process.env.TESTPULSE_E2E_FAST_READ;
if (!supabaseUrl) throw new Error('count-reads: NEXT_PUBLIC_SUPABASE_URL is not set');
if (!log) throw new Error('count-reads: TESTPULSE_E2E_READ_LOG is not set');
if (!Number.isInteger(slowReadsMs) || slowReadsMs < 0) {
  throw new Error('count-reads: TESTPULSE_E2E_SLOW_READS_MS must be a whole number of ms');
}
const supabaseOrigin = new URL(supabaseUrl).origin;
const realFetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url.startsWith(supabaseOrigin)) {
    const { pathname, search } = new URL(url);
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const line = `${method} ${decodeURIComponent(pathname + search)}`;
    appendFileSync(log, `${line}\n`);
    if (slowReadsMs > 0 && line !== fastRead) await sleep(slowReadsMs);
  }
  return realFetch(input, init);
};

export {};
