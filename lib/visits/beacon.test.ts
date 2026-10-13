import { describe, expect, it, vi } from 'vitest';

import {
  createVisitTracker,
  elapsedSeconds,
  VISIT_TIME_URL,
  VISITS_URL,
  viewPath,
  type BeaconDeps,
} from './beacon.ts';

// The visit beacon's client logic (spec section 14): after load and on every client-side route
// change it records the page's path, without its query or hash; when the view ends (the next
// route change, pagehide, or the page being hidden) it sends the seconds the view lasted, once.

const FIRST = '0b7c6f2e-4f1a-4c39-9a51-2d6f3e8b9c10';
const SECOND = '6a1f8e44-0c2b-4d7e-8f90-b1c2d3e4f5a6';

interface Harness {
  readonly deps: BeaconDeps;
  readonly fetch: ReturnType<typeof vi.fn>;
  readonly sendBeacon: ReturnType<typeof vi.fn>;
  readonly setNow: (ms: number) => void;
  readonly created: () => unknown[];
  readonly timed: () => unknown[];
}

function harness(
  options: {
    ids?: (string | null)[];
    beacon?: boolean | 'absent';
    loaded?: Promise<void>;
  } = {},
): Harness {
  let now = 0;
  const ids = [...(options.ids ?? [FIRST, SECOND])];
  const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async (url) => {
    if (url !== VISITS_URL) return new Response(null, { status: 204 });
    const id = ids.shift() ?? null;
    return id === null
      ? new Response(null, { status: 204 })
      : Response.json({ id }, { status: 201 });
  });
  const sendBeacon = vi.fn<(url: string, data: string) => boolean>(() => options.beacon !== false);
  const deps: BeaconDeps = {
    now: () => now,
    fetch,
    ...(options.beacon === 'absent' ? {} : { sendBeacon }),
    whenLoaded: () => options.loaded ?? Promise.resolve(),
  };
  const bodies = (calls: unknown[][], url: string) =>
    calls
      .filter(([called]) => called === url)
      .map(
        ([, second]) =>
          JSON.parse(
            typeof second === 'string' ? second : String((second as RequestInit).body),
          ) as unknown,
      );
  return {
    deps,
    fetch,
    sendBeacon,
    setNow: (ms) => {
      now = ms;
    },
    created: () => bodies(fetch.mock.calls, VISITS_URL),
    timed: () => [
      ...bodies(sendBeacon.mock.calls, VISIT_TIME_URL),
      ...bodies(fetch.mock.calls, VISIT_TIME_URL),
    ],
  };
}

// Lets the tracker's promise chains (load, the create request, its JSON) settle.
const settle = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

describe('viewPath', () => {
  it('keeps the pathname alone', () => {
    expect(viewPath('/')).toBe('/');
    expect(viewPath('/p/routeserve')).toBe('/p/routeserve');
  });

  it('strips a query string and a hash', () => {
    expect(viewPath('/p/routeserve?branches=all&runs=30')).toBe('/p/routeserve');
    expect(viewPath('/privacy#cookie')).toBe('/privacy');
    expect(viewPath('/p/x?a=1#b')).toBe('/p/x');
  });

  it('sends nothing for a path the server would refuse', () => {
    expect(viewPath('')).toBeNull();
    expect(viewPath('p/x')).toBeNull();
    expect(viewPath(`/${'a'.repeat(511)}`)).toBe(`/${'a'.repeat(511)}`);
    expect(viewPath(`/${'a'.repeat(512)}`)).toBeNull();
  });

  // The owner's admin pages are not visits (spec section 15, "Admin" as built): the beacon is in
  // the root layout, so it runs there too, and records nothing.
  it('sends nothing for an admin page, and only for admin pages', () => {
    for (const path of ['/admin', '/admin/', '/admin/links/x', '/admin?notice=signed-out']) {
      expect(viewPath(path), path).toBeNull();
    }
    expect(viewPath('/administer')).toBe('/administer');
    expect(viewPath('/p/admin')).toBe('/p/admin');
  });
});

describe('elapsedSeconds', () => {
  it('rounds to whole seconds and is never negative', () => {
    expect(elapsedSeconds(1_000, 3_499)).toBe(2);
    expect(elapsedSeconds(1_000, 3_500)).toBe(3);
    expect(elapsedSeconds(1_000, 1_000)).toBe(0);
    expect(elapsedSeconds(5_000, 1_000)).toBe(0);
  });
});

