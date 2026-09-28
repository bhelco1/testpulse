// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { layerSegments } from '../../lib/design/layers';
import { ruleFor } from '../testing/stylesheet';
import { LayerBar } from './LayerBar';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'LayerBar.module.css');
const OSTOMATE2 = layerSegments({ unit: 103, integration: 29, visual: 10 });

describe('LayerBar', () => {
  it('draws one segment per layer, sized by count, in its fixed layer tone', () => {
    const { container } = render(<LayerBar layers={OSTOMATE2} />);
    const bar = container.querySelector<HTMLElement>('[data-part="bar"]');
    const segments = [...(bar?.children ?? [])] as HTMLElement[];

    expect(bar?.getAttribute('aria-hidden')).toBe('true');
    expect(segments.map((s) => [s.style.flexGrow, s.dataset.tone])).toEqual([
      ['103', '1'],
      ['29', '3'],
      ['10', '2'],
    ]);
  });

  it('labels every layer with its count in words, in bar order', () => {
    const { getAllByRole } = render(<LayerBar layers={OSTOMATE2} />);
    expect(getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Unit103',
      'Integration29',
      'Visual10',
    ]);
  });

  it('groups thousands in counts', () => {
    const { getAllByRole } = render(<LayerBar layers={layerSegments({ unit: 1048 })} />);
    expect(getAllByRole('listitem')[0]?.textContent).toBe('Unit1,048');
  });

  it('is 8px tall with the mandatory 3px gap between segments, each at least 3px', () => {
    expect(ruleFor(CSS, '.bar')).toMatchObject({
      height: '8px',
      gap: '3px',
      'border-radius': 'var(--radius-pill)',
      overflow: 'hidden',
    });
    expect(ruleFor(CSS, '.segment')).toEqual({ 'min-width': '3px' });
    expect(ruleFor(CSS, '.labels')).toMatchObject({
      gap: '6px var(--space-5)',
      'font-size': '13px',
      color: 'var(--ink-2)',
    });
  });

  it('kiosk: a 14px bar, still with 3px gaps, and 24px labels with the count in ink', () => {
    const { container, getAllByRole } = render(<LayerBar layers={OSTOMATE2} variant="kiosk" />);

    expect((container.firstElementChild as HTMLElement).dataset.variant).toBe('kiosk');
    expect(getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Unit103',
      'Integration29',
      'Visual10',
    ]);
    expect(ruleFor(CSS, '.kiosk .bar')).toEqual({ height: '14px', 'margin-bottom': '12px' });
    expect(ruleFor(CSS, '.kiosk .labels')).toEqual({
      gap: '6px var(--space-6)',
      'font-size': '24px',
    });
    expect(ruleFor(CSS, '.kiosk .label')).toEqual({ gap: 'var(--space-2)' });
    expect(ruleFor(CSS, '.kiosk .count')).toEqual({ color: 'var(--ink)' });
  });
});
