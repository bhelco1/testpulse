// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { layerSegments } from '../../lib/design/layers';
import type { DeclaredSuite } from '../../lib/projects/schema';
import { ruleFor } from '../testing/stylesheet';
import { Pyramid } from './Pyramid';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'Pyramid.module.css');

const ROUTESERVE = layerSegments({ unit: 608, component: 165, integration: 3, api: 269 });
const ROUTESERVE_DECLARED: DeclaredSuite[] = [
  { name: 'Maestro E2E (iOS)', layer: 'e2e', count: 13, status: 'authored_not_executed' },
];

const rowsOf = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLElement>('[data-part="row"]'),
];
const barOf = (row: HTMLElement) => row.querySelector<HTMLElement>('[data-part="bar"]');

describe('Pyramid', () => {
  it('heads the figure with the executed total and the note', () => {
    const { container } = render(
      <Pyramid
        layers={ROUTESERVE}
        declared={ROUTESERVE_DECLARED}
        total={1045}
        note="Approximate layer split"
      />,
    );
    const head = container.querySelector<HTMLElement>('[data-part="head"]');

    expect(container.firstElementChild?.tagName).toBe('FIGURE');
    expect(head?.textContent).toBe('1,045tests executed in the latest runApproximate layer split');
  });

  it('orders rows by spec section 8 with unit at the base, not by size', () => {
    const { container } = render(<Pyramid layers={ROUTESERVE} declared={[]} total={1045} />);
    expect(rowsOf(container).map((row) => row.textContent)).toEqual([
      'API26926%',
      'Integration31%',
      'Component16516%',
      'Unit60858%',
    ]);
  });

  it('sizes each bar against the largest layer, in its fixed layer tone', () => {
    const { container } = render(<Pyramid layers={ROUTESERVE} declared={[]} total={1045} />);
    const bars = rowsOf(container).map(barOf);

    expect(bars.map((bar) => [bar?.style.width, bar?.dataset.tone])).toEqual([
      [`${(269 / 608) * 100}%`, '4'],
      [`${(3 / 608) * 100}%`, '3'],
      [`${(165 / 608) * 100}%`, '2'],
      ['100%', '1'],
    ]);
    expect(bars.every((bar) => bar?.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  it('shows declared suites as a text row above the bars, with no bar and no count', () => {
    const { container } = render(
      <Pyramid layers={ROUTESERVE} declared={ROUTESERVE_DECLARED} total={1045} />,
    );
    const [declared] = rowsOf(container);

    expect(declared?.dataset.declared).toBe('true');
    expect(declared?.textContent).toBe('E2E13 flows declared · not counted');
    expect(barOf(declared as HTMLElement)).toBeNull();
  });

  it('adds declared suites of one layer into a single row, in tests for non-E2E layers', () => {
    const { container } = render(
      <Pyramid
        layers={layerSegments({ unit: 103, integration: 29, visual: 10 })}
        declared={[
          { name: 'Contract', layer: 'integration', count: 6, status: 'authored_not_executed' },
          {
            name: 'Maestro E2E (Android)',
            layer: 'e2e',
            count: 7,
            status: 'runs_in_ci_not_reported',
          },
          { name: 'Maestro E2E (iOS)', layer: 'e2e', count: 5, status: 'runs_in_ci_not_reported' },
        ]}
        total={142}
      />,
    );
    expect(rowsOf(container).map((row) => row.textContent)).toEqual([
      'E2E12 flows declared · not counted',
      'Integration6 tests declared · not counted',
      'Visual107%',
      'Integration2920%',
      'Unit10373%',
    ]);
  });

  it('never rounds a present layer down to 0%', () => {
    const { container } = render(<Pyramid layers={ROUTESERVE} declared={[]} total={1045} />);
    expect(rowsOf(container)[1]?.querySelector('[data-part="pct"]')?.textContent).toBe('1%');
  });

  it('with a single layer draws one full-width bar', () => {
    const { container } = render(
      <Pyramid layers={layerSegments({ unit: 214 })} declared={[]} total={214} />,
    );
    const rows = rowsOf(container);

    expect(rows.map((row) => row.textContent)).toEqual(['Unit214100%']);
    expect(barOf(rows[0] as HTMLElement)?.style.width).toBe('100%');
  });

  it('with no layers says no tests have run, with no header, bars or declared rows', () => {
    const { container } = render(<Pyramid layers={[]} declared={ROUTESERVE_DECLARED} total={0} />);

    expect(container.querySelector('[data-part="head"]')).toBeNull();
    expect(rowsOf(container)).toEqual([]);
    expect(container.querySelector('[data-part="none"]')?.textContent).toBe(
      'No tests executed yet.',
    );
  });

  it('is a surface card with 30px bars of radius 4, at least 6px wide', () => {
    expect(ruleFor(CSS, '.pyramid')).toEqual({
      margin: '0px',
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      'border-radius': 'var(--radius-xl)',
      padding: 'var(--space-6) 26px',
      'box-shadow': 'var(--shadow-card)',
      'box-sizing': 'border-box',
    });
    expect(ruleFor(CSS, '.bar')).toEqual({
      'min-width': '6px',
      height: '30px',
      'border-radius': 'var(--radius-xs)',
    });
    expect(ruleFor(CSS, '.barCell')).toEqual({ display: 'flex', 'justify-content': 'center' });
    for (const tone of [1, 2, 3, 4]) {
      expect(ruleFor(CSS, `.tone${tone}`)).toEqual({ background: `var(--layer-${tone})` });
    }
  });

  it('lays rows on a 110 / fluid / 120 grid, 80 / fluid / 88 on a phone', () => {
    expect(ruleFor(CSS, '.row')).toEqual({
      display: 'grid',
      'grid-template-columns': '110px minmax(0, 1fr) 120px',
      'align-items': 'center',
      gap: 'var(--space-4)',
      'font-size': '14px',
    });
    expect(ruleFor(CSS, '.row', '(max-width: 640px)')).toEqual({
      'grid-template-columns': '80px minmax(0, 1fr) 88px',
    });
    expect(ruleFor(CSS, '.rows')).toMatchObject({
      display: 'flex',
      'flex-direction': 'column',
      gap: 'var(--space-2)',
    });
  });

  it('sets the labels, counts and declared text in the design sizes and inks', () => {
    expect(ruleFor(CSS, '.label')).toEqual({ 'text-align': 'right', color: 'var(--ink-2)' });
    expect(ruleFor(CSS, '.declared .label')).toEqual({ color: 'var(--ink-3)' });
    expect(ruleFor(CSS, '.declaredText')).toEqual({
      'text-align': 'center',
      'font-size': '13px',
      color: 'var(--ink-3)',
    });
    expect(ruleFor(CSS, '.count')).toEqual({
      display: 'flex',
      'align-items': 'baseline',
      gap: 'var(--space-2)',
      'white-space': 'nowrap',
    });
    expect(ruleFor(CSS, '.figure')).toEqual({ 'font-weight': '600' });
    expect(ruleFor(CSS, '.pct')).toEqual({ 'font-size': '13px', color: 'var(--ink-3)' });
    expect(ruleFor(CSS, '.none')).toEqual({
      margin: '0px',
      'font-size': '15px',
      color: 'var(--ink-2)',
    });
  });

  it('sets the header total in --text-count beside its 15px caption', () => {
    expect(ruleFor(CSS, '.head')).toEqual({
      display: 'flex',
      'flex-wrap': 'wrap',
      'justify-content': 'space-between',
      'align-items': 'baseline',
      gap: 'var(--space-2) var(--space-4)',
      'margin-bottom': 'var(--space-6)',
    });
    expect(ruleFor(CSS, '.total')).toEqual({ font: 'var(--text-count)' });
    expect(ruleFor(CSS, '.caption')).toEqual({ 'font-size': '15px', color: 'var(--ink-2)' });
    expect(ruleFor(CSS, '.note')).toEqual({ 'font-size': '13.5px', color: 'var(--ink-3)' });
  });
});
