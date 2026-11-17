import { describe, expect, it, vi } from 'vitest';

import { singleFlight } from './single-flight.ts';

// Concurrent page views on one server instance that ask for the same read share one call
// (decision 2026-11-17), so a burst of visitors, or every open page refreshing after a report,
// costs the database one read rather than one each.

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('singleFlight', () => {
  it('gives concurrent callers of one key a single underlying call', async () => {
    const flight = singleFlight();
    const pending = deferred<string>();
    const read = vi.fn(() => pending.promise);

    const waiters = Array.from({ length: 20 }, () => flight('landing', read));
    pending.resolve('rows');

    expect(await Promise.all(waiters)).toEqual(Array.from({ length: 20 }, () => 'rows'));
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('calls once per key', async () => {
    const flight = singleFlight();
    const read = vi.fn((key: string) => Promise.resolve(key));

    const [a, b] = await Promise.all([flight('a', () => read('a')), flight('b', () => read('b'))]);

    expect([a, b]).toEqual(['a', 'b']);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('keeps nothing once a call settles: the next caller reads again', async () => {
    const flight = singleFlight();
    const read = vi.fn(() => Promise.resolve('rows'));

    await flight('landing', read);
    await flight('landing', read);

    expect(read).toHaveBeenCalledTimes(2);
  });

  it('hands a rejection to every waiter and does not keep it', async () => {
    const flight = singleFlight();
    const pending = deferred<string>();
    const failing = vi.fn(() => pending.promise);

    const waiters = [flight('landing', failing), flight('landing', failing)];
    pending.reject(new Error('57014 statement timeout'));

    for (const waiter of waiters) await expect(waiter).rejects.toThrow('57014');
    expect(failing).toHaveBeenCalledTimes(1);
    await expect(flight('landing', () => Promise.resolve('rows'))).resolves.toBe('rows');
  });

  it('turns a synchronous throw into a rejection for the caller', async () => {
    const flight = singleFlight();

    await expect(
      flight('landing', () => {
        throw new Error('no client');
      }),
    ).rejects.toThrow('no client');
    await expect(flight('landing', () => Promise.resolve('rows'))).resolves.toBe('rows');
  });
});
