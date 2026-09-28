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
      font: '13px var(--font-mono)',
      color: 'var(--ink-2)',
      overflow: 'hidden',
      'text-overflow': 'ellipsis',
    });
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
});
