import { describe, expect, it } from 'vitest';

import { assertLocalSupabaseUrl, createSeedClient } from './local.ts';

// The seed deletes and re-creates projects, so it must never reach a hosted database.

describe('assertLocalSupabaseUrl', () => {
  it.each(['http://127.0.0.1:54321', 'http://localhost:54321', 'http://[::1]:54321'])(
    'accepts the local stack at %s',
    (url) => {
      expect(() => assertLocalSupabaseUrl(url)).not.toThrow();
    },
  );

  it.each([
    'https://abcdefghijklmnopqrst.supabase.co',
    'http://localhost.example.com:54321',
    'http://127.0.0.1.nip.io:54321',
    'http://127.0.0.1@example.com:54321',
    'http://10.0.0.5:54321',
    'ftp://127.0.0.1:54321',
    'not a url',
  ])('refuses %s', (url) => {
    expect(() => assertLocalSupabaseUrl(url)).toThrow(
      /db:seed only writes to a local Supabase \(localhost, 127\.0\.0\.1 or \[::1\]\)/,
    );
  });

  it.each([undefined, '', '   '])('refuses a missing URL (%j)', (url) => {
    expect(() => assertLocalSupabaseUrl(url)).toThrow('NEXT_PUBLIC_SUPABASE_URL is not set');
  });
});

describe('createSeedClient', () => {
  const secret = 'sb_secret_not-a-real-key-used-only-in-this-test';

  it('refuses a hosted URL before it builds a client, without echoing the key', () => {
    let message = '';
    try {
      createSeedClient({
        NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
        SUPABASE_SECRET_KEY: secret,
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/db:seed only writes to a local Supabase/);
    expect(message).toContain('abcdefghijklmnopqrst.supabase.co');
    expect(message).not.toContain(secret);
  });

  it('builds a secret-key client for the local stack', () => {
    const client = createSeedClient({
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_SECRET_KEY: secret,
    });
    expect(typeof client.rpc).toBe('function');
  });

  it('still needs the secret key', () => {
    expect(() => createSeedClient({ NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' })).toThrow(
      'SUPABASE_SECRET_KEY',
    );
  });
});
