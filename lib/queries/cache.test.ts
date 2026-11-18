import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cacheKey,
  cachedRead,
  PUBLIC_READS_TAG,
  REFRESH_AFTER_SECONDS,
  sharedRead,
} from './cache.ts';
import { fakeClient, type Answer, type Query } from './fake-client.test-support.ts';
import {
  ageNextCache,
  cacheCalls,
  resetNextCache,
  settleNextCache,
} from './next-cache.test-support.ts';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
vi.mock('next/cache', () => import('./next-cache.test-support.ts'));

// The public read cache (decisions 2026-11-17 and 2026-11-18): every read is keyed by its name,
// its arguments, the data version read once per page view, the UTC day and the build, tagged
// public-reads. An entry older than 60 s is served as it is and refreshed in the background, which
// bounds the writes no report marks (projects:sync).

let reports = { count: 1368, newest: '2026-10-05T11:58:00.123456+00:00' };
let queries: Query[] = [];

function serve() {
  const fake = fakeClient((query): Answer =>
    query.table === 'reports'
      ? { data: [{ created_at: reports.newest }], count: reports.count }
      : { error: { code: 'X', message: `unexpected table ${query.table}` } },
  );
  queries = fake.queries;
  vi.mocked(createClient).mockReturnValue(
    fake.client as unknown as ReturnType<typeof createClient>,
  );
}

const AT = new Date('2026-10-05T11:59:42.318Z');
const VERSION = '1368:2026-10-05T11:58:00.123456+00:00';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_unit_test_placeholder');
  reports = { count: 1368, newest: '2026-10-05T11:58:00.123456+00:00' };
  resetNextCache();
  serve();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(createClient).mockReset();
});

describe('cacheKey', () => {
  it('is one part naming the read, the build, the data version, the UTC day and the arguments', () => {
    expect(
      cacheKey('project-page', ['ostomate2', 'all', 20], {
        version: VERSION,
        day: '2026-10-05',
        build: 'build-1',
      }),
    ).toEqual([
      JSON.stringify({
        read: 'project-page',
        build: 'build-1',
        version: VERSION,
        day: '2026-10-05',
        args: ['ostomate2', 'all', 20],
      }),
    ]);
  });

  it('tells apart arguments a joined string would run together', () => {
    const context = { version: VERSION, day: '2026-10-05', build: 'b' };

    expect(cacheKey('r', ['a,b', 'c'], context)).not.toEqual(cacheKey('r', ['a', 'b,c'], context));
  });
});

