import { AuthApiError, createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { requestSignInLink, sendMagicLink, type SignInDeps } from './sign-in.ts';

vi.mock('@supabase/supabase-js', async (original) => ({
  ...(await original<typeof import('@supabase/supabase-js')>()),
  createClient: vi.fn(),
}));

// Spec section 15 and the 2026-10-13 decisions: the form shows one neutral message for every
// valid address and never reveals whether it may sign in; only the allowlisted address is sent a
// link, decided on the server before Supabase Auth is asked; the send happens after the answer
// has gone (`after`), so the time taken says nothing either.

const OWNER = 'owner@example.com';

function deps(adminEmail: string | undefined) {
  const tasks: (() => Promise<void>)[] = [];
  const send = vi.fn<(email: string) => Promise<void>>(async () => undefined);
  const value: SignInDeps = { adminEmail, send, later: (task) => tasks.push(task) };
  return { value, send, tasks };
}

afterEach(() => {
  vi.mocked(createClient).mockReset();
});

describe('requestSignInLink', () => {
  it('answers the owner’s address with the neutral message and sends a link after answering', async () => {
    const { value, send, tasks } = deps(OWNER);

    expect(requestSignInLink(OWNER, value)).toEqual({ status: 'sent' });
    expect(send).not.toHaveBeenCalled();
    expect(tasks).toHaveLength(1);
    await tasks[0]?.();
    expect(send).toHaveBeenCalledExactlyOnceWith(OWNER);
  });

  it('answers any other address with the same message and sends nothing', () => {
    const { value, send, tasks } = deps(OWNER);

    const owner = requestSignInLink(OWNER, deps(OWNER).value);
    const other = requestSignInLink('someone@example.org', value);
    expect(other).toEqual(owner);
    expect(JSON.stringify(other)).not.toContain('someone');
    expect(tasks).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('matches the owner’s address whatever its case or surrounding spaces, and sends it trimmed', async () => {
    const { value, send, tasks } = deps(' OWNER@example.com ');

    expect(requestSignInLink('  Owner@Example.com\n', value)).toEqual({ status: 'sent' });
    await tasks[0]?.();
    expect(send).toHaveBeenCalledExactlyOnceWith('Owner@Example.com');
  });

  it.each([
    ['missing', undefined],
    ['blank', ' '],
  ])('sends nobody a link when ADMIN_EMAIL is %s, with the same message', (_label, adminEmail) => {
    const { value, tasks } = deps(adminEmail);
    expect(requestSignInLink(OWNER, value)).toEqual({ status: 'sent' });
    expect(tasks).toHaveLength(0);
  });

  it.each([
    ['owner@example', 'owner@example'],
    ['', ''],
    ['not an address', 'not an address'],
  ])('refuses %j as not an address, keeping what was typed', (input, kept) => {
    const { value, tasks } = deps(OWNER);
    expect(requestSignInLink(input, value)).toEqual({ status: 'invalid', email: kept });
    expect(tasks).toHaveLength(0);
  });

  it('refuses a field that is not text, or missing', () => {
    const { value, tasks } = deps(OWNER);
    expect(requestSignInLink(new File(['x'], 'x.txt'), value)).toEqual({
      status: 'invalid',
      email: '',
    });
    expect(requestSignInLink(null, value)).toEqual({ status: 'invalid', email: '' });
    expect(tasks).toHaveLength(0);
  });

  it('keeps at most an address’s length of what was typed', () => {
    const { value } = deps(OWNER);
    const state = requestSignInLink('x'.repeat(10_000), value);
    expect(state).toEqual({ status: 'invalid', email: 'x'.repeat(254) });
  });
});

describe('sendMagicLink', () => {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_unit_test_placeholder',
  };

  function fakeClient(answer: () => Promise<{ error: Error | null }>) {
    const signInWithOtp = vi.fn(answer);
    vi.mocked(createClient).mockReturnValue({ auth: { signInWithOtp } } as never);
    return signInWithOtp;
  }

  it('asks Supabase Auth for a one-time link on the publishable key, keeping no session', async () => {
    const signInWithOtp = fakeClient(async () => ({ error: null }));
    const log = vi.fn();

    await sendMagicLink(OWNER, env, log);

    expect(createClient).toHaveBeenCalledWith(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          flowType: 'implicit',
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
    expect(signInWithOtp).toHaveBeenCalledExactlyOnceWith({
      email: OWNER,
      options: { shouldCreateUser: true },
    });
    expect(log).not.toHaveBeenCalled();
  });

  it('logs a refusal by its code alone, never the address', async () => {
    fakeClient(async () => ({
      error: new AuthApiError(`rate limited for ${OWNER}`, 429, 'over_email_send_rate_limit'),
    }));
    const log = vi.fn();

    await sendMagicLink(OWNER, env, log);

    expect(log).toHaveBeenCalledExactlyOnceWith(
      'testpulse admin: the sign-in link was not sent (over_email_send_rate_limit, 429)',
    );
  });

  it('logs a failure to reach Supabase, never the address', async () => {
    fakeClient(async () => {
      throw new TypeError(`fetch failed for ${OWNER}`);
    });
    const log = vi.fn();

    await sendMagicLink(OWNER, env, log);

    expect(log).toHaveBeenCalledExactlyOnceWith(
      'testpulse admin: the sign-in link was not sent (TypeError)',
    );
  });

  it('logs a missing setting by name and sends nothing', async () => {
    const log = vi.fn();
    await sendMagicLink(OWNER, {}, log);
    expect(createClient).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/^testpulse admin: the sign-in link was not sent \(Missing /),
    );
  });
});
