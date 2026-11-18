// A stand-in for next/cache's unstable_cache in unit tests, which run outside a Next.js server and
// so have no cache of its own. It keeps what Next.js keeps and answers as Next.js answers
// (node_modules/next/dist/server/web/spec-extension/unstable-cache.js): the entry is stored as
// JSON.stringify of the value, a miss hands back the value itself and a hit hands back JSON.parse
// of what was stored. A stale entry (ageNextCache) is handed back as it is while the callback
// refreshes it in the background, as Next.js does inside a request: every call that finds it stale
// starts a refresh, since Next.js shares one only within a request, and a refresh that fails is
// dropped (Next.js logs it), leaving the entry stale. Every call's key parts and options are
// recorded for the tests to read.

export interface CacheCall {
  readonly keyParts: readonly string[];
  readonly tags: readonly string[];
  readonly revalidate: number | false | undefined;
  readonly hit: boolean;
  readonly stale: boolean;
}

const store = new Map<string, { readonly json: string; readonly stale: boolean }>();
const refreshes: Promise<void>[] = [];
export const cacheCalls: CacheCall[] = [];

export function resetNextCache(): void {
  store.clear();
  refreshes.length = 0;
  cacheCalls.length = 0;
}

/** Makes every stored entry older than its revalidate time. */
export function ageNextCache(): void {
  for (const [key, entry] of store) store.set(key, { ...entry, stale: true });
}

/** Waits for the background refreshes stale hits started. */
export async function settleNextCache(): Promise<void> {
  await Promise.all(refreshes);
}

export function unstable_cache<T>(
  callback: () => Promise<T>,
  keyParts: readonly string[] = [],
  options: { readonly tags?: readonly string[]; readonly revalidate?: number | false } = {},
): () => Promise<T> {
  return async () => {
    const key = JSON.stringify(keyParts);
    const stored = store.get(key);
    cacheCalls.push({
      keyParts,
      tags: options.tags ?? [],
      revalidate: options.revalidate,
      hit: stored !== undefined,
      stale: stored?.stale ?? false,
    });
    if (stored !== undefined) {
      if (stored.stale) {
        refreshes.push(
          callback().then(
            (value) => {
              store.set(key, { json: JSON.stringify(value), stale: false });
            },
            () => undefined,
          ),
        );
      }
      // What Next.js returns on a hit: the parsed JSON, whatever type the callback promised.
      return JSON.parse(stored.json) as T;
    }
    const value = await callback();
    store.set(key, { json: JSON.stringify(value), stale: false });
    return value;
  };
}

export const revalidateTag = (): void => undefined;
