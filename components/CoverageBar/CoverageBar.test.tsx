// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ruleFor } from '../testing/stylesheet';
import { CoverageBar } from './CoverageBar';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'CoverageBar.module.css');

function parts(container: HTMLElement) {
  const row = container.firstElementChild as HTMLElement;
  const q = (part: string) => row.querySelector<HTMLElement>(`[data-part="${part}"]`);
  return { row, track: q('track'), fill: q('fill'), floor: q('floor'), value: q('value') };
}

describe('CoverageBar', () => {
  it('above the floor: the figure, the floor, and the floor tick on a 0 to 100 scale', () => {
    const { container, getByText } = render(<CoverageBar module="shared" pct={92} floor={91} />);
    const { row, track, fill, floor, value } = parts(container);

    expect(row.dataset.state).toBe('above');
    expect(getByText('shared')).toBeTruthy();
    expect(value?.textContent).toBe('92.0%floor 91%');
    expect(track?.getAttribute('aria-hidden')).toBe('true');
    expect(fill?.style.width).toBe('92%');
    expect(floor?.style.left).toBe('91%');
    expect(value?.querySelector('svg')).toBeNull();
  });

  it('at the floor counts as meeting it', () => {
    const { container } = render(<CoverageBar module="composeApp" pct={93} floor={93} />);
    const { row, value } = parts(container);
    expect(row.dataset.state).toBe('at');
    expect(value?.textContent).toBe('93.0%floor 93%');
    expect(value?.querySelector('svg')).toBeNull();
  });

  it('below the floor: says so in words beside a down arrow', () => {
    const { container } = render(<CoverageBar module="composeApp" pct={92.6} floor={93} />);
    const { row, value, fill } = parts(container);

    expect(row.dataset.state).toBe('below');
    expect(value?.textContent).toBe('92.6%below floor 93%');
    const arrow = value?.querySelector('svg');
    expect(arrow?.getAttribute('aria-hidden')).toBe('true');
    expect(arrow?.querySelector('path')?.getAttribute('d')).toBe('M12 5v14M6 13l6 6 6-6');
    expect(fill?.style.width).toBe('92.6%');
  });

  it('writes full coverage without a decimal, as the design does', () => {
    const { container } = render(<CoverageBar module="shared" pct={100} floor={80} />);
    expect(parts(container).value?.textContent).toBe('100%floor 80%');
  });

  // Decision 2026-09-29 (spec section 19): percentages round down to the tenth, as pass rates do.
  describe('rounds the figure down to the tenth', () => {
    it('79.96% beside an 80% floor reads 79.9% and stays below the floor', () => {
      const { container } = render(<CoverageBar module="shared" pct={79.96} floor={80} />);
      const { row, value } = parts(container);
      expect(value?.textContent).toBe('79.9%below floor 80%');
      expect(row.dataset.state).toBe('below');
      expect(value?.querySelector('svg')).not.toBeNull();
    });

    it('the kiosk row rounds down the same way', () => {
      const { container } = render(
        <CoverageBar module="shared" pct={79.96} floor={80} variant="kiosk" />,
      );
      expect(parts(container).value?.textContent).toBe('79.9%');
    });

    it('80.0% exactly meets an 80% floor', () => {
      const { container } = render(<CoverageBar module="shared" pct={80.0} floor={80} />);
      const { row, value } = parts(container);
      expect(value?.textContent).toBe('80.0%floor 80%');
      expect(row.dataset.state).toBe('at');
    });

    it('94.35% and 94.39% both read 94.3%', () => {
      const { container } = render(<CoverageBar module="composeApp" pct={94.35} floor={93} />);
      expect(parts(container).value?.textContent).toBe('94.3%floor 93%');
      cleanup();
      const { container: high } = render(
        <CoverageBar module="composeApp" pct={94.39} floor={93} />,
      );
      expect(parts(high).value?.textContent).toBe('94.3%floor 93%');
    });

    it('99.96% reads 99.9%, never 100%', () => {
      const { container } = render(<CoverageBar module="shared" pct={99.96} floor={80} />);
      expect(parts(container).value?.textContent).toBe('99.9%floor 80%');
    });

    it('0% reads 0.0%', () => {
      const { container } = render(<CoverageBar module="shared" pct={0} floor={80} />);
      const { row, value } = parts(container);
      expect(value?.textContent).toBe('0.0%below floor 80%');
      expect(row.dataset.state).toBe('below');
    });

    // Section 11: below floor is strictly under the floor, judged on the stored value. 80.04%
    // displays as 80.0% like an exact 80%, but it is over the floor, not at it.
    it('judges the floor on the raw value, not the displayed one', () => {
      const { container } = render(<CoverageBar module="shared" pct={80.04} floor={80} />);
      const { row, value } = parts(container);
      expect(value?.textContent).toBe('80.0%floor 80%');
      expect(row.dataset.state).toBe('above');
    });
  });

  it('keeps the fill on the track for out-of-range input', () => {
    const { container } = render(<CoverageBar module="shared" pct={104} floor={80} />);
    expect(parts(container).fill?.style.width).toBe('100%');
    cleanup();
    const { container: low } = render(<CoverageBar module="shared" pct={-3} floor={80} />);
    expect(parts(low).fill?.style.width).toBe('0%');
  });

  it('lays the row out on a 128px label column with the stored module key in mono', () => {
    expect(ruleFor(CSS, '.row')).toMatchObject({
      'grid-template-columns': '128px minmax(40px, 1fr) auto',
      'column-gap': '14px',
      'font-size': '14px',
    });
    expect(ruleFor(CSS, '.module')).toEqual({
      'min-width': '0px',
      font: '13px var(--font-mono)',
      color: 'var(--ink-2)',
      'white-space': 'nowrap',
      overflow: 'hidden',
      'text-overflow': 'ellipsis',
    });
  });

  it('keeps a long module key on one line and puts the full key in its title (v4 item 34)', () => {
    const key = 'packages/shared/src/very/long/module/path';
    const { getByText } = render(<CoverageBar module={key} pct={92} floor={91} />);
    expect(getByText(key).getAttribute('title')).toBe(key);
  });

  it('keeps the fill ink below the floor and turns the arrow, figure and floor words amber', () => {
    expect(ruleFor(CSS, '.fill')).toMatchObject({ background: 'var(--ink)' });
    expect(ruleFor(CSS, '.floor')).toMatchObject({
      top: '-4px',
      width: '2px',
      height: '14px',
      background: 'var(--attn)',
    });
    expect(ruleFor(CSS, '.below .figure, .below .floorLabel, .arrow')).toEqual({
      color: 'var(--attn)',
    });
  });

  describe('kiosk variant', () => {
    it('shows the module and the figure only, with no floor words', () => {
      const { container } = render(
        <CoverageBar module="shared" pct={92} floor={91} variant="kiosk" />,
      );
      const { row, value, floor } = parts(container);

      expect(row.dataset.variant).toBe('kiosk');
      expect(value?.textContent).toBe('92.0%');
      expect(floor?.style.left).toBe('91%');
    });

    it('below floor: a 22px down arrow and the figure in --attn, still no floor words (v4 item 25h)', () => {
      const { container, getByText } = render(
        <CoverageBar module="composeApp" pct={92.6} floor={93} variant="kiosk" />,
      );
      const { row, value } = parts(container);

      expect(row.dataset.state).toBe('below');
      expect(row.className).toContain('below');
      expect(value?.textContent).toBe('92.6%');
      const arrow = value?.querySelector('svg');
      expect(arrow?.getAttribute('width')).toBe('22');
      expect(arrow?.getAttribute('stroke-width')).toBe('2.8');
      expect(arrow?.querySelector('path')?.getAttribute('d')).toBe('M12 5v14M6 13l6 6 6-6');
      expect(getByText('composeApp').getAttribute('title')).toBe('composeApp');
    });

    it('sets the kiosk row at 220 / fluid / 130 with a 10px track and a 3 by 22 floor tick', () => {
      expect(ruleFor(CSS, '.kiosk')).toEqual({
        'grid-template-columns': '220px minmax(40px, 1fr) 130px',
        'column-gap': '18px',
        'font-size': '24px',
      });
      expect(ruleFor(CSS, '.kiosk .module')).toEqual({ 'font-size': '22px' });
      expect(ruleFor(CSS, '.kiosk .track')).toEqual({ height: '10px' });
      expect(ruleFor(CSS, '.kiosk .floor')).toEqual({
        top: '-6px',
        width: '3px',
        height: '22px',
      });
      expect(ruleFor(CSS, '.kiosk .value')).toEqual({
        'justify-content': 'flex-end',
        gap: 'var(--space-2)',
      });
    });
  });
});
