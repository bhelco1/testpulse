import * as crypto from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from '../../app/api/cron/daily/route.ts';
import { CRON_SECRET_VAR, handleDailyCron, isCronAuthorized } from './cron.ts';
import type { DailySummary } from './summary.ts';

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

// The cron route (spec sections 12 and 15): only a request carrying `Bearer ${CRON_SECRET}`, as
// Vercel cron sends it, runs the job; a missing or empty CRON_SECRET refuses every request; the
// comparison is constant time; the answer is 200 when every step succeeded and 500 otherwise.

// Not a real secret: the value exists only in this test.
const SECRET = 'unit-test-cron-secret-0123456789';
const NOW = new Date('2026-10-08T05:00:00.000Z');

const summary = (failed: boolean): DailySummary => ({
  started_at: NOW.toISOString(),
  finished_at: '2026-10-08T05:00:02.000Z',
  status: failed ? 'failed' : 'ok',
  failed_step: failed ? 'prune' : null,
  error: failed ? 'prune_expired: XX000 broke' : null,
  failed_steps: failed ? ['prune'] : [],
  heartbeat_written: true,
  projects_checked: 3,
  stale_opened: 0,
  stale_opened_project_ids: [],
  pruned: {
    results: 0,
    result_failures: 0,
    visits: 0,
    rate_limit_buckets: 0,
    runs_marked_pruned: 0,
  },
  pruned_by_project: [],
  prune_batches: failed ? 0 : 1,
  prune_complete: !failed,
});

function deps(result: DailySummary = summary(false)) {
  const client = {} as SupabaseClient;
  const createClient = vi.fn(() => client);
  const runJob = vi.fn(async () => result);
  const now = vi.fn(() => NOW);
  const log = { info: vi.fn(), error: vi.fn() };
  return { client, createClient, runJob, now, log };
}

const env = (secret: string | undefined) => ({ [CRON_SECRET_VAR]: secret });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.mocked(crypto.timingSafeEqual).mockClear();
});

