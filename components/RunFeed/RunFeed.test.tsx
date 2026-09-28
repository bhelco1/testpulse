// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FeedRun, KioskFeedRun } from '../RunFeedRow/RunFeedRow';
import { ruleFor } from '../testing/stylesheet';
import { RunFeed, type FeedEntry } from './RunFeed';
import styles from './RunFeed.module.css';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'RunFeed.module.css');

const has = (element: Element | null | undefined, name: string) => {
  const className = styles[name];
  if (!className) throw new Error(`RunFeed.module.css has no .${name}`);
  return element?.classList.contains(className) ?? false;
};

const run = (id: string, extra: Partial<FeedRun> = {}): FeedEntry =>
  ({
    id,
    href: `/p/ostomate2/runs/${id}`,
    status: 'passed',
    visibility: 'public',
    title: 'Push to main',
    project: 'Ostomate2',
    branch: 'main',
    sha: '0e2d0b4',
    when: '4 minutes ago',
    total: 142,
    duration: '27 s',
    ...extra,
  }) as FeedEntry;

const RUNS: FeedEntry[] = [
  { ...run('3'), isNew: true },
  run('2', {
    project: 'RouteServe',
    visibility: 'private',
    when: '2 hours ago',
  } as Partial<FeedRun>),
  run('1', { when: 'yesterday' }),
];

