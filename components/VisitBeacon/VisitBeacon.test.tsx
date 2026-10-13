// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BeaconDeps } from '../../lib/visits/beacon';
import { VisitBeacon } from './VisitBeacon';

// The beacon's wiring (spec section 14): one tracker for the page's life, told of the first path
// and of every client-side route change, and told the view ended on pagehide or when the page is
// hidden. What it sends is lib/visits/beacon.test.ts's.

let pathname = '/';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const view = vi.fn();
const leave = vi.fn();
let made: BeaconDeps[] = [];
vi.mock('../../lib/visits/beacon', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/visits/beacon')>()),
  createVisitTracker: (deps: BeaconDeps) => {
    made.push(deps);
    return { view, leave };
  },
}));

let visibility: DocumentVisibilityState = 'visible';

beforeEach(() => {
  pathname = '/';
  made = [];
  view.mockReset();
  leave.mockReset();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  });
});
afterEach(() => cleanup());

describe('VisitBeacon', () => {
  it('renders nothing, on the server or in the browser', () => {
    expect(renderToStaticMarkup(<VisitBeacon />)).toBe('');
    const { container } = render(<VisitBeacon />);
    expect(container.innerHTML).toBe('');
  });

  it('makes one tracker and tells it the first path and every route change', () => {
    const { rerender } = render(<VisitBeacon />);
    pathname = '/p/routeserve';
    rerender(<VisitBeacon />);
    rerender(<VisitBeacon />);
    pathname = '/';
    rerender(<VisitBeacon />);

    expect(made).toHaveLength(1);
    expect(view.mock.calls).toEqual([['/'], ['/p/routeserve'], ['/']]);
    expect(leave).not.toHaveBeenCalled();
  });

  it('ends the view on pagehide and when the page is hidden, not when it is shown', () => {
    render(<VisitBeacon />);
    window.dispatchEvent(new Event('pagehide'));
    expect(leave).toHaveBeenCalledTimes(1);

    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(leave).toHaveBeenCalledTimes(1);

    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(leave).toHaveBeenCalledTimes(2);
  });

  it('stops listening once it is gone', () => {
    const { unmount } = render(<VisitBeacon />);
    unmount();
    window.dispatchEvent(new Event('pagehide'));
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(leave).not.toHaveBeenCalled();
  });

  it('hands the tracker the browser’s clock, fetch and sendBeacon, and waits for load', async () => {
    const sendBeacon = vi.fn(() => true);
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: sendBeacon });
    render(<VisitBeacon />);
    const [deps] = made;
    expect(typeof deps?.now()).toBe('number');
    deps?.sendBeacon?.('/api/visits/time', '{}');
    expect(sendBeacon).toHaveBeenCalledWith('/api/visits/time', '{}');

    let state: DocumentReadyState = 'loading';
    Object.defineProperty(document, 'readyState', { configurable: true, get: () => state });
    let resolved = false;
    void deps?.whenLoaded?.().then(() => (resolved = true));
    await Promise.resolve();
    expect(resolved).toBe(false);
    state = 'complete';
    window.dispatchEvent(new Event('load'));
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(true);
  });
});
