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

  it('treats a whitespace-only URL as missing rather than passing it to the library', () => {
    expect(() =>
      createSecretClient({ NEXT_PUBLIC_SUPABASE_URL: '   \n', SUPABASE_SECRET_KEY: secretKey }),
    ).toThrow(/Missing NEXT_PUBLIC_SUPABASE_URL/);
    expect(createClient).not.toHaveBeenCalled();
  });

  it.each<[string, string]>([
    ['no scheme', 'testpulse.supabase.co'],
    ['surrounding double quotes', `"${url}"`],
    ['a scheme that is not http or https', 'ftp://testpulse.supabase.co'],
  ])('refuses a URL with %s before the library sees it', (_label, value) => {
    const failing = () =>
      createSecretClient({ NEXT_PUBLIC_SUPABASE_URL: value, SUPABASE_SECRET_KEY: secretKey });

    expect(failing).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(failing).toThrow(new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    expect(failing).toThrow(/https:\/\/<project-ref>\.supabase\.co/);
    expect(failing).toThrow(/^(?!.*sb_secret_unit_test_placeholder)/);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('makes surrounding whitespace visible and caps the echoed value at 60 characters', () => {
    const long = `\t${'nope.supabase.co/'.repeat(8)} `;
    let message = '';

    try {
      createSecretClient({ NEXT_PUBLIC_SUPABASE_URL: long, SUPABASE_SECRET_KEY: secretKey });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toMatch(/NEXT_PUBLIC_SUPABASE_URL/);
    const echo = /"(.*)\u2026"/.exec(message)?.[1];
    expect(echo).toHaveLength(60);
    expect(echo).toMatch(/^\\t/);
    expect(message).not.toContain(long.trim());
  });

  it('trims the URL so a stray trailing newline is not fatal', () => {
    createSecretClient({ NEXT_PUBLIC_SUPABASE_URL: `${url}\n`, SUPABASE_SECRET_KEY: secretKey });

    expect(createClient).toHaveBeenCalledWith(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });
});
