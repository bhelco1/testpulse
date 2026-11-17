// Shares one in-flight call among concurrent callers of the same key (decision 2026-11-17). Next.js
// writes a cache entry only once the request that missed has finished, so without this every
// concurrent miss, such as the refresh every open page makes after a report, would run its own
// read. Nothing outlives the call: a result or a rejection reaches the callers already waiting,
// and the next caller starts afresh, so a failure is never kept.

export type Flight = <T>(key: string, call: () => Promise<T>) => Promise<T>;

export function singleFlight(): Flight {
  const inFlight = new Map<string, Promise<unknown>>();
  return <T>(key: string, call: () => Promise<T>): Promise<T> => {
    const waiting = inFlight.get(key);
    // Only this function stores under a key, and always the promise of that key's call.
    if (waiting !== undefined) return waiting as Promise<T>;
    const started = Promise.resolve()
      .then(call)
      .finally(() => inFlight.delete(key));
    inFlight.set(key, started);
    return started;
  };
}
