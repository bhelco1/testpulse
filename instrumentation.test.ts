import { afterEach, describe, expect, it, vi } from 'vitest';

import { register } from './instrumentation.ts';
import { SEED_NOW } from './lib/seed/plan.ts';

// register() is the hook Next.js runs once before a server instance handles requests. These
// tests call it the way Next does, with the process environment; tests/e2e/harness/server.spec.ts
// proves that a real `next start` stops when it throws.

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('register', () => {
  it('exits the Node.js server process with the reason when it must not start', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('TESTPULSE_FIXED_NOW', SEED_NOW);
    vi.stubEnv('VERCEL_ENV', 'production');
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // The real exit would end the test run; throwing stops register() where the exit would.
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    await expect(register()).rejects.toThrow('process.exit called');

    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(error).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('testpulse refuses to start'),
    );
  });

  it('throws when TESTPULSE_FIXED_NOW is set and VERCEL_ENV is production', async () => {
    vi.stubEnv('TESTPULSE_FIXED_NOW', SEED_NOW);
    vi.stubEnv('VERCEL_ENV', 'production');

    await expect(register()).rejects.toThrow('testpulse refuses to start');
  });

  it('throws on a malformed TESTPULSE_FIXED_NOW', async () => {
    vi.stubEnv('TESTPULSE_FIXED_NOW', 'next tuesday');
    vi.stubEnv('VERCEL_ENV', 'preview');

    await expect(register()).rejects.toThrow('TESTPULSE_FIXED_NOW must be a UTC instant');
  });

  it('logs the fixed instant to stdout, where the e2e harness reads it', async () => {
    vi.stubEnv('TESTPULSE_FIXED_NOW', SEED_NOW);
    vi.stubEnv('VERCEL_ENV', 'preview');
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    await register();

    expect(info).toHaveBeenCalledExactlyOnceWith(
      `testpulse: clock fixed by TESTPULSE_FIXED_NOW at ${SEED_NOW}`,
    );
  });

  it('starts quietly on the wall clock', async () => {
    vi.stubEnv('TESTPULSE_FIXED_NOW', undefined);
    vi.stubEnv('VERCEL_ENV', 'production');
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    await register();

    expect(info).not.toHaveBeenCalled();
  });
});
