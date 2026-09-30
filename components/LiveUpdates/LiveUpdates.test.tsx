// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReportWatch } from '../../lib/live/reports';
import type { FeedRun } from '../RunFeedRow/RunFeedRow';
import { timeLabel } from '../testing/time';
import { LiveRunFeed, LiveSiteHeader, LiveUpdates } from './LiveUpdates';

const refresh = vi.fn();
// Next.js hands every render the same router, as this does.
const router = { refresh, push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

// The page's one subscription, played by the test: what watchReports was handed, and whether the
// component stopped it.
let watch: ReportWatch | undefined;
const stop = vi.fn();
vi.mock('../../lib/live/reports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/live/reports')>()),
  watchReports: (_client: unknown, handlers: ReportWatch) => {
    watch = handlers;
    return stop;
  },
}));
// The browser client needs the NEXT_PUBLIC_ settings, which unit tests do not have.
vi.mock('../../lib/supabase/public', () => ({ createPublicClient: () => ({}) }));

beforeEach(() => {
  vi.useFakeTimers();
  refresh.mockReset();
  stop.mockReset();
  watch = undefined;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const AS_OF = timeLabel('12:00');

const run = (id: string): FeedRun => ({
  id,
  href: `/p/ostomate2/runs/${id}`,
  project: 'Ostomate 2.0',
  branch: 'main',
  sha: '0e2d0b4',
  when: timeLabel('2 h ago'),
  visibility: 'public',
  title: 'Push to main',
  status: 'passed',
  total: 142,
  duration: '36 s',
});

function page(runs: readonly FeedRun[]) {
  return (
    <LiveUpdates>
      <LiveSiteHeader projects={[]} current="home" />
      <LiveRunFeed runs={runs} asOf={AS_OF} />
    </LiveUpdates>
  );
}

const state = (next: 'live' | 'offline') => act(() => watch?.onState(next));
const report = () => act(() => watch?.onReport());
const note = (container: HTMLElement) =>
  container.querySelector('[data-part="live-note"]')?.textContent ?? null;
const indicator = (container: HTMLElement) =>
  container.querySelector('header [data-state]')?.textContent ?? null;

describe('LiveUpdates', () => {
  // Spec section 13: without JavaScript the feed is the server-rendered list, and neither "Live"
  // nor "Offline" would be true, so the server renders neither.
  it('renders no connection state on the server', () => {
    const html = renderToStaticMarkup(page([run('b'), run('a')]));

    expect(html).not.toMatch(/Live|Offline|Updates as reports arrive/);
    expect(html).toContain('href="/p/ostomate2/runs/b"');
    expect(html).not.toContain('data-part="new"');
  });

  it('shows neither state while the channel is connecting', () => {
    const { container } = render(page([run('a')]));

    expect(watch).toBeDefined();
    expect(indicator(container)).toBeNull();
    expect(note(container)).toBeNull();
  });

  it('shows "Live" and the live note once subscribed', () => {
    const { container } = render(page([run('a')]));
    state('live');

    expect(indicator(container)).toBe('Live');
    expect(note(container)).toBe('Updates as reports arrive');
  });

  it('shows the offline states, dated by the page’s data, when the channel fails', () => {
    const { container } = render(page([run('a')]));
    state('live');
    state('offline');

    expect(indicator(container)).toBe('Offline · reconnecting');
    expect(note(container)).toBe('Offline. Showing runs as of 12:00 UTC; reconnecting');
  });

  it('refreshes once for a burst of reports, 2 s after the last', () => {
    render(page([run('a')]));
    state('live');
    report();
    act(() => vi.advanceTimersByTime(1_500));
    report();
    act(() => vi.advanceTimersByTime(1_500));
    report();
    act(() => vi.advanceTimersByTime(1_999));
    expect(refresh).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('refreshes again for a report that comes after the refresh', () => {
    render(page([run('a')]));
    report();
    act(() => vi.advanceTimersByTime(2_000));
    report();
    act(() => vi.advanceTimersByTime(2_000));

    expect(refresh).toHaveBeenCalledTimes(2);
  });

  // Reports sent while the socket was down never reach the page, so it catches up at once.
  it('refreshes when it is live again after being offline, not on the first subscribe', () => {
    render(page([run('a')]));
    state('live');
    expect(refresh).not.toHaveBeenCalled();

    state('offline');
    state('live');
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('stops the subscription and any pending refresh when the page goes', () => {
    const { unmount } = render(page([run('a')]));
    report();
    unmount();

    expect(stop).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(2_000));
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('LiveRunFeed', () => {
  const chips = (container: HTMLElement) =>
    [...container.querySelectorAll('[role="log"] a')].map((row) =>
      row.querySelector('[data-part="new"]') === null ? row.getAttribute('href') : 'New',
    );

  // RunFeedRow "New": only rows that arrived since the page loaded.
  it('marks the runs that arrived since the page loaded as new, and keeps them so', () => {
    const { container, rerender } = render(page([run('c'), run('b'), run('a')]));
    expect(chips(container)).toEqual([
      '/p/ostomate2/runs/c',
      '/p/ostomate2/runs/b',
      '/p/ostomate2/runs/a',
    ]);

    rerender(page([run('d'), run('c'), run('b')]));
    expect(chips(container)).toEqual(['New', '/p/ostomate2/runs/c', '/p/ostomate2/runs/b']);

    rerender(page([run('e'), run('d'), run('c')]));
    expect(chips(container)).toEqual(['New', 'New', '/p/ostomate2/runs/c']);
  });

  it('is the landing’s empty card, with no note, before any run', () => {
    const { container } = render(page([]));
    state('live');

    expect(container.querySelector('[data-part="empty-title"]')?.textContent).toBe('No runs yet');
    expect(note(container)).toBeNull();
  });

  it('marks every run as new when the feed was empty at page load', () => {
    const { container, rerender } = render(page([]));
    rerender(page([run('a')]));

    expect(chips(container)).toEqual(['New']);
  });
});
