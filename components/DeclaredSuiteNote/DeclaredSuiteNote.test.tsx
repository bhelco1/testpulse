// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { DeclaredSuite } from '../../lib/projects/schema';
import { ruleFor } from '../testing/stylesheet';
import { DeclaredSuiteNote } from './DeclaredSuiteNote';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'DeclaredSuiteNote.module.css');

const SUITES: DeclaredSuite[] = [
  { name: 'Maestro E2E · Android', layer: 'e2e', count: 7, status: 'runs_in_ci_not_reported' },
  { name: 'Maestro E2E · iOS', layer: 'e2e', count: 13, status: 'authored_not_executed' },
];

describe('DeclaredSuiteNote', () => {
  it('heads the list with the design copy saying they are not counted', () => {
    const { getByRole, getByText } = render(<DeclaredSuiteNote suites={SUITES} />);
    expect(getByRole('heading', { name: 'Declared suites' })).toBeTruthy();
    expect(
      getByText('These tests exist but don’t report here yet. They aren’t counted in any total.'),
    ).toBeTruthy();
  });

  it('lists each suite with its layer, size and status in words', () => {
    const { getAllByRole } = render(<DeclaredSuiteNote suites={SUITES} />);
    const rows = getAllByRole('listitem');

    expect(rows.map((row) => row.textContent)).toEqual([
      'Maestro E2E · AndroidE2E7 flowsRuns in CI, not yet reported',
      'Maestro E2E · iOSE2E13 flowsAuthored, not yet executed',
    ]);
  });

  it('draws the two statuses with different dashed rings', () => {
    const { getAllByRole } = render(<DeclaredSuiteNote suites={SUITES} />);
    const [runsInCi, authored] = getAllByRole('listitem').map((row) =>
      within(row).getByText(/not yet/),
    );

    expect(runsInCi?.dataset.status).toBe('runs_in_ci_not_reported');
    expect(authored?.dataset.status).toBe('authored_not_executed');
    const ring = (el: HTMLElement | undefined) => el?.querySelector('svg circle');
    expect(ring(runsInCi)?.getAttribute('stroke-dasharray')).toBe('3.5 3');
    expect(ring(authored)?.getAttribute('stroke-dasharray')).toBe('1 3.2');
    expect(runsInCi?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('names layers as the design does and counts non-E2E suites in tests', () => {
    const { getAllByRole } = render(
      <DeclaredSuiteNote
        suites={[{ name: 'Contract', layer: 'api', count: 6, status: 'runs_in_ci_not_reported' }]}
      />,
    );
    expect(getAllByRole('listitem')[0]?.textContent).toBe(
      'ContractAPI6 testsRuns in CI, not yet reported',
    );
  });

  // Design v4 item 50: count nouns are singular at 1.
  it('says "1 flow" and "1 test" for a suite of one', () => {
    const { getAllByRole } = render(
      <DeclaredSuiteNote
        suites={[
          { name: 'Smoke', layer: 'e2e', count: 1, status: 'authored_not_executed' },
          { name: 'Contract', layer: 'api', count: 1, status: 'runs_in_ci_not_reported' },
        ]}
      />,
    );
    expect(getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      'SmokeE2E1 flowAuthored, not yet executed',
      'ContractAPI1 testRuns in CI, not yet reported',
    ]);
  });

  it('renders nothing when a project declares no suites', () => {
    const { container } = render(<DeclaredSuiteNote suites={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('lays each row out as wrapping columns: name, layer 110, count 90, status', () => {
    expect(ruleFor(CSS, '.row')).toEqual({
      display: 'flex',
      'flex-wrap': 'wrap',
      gap: '6px 12px',
      'align-items': 'center',
      padding: '14px 20px',
      'border-top': '1px solid var(--line)',
      'font-size': '14px',
    });
    expect(ruleFor(CSS, '.name')).toEqual({ flex: '1 1 220px', 'font-weight': '600' });
    expect(ruleFor(CSS, '.layer')).toEqual({ width: '110px', color: 'var(--ink-3)' });
    expect(ruleFor(CSS, '.count')).toEqual({ width: '90px' });
    expect(ruleFor(CSS, '.status')).toMatchObject({
      flex: '0 1 260px',
      gap: '6px',
      color: 'var(--neutral)',
      'font-weight': '600',
    });
  });

  it('draws one hairline between the header and the first row', () => {
    expect(ruleFor(CSS, '.head')).toEqual({ padding: '16px 20px' });
    expect(() => ruleFor(CSS, '.row:last-child')).toThrow('found 0');
  });
});