describe('isCronAuthorized', () => {
  it('accepts exactly the header Vercel cron sends', () => {
    expect(isCronAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it.each([
    ['no header', null],
    ['an empty header', ''],
    ['the bare secret', SECRET],
    ['another secret', 'Bearer unit-test-cron-secret-9876543210'],
    ['a prefix of the secret', `Bearer ${SECRET.slice(0, -1)}`],
    ['the secret with more after it', `Bearer ${SECRET}x`],
    ['a lower-case scheme', `bearer ${SECRET}`],
    ['two spaces', `Bearer  ${SECRET}`],
    ['a trailing space', `Bearer ${SECRET} `],
  ])('refuses %s', (_, header) => {
    expect(isCronAuthorized(header, SECRET)).toBe(false);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['blank', '   '],
  ])('refuses every request when CRON_SECRET is %s, even one that matches it', (_, secret) => {
    expect(isCronAuthorized(`Bearer ${secret ?? ''}`, secret)).toBe(false);
    expect(isCronAuthorized('Bearer ', secret)).toBe(false);
    expect(isCronAuthorized(null, secret)).toBe(false);
  });

  it('compares in constant time, over digests of equal length whatever was sent', () => {
    const compare = vi.mocked(crypto.timingSafeEqual);
    isCronAuthorized(`Bearer ${SECRET}`, SECRET);
    isCronAuthorized('Bearer x', SECRET);
    isCronAuthorized(`Bearer ${SECRET.repeat(20)}`, SECRET);
    expect(compare).toHaveBeenCalledTimes(3);
    for (const [given, expected] of compare.mock.calls) {
      expect(given.byteLength).toBe(32);
      expect(expected.byteLength).toBe(32);
    }
  });
});

describe('handleDailyCron', () => {
  it('runs the job with the secret client and the clock, and answers 200 with the summary', async () => {
    const d = deps();
    const answer = await handleDailyCron(
      { authorization: `Bearer ${SECRET}`, env: env(SECRET) },
      d,
    );
    expect(answer).toEqual({ status: 200, body: summary(false) });
    expect(d.runJob).toHaveBeenCalledWith(d.client, NOW);
  });

  it('answers 500 with the summary when a step failed', async () => {
    const d = deps(summary(true));
    const answer = await handleDailyCron(
      { authorization: `Bearer ${SECRET}`, env: env(SECRET) },
      d,
    );
    expect(answer).toEqual({ status: 500, body: summary(true) });
  });

  it.each([
    ['no header', null],
    ['a wrong secret', 'Bearer not-the-secret'],
    ['an empty bearer', 'Bearer '],
  ])('answers 401 with a JSON body to %s, and does nothing', async (_, authorization) => {
    const d = deps();
    const answer = await handleDailyCron({ authorization, env: env(SECRET) }, d);
    expect(answer).toEqual({ status: 401, body: { error: 'Unauthorized' } });
    expect(d.createClient).not.toHaveBeenCalled();
    expect(d.runJob).not.toHaveBeenCalled();
    expect(d.now).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
  ])('refuses every request when CRON_SECRET is %s, and logs why', async (_, secret) => {
    const d = deps();
    const answer = await handleDailyCron({ authorization: 'Bearer ', env: env(secret) }, d);
    expect(answer).toEqual({ status: 401, body: { error: 'Unauthorized' } });
    expect(d.runJob).not.toHaveBeenCalled();
    expect(d.log.error).toHaveBeenCalledWith(
      'testpulse daily: CRON_SECRET is not set, so every request is refused',
    );
  });

  it('answers 500 without the cause when the secret client cannot be made', async () => {
    const d = deps();
    d.createClient.mockImplementation(() => {
      throw new Error('Missing SUPABASE_SECRET_KEY.');
    });
    const answer = await handleDailyCron(
      { authorization: `Bearer ${SECRET}`, env: env(SECRET) },
      d,
    );
    expect(answer).toEqual({ status: 500, body: { error: 'The daily job is not configured.' } });
    expect(d.runJob).not.toHaveBeenCalled();
    expect(d.log.error).toHaveBeenCalledWith(
      'testpulse daily: not configured: Missing SUPABASE_SECRET_KEY.',
    );
  });

  it('answers 500 when the job itself throws', async () => {
    const d = deps();
    d.runJob.mockRejectedValue(new Error('unexpected'));
    const answer = await handleDailyCron(
      { authorization: `Bearer ${SECRET}`, env: env(SECRET) },
      d,
    );
    expect(answer).toEqual({ status: 500, body: { error: 'The daily job failed unexpectedly.' } });
    expect(d.log.error).toHaveBeenCalledWith('testpulse daily: failed unexpectedly: unexpected');
  });
});

describe('GET /api/cron/daily', () => {
  const request = (authorization?: string) =>
    new Request('http://127.0.0.1:3000/api/cron/daily', {
      headers: authorization === undefined ? {} : { authorization },
    });

  it('answers 401 JSON, uncached, when CRON_SECRET is not set', async () => {
    vi.stubEnv(CRON_SECRET_VAR, '');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('answers 401 JSON to a wrong secret', async () => {
    vi.stubEnv(CRON_SECRET_VAR, SECRET);
    const response = await GET(request('Bearer wrong'));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('answers 500 JSON when authorized but the database is not configured', async () => {
    vi.stubEnv(CRON_SECRET_VAR, SECRET);
    vi.stubEnv('SUPABASE_SECRET_KEY', '');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'The daily job is not configured.' });
    // The log names the missing setting and never echoes the request's secret.
    expect(errors.mock.calls.flat().join('\n')).toContain('SUPABASE_SECRET_KEY');
    expect(errors.mock.calls.flat().join('\n')).not.toContain(SECRET);
  });
});
