import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createSecretClient } from './server.ts';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

const url = 'http://127.0.0.1:54321';
const secretKey = 'sb_secret_unit_test_placeholder';

describe('createSecretClient (spec section 15)', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockClear();
  });

  it('names every missing variable instead of failing on the first request', () => {
    expect(() => createSecretClient({})).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL.*SUPABASE_SECRET_KEY|SUPABASE_SECRET_KEY.*NEXT_PUBLIC_SUPABASE_URL/,
    );
    expect(createClient).not.toHaveBeenCalled();
  });

  it('names only the variable that is missing', () => {
    expect(() => createSecretClient({ NEXT_PUBLIC_SUPABASE_URL: url })).toThrow(
      /^(?!.*NEXT_PUBLIC_SUPABASE_URL).*SUPABASE_SECRET_KEY/,
    );
    expect(() => createSecretClient({ SUPABASE_SECRET_KEY: secretKey })).toThrow(
      /^(?!.*SUPABASE_SECRET_KEY).*NEXT_PUBLIC_SUPABASE_URL/,
    );
  });

  it('treats an empty value as missing', () => {
    expect(() =>
      createSecretClient({ NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SECRET_KEY: '' }),
    ).toThrow(/SUPABASE_SECRET_KEY/);
  });

  it('never echoes the secret in its error', () => {
    expect(() =>
      createSecretClient({ NEXT_PUBLIC_SUPABASE_URL: '', SUPABASE_SECRET_KEY: secretKey }),
    ).toThrow(/^(?!.*sb_secret_unit_test_placeholder)/);
  });

  it('builds the client with the secret key and keeps no session', () => {
    createSecretClient({ NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SECRET_KEY: secretKey });

    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });
});
