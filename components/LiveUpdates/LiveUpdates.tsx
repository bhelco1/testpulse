'use client';

import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import type { TimeLabel } from '../../lib/copy/time';
import { arrivals, rebase, type Baseline } from '../../lib/live/arrivals';
import {
  feedConnection,
  REFRESH_DEBOUNCE_MS,
  watchReports,
  type LiveState,
} from '../../lib/live/reports';
import { createPublicClient } from '../../lib/supabase/public';
import { RunFeed } from '../RunFeed/RunFeed';
import type { FeedRun } from '../RunFeedRow/RunFeedRow';
import { SiteHeader, type SiteHeaderProps } from '../SiteHeader/SiteHeader';

// The live feed (spec section 13, design/components.md LiveIndicator, RunFeed and RunFeedRow).
// One subscription per page: a report insert re-renders the page on the server through
// lib/queries (router.refresh), so every number on it, not only the feed, is current, and the
// browser never builds anything from the realtime payload. The server renders the "connecting"
// state, which shows neither "Live" nor "Offline", and that is what a visitor without
// JavaScript keeps.

const LiveContext = createContext<LiveState>('connecting');

export function LiveUpdates({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<LiveState>('connecting');

  useEffect(() => {
    let client;
    try {
      client = createPublicClient();
    } catch (error) {
      // A build without the Supabase settings: the page stays as rendered, claiming neither
      // state. The message names the missing setting only.
      console.error(error instanceof Error ? error.message : error);
      return;
    }
    let pending: ReturnType<typeof setTimeout> | undefined;
    let offline = false;
    const stop = watchReports(client, {
      onReport: () => {
        clearTimeout(pending);
        pending = setTimeout(() => router.refresh(), REFRESH_DEBOUNCE_MS);
      },
      onState: (next) => {
        // Reports sent while the socket was down never arrive, so catch up on reconnecting.
        if (next === 'live' && offline) router.refresh();
        offline = next === 'offline';
        setState(next);
      },
    });
    return () => {
      clearTimeout(pending);
      stop();
    };
  }, [router]);

  return <LiveContext.Provider value={state}>{children}</LiveContext.Provider>;
}

export const useLiveState = (): LiveState => useContext(LiveContext);

/**
 * The ids among `ids` that arrived since the page loaded (lib/live/arrivals.ts). The baseline is
 * the first render's ids and starts again when `scope` changes, as when the project page's branch
 * filter shows another list.
 */
export function useArrivals(ids: readonly string[], scope: string): ReadonlySet<string> {
  const [baseline, setBaseline] = useState<Baseline>(() => ({ scope, seen: new Set(ids) }));
  const current = rebase(baseline, scope, ids);
  if (current !== baseline) setBaseline(current);
  return arrivals(current.seen, ids);
}

/** SiteHeader with the LiveIndicator for this page's connection, none while connecting. */
export function LiveSiteHeader(props: Omit<SiteHeaderProps, 'connected'>) {
  const state = useLiveState();
  return (
    <SiteHeader {...props} connected={state === 'connecting' ? undefined : state === 'live'} />
  );
}

/** The landing's recent runs, with the live note and the "New" chip. */
export function LiveRunFeed({ runs, asOf }: { runs: readonly FeedRun[]; asOf: TimeLabel }) {
  const state = useLiveState();
  const arrived = useArrivals(
    runs.map((run) => run.id),
    'recent',
  );
  // The landing's empty feed is a card of its own, with no header and so no note.
  if (runs.length === 0) return <RunFeed state="empty" />;
  return (
    <RunFeed
      state="ready"
      list="recent"
      runs={runs.map((run) => ({ ...run, isNew: arrived.has(run.id) }))}
      {...feedConnection(state, asOf)}
    />
  );
}
