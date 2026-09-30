// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { ResultRow } from '../ResultsTable/ResultsTable';
import { RunResults } from './RunResults';

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
      <RunResults results={{ kind: 'pruned', totals: { total: 192, passed: 192, failed: 0 } }} />,
    );
    expect(container.querySelector('[data-part="pruned-text"]')?.textContent).toContain(
      'Summary totals are permanent: 192 tests, 192 passed, 0 failed.',
    );
  });
});