describe('RunFeed (web, landing)', () => {
  it('ready: "Recent runs" heading, the live note, and the rows in a polite log', () => {
    const { getByRole, getAllByRole } = render(
      <RunFeed state="ready" list="recent" runs={RUNS} connected />,
    );

    expect(getByRole('heading', { level: 2 }).textContent).toBe('Recent runs');
    const log = getByRole('log');
    expect(log.getAttribute('aria-live')).toBe('polite');
    const links = within(log).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/p/ostomate2/runs/3',
      '/p/ostomate2/runs/2',
      '/p/ostomate2/runs/1',
    ]);
    // Landing rows name their project.
    expect(links[0]?.textContent).toContain('Ostomate2·main');
    expect(getAllByRole('listitem')).toHaveLength(3);
  });

  it('marks only the new rows as new', () => {
    const { getAllByRole } = render(<RunFeed state="ready" list="recent" runs={RUNS} connected />);
    const newChips = getAllByRole('link').map(
      (link) => link.querySelector('[data-part="new"]') !== null,
    );
    expect(newChips).toEqual([true, false, false]);
  });

  it('connected: the pulsing dot and "Updates as reports arrive" in --ink-3', () => {
    const { container } = render(<RunFeed state="ready" list="recent" runs={RUNS} connected />);
    const note = container.querySelector<HTMLElement>('[data-part="live-note"]');

    expect(note?.textContent).toBe('Updates as reports arrive');
    expect(note?.querySelector<HTMLElement>('[data-part="dot"]')?.dataset.state).toBe('on');
    expect(has(note, 'offline')).toBe(false);
  });

  it('disconnected: the ring and "Offline. Showing runs as of {HH:MM}; reconnecting" in --ink-2', () => {
    const { container } = render(
      <RunFeed state="ready" list="recent" runs={RUNS} connected={false} asOf="10:42" />,
    );
    const note = container.querySelector<HTMLElement>('[data-part="live-note"]');

    expect(note?.textContent).toBe('Offline. Showing runs as of 10:42; reconnecting');
    expect(note?.querySelector<HTMLElement>('[data-part="dot"]')?.dataset.state).toBe('off');
    expect(has(note, 'offline')).toBe(true);
    // No banner: the rows stay, under the inline note.
    expect(container.querySelectorAll('a')).toHaveLength(3);
  });

  it('has no branch filter and no "Load more" on the landing feed', () => {
    const { queryByRole } = render(<RunFeed state="ready" list="recent" runs={RUNS} connected />);
    expect(queryByRole('radiogroup')).toBeNull();
    expect(queryByRole('button')).toBeNull();
  });

  it('renders on the server without client JavaScript: the rows are plain links in the log', () => {
    const html = renderToStaticMarkup(
      <RunFeed state="ready" list="recent" runs={RUNS} connected />,
    );
    expect(html).toContain('role="log"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('href="/p/ostomate2/runs/3"');
    expect(html).toContain('href="/p/ostomate2/runs/1"');
  });

  it('loading: a busy card of 3 skeleton rows and no log', () => {
    const { getByLabelText, queryByRole } = render(<RunFeed state="loading" />);
    const card = getByLabelText('Loading runs');

    expect(card.getAttribute('aria-busy')).toBe('true');
    expect(card.querySelectorAll('[data-part="skeleton-row"]')).toHaveLength(3);
    const [status, title, meta, count] = [
      ...(card.firstElementChild?.querySelectorAll<HTMLElement>('[data-part="skeleton"]') ?? []),
    ];
    expect([status?.style.width, status?.style.height]).toEqual(['104px', '14px']);
    expect([title?.style.width, title?.style.height]).toEqual(['70%', '14px']);
    expect([meta?.style.width, meta?.style.height]).toEqual(['45%', '10px']);
    expect([count?.style.width, count?.style.height]).toEqual(['90px', '14px']);
    expect(queryByRole('log')).toBeNull();
  });

  it('empty: "No runs yet" and the reason, no log', () => {
    const { container, queryByRole } = render(<RunFeed state="empty" />);

    expect(container.querySelector('[data-part="empty-title"]')?.textContent).toBe('No runs yet');
    expect(container.querySelector('[data-part="empty-text"]')?.textContent).toBe(
      "Runs appear here as each project's CI reports.",
    );
    expect(queryByRole('log')).toBeNull();
  });

  it('error: ErrorState inline with the feed copy, and "Try again" retries', () => {
    const onRetry = vi.fn();
    const { getByRole } = render(<RunFeed state="error" onRetry={onRetry} />);
    const alert = getByRole('alert');

    expect(alert.dataset.variant).toBe('inline');
    expect(alert.textContent).toContain("Runs couldn't be loaded");
    expect(alert.textContent).toContain('The rest of the page is still current.');
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe('RunFeed (web, project page)', () => {
  function renderProject(extra: { onLoadMore?: () => void } = {}) {
    const onBranchesChange = vi.fn();
    const view = render(
      <RunFeed
        state="ready"
        list="project"
        runs={RUNS}
        branches="default"
        onBranchesChange={onBranchesChange}
        {...extra}
      />,
    );
    return { ...view, onBranchesChange };
  }

  it('is headed "Runs" with the Branches radio group, and rows leave out the project', () => {
    const { getByRole, getAllByRole } = renderProject();

    expect(getByRole('heading', { level: 2 }).textContent).toBe('Runs');
    const group = getByRole('radiogroup', { name: 'Branches' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((radio) => radio.textContent)).toEqual(['Default branch', 'All branches']);
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    expect(getAllByRole('link')[2]?.textContent).toContain('main·0e2d0b4');
    expect(getAllByRole('link')[2]?.textContent).not.toContain('Ostomate2');
  });

  it('shows the given branch scope as chosen', () => {
    const { getByRole } = render(
      <RunFeed
        state="ready"
        list="project"
        runs={RUNS}
        branches="all"
        onBranchesChange={() => {}}
      />,
    );
    expect(getByRole('radio', { name: 'All branches' }).getAttribute('aria-checked')).toBe('true');
  });

  it('asks for the other branch scope on click and with the arrow keys', () => {
    const { getByRole, onBranchesChange } = renderProject();

    fireEvent.click(getByRole('radio', { name: 'All branches' }));
    expect(onBranchesChange).toHaveBeenLastCalledWith('all');
    fireEvent.keyDown(getByRole('radio', { name: 'Default branch' }), { key: 'ArrowRight' });
    expect(onBranchesChange).toHaveBeenCalledTimes(2);
    expect(onBranchesChange).toHaveBeenLastCalledWith('all');
  });

  it('"Load 20 more" is a secondary button that asks for more', () => {
    const onLoadMore = vi.fn();
    const { getByRole } = renderProject({ onLoadMore });
    const more = getByRole('button', { name: 'Load 20 more' });

    expect(more.dataset.variant).toBe('secondary');
    fireEvent.click(more);
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it('has no "Load 20 more" when there is nothing more to load', () => {
    const { queryByRole } = renderProject();
    expect(queryByRole('button', { name: 'Load 20 more' })).toBeNull();
  });

  it('draws no live note in the header, where the filter sits', () => {
    const { container } = renderProject();
    expect(container.querySelector('[data-part="live-note"]')).toBeNull();
  });
});

const KIOSK_RUNS: KioskFeedRun[] = [
  {
    id: '3',
    status: 'passed',
    project: 'Ostomate2',
    branch: 'main',
    when: '4 min ago',
    total: 142,
  },
  {
    id: '2',
    status: 'passed',
    project: 'RouteServe',
    branch: 'main',
    when: '2 h ago',
    total: 1048,
  },
  {
    id: '1',
    status: 'failed',
    project: 'Ostomate2',
    branch: 'PR #52',
    when: 'yesterday',
    failed: 1,
  },
];

describe('RunFeed (kiosk)', () => {
  it('heads three tiles with "Recent runs" and "Updates as reports arrive"', () => {
    const { getByRole, container } = render(
      <RunFeed variant="kiosk" runs={KIOSK_RUNS} connected />,
    );

    expect(getByRole('heading', { level: 2 }).textContent).toBe('Recent runs');
    expect(container.querySelector('[data-part="kiosk-note"]')?.textContent).toBe(
      'Updates as reports arrive',
    );
    const log = getByRole('log');
    expect(log.querySelectorAll('[data-variant="kiosk"]')).toHaveLength(3);
    expect(container.querySelector('a, button')).toBeNull();
  });

  it('disconnected: "As of {HH:MM}"', () => {
    const { container } = render(
      <RunFeed variant="kiosk" runs={KIOSK_RUNS} connected={false} asOf="10:42" />,
    );
    expect(container.querySelector('[data-part="kiosk-note"]')?.textContent).toBe('As of 10:42');
  });

  it('lays out a 200px header column beside three equal tiles, gap 16', () => {
    expect(ruleFor(CSS, '.kiosk')).toEqual({
      display: 'grid',
      'grid-template-columns': '200px minmax(0, 1fr)',
      gap: '16px',
      'align-items': 'stretch',
    });
    expect(ruleFor(CSS, '.kioskLog')).toEqual({
      display: 'grid',
      'grid-template-columns': 'repeat(3, minmax(0, 1fr))',
      gap: '16px',
    });
    expect(ruleFor(CSS, '.kioskHeader')).toEqual({
      display: 'flex',
      'flex-direction': 'column',
      'justify-content': 'center',
      gap: '6px',
    });
    expect(ruleFor(CSS, '.kioskHeading')).toEqual({
      margin: '0px',
      font: '500 32px/1.1 var(--font-serif)',
    });
    expect(ruleFor(CSS, '.kioskNote')).toEqual({ 'font-size': '22px', color: 'var(--ink-3)' });
  });
});

describe('RunFeed styles', () => {
  it('draws the feed card: --surface, 1px --line, radius 20, padding 8', () => {
    expect(ruleFor(CSS, '.feed')).toEqual({
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      'border-radius': 'var(--radius-xl)',
      padding: '8px',
      'min-width': '0px',
      'box-shadow': 'var(--shadow-card)',
    });
  });

  it('sets the landing header and the h2 serif 24/500', () => {
    expect(ruleFor(CSS, '.header')).toEqual({
      display: 'flex',
      'flex-wrap': 'wrap',
      'justify-content': 'space-between',
      'align-items': 'baseline',
      gap: '6px 12px',
      padding: '16px 16px 10px',
    });
    expect(ruleFor(CSS, '.heading')).toEqual({ margin: '0px', font: '500 24px var(--font-serif)' });
  });

  it('sets the project header: centred, gap 10 12, padding 12 12 8 16', () => {
    expect(ruleFor(CSS, '.header.projectHeader')).toEqual({
      'align-items': 'center',
      gap: '10px 12px',
      padding: '12px 12px 8px 16px',
    });
  });

  it('sets the live note 13.5 --ink-3 with gap 8, and --ink-2 when offline', () => {
    expect(ruleFor(CSS, '.note')).toEqual({
      display: 'flex',
      'align-items': 'center',
      gap: '8px',
      'font-size': '13.5px',
      color: 'var(--ink-3)',
    });
    expect(ruleFor(CSS, '.note.offline')).toEqual({ color: 'var(--ink-2)' });
  });

  it('stacks the rows, and pads "Load 20 more" 8 16 12', () => {
    expect(ruleFor(CSS, '.list')).toEqual({
      display: 'flex',
      'flex-direction': 'column',
      margin: '0px',
      padding: '0px',
      'list-style': 'none',
    });
    expect(ruleFor(CSS, '.more')).toEqual({ padding: '8px 16px 12px' });
  });

  it('sets the loading rows: gap 16, padding 14 16, the text column flexible', () => {
    expect(ruleFor(CSS, '.skeletonRow')).toEqual({
      display: 'flex',
      'align-items': 'center',
      gap: '16px',
      padding: '14px 16px',
    });
    expect(ruleFor(CSS, '.skeletonText')).toEqual({ flex: '1 1 0%' });
    expect(ruleFor(CSS, '.skeletonMeta')).toEqual({ 'margin-top': '8px' });
  });

  it('sets the empty card: padding 22 24, title serif 20, text 14 --ink-2', () => {
    expect(ruleFor(CSS, '.empty')).toEqual({
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      'border-radius': 'var(--radius-xl)',
      padding: '22px 24px',
    });
    expect(ruleFor(CSS, '.emptyTitle')).toEqual({ font: '500 20px var(--font-serif)' });
    expect(ruleFor(CSS, '.emptyText')).toEqual({
      'font-size': '14px',
      color: 'var(--ink-2)',
      'margin-top': '4px',
    });
  });
});
