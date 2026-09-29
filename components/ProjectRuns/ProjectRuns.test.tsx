// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FeedRun } from '../RunFeedRow/RunFeedRow';
import { ProjectRuns } from './ProjectRuns';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

beforeEach(() => push.mockReset());
afterEach(cleanup);

const RUN: FeedRun = {
  id: 'r1',
  href: '/p/ostomate2/runs/r1',
  project: 'Ostomate 2.0',
  branch: 'main',
  sha: '0e2d0b4',
  when: '2 hours ago',
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
  it('lists the runs under "Runs" with no project name and no live note', () => {
    const { getByRole, getAllByRole, container } = render(
      <ProjectRuns
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
        project="Ostomate 2.0"
        runs={{ branches: 'all', items: [RUN], branchHrefs: HREFS, loadMoreHref: null }}
      />,
    );
    expect(queryByRole('button', { name: 'Load 20 more' })).toBeNull();
  });

  it('keeps the header and filter with no runs, naming the project', () => {
    const { container, getByRole } = render(
      <ProjectRuns
        project="Ostomate 2.0"
        runs={{ branches: 'default', items: [], branchHrefs: HREFS, loadMoreHref: null }}
      />,
    );

    expect(getByRole('radiogroup', { name: 'Branches' })).toBeTruthy();
    expect(container.textContent).toContain('Runs appear here when Ostomate 2.0’s CI reports.');
  });
});
