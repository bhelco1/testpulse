// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ruleFor } from '../testing/stylesheet';
import { CoverageFloors } from './CoverageFloors';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'CoverageFloors.module.css');

describe('CoverageFloors', () => {
  it('heads the rows, explains the floor marker, and draws a CoverageBar per module', () => {
    const { getByRole, container } = render(
      <CoverageFloors
        modules={[
          { module: 'composeApp', pct: 94.3, floor: 93 },
          { module: 'shared', pct: 93.3, floor: 91 },
        ]}
      />,
    );

    expect(getByRole('heading', { level: 3 }).textContent).toBe(
      'Line coverage against enforced floors',
    );
    expect(container.querySelector('p')?.textContent).toBe(
      'The amber tick is the floor CI enforces; a build below it fails. Scale 0 to 100.',
    );
    const rows = [...container.querySelectorAll<HTMLElement>('[data-state]')];
    expect(rows.map((row) => row.textContent)).toEqual([
      'composeApp94.3%floor 93%',
      'shared93.3%floor 91%',
    ]);
  });

  it('draws nothing without modules, which the project page does not design', () => {
    const { container } = render(<CoverageFloors modules={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('sets the card, title, note and row gap as the project page draws them', () => {
    expect(ruleFor(CSS, '.card')).toEqual({
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      'border-radius': 'var(--radius-xl)',
      padding: 'var(--space-6) 26px',
      'box-shadow': 'var(--shadow-card)',
    });
    expect(ruleFor(CSS, '.title')).toEqual({ margin: '0px', font: '500 22px var(--font-serif)' });
    expect(ruleFor(CSS, '.note')).toEqual({
      margin: 'var(--space-1) 0 22px',
      'font-size': '13.5px',
      'line-height': '1.5',
      color: 'var(--ink-3)',
    });
    expect(ruleFor(CSS, '.rows')).toMatchObject({ gap: '14px' });
  });
});
