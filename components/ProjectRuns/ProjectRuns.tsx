'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import type { TimeLabel } from '../../lib/copy/time';
import { feedConnection } from '../../lib/live/reports';
import type { BranchScope } from '../../lib/queries/project';
import { useArrivals, useLiveState } from '../LiveUpdates/LiveUpdates';
import { RunFeed } from '../RunFeed/RunFeed';
import type { FeedRun } from '../RunFeedRow/RunFeedRow';

export interface ProjectRunsProps {
  project: string;
  runs: {
    branches: BranchScope;
    items: readonly FeedRun[];
    branchHrefs: Readonly<Record<BranchScope, string>>;
    loadMoreHref: string | null;
  };
  // When the page's data was read, for the offline note.
  asOf: TimeLabel;
}

// The project page's run list. The branch filter and its length live in the URL, so the server
// renders the chosen list: the buttons only navigate there. Without JavaScript the list renders
// on its default page and the buttons do nothing. Inside LiveUpdates it shows the connection's
// note and marks the runs that arrived since the page loaded; a new branch scope is a new list.
export function ProjectRuns({ project, runs, asOf }: ProjectRunsProps) {
  const router = useRouter();
  const connection = feedConnection(useLiveState(), asOf);
  const arrived = useArrivals(
    runs.items.map((run) => run.id),
    runs.branches,
  );
  // "Load 20 more" (design v21 item 14): busy from the click until the longer list arrives, which
  // changes the next page's address; then focus moves to the first of the new rows.
  const [pending, startTransition] = useTransition();
  const [asked, setAsked] = useState<{ href: string; shown: number } | null>(null);
  const [focusHref, setFocusHref] = useState<string | null>(null);
  const loading = asked !== null && asked.href === runs.loadMoreHref;
  if (asked !== null && !loading) {
    // The longer list has arrived: its first new row takes focus once it is drawn.
    setFocusHref(runs.items[asked.shown]?.href ?? null);
    setAsked(null);
  }
  useEffect(() => {
    if (focusHref !== null) document.querySelector<HTMLElement>(`a[href="${focusHref}"]`)?.focus();
  }, [focusHref]);
  const go = (href: string) => router.push(href, { scroll: false });
  const list = {
    list: 'project',
    project,
    branches: runs.branches,
    onBranchesChange: (branches: BranchScope) => go(runs.branchHrefs[branches]),
    ...connection,
  } as const;
  if (runs.items.length === 0) return <RunFeed state="empty" {...list} />;
  const { loadMoreHref } = runs;
  const loadMore = (href: string) => {
    setAsked({ href, shown: runs.items.length });
    startTransition(() => go(href));
  };
  return (
    <RunFeed
      state="ready"
      runs={runs.items.map((run) => ({ ...run, isNew: arrived.has(run.id) }))}
      {...list}
      onLoadMore={loadMoreHref === null ? undefined : () => loadMore(loadMoreHref)}
      loadingMore={loading && pending}
    />
  );
}
