// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReportWatch } from '../../lib/live/reports';
import { LiveUpdates } from '../LiveUpdates/LiveUpdates';
import type { FeedRun } from '../RunFeedRow/RunFeedRow';
import { ProjectRuns, type ProjectRunsProps } from './ProjectRuns';
import { timeLabel } from '../testing/time';

const push = vi.fn();
const router = { push, refresh: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

let watch: ReportWatch | undefined;
vi.mock('../../lib/live/reports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/live/reports')>()),
  watchReports: (_client: unknown, handlers: ReportWatch) => {
    watch = handlers;
    return () => {};
  },
}));
vi.mock('../../lib/supabase/public', () => ({ createPublicClient: () => ({}) }));

const AS_OF = timeLabel('12:00');

beforeEach(() => push.mockReset());
afterEach(cleanup);

const RUN: FeedRun = {
  id: 'r1',
  href: '/p/ostomate2/runs/r1',
  project: 'Ostomate 2.0',
  branch: 'main',
  sha: '0e2d0b4',
  when: timeLabel('2 h ago'),
  visibility: 'public',
  title: 'Push to main',
  status: 'passed',
  total: 192,
  duration: '36 s',
};

const HREFS = { default: '/p/ostomate2', all: '/p/ostomate2?branches=all' };

// The run list keeps its filter and length in the URL, so a reload, a shared link and the
// server render all show the same list; the buttons only navigate there.
describe('ProjectRuns', () => {
  // Outside LiveUpdates, as while the channel connects and without JavaScript: no note.
  it('lists the runs under "Runs" with no project name and no live note', () => {
    const { getByRole, getAllByRole, container } = render(
      <ProjectRuns
        asOf={AS_OF}
        project="Ostomate 2.0"
        runs={{ branches: 'default', items: [RUN], branchHrefs: HREFS, loadMoreHref: null }}
      />,
    );

    expect(getByRole('heading', { level: 2 }).textContent).toBe('Runs');
    const row = getAllByRole('link').find((link) => link.getAttribute('href') === RUN.href);
    expect(row?.textContent).not.toContain('Ostomate 2.0');
    expect(container.querySelector('[data-part="live-note"]')).toBeNull();
    expect(getByRole('radio', { name: 'Default branch' }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('goes to the other branch scope’s list without scrolling', () => {
    const { getByRole } = render(
      <ProjectRuns
        asOf={AS_OF}
        project="Ostomate 2.0"
        runs={{ branches: 'default', items: [RUN], branchHrefs: HREFS, loadMoreHref: null }}
      />,
    );

    fireEvent.click(getByRole('radio', { name: 'All branches' }));
    expect(push).toHaveBeenCalledWith('/p/ostomate2?branches=all', { scroll: false });
  });

  it('loads 20 more by going to the longer list, and offers it only when there are more', () => {
    const { getByRole, queryByRole, rerender } = render(
      <ProjectRuns
        asOf={AS_OF}
        project="Ostomate 2.0"
        runs={{
          branches: 'all',
          items: [RUN],
          branchHrefs: HREFS,
          loadMoreHref: '/p/ostomate2?branches=all&runs=30',
        }}
      />,
    );

    fireEvent.click(getByRole('button', { name: 'Load 20 more' }));
    expect(push).toHaveBeenCalledWith('/p/ostomate2?branches=all&runs=30', { scroll: false });

    rerender(
      <ProjectRuns
        asOf={AS_OF}
        project="Ostomate 2.0"
        runs={{ branches: 'all', items: [RUN], branchHrefs: HREFS, loadMoreHref: null }}
      />,
    );
    expect(queryByRole('button', { name: 'Load 20 more' })).toBeNull();
  });

  it('keeps the header and filter with no runs, naming the project', () => {
    const { container, getByRole } = render(
      <ProjectRuns
        asOf={AS_OF}
        project="Ostomate 2.0"
        runs={{ branches: 'default', items: [], branchHrefs: HREFS, loadMoreHref: null }}
      />,
    );

    expect(getByRole('radiogroup', { name: 'Branches' })).toBeTruthy();
    expect(container.textContent).toContain('Runs appear here when Ostomate 2.0’s CI reports.');
  });
});

describe('ProjectRuns, live', () => {
  const run = (id: string): FeedRun => ({ ...RUN, id, href: `/p/ostomate2/runs/${id}` });
  const runs = (
    ids: readonly string[],
    branches: 'default' | 'all' = 'default',
  ): ProjectRunsProps['runs'] => ({
    branches,
    items: ids.map(run),
    branchHrefs: HREFS,
    loadMoreHref: null,
  });
  const live = (list: ProjectRunsProps['runs']) => (
    <LiveUpdates>
      <ProjectRuns asOf={AS_OF} project="Ostomate 2.0" runs={list} />
    </LiveUpdates>
  );
  const chips = (container: HTMLElement) =>
    [...container.querySelectorAll('[role="log"] a')].map(
      (row) => row.querySelector('[data-part="new"]') !== null,
    );

  it('shows the live note under the header, and the offline note dated by the page', () => {
    const { container } = render(live(runs(['b', 'a'])));
    const note = () => container.querySelector('[data-part="live-note"]')?.textContent;

    act(() => watch?.onState('live'));
    expect(note()).toBe('Updates as reports arrive');
    act(() => watch?.onState('offline'));
    expect(note()).toBe('Offline. Showing runs as of 12:00; reconnecting');
  });

  it('marks a run that arrived as new, and not the runs "Load 20 more" adds below', () => {
    const { container, rerender } = render(live(runs(['c', 'b'])));
    expect(chips(container)).toEqual([false, false]);

    rerender(live(runs(['d', 'c', 'b'])));
    expect(chips(container)).toEqual([true, false, false]);

    rerender(live(runs(['d', 'c', 'b', 'a', 'z'])));
    expect(chips(container)).toEqual([true, false, false, false, false]);
  });

  it('starts again when the branch filter shows another list', () => {
    const { container, rerender } = render(live(runs(['c', 'b'])));
    rerender(live(runs(['pr', 'c', 'b'], 'all')));

    expect(chips(container)).toEqual([false, false, false]);
  });
});
