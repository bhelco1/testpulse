// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FeedRun, KioskFeedRun } from '../RunFeedRow/RunFeedRow';
import { ruleFor } from '../testing/stylesheet';
import { RunFeed, type FeedEntry } from './RunFeed';
import styles from './RunFeed.module.css';
import { timeLabel } from '../testing/time';

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
    when: timeLabel('4 min ago'),
    total: 142,
    duration: '27 s',
    ...extra,
  }) as FeedEntry;

const RUNS: FeedEntry[] = [
  { ...run('3'), isNew: true },
  run('2', {
    project: 'RouteServe',
    visibility: 'private',
    when: timeLabel('2 h ago'),
  } as Partial<FeedRun>),
  run('1', { when: timeLabel('yesterday') }),
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

  it('disconnected: the ring and "Offline. Showing runs as of {HH:MM} UTC; reconnecting" in --ink-2', () => {
    const { container } = render(
      <RunFeed
        state="ready"
        list="recent"
        runs={RUNS}
        connected={false}
        asOf={timeLabel('10:42')}
      />,
    );
    const note = container.querySelector<HTMLElement>('[data-part="live-note"]');

    expect(note?.textContent).toBe('Offline. Showing runs as of 10:42 UTC; reconnecting');
    // Every time a page prints is a <time> with its instant and full date (spec 11, "Project
    // page view"); the HH:MM is UTC and says so (design v8 item 36).
    const time = note?.querySelector('time');
    expect(time?.textContent).toBe('10:42 UTC');
    expect(time?.getAttribute('datetime')).toBe('2026-10-05T11:56:00.000Z');
    expect(time?.getAttribute('title')).toBe('5 Oct 2026, 11:56 UTC');
    expect(note?.querySelector<HTMLElement>('[data-part="dot"]')?.dataset.state).toBe('off');
    expect(has(note, 'offline')).toBe(true);
    // No banner: the rows stay, under the inline note.
    expect(container.querySelectorAll('a')).toHaveLength(3);
  });

  // While the channel is connecting, and without JavaScript, neither note would be true.
  it('has no live note when no connection state is given', () => {
    const { container, getByRole } = render(<RunFeed state="ready" list="recent" runs={RUNS} />);

    expect(container.querySelector('[data-part="live-note"]')).toBeNull();
    expect(getByRole('heading', { level: 2 }).textContent).toBe('Recent runs');
    expect(within(getByRole('log')).getAllByRole('link')).toHaveLength(3);
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
      'Runs appear here as each project’s CI reports.',
    );
    expect(queryByRole('log')).toBeNull();
  });

  it('error: ErrorState inline with the feed copy, and "Try again" retries', () => {
    const onRetry = vi.fn();
    const { getByRole } = render(<RunFeed state="error" onRetry={onRetry} />);
    const alert = getByRole('alert');

    expect(alert.dataset.variant).toBe('inline');
    expect(alert.textContent).toContain('Runs couldn’t be loaded');
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
        project="Ostomate2"
        runs={RUNS}
        branches="default"
        onBranchesChange={onBranchesChange}
        connected
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
        project="Ostomate2"
        runs={RUNS}
        branches="all"
        onBranchesChange={() => {}}
        connected
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

  // v4 item 36: the header row holds the heading and the filter; the note gets its own line.
  it('puts the live note on its own line under the header row, not in it', () => {
    const { container, getByRole } = renderProject();
    const note = container.querySelector<HTMLElement>('[data-part="live-note"]');

    expect(note?.textContent).toBe('Updates as reports arrive');
    expect(note?.querySelector<HTMLElement>('[data-part="dot"]')?.dataset.state).toBe('on');
    expect(has(note, 'projectNote')).toBe(true);
    const header = getByRole('heading', { level: 2 }).parentElement;
    expect(header?.contains(note ?? null)).toBe(false);
    expect(header?.nextElementSibling).toBe(note);
  });

  it('offline: the same line reads "Offline. Showing runs as of {HH:MM} UTC; reconnecting"', () => {
    const { container } = render(
      <RunFeed
        state="ready"
        list="project"
        project="Ostomate2"
        runs={RUNS}
        branches="default"
        onBranchesChange={() => {}}
        connected={false}
        asOf={timeLabel('10:42')}
      />,
    );
    const note = container.querySelector<HTMLElement>('[data-part="live-note"]');

    expect(note?.textContent).toBe('Offline. Showing runs as of 10:42 UTC; reconnecting');
    expect(note?.querySelector<HTMLElement>('[data-part="dot"]')?.dataset.state).toBe('off');
    expect(has(note, 'offline')).toBe(true);
  });

  // While the channel is connecting, and without JavaScript, neither note would be true.
  it('has no live note when no connection state is given, ready or empty', () => {
    const list = {
      list: 'project',
      project: 'Ostomate2',
      branches: 'default',
      onBranchesChange: () => {},
    } as const;
    const { container, getByRole, rerender } = render(
      <RunFeed state="ready" runs={RUNS} {...list} />,
    );

    expect(container.querySelector('[data-part="live-note"]')).toBeNull();
    expect(getByRole('heading', { level: 2 }).textContent).toBe('Runs');
    expect(getByRole('radiogroup', { name: 'Branches' })).toBeTruthy();

    rerender(<RunFeed state="empty" {...list} />);
    expect(container.querySelector('[data-part="live-note"]')).toBeNull();
    expect(container.textContent).toContain('Runs appear here when Ostomate2’s CI reports.');
  });

  // v4 item 37: the project run list keeps its header, filter and note when there are no runs.
  it('empty: header, filter and note stay; "No runs yet" names the project', () => {
    const { container, getByRole, queryByRole } = render(
      <RunFeed
        state="empty"
        list="project"
        project="Ostomate2"
        branches="default"
        onBranchesChange={() => {}}
        connected
      />,
    );

    expect(getByRole('heading', { level: 2 }).textContent).toBe('Runs');
    expect(getByRole('radiogroup', { name: 'Branches' })).toBeTruthy();
    expect(container.querySelector('[data-part="live-note"]')?.textContent).toBe(
      'Updates as reports arrive',
    );
    const empty = container.querySelector<HTMLElement>('[data-part="project-empty"]');
    expect(empty?.querySelector('[data-part="empty-title"]')?.textContent).toBe('No runs yet');
    expect(empty?.querySelector('[data-part="empty-text"]')?.textContent).toBe(
      'Runs appear here when Ostomate2’s CI reports.',
    );
    expect(queryByRole('log')).toBeNull();
    expect(queryByRole('button', { name: 'Load 20 more' })).toBeNull();
  });
});

