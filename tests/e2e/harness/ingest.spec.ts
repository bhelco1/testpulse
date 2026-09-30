import { expect, test } from '@playwright/test';

import { writerClient } from '../support/ingest.ts';

// The live-feed spec's report writer holds the secret key and deletes projects, so, like
// db:seed (lib/seed/local.ts), it must refuse any database but the local stack, and before a
// client exists.

const secret = 'sb_secret_not-a-real-key-used-only-in-this-test';

test('refuses a hosted URL before it builds a client, without echoing the key', () => {
  let message = '';
  try {
    writerClient({
      NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
      SUPABASE_SECRET_KEY: secret,
    });
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  expect(message).toMatch(
    /^the e2e report writer only writes to a local Supabase \(localhost, 127\.0\.0\.1 or \[::1\]\)/,
  );
  expect(message).toContain('abcdefghijklmnopqrst.supabase.co');
  expect(message).not.toContain(secret);
});

// With no key at all, the refusal is still the URL's: the guard runs before the client is made.
test('refuses the hosted URL before looking for the key', () => {
  expect(() =>
    writerClient({ NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co' }),
  ).toThrow(/the e2e report writer only writes to a local Supabase/);
});

test('builds a secret-key client for the local stack', () => {
  const client = writerClient({
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_SECRET_KEY: secret,
  });
  expect(typeof client.rpc).toBe('function');
});
