'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { createVisitTracker, type BeaconDeps, type VisitTracker } from '../../lib/visits/beacon';

// The visit beacon (spec section 14), rendered once in the root layout. It draws nothing: after
// the page has loaded, and on every client-side route change, it records the view; on pagehide,
// or when the page is hidden, it ends it. What it sends is lib/visits/beacon.ts. Without
// JavaScript nothing runs, so nothing is recorded.

function browserDeps(): BeaconDeps {
  return {
    now: () => performance.now(),
    fetch: (url, init) => fetch(url, init),
    ...(typeof navigator.sendBeacon === 'function'
      ? { sendBeacon: (url: string, data: string) => navigator.sendBeacon(url, data) }
      : {}),
    whenLoaded: () =>
      document.readyState === 'complete'
        ? Promise.resolve()
        : new Promise((resolve) =>
            window.addEventListener('load', () => resolve(), { once: true }),
          ),
  };
}

export function VisitBeacon() {
  const pathname = usePathname();
  const tracker = useRef<VisitTracker | null>(null);

  useEffect(() => {
    tracker.current ??= createVisitTracker(browserDeps());
    tracker.current.view(pathname);
  }, [pathname]);

  useEffect(() => {
    const leave = () => tracker.current?.leave();
    const hidden = () => {
      if (document.visibilityState === 'hidden') leave();
    };
    window.addEventListener('pagehide', leave);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('pagehide', leave);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);

  return null;
}
