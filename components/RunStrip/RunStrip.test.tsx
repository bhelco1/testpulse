// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RunsTimelineRun } from '../StatusTimeline/StatusTimeline';
import { ruleFor } from '../testing/stylesheet';
import { timeLabel } from '../testing/time';
import { RunStrip } from './RunStrip';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const CSS = join(import.meta.dirname, 'RunStrip.module.css');

const runs = (statuses: RunsTimelineRun['status'][]): RunsTimelineRun[] =>
  statuses.map((status, i) => ({
    title: 'Push to main',
    branch: 'main',
    sha: `${i}`.padStart(7, '0'),
    when: timeLabel(`${statuses.length - i} days ago`),
    href: `/p/ostomate2/runs/${i}`,
    status,
  }));

// The project page's "Last 40 runs" card (design/pages/Project Page.dc.html, History).
describe('RunStrip', () => {
  it('titles the card, states what it shows, notes the runs and draws the strip', () => {
    // jsdom does no layout: the strip measures a width that fits every cell.
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    const { getByRole, container } = render(
      <RunStrip runs={runs(['passed', 'passed'])} defaultBranch="main" note="All 2 passed." />,
    );

    const card = getByRole('region', { name: 'Last 40 runs' });
    expect(within(card).getByRole('heading', { level: 3 }).textContent).toBe('Last 40 runs');
    expect(container.querySelector('[data-part="scope"]')?.textContent).toBe(
      'Default branch · run status',
    );
    expect(container.querySelector('[data-part="note"]')?.textContent).toBe('All 2 passed.');
    expect(within(card).getByRole('img').getAttribute('aria-label')).toBe(
      'Last 2 runs on main: 2 passed.',
    );
  });

  it('has no note when given none', () => {
    const html = renderToStaticMarkup(
      <RunStrip runs={runs(['passed', 'failed'])} defaultBranch="main" note={null} />,
    );
    expect(html).not.toContain('data-part="note"');
    expect(html).toContain('Last 2 runs on main: 1 passed, 1 failed.');
  });

  it('draws the card and its header as the project page does', () => {
    expect(ruleFor(CSS, '.card')).toEqual({
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      'border-radius': 'var(--radius-xl)',
      padding: '22px var(--space-6)',
      'box-shadow': 'var(--shadow-card)',
    });
    expect(ruleFor(CSS, '.head')).toEqual({
      display: 'flex',
      'justify-content': 'space-between',
      'align-items': 'baseline',
      gap: 'var(--space-3)',
      'flex-wrap': 'wrap',
      'margin-bottom': '14px',
    });
    expect(ruleFor(CSS, '.title')).toEqual({ margin: '0px', font: '500 20px var(--font-serif)' });
    expect(ruleFor(CSS, '.scope')).toEqual({
      margin: '2px 0px 0px',
      'font-size': '13px',
      color: 'var(--ink-3)',
    });
    expect(ruleFor(CSS, '.note')).toEqual({ 'font-size': '14px', color: 'var(--ink-2)' });
  });
});