const KIOSK_RUNS: KioskFeedRun[] = [
  {
    id: '3',
    status: 'passed',
    visibility: 'public',
    project: 'Ostomate2',
    branch: 'main',
    when: timeLabel('4 min ago'),
    total: 142,
  },
  {
    id: '2',
    status: 'passed',
    visibility: 'private',
    project: 'RouteServe',
    branch: 'main',
    when: timeLabel('2 h ago'),
    total: 1048,
  },
  {
    id: '1',
    status: 'failed',
    visibility: 'public',
    project: 'Ostomate2',
    branch: 'fix-today-count',
    when: timeLabel('yesterday'),
    failed: 1,
  },
];

describe('RunFeed (kiosk)', () => {
  it('heads three tiles with "Recent runs" and "Updates as reports arrive"', () => {
    const { getByRole, container } = render(
      <RunFeed variant="kiosk" state="ready" runs={KIOSK_RUNS} connected />,
    );

    expect(getByRole('heading', { level: 2 }).textContent).toBe('Recent runs');
    expect(container.querySelector('[data-part="kiosk-note"]')?.textContent).toBe(
      'Updates as reports arrive',
    );
    const log = getByRole('log');
    expect(log.querySelectorAll('[data-variant="kiosk"]')).toHaveLength(3);
    expect(container.querySelector('a, button')).toBeNull();
  });

  it('passes private and empty runs to their tiles (v4 item 41)', () => {
    const { container } = render(
      <RunFeed
        variant="kiosk"
        state="ready"
        runs={[
          ...KIOSK_RUNS,
          {
            id: '0',
            status: 'empty',
            visibility: 'public',
            project: 'Ostomate2',
            branch: 'main',
            when: timeLabel('2 days ago'),
          },
        ]}
        connected
      />,
    );
    expect(container.querySelector('[data-part="private"]')?.getAttribute('aria-label')).toBe(
      'Private repository',
    );
    expect([...container.querySelectorAll('[data-part="count"]')].at(-1)?.textContent).toBe(
      '0 tests',
    );
  });

  it('connected: the note has no dot', () => {
    const { container } = render(
      <RunFeed variant="kiosk" state="ready" runs={KIOSK_RUNS} connected />,
    );
    const note = container.querySelector<HTMLElement>('[data-part="kiosk-note"]');
    expect(note?.querySelector('[data-part="kiosk-ring"]')).toBeNull();
    expect(has(note, 'kioskOffline')).toBe(false);
  });

  it('disconnected: a 14px ring and "Offline. As of {HH:MM}" in --ink-2 (v4 item 41)', () => {
    const { container } = render(
      <RunFeed
        variant="kiosk"
        state="ready"
        runs={KIOSK_RUNS}
        connected={false}
        asOf={timeLabel('10:42')}
      />,
    );
    const note = container.querySelector<HTMLElement>('[data-part="kiosk-note"]');

    expect(note?.textContent).toBe('Offline. As of 10:42');
    const ring = note?.querySelector<HTMLElement>('[data-part="kiosk-ring"]');
    expect(ring?.getAttribute('aria-hidden')).toBe('true');
    expect(has(note, 'kioskOffline')).toBe(true);
    expect(ruleFor(CSS, '.kioskNote.kioskOffline')).toEqual({
      display: 'flex',
      'align-items': 'center',
      gap: '10px',
      color: 'var(--ink-2)',
    });
    expect(ruleFor(CSS, '.kioskRing')).toEqual({
      width: '14px',
      height: '14px',
      'border-radius': '50%',
      border: '2px solid var(--ink-3)',
      'box-sizing': 'border-box',
    });
  });

  it('loading: 3 skeleton tiles named "Loading runs", no log (v4 items 41, 51)', () => {
    const { container, getByLabelText, queryByRole } = render(
      <RunFeed variant="kiosk" state="loading" connected />,
    );
    const busy = getByLabelText('Loading runs');

    expect(busy.getAttribute('aria-busy')).toBe('true');
    const tiles = busy.querySelectorAll<HTMLElement>('[data-part="skeleton-tile"]');
    expect(tiles).toHaveLength(3);
    const blocks = [...(tiles[0]?.querySelectorAll<HTMLElement>('[data-part="skeleton"]') ?? [])];
    expect(blocks.map((block) => [block.style.width, block.style.height])).toEqual([
      ['130px', '24px'],
      ['90px', '22px'],
      ['75%', '24px'],
    ]);
    expect(queryByRole('log')).toBeNull();
    expect(container.querySelector('[data-part="kiosk-note"]')).not.toBeNull();
  });

  it('empty: one tile, "No runs yet" and the landing reason (v4 item 41)', () => {
    const { container, queryByRole } = render(<RunFeed variant="kiosk" state="empty" connected />);

    const tile = container.querySelector<HTMLElement>('[data-part="kiosk-empty"]');
    expect(tile?.querySelector('[data-part="empty-title"]')?.textContent).toBe('No runs yet');
    expect(tile?.querySelector('[data-part="empty-text"]')?.textContent).toBe(
      'Runs appear here as each project’s CI reports.',
    );
    expect(has(tile, 'kioskTile')).toBe(true);
    expect(queryByRole('log')).toBeNull();
  });

  // Design v5 item 11: empty and error are one tile across all three run columns of the grid.
  it('empty and error: the tile spans the three run columns of the kiosk grid', () => {
    for (const state of ['empty', 'error'] as const) {
      const { container, unmount } = render(<RunFeed variant="kiosk" state={state} connected />);
      const tile = container.querySelector<HTMLElement>(`[data-part="kiosk-${state}"]`);
      expect(has(tile?.parentElement, 'kiosk')).toBe(true);
      expect(has(tile, 'kioskSpan')).toBe(true);
      unmount();
    }
    expect(ruleFor(CSS, '.kioskSpan')).toEqual({ 'grid-column': '2 / -1' });
  });

  it('error: the tile is a polite status, as nobody acts on a wall display', () => {
    const { container, getByRole } = render(<RunFeed variant="kiosk" state="error" connected />);
    expect(getByRole('status')).toBe(container.querySelector('[data-part="kiosk-error"]'));
  });

  it('shows the heading and the connection note in every state', () => {
    const states = [
      { state: 'ready', runs: KIOSK_RUNS },
      { state: 'loading' },
      { state: 'empty' },
      { state: 'error' },
    ] as const;
    for (const feed of states) {
      for (const connection of [
        { connected: true } as const,
        { connected: false, asOf: timeLabel('10:42') } as const,
      ]) {
        const { container, getByRole, unmount } = render(
          <RunFeed variant="kiosk" {...feed} {...connection} />,
        );
        expect(getByRole('heading', { level: 2 }).textContent).toBe('Recent runs');
        expect(container.querySelector('[data-part="kiosk-note"]')?.textContent).toBe(
          connection.connected ? 'Updates as reports arrive' : 'Offline. As of 10:42',
        );
        unmount();
      }
    }
  });

  it('error: one tile with the error icon and "Retrying every minute.", no button, no rows', () => {
    const { container, queryByRole } = render(<RunFeed variant="kiosk" state="error" connected />);

    const tile = container.querySelector<HTMLElement>('[data-part="kiosk-error"]');
    expect(tile?.querySelector('[data-part="error-title"]')?.textContent).toBe(
      'Runs couldn’t be loaded',
    );
    expect(tile?.querySelector('[data-part="error-text"]')?.textContent).toBe(
      'Retrying every minute.',
    );
    const icon = tile?.querySelector('svg');
    expect(icon?.getAttribute('width')).toBe('24');
    expect(icon?.getAttribute('stroke-width')).toBe('2.6');
    expect(icon?.querySelector('path')?.getAttribute('d')).toBe('M12 7v6M12 17h.01');
    expect(has(tile, 'kioskTile')).toBe(true);
    expect(container.querySelector('button, a')).toBeNull();
    expect(container.querySelector('[data-variant="kiosk"]')).toBeNull();
    expect(queryByRole('log')).toBeNull();
  });

  it('sets the state tiles: padding 18 24, --radius-lg, --surface, 1px --line', () => {
    expect(ruleFor(CSS, '.kioskTile')).toEqual({
      display: 'flex',
      'flex-direction': 'column',
      'justify-content': 'center',
      gap: '6px',
      padding: '18px 24px',
      'border-radius': 'var(--radius-lg)',
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      'min-width': '0px',
    });
    expect(ruleFor(CSS, '.kioskSkeleton')).toEqual({
      display: 'flex',
      'flex-direction': 'column',
      gap: '12px',
      padding: '18px 24px',
      'border-radius': 'var(--radius-lg)',
      background: 'var(--surface)',
      border: '1px solid var(--line)',
    });
    expect(ruleFor(CSS, '.kioskSkeletonTop')).toEqual({
      display: 'flex',
      'justify-content': 'space-between',
    });
    expect(ruleFor(CSS, '.kioskStateTitle')).toEqual({ font: '500 28px var(--font-serif)' });
    expect(ruleFor(CSS, '.kioskErrorTitle')).toEqual({
      display: 'flex',
      'align-items': 'center',
      gap: '10px',
    });
    expect(ruleFor(CSS, '.kioskErrorIcon')).toEqual({ flex: '0 0 auto', color: 'var(--fail)' });
    expect(ruleFor(CSS, '.kioskStateText')).toEqual({
      'font-size': '22px',
      color: 'var(--ink-3)',
    });
  });

  it('lays out a 200px header column beside three equal tiles, gap 16', () => {
    expect(ruleFor(CSS, '.kiosk')).toEqual({
      display: 'grid',
      'grid-template-columns': '200px repeat(3, minmax(0, 1fr))',
      gap: '16px',
      'align-items': 'stretch',
    });
    expect(ruleFor(CSS, '.kioskLog')).toEqual({
      'grid-column': '2 / -1',
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

  it('sets the project header: centred, gap 10 12, padding 12 12 4 16', () => {
    expect(ruleFor(CSS, '.header.projectHeader')).toEqual({
      'align-items': 'center',
      gap: '10px 12px',
      padding: '12px 12px 4px 16px',
    });
  });

  it('sets the project live note line: padding 0 16 10, left-aligned', () => {
    expect(ruleFor(CSS, '.note.projectNote')).toEqual({ padding: '0px 16px 10px' });
  });

  it('sets the project empty body: padding 14 16 16', () => {
    expect(ruleFor(CSS, '.projectEmpty')).toEqual({ padding: '14px 16px 16px' });
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
