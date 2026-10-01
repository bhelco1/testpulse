// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FailedRunBanner } from '../FailedRunBanner/FailedRunBanner';
import type { ResultRow } from '../ResultsTable/ResultsTable';
import { ruleFor } from '../testing/stylesheet';
import { RunFilterProvider } from './RunFilter';
import { RunResults } from './RunResults';

const CSS = join(import.meta.dirname, 'RunResults.module.css');
const PRUNED_ON = {
  text: '1 Sep',
  datetime: '2026-09-01T03:00:00.000Z',
  title: '1 Sep 2026, 03:00 UTC',
};

afterEach(cleanup);

const rows: ResultRow[] = Array.from({ length: 120 }, (_, index) => ({
  key: `t${String(index).padStart(3, '0')}`,
  suite: 'packages/shared/src/time.test.ts',
  name: `test ${String(index).padStart(3, '0')}`,
  status: 'passed',
  layer: 'unit',
  flaky: false,
  platforms: [{ platform: 'node', status: 'passed' }],
  time: '0.01 s',
  historyHref: `/p/routeserve/tests/t${index}`,
  failures: [],
}));

const shown = (container: HTMLElement) => container.querySelectorAll('[data-part="test"]').length;

// The results table's page count is the run page's own state (design/README.md, "State").
describe('RunResults', () => {
  it('shows the first 50 rows, then 50 more each time it is asked', () => {
    const { container, getByRole, queryByRole } = render(
      <RunResults results={{ kind: 'rows', visibility: 'public', rows }} />,
    );
    expect(shown(container)).toBe(50);
    fireEvent.click(getByRole('button', { name: 'Load 50 more' }));
    expect(shown(container)).toBe(100);
    fireEvent.click(getByRole('button', { name: 'Load 50 more' }));
    expect(shown(container)).toBe(120);
    expect(queryByRole('button', { name: 'Load 50 more' })).toBeNull();
  });

  it('shows the retention note for a pruned run', () => {
    const { container } = render(
      <RunResults
        results={{
          kind: 'pruned',
          totals: { total: 192, passed: 192, failed: 0 },
          prunedOn: PRUNED_ON,
        }}
      />,
    );
    expect(container.querySelector('[data-part="pruned-text"]')?.textContent).toContain(
      'Summary totals are permanent: 192 tests, 192 passed, 0 failed.',
    );
    expect(container.querySelector('[data-part="pruned-on"]')?.textContent).toBe('Pruned on 1 Sep');
  });

  // components.md, Run page, and the Design System's "RESULTS · empty run": one card in place
  // of the filters and table.
  it('shows one card for an empty run, and no filters or table', () => {
    const { container, queryByRole } = render(
      <RunResults
        results={{ kind: 'empty', body: '3 reports arrived, but none held any test cases.' }}
      />,
    );
    const card = container.querySelector<HTMLElement>('[data-part="empty-run"]');
    expect(card?.querySelector('[data-part="empty-run-title"]')?.textContent).toBe(
      'No test results in this run',
    );
    expect(card?.querySelector('[data-part="empty-run-text"]')?.textContent).toBe(
      '3 reports arrived, but none held any test cases.',
    );
    // The dashed ring of Empty, 22 px in --attn.
    expect(card?.querySelector('svg circle')?.getAttribute('stroke-dasharray')).toBe('3.5 3');
    expect(card?.querySelector('svg')?.getAttribute('width')).toBe('22');
    expect(queryByRole('radiogroup')).toBeNull();
    expect(queryByRole('table')).toBeNull();
    expect(ruleFor(CSS, '.empty')).toEqual({
      'max-width': '720px',
      display: 'flex',
      gap: '14px',
      'align-items': 'flex-start',
      padding: '24px',
      'border-radius': 'var(--radius-xl)',
      background: 'var(--surface)',
      border: '1px solid var(--line)',
    });
    expect(ruleFor(CSS, '.emptyIcon')).toEqual({ flex: '0 0 auto', color: 'var(--attn)' });
    expect(ruleFor(CSS, '.emptyTitle')).toEqual({ font: '500 22px var(--font-serif)' });
    expect(ruleFor(CSS, '.emptyText')).toEqual({
      margin: '6px 0px 0px',
      'font-size': '14.5px',
      'line-height': '1.55',
      color: 'var(--ink-2)',
      'text-wrap': 'pretty',
    });
  });

  it('filters to the failures when the banner asks, below a page of passing rows', () => {
    const failing: ResultRow = {
      ...rows[0],
      key: 'fail',
      name: 'zz fails',
      suite: 'zz.test.ts',
      status: 'failed',
      platforms: [{ platform: 'node', status: 'failed' }],
      failures: [],
    } as ResultRow;
    const { getByRole, container } = render(
      <RunFilterProvider>
        <FailedRunBanner
          banner={{ title: '1 test failed', body: 'x', action: 'Show failure', filter: 'failed' }}
        />
        <RunResults results={{ kind: 'rows', visibility: 'public', rows: [...rows, failing] }} />
      </RunFilterProvider>,
    );
    fireEvent.click(getByRole('link', { name: 'Show failure' }));
    expect(shown(container)).toBe(1);
    expect(document.activeElement).toBe(getByRole('button', { name: 'zz fails' }));
  });
});
