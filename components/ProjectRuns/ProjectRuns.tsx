'use client';

import { useRouter } from 'next/navigation';

import type { BranchScope } from '../../lib/queries/project';
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
}

// The project page's run list. The branch filter and its length live in the URL, so the server
// renders the chosen list: the buttons only navigate there. Without JavaScript the list renders
// on its default page and the buttons do nothing. Realtime (the live note) comes with the live
// feed; until then no connection state is given, so no note is shown.
export function ProjectRuns({ project, runs }: ProjectRunsProps) {
  const router = useRouter();
  const go = (href: string) => router.push(href, { scroll: false });
  const list = {
    list: 'project',
    project,
    branches: runs.branches,
    onBranchesChange: (branches: BranchScope) => go(runs.branchHrefs[branches]),
  } as const;
  if (runs.items.length === 0) return <RunFeed state="empty" {...list} />;
  const { loadMoreHref } = runs;
  return (
    <RunFeed
      state="ready"
      runs={runs.items}
      {...list}
      onLoadMore={loadMoreHref === null ? undefined : () => go(loadMoreHref)}
    />
  );
}
