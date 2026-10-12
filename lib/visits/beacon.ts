// The visit beacon's logic in the browser (spec section 14): a page view is recorded by the
// page's own script after it has loaded, not by the server request, which keeps out most link
// previews and mail scanners, since they fetch a page without running it. Each view sends its
// path, without the query string or hash, and, when it ends, the whole seconds it lasted, once.
// A view ends at the next client-side route change, on pagehide, or when the page is hidden
// (the last moment a mobile browser reliably runs script). Nothing here reads a cookie: the
// session lives in an httpOnly cookie the browser sends by itself. Everything the browser
// provides is passed in, so the timing and the requests are tested without one.

export const VISITS_URL = '/api/visits';
export const VISIT_TIME_URL = '/api/visits/time';

/** The longest path the server takes (lib/visits/record.ts); a longer one is not sent. */
export const PATH_LIMIT = 512;

export interface BeaconDeps {
  /** A monotonic clock in milliseconds: performance.now in the browser. */
  readonly now: () => number;
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** navigator.sendBeacon, where the browser has it. */
  readonly sendBeacon?: (url: string, data: string) => boolean;
  /** Resolves once the page has finished loading. */
  readonly whenLoaded?: () => Promise<void>;
}

export interface VisitTracker {
  /** A page view of `pathname` begins, and the one before it, if any, ends. */
  readonly view: (pathname: string) => void;
  /** The current view ends: pagehide, or the page was hidden. */
  readonly leave: () => void;
}

const VISIT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The path to record: the pathname without a query or hash, or null if the server would refuse it. */
export function viewPath(pathname: string): string | null {
  const path = pathname.split(/[?#]/, 1)[0] ?? '';
  return path.startsWith('/') && path.length <= PATH_LIMIT ? path : null;
}

export function elapsedSeconds(startMs: number, endMs: number): number {
  return Math.max(0, Math.round((endMs - startMs) / 1000));
}

interface View {
  readonly path: string | null;
  readonly startedAt: number;
  id: string | null;
  /** Set when the view ends: the seconds it lasted. */
  seconds: number | null;
  sent: boolean;
}

export function createVisitTracker(deps: BeaconDeps): VisitTracker {
  let current: View | null = null;

  const post = (url: string, body: string) =>
    deps.fetch(url, { method: 'POST', body, credentials: 'same-origin', keepalive: true });

  // One update per view: sent once both the id and the seconds are known, whichever comes last.
  const sendTime = (view: View) => {
    if (view.sent || view.id === null || view.seconds === null) return;
    view.sent = true;
    const body = JSON.stringify({ id: view.id, seconds: view.seconds });
    // sendBeacon survives the page going away; it refuses data over its quota, so a keepalive
    // fetch, which also outlives the page, is the fallback. Errors are the page's to ignore.
    if (deps.sendBeacon?.(VISIT_TIME_URL, body) === true) return;
    post(VISIT_TIME_URL, body).catch(() => undefined);
  };

  const record = async (view: View, path: string) => {
    try {
      await (deps.whenLoaded?.() ?? Promise.resolve());
      const response = await post(VISITS_URL, JSON.stringify({ path }));
      if (response.status !== 201) return;
      const body: unknown = await response.json();
      const id = typeof body === 'object' && body !== null && 'id' in body ? body.id : null;
      if (typeof id !== 'string' || !VISIT_ID.test(id)) return;
      view.id = id;
      sendTime(view);
    } catch {
      // A visit that could not be recorded is simply not recorded; the page is unaffected.
    }
  };

  const leave = () => {
    if (current === null || current.seconds !== null) return;
    current.seconds = elapsedSeconds(current.startedAt, deps.now());
    sendTime(current);
  };

  const view = (pathname: string) => {
    const path = viewPath(pathname);
    if (current !== null && current.path === path) return;
    leave();
    const next: View = { path, startedAt: deps.now(), id: null, seconds: null, sent: false };
    current = next;
    if (path !== null) void record(next, path);
  };

  return { view, leave };
}