describe('cachedRead', () => {
  it('reads as of the minute’s last millisecond, keyed by the UTC day, refreshed after 60 s', async () => {
    const load = vi.fn((_args: readonly [string], until: Date) =>
      Promise.resolve({ until, slug: _args[0] }),
    );
    const read = cachedRead('project-head', load);

    const value = await read(['ostomate2'], AT);

    expect(value).toEqual({ until: new Date('2026-10-05T11:59:59.999Z'), slug: 'ostomate2' });
    expect(load).toHaveBeenCalledWith(['ostomate2'], new Date('2026-10-05T11:59:59.999Z'));
    const [call] = cacheCalls;
    expect(call?.tags).toEqual([PUBLIC_READS_TAG]);
    expect(REFRESH_AFTER_SECONDS).toBe(60);
    expect(call?.revalidate).toBe(REFRESH_AFTER_SECONDS);
    expect(JSON.parse(call?.keyParts[0] ?? '{}')).toEqual({
      read: 'project-head',
      build: 'unbuilt',
      version: VERSION,
      day: '2026-10-05',
      args: ['ostomate2'],
    });
  });

  it('gives a hit exactly what the miss gave, Dates included', async () => {
    const load = () =>
      Promise.resolve({ finishedAt: new Date('2026-10-05T09:26:17.747Z'), runs: [1, 2] });
    const read = cachedRead('landing', load);

    const miss = await read([], AT);
    const hit = await read([], AT);

    expect(cacheCalls.map((call) => call.hit)).toEqual([false, true]);
    expect(hit).toStrictEqual(miss);
    expect(hit.finishedAt).toBeInstanceOf(Date);
  });

  it('shares one entry across the minutes of a UTC day and reads afresh on the next day', async () => {
    const load = vi.fn(() => Promise.resolve('page'));
    const read = cachedRead('landing', load);

    await read([], new Date('2026-10-05T11:59:00.000Z'));
    await read([], new Date('2026-10-05T12:00:00.000Z'));
    await read([], new Date('2026-10-05T23:59:59.999Z'));
    expect(load).toHaveBeenCalledTimes(1);

    await read([], new Date('2026-10-06T00:00:00.000Z'));
    expect(load).toHaveBeenCalledTimes(2);
    const days = cacheCalls.map(
      (call) => (JSON.parse(call.keyParts[0] ?? '{}') as { day: string }).day,
    );
    expect(days).toEqual(['2026-10-05', '2026-10-05', '2026-10-05', '2026-10-06']);
  });

  it('serves a stale entry as it is and refreshes it as of the refreshing view’s minute', async () => {
    const load = vi.fn((_args: readonly [], until: Date) => Promise.resolve(until.toISOString()));
    const read = cachedRead('landing', load);

    await read([], AT);
    ageNextCache();
    const stale = await read([], new Date('2026-10-05T12:07:10.000Z'));
    await settleNextCache();
    const refreshed = await read([], new Date('2026-10-05T12:07:30.000Z'));

    expect(stale).toBe('2026-10-05T11:59:59.999Z');
    expect(refreshed).toBe('2026-10-05T12:07:59.999Z');
    expect(load).toHaveBeenLastCalledWith([], new Date('2026-10-05T12:07:59.999Z'));
    expect(cacheCalls.map((call) => [call.hit, call.stale])).toEqual([
      [false, false],
      [true, true],
      [true, false],
    ]);
  });

  it('reads afresh once a report changes the data version', async () => {
    const load = vi.fn(() => Promise.resolve('page'));
    const read = cachedRead('landing', load);

    await read([], AT);
    reports = { count: 1369, newest: '2026-10-05T11:59:40.000001+00:00' };
    await read([], AT);

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('runs one read for concurrent misses of one key', async () => {
    const load = vi.fn(() => Promise.resolve('page'));
    const read = cachedRead('landing', load);

    const pages = await Promise.all(Array.from({ length: 20 }, () => read([], AT)));

    expect(pages).toEqual(Array.from({ length: 20 }, () => 'page'));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('reads the data version first, as anon, and fails as a read when it cannot', async () => {
    const load = vi.fn(() => Promise.resolve('page'));
    const read = cachedRead('landing', load);
    const fake = fakeClient(() => ({ error: { code: 'PGRST002', message: 'Could not query' } }));
    vi.mocked(createClient).mockReturnValue(
      fake.client as unknown as ReturnType<typeof createClient>,
    );

    await expect(read([], AT)).rejects.toThrow('read the data version: PGRST002');
    expect(load).not.toHaveBeenCalled();
    expect(cacheCalls).toEqual([]);
  });

  it('keeps no failed read: the next request reads again', async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('load the run results: 57014'))
      .mockResolvedValueOnce('page');
    const read = cachedRead('landing', load);

    await expect(read([], AT)).rejects.toThrow('57014');
    await expect(read([], AT)).resolves.toBe('page');
  });

  it('reads the version through the publishable-key client', async () => {
    await cachedRead('landing', () => Promise.resolve('page'))([], AT);

    expect(queries.map((query) => query.table)).toEqual(['reports']);
  });
});

describe('sharedRead', () => {
  it('is never cached, and concurrent callers of one key share a call', async () => {
    const load = vi.fn(() => Promise.resolve(['row']));

    const rows = await Promise.all(
      Array.from({ length: 5 }, () => sharedRead('run-results', ['run-1', VERSION], load)),
    );
    await sharedRead('run-results', ['run-1', VERSION], load);

    expect(rows).toEqual(Array.from({ length: 5 }, () => ['row']));
    expect(load).toHaveBeenCalledTimes(2);
    expect(cacheCalls).toEqual([]);
  });
});
