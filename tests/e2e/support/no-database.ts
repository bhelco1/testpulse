// A preload for a `next start` of its own (tests/e2e/server-error.spec.ts): every request to the
// Supabase project fails as an unreachable host does, so the pages' reads throw as they would in
// an outage. Loaded with NODE_OPTIONS=--import before Next.js patches fetch, so Next's fetch wraps
// this one. Nothing else is touched; no other server under test loads it.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!supabaseUrl) throw new Error('no-database: NEXT_PUBLIC_SUPABASE_URL is not set');
const supabaseOrigin = new URL(supabaseUrl).origin;
const realFetch = globalThis.fetch;

globalThis.fetch = (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url.startsWith(supabaseOrigin)) {
    return Promise.reject(new TypeError('fetch failed: the e2e no-database preload'));
  }
  return realFetch(input, init);
};

export {};
