import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPublicClient } from './public.ts';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

const url = 'http://127.0.0.1:54321';
const publishableKey = 'sb_publishable_unit_test_placeholder';
const secretKey = 'sb_secret_unit_test_placeholder';

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};

// A legacy Supabase key is a JWT whose payload names its database role. These are built here,
// unsigned, so the test holds no real key.
const base64url = (value: string) =>
  btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const legacyKey = (role: string) =>
  [
    base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
    base64url(JSON.stringify({ iss: 'supabase-demo', role })),
    'unit-test-signature',
  ].join('.');

function messageOf(failing: () => unknown): string {
  try {
    failing();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected a throw');
}

describe('createPublicClient (spec section 15)', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('names every missing variable instead of failing on the first request', () => {
    expect(() => createPublicClient({})).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
    );
    expect(createClient).not.toHaveBeenCalled();
  });

  it('names only the variable that is missing', () => {
    expect(() => createPublicClient({ NEXT_PUBLIC_SUPABASE_URL: url })).toThrow(
      /^Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY\./,
    );
    expect(() =>
      createPublicClient({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey }),
    ).toThrow(/^Missing NEXT_PUBLIC_SUPABASE_URL\./);
  });

  it.each([
    ['empty', ''],
    ['whitespace-only', '  \n'],
  ])('treats an %s key as missing', (_label, value) => {
    expect(() =>
      createPublicClient({
        NEXT_PUBLIC_SUPABASE_URL: url,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: value,
      }),
    ).toThrow(/^Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY\./);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('treats a whitespace-only URL as missing rather than passing it to the library', () => {
    expect(() =>
      createPublicClient({
        NEXT_PUBLIC_SUPABASE_URL: '   \n',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
      }),
    ).toThrow(/^Missing NEXT_PUBLIC_SUPABASE_URL\./);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('refuses a URL that is not absolute http or https, echoing the URL but never the key', () => {
    const message = messageOf(() =>
      createPublicClient({
        NEXT_PUBLIC_SUPABASE_URL: 'testpulse.supabase.co',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
      }),
    );

    expect(message).toMatch(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(message).toContain('"testpulse.supabase.co"');
    expect(message).not.toContain(publishableKey);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('refuses a secret key, which bypasses row-level security, without echoing it', () => {
    const message = messageOf(() =>
      createPublicClient({
        NEXT_PUBLIC_SUPABASE_URL: url,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: secretKey,
      }),
    );

    expect(message).toMatch(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY holds a secret key/);
    expect(message).not.toContain(secretKey);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('refuses a secret key that picked up surrounding whitespace', () => {
    expect(() =>
      createPublicClient({
        NEXT_PUBLIC_SUPABASE_URL: url,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ` ${secretKey}\n`,
      }),
    ).toThrow(/holds a secret key/);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('refuses a legacy service-role key without echoing it', () => {
    const serviceRole = legacyKey('service_role');
    const message = messageOf(() =>
      createPublicClient({
        NEXT_PUBLIC_SUPABASE_URL: url,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: serviceRole,
      }),
    );

    expect(message).toMatch(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY holds a secret key/);
    expect(message).not.toContain(serviceRole);
    expect(message).not.toContain(serviceRole.split('.')[1]);
    expect(createClient).not.toHaveBeenCalled();
  });

  it.each([
    ['a legacy anon key', legacyKey('anon')],
    ['a three-part key whose middle part is not JSON', 'aaa.%%%.ccc'],
  ])('accepts %s, which RLS still constrains', (_label, key) => {
    createPublicClient({
      NEXT_PUBLIC_SUPABASE_URL: url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
    });

    expect(createClient).toHaveBeenCalledWith(url, key, clientOptions);
  });

  it('builds the client with the publishable key, trimmed, and never keeps a session', () => {
    createPublicClient({
      NEXT_PUBLIC_SUPABASE_URL: `${url}\n`,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `${publishableKey}\n`,
    });

    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith(url, publishableKey, clientOptions);
  });

  it('reads the two NEXT_PUBLIC_ variables from the environment by default', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', url);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', publishableKey);
    vi.stubEnv('SUPABASE_SECRET_KEY', secretKey);

    createPublicClient();

    expect(createClient).toHaveBeenCalledWith(url, publishableKey, clientOptions);
  });
});
