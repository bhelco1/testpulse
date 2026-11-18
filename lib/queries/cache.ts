import { unstable_cache } from 'next/cache';
import { cache } from 'react';

import { fromCacheJson, toCacheJson } from './cache-json.ts';
import { readDataVersion } from './data-version.ts';
import { readMinute } from './read-minute.ts';
import { singleFlight } from './single-flight.ts';

// The public read cache (decisions 2026-11-17 and 2026-11-18). Every page view runs about ten anon
// reads, and overlapping views saturated the free-tier database's CPU (statement timeouts, 57014).
// Cached, views share each read. A key names the read, its arguments as plain values, the data
// version (lib/queries/data-version.ts, read once per page view and never cached), the UTC day
// (lib/queries/read-minute.ts) and the build, so a report shows on the next view and no entry
// outlives the code that wrote it. The minute is not in the key: when it was, every minute began
// with a cold miss on every server instance. Only reads made with the publishable-key client are
// cached, each building its own client inside, and nothing per visitor (cookies, headers, the
// tracked-link lead) is ever part of one.

/** The tag on every cached public read; the daily job's prune revalidates it (section 12). */
export const PUBLIC_READS_TAG = 'public-reads';

/**
 * How old an entry may be before Next.js refreshes it. An older entry is still served as it is,
 * and the view that finds it starts the refresh in the background, so no visitor waits on one.
 * Reports change the version; this bounds the writes that do not, such as projects:sync.
 */
export const REFRESH_AFTER_SECONDS = 60;

// next.config.ts sets it for each build; tests run unbuilt.
const BUILD_ID = process.env.TESTPULSE_BUILD_ID ?? 'unbuilt';

/** An argument of a cached read: a plain value, so the key is exactly what the read depends on. */
export type KeyArg = string | number | boolean | null;

export interface KeyContext {
  readonly version: string;
  /** The UTC day (readMinute). */
  readonly day: string;
  readonly build: string;
}

/** The entry's key parts: one JSON part, so no two argument lists can run together. */
export function cacheKey(
  read: string,
  args: readonly KeyArg[],
  { version, day, build }: KeyContext,
): string[] {
  return [JSON.stringify({ read, build, version, day, args })];
}

// Once per request: React's cache lasts for one server render, which a page and its head share.
const requestVersion = cache(() => readDataVersion());

const flight = singleFlight();

/**
 * A read cached for the UTC day of `at` and the current data version. The read runs as of the
 * last millisecond of the minute of `at` (readMinute): a miss's own, or, for a refresh, that of
 * the view that found the entry stale. What moves with the clock is the caller's to put back at
 * the exact instant. Concurrent misses on one server instance share one read, and so do the
 * background refreshes of the views that find one entry stale: Next.js shares a refresh only
 * within a request, and a stale hit returns at once, so the outer flight is over before the next
 * view arrives and each would otherwise start its own refresh.
 */
export function cachedRead<A extends readonly KeyArg[], T>(
  name: string,
  read: (args: A, until: Date) => Promise<T>,
): (args: A, at: Date) => Promise<T> {
  return async (args, at) => {
    const version = await requestVersion();
    const { day, until } = readMinute(at);
    const keyParts = cacheKey(name, args, { version, day, build: BUILD_ID });
    const key = keyParts[0] ?? name;
    const stored = await flight(key, () =>
      unstable_cache(
        () => flight(`${key}#read`, async () => toCacheJson(await read(args, until))),
        keyParts,
        { tags: [PUBLIC_READS_TAG], revalidate: REFRESH_AFTER_SECONDS },
      )(),
    );
    return fromCacheJson(stored);
  };
}

/**
 * A read that is never cached, such as a run's per-test rows (over the cache's budget), but whose
 * concurrent callers on one server instance share one call.
 */
export function sharedRead<T>(
  name: string,
  args: readonly KeyArg[],
  read: () => Promise<T>,
): Promise<T> {
  return flight(JSON.stringify({ read: name, args }), read);
}

/** The data version of this page view, for a shared read's key. */
export const dataVersion = (): Promise<string> => requestVersion();
