// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { HistoryTile } from '../../lib/pages/test-history';
import { ruleFor } from '../testing/stylesheet';
import { timeLabel } from '../testing/time';
import { HistoryTiles } from './HistoryTiles';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'HistoryTiles.module.css');

const TILES: readonly HistoryTile[] = [
  { label: 'Runs', value: '40', sub: ['since ', timeLabel('22 Aug')], tone: 'ink' },
  { label: 'Failed', value: '1', sub: ['1 run · ios-sim'], tone: 'fail' },
  { label: 'Flaky', value: '2', sub: ['commits in 30 days · jvm'], tone: 'attn' },
  { label: 'Median time', value: '0.41 s', sub: ['jvm · ios-sim 0.63 s'], tone: 'ink' },
];

// The test history page's four tiles (design/pages/Test History.dc.html; components.md, Test
// history page, "Tiles"): label, a figure coloured by what it says, and a sub-line.
describe('HistoryTiles', () => {
  it('lists each tile’s label, figure and sub-line, a date in its <time>', () => {
    const { getByRole } = render(<HistoryTiles tiles={TILES} />);
    const items = [...getByRole('list').querySelectorAll('li')];
    expect(
      items.map((item) =>
        ['label', 'value', 'sub'].map(
          (name) => item.querySelector(`[data-part="${name}"]`)?.textContent,
        ),
      ),
    ).toEqual([
      ['Runs', '40', 'since 22 Aug'],
      ['Failed', '1', '1 run · ios-sim'],
      ['Flaky', '2', 'commits in 30 days · jvm'],
      ['Median time', '0.41 s', 'jvm · ios-sim 0.63 s'],
    ]);
    expect(items[0]?.querySelector('time')?.getAttribute('datetime')).toBe(
      '2026-10-05T11:56:00.000Z',
    );
    expect(items.map((item) => item.getAttribute('data-tone'))).toEqual([
      'ink',
      'fail',
      'attn',
      'ink',
    ]);
  });

  it('draws the grid and tiles as the mock does, the figure in its tone', () => {
    expect(ruleFor(CSS, '.tiles')).toEqual({
      display: 'grid',
      'grid-template-columns': 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))',
      gap: '12px',
      'margin-top': '28px',
      padding: '0px',
      'list-style': 'none',
    });
    expect(ruleFor(CSS, '.tile')).toEqual({
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      'border-radius': 'var(--radius-lg)',
      padding: '18px 20px',
    });
    expect(ruleFor(CSS, '.label')).toEqual({ 'font-size': '14px', color: 'var(--ink-3)' });
    expect(ruleFor(CSS, '.value')).toEqual({
      font: '500 36px/1.1 var(--font-serif)',
      'margin-top': '6px',
      color: 'var(--ink)',
    });
    expect(ruleFor(CSS, ".tile[data-tone='fail'] .value")).toEqual({ color: 'var(--fail)' });
    expect(ruleFor(CSS, ".tile[data-tone='attn'] .value")).toEqual({ color: 'var(--attn)' });
    expect(ruleFor(CSS, '.sub')).toEqual({
      'font-size': '13px',
      color: 'var(--ink-3)',
      'margin-top': '2px',
    });
  });
});