describe('createVisitTracker', () => {
  it('records the first view once the page has loaded, path only, same-origin', async () => {
    let loaded = () => undefined as void;
    const h = harness({ loaded: new Promise<void>((resolve) => (loaded = resolve)) });
    const tracker = createVisitTracker(h.deps);

    tracker.view('/p/ostomate2?branches=all#runs');
    await settle();
    expect(h.fetch).not.toHaveBeenCalled();

    loaded();
    await settle();
    expect(h.created()).toEqual([{ path: '/p/ostomate2' }]);
    const [, init] = h.fetch.mock.calls[0] as [string, RequestInit];
    expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin', keepalive: true });
  });

  it('sends one time update for a view when the route changes, then records the next', async () => {
    const h = harness();
    const tracker = createVisitTracker(h.deps);
    h.setNow(1_000);
    tracker.view('/');
    await settle();

    h.setNow(13_400);
    tracker.view('/p/routeserve');
    await settle();

    expect(h.created()).toEqual([{ path: '/' }, { path: '/p/routeserve' }]);
    expect(h.timed()).toEqual([{ id: FIRST, seconds: 12 }]);
    expect(h.sendBeacon).toHaveBeenCalledWith(VISIT_TIME_URL, expect.any(String));
  });

  it('sends the update once however many ways the view ends', async () => {
    const h = harness();
    const tracker = createVisitTracker(h.deps);
    tracker.view('/');
    await settle();

    h.setNow(4_000);
    tracker.leave();
    h.setNow(9_000);
    tracker.leave();
    tracker.view('/privacy');
    await settle();

    expect(h.timed()).toEqual([{ id: FIRST, seconds: 4 }]);
    expect(h.created()).toEqual([{ path: '/' }, { path: '/privacy' }]);
  });

  it('ignores the same path twice in a row, as a re-run effect would give', async () => {
    const h = harness();
    const tracker = createVisitTracker(h.deps);
    tracker.view('/');
    tracker.view('/');
    await settle();
    expect(h.created()).toEqual([{ path: '/' }]);
    expect(h.timed()).toEqual([]);
  });

  it('sends the update when the visit id arrives after the view ended', async () => {
    let answer: (value: Response) => void = () => undefined;
    const h = harness();
    h.fetch.mockImplementationOnce(() => new Promise<Response>((resolve) => (answer = resolve)));
    const tracker = createVisitTracker(h.deps);
    tracker.view('/');
    await settle();
    h.setNow(7_000);
    tracker.leave();
    await settle();
    expect(h.timed()).toEqual([]);

    h.setNow(60_000);
    answer(Response.json({ id: FIRST }, { status: 201 }));
    await settle();
    expect(h.timed()).toEqual([{ id: FIRST, seconds: 7 }]);
  });

  it('sends no update for a view the server did not record', async () => {
    const h = harness({ ids: [null] });
    const tracker = createVisitTracker(h.deps);
    tracker.view('/');
    await settle();
    tracker.leave();
    await settle();
    expect(h.timed()).toEqual([]);
  });

  it('sends no update when the record request fails or answers something else', async () => {
    const h = harness();
    h.fetch.mockRejectedValueOnce(new TypeError('offline'));
    h.fetch.mockResolvedValueOnce(Response.json({ id: 'not-a-uuid' }, { status: 201 }));
    const tracker = createVisitTracker(h.deps);
    tracker.view('/');
    await settle();
    tracker.view('/privacy');
    await settle();
    tracker.leave();
    await settle();
    expect(h.timed()).toEqual([]);
  });

  it('falls back to a keepalive fetch when sendBeacon refuses the data', async () => {
    const h = harness({ beacon: false });
    const tracker = createVisitTracker(h.deps);
    tracker.view('/');
    await settle();
    h.setNow(2_000);
    tracker.leave();
    await settle();

    expect(h.sendBeacon).toHaveBeenCalledTimes(1);
    const timeCall = h.fetch.mock.calls.find(([url]) => url === VISIT_TIME_URL) as
      [string, RequestInit] | undefined;
    expect(timeCall?.[1]).toMatchObject({
      method: 'POST',
      keepalive: true,
      credentials: 'same-origin',
      body: JSON.stringify({ id: FIRST, seconds: 2 }),
    });
  });

  it('uses a keepalive fetch where the browser has no sendBeacon', async () => {
    const h = harness({ beacon: 'absent' });
    const tracker = createVisitTracker(h.deps);
    tracker.view('/');
    await settle();
    h.setNow(3_000);
    tracker.leave();
    await settle();
    expect(h.timed()).toEqual([{ id: FIRST, seconds: 3 }]);
  });

  it('never lets a failed time update escape', async () => {
    const h = harness({ beacon: 'absent' });
    h.fetch.mockImplementation(async (url: string) => {
      if (url === VISIT_TIME_URL) throw new TypeError('offline');
      return Response.json({ id: FIRST }, { status: 201 });
    });
    const tracker = createVisitTracker(h.deps);
    tracker.view('/');
    await settle();
    expect(() => tracker.leave()).not.toThrow();
    await settle();
  });

  it('records nothing for a path it would not send, and still ends the view before it', async () => {
    const h = harness();
    const tracker = createVisitTracker(h.deps);
    tracker.view('/');
    await settle();
    h.setNow(5_000);
    tracker.view(`/${'a'.repeat(600)}`);
    await settle();
    expect(h.created()).toEqual([{ path: '/' }]);
    expect(h.timed()).toEqual([{ id: FIRST, seconds: 5 }]);
  });

  it('records no view of an admin page, and ends the public view before it', async () => {
    const h = harness();
    const tracker = createVisitTracker(h.deps);
    tracker.view('/');
    await settle();
    h.setNow(3_000);
    tracker.view('/admin');
    tracker.view('/admin/links/0b7c6f2e-4f1a-4c39-9a51-2d6f3e8b9c10');
    await settle();
    expect(h.created()).toEqual([{ path: '/' }]);
    expect(h.timed()).toEqual([{ id: FIRST, seconds: 3 }]);
  });
});
