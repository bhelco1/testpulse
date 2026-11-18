import { unstable_cache } from 'next/cache';
import { cache } from 'react';

import { fromCacheJson, toCacheJson } from './cache-json.ts';
import { readDataVersion } from './data-version.ts';
import { minuteUntil, readMinute } from './read-minute.ts';
import { singleFlight } from './single-flight.ts';

// The public read cache (decision 2026-11-17). Every page view runs about ten anon reads, and
// overlapping views saturated the free-tier database's CPU (statement timeouts, 57014). Cached,
// the views of one minute share each read. A key names the read, its arguments as plain values,
// the data version (lib/queries/data-version.ts, read once per page view and never cached), the
// minute (lib/queries/read-minute.ts) and the build, so a report shows on the next view and no
// entry outlives the code that wrote it. Only reads made with the publishable-key client are
// cached, each building its own client inside, and nothing per visitor (cookies, headers, the
// tracked-link lead) is ever part of one.

/** The tag on every cached public read; the daily job's prune revalidates it (section 12). */
export const PUBLIC_READS_TAG = 'public-reads';

/**
 * How long an entry may be served without a new data version. Reports change the version; this
 * bounds the writes that do not, such as projects:sync.
 */
export const FALLBACK_REVALIDATE_SECONDS = 300;

// next.config.ts sets it for each build; tests run unbuilt.
const BUILD_ID = process.env.TESTPULSE_BUILD_ID ?? 'unbuilt';

/** An argument of a cached read: a plain value, so the key is exactly what the read depends on. */
export type KeyArg = string | number | boolean | null;

export interface KeyContext {
  readonly version: string;
  /** The minute's start (readMinute). */
  readonly minute: string;
  readonly build: string;
}

/** The entry's key parts: one JSON part, so no two argument lists can run together. */
export function cacheKey(
  read: string,
  args: readonly KeyArg[],
  { version, minute, build }: KeyContext,
): string[] {
  return [JSON.stringify({ read, build, version, minute, args })];
}

// Once per request: React's cache lasts for one server render, which a page and its head share.
const requestVersion = cache(() => readDataVersion());

const flight = singleFlight();

/**
 * A read cached for the minute of `at` and the current data version. The read runs as of the
 * minute's last millisecond (readMinute); what moves with the clock is the caller's to put back
 * at the exact instant. Concurrent misses on one server instance share one read.
 */
export function cachedRead<A extends readonly KeyArg[], T>(
  name: string,
  read: (args: A, until: Date) => Promise<T>,
): (args: A, at: Date) => Promise<T> {
  return async (args, at) => {
    const version = await requestVersion();
    const { start } = readMinute(at);
    const keyParts = cacheKey(name, args, { version, minute: start, build: BUILD_ID });
    const stored = await flight(keyParts[0] ?? name, () =>
      unstable_cache(async () => toCacheJson(await read(args, minuteUntil(start))), keyParts, {
        tags: [PUBLIC_READS_TAG],
        revalidate: FALLBACK_REVALIDATE_SECONDS,
      })(),
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
