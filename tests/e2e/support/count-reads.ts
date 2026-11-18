import { appendFileSync } from 'node:fs';

// A preload for a `next start` of its own (tests/e2e/shared-reads.spec.ts): every request the
// server sends to the Supabase project is appended, method and path with its query, as one line
// of the file READ_LOG names, so the spec can count the database reads its page loads cost. The
// request itself goes through untouched. Loaded with NODE_OPTIONS=--import before Next.js patches
// fetch, as tests/e2e/support/no-database.ts is; no other server under test loads it.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const log = process.env.TESTPULSE_E2E_READ_LOG;
if (!supabaseUrl) throw new Error('count-reads: NEXT_PUBLIC_SUPABASE_URL is not set');
if (!log) throw new Error('count-reads: TESTPULSE_E2E_READ_LOG is not set');
const supabaseOrigin = new URL(supabaseUrl).origin;
const realFetch = globalThis.fetch;

globalThis.fetch = (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url.startsWith(supabaseOrigin)) {
    const { pathname, search } = new URL(url);
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    appendFileSync(log, `${method} ${decodeURIComponent(pathname + search)}\n`);
  }
  return realFetch(input, init);
};

export {};
