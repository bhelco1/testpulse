// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ruleFor } from '../testing/stylesheet';
import { RunReports } from './RunReports';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'RunReports.module.css');

describe('RunReports', () => {
  it('tables the latest run’s reports by key with their test counts', () => {
    const { getByRole } = render(
      <RunReports
        reports={[
          { key: 'android/shared/jvm', total: '82' },
          { key: 'ios/composeApp/ios-sim', total: '50' },
        ]}
      />,
    );

    expect(getByRole('heading', { level: 3 }).textContent).toBe('Reports per run');
    const table = getByRole('table', { name: 'Reports per run' });
    const headers = within(table).getAllByRole('columnheader');
    expect(headers.map((cell) => cell.textContent)).toEqual(['Job / module / platform', 'Tests']);
    const rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((cell) => cell.textContent),
      );
    expect(rows).toEqual([
      ['android/shared/jvm', '82'],
      ['ios/composeApp/ios-sim', '50'],
    ]);
  });

  it('draws nothing before the first run', () => {
    const { container } = render(<RunReports reports={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('draws the inset table in mono with uppercased headers', () => {
    expect(ruleFor(CSS, '.card')).toEqual({
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      'border-radius': 'var(--radius-xl)',
      padding: 'var(--space-6) 26px',
      'box-shadow': 'var(--shadow-card)',
    });
    expect(ruleFor(CSS, '.title')).toEqual({
      margin: '0px 0px 18px',
      font: '500 22px var(--font-serif)',
    });
    expect(ruleFor(CSS, '.table')).toMatchObject({
      background: 'var(--inset)',
      border: '1px solid var(--line)',
      'border-radius': 'var(--radius-md)',
    });
    expect(ruleFor(CSS, '.head')).toMatchObject({
      font: '600 12px var(--font-mono)',
      'letter-spacing': '0.04em',
      'text-transform': 'uppercase',
      color: 'var(--ink-3)',
    });
    expect(ruleFor(CSS, '.row')).toMatchObject({
      'grid-template-columns': 'minmax(0, 1fr) auto',
      gap: 'var(--space-3)',
      padding: '10px 14px',
      'border-bottom': '1px solid var(--line)',
    });
    expect(ruleFor(CSS, '.key')).toMatchObject({
      color: 'var(--ink-2)',
      'overflow-wrap': 'anywhere',
    });
  });
});
