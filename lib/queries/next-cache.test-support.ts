// A stand-in for next/cache's unstable_cache in unit tests, which run outside a Next.js server and
// so have no cache of its own. It keeps what Next.js keeps and answers as Next.js answers
// (node_modules/next/dist/server/web/spec-extension/unstable-cache.js): the entry is stored as
// JSON.stringify of the value, a miss hands back the value itself and a hit hands back JSON.parse
// of what was stored. Every call's key parts and options are recorded for the tests to read.

export interface CacheCall {
  readonly keyParts: readonly string[];
  readonly tags: readonly string[];
  readonly revalidate: number | false | undefined;
  readonly hit: boolean;
}

const store = new Map<string, string>();
export const cacheCalls: CacheCall[] = [];

export function resetNextCache(): void {
  store.clear();
  cacheCalls.length = 0;
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
    });
    // What Next.js returns on a hit: the parsed JSON, whatever type the callback promised.
    if (stored !== undefined) return JSON.parse(stored) as T;
    const value = await callback();
    store.set(key, JSON.stringify(value));
    return value;
  };
}

export const revalidateTag = (): void => undefined;
