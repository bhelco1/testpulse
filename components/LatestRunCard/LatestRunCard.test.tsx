// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { LatestRunView } from '../../lib/pages/project';
import { ruleFor } from '../testing/stylesheet';
import { LatestRunCard } from './LatestRunCard';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'LatestRunCard.module.css');

const PASSED: LatestRunView = {
  status: 'passed',
  when: '2 hours ago',
  branch: 'main',
  sha: '0e2d0b4',
  href: '/p/ostomate2/runs/run-9',
  figure: '142',
  figureTone: 'ink',
  line: 'tests · 142 passed · 0 failed · 0 skipped · 36 s',
  failing: null,
  passRate30: '100%',
  recovery: {
    greenStreak: { current: 8, longest: 8 },
    timeToGreen: { recoveries: [], medianMs: null, worstMs: null, stillRed: null },
  },
};

const FAILED: LatestRunView = {
  ...PASSED,
  status: 'failed',
  figure: '1',
  figureTone: 'fail',
  line: 'failed · 1,040 of 1,041 passed · 204 s',
  failing: {
    short: 'asset.test.ts › accepts a minimal valid asset',
    full: 'packages/shared/src/asset.test.ts › accepts a minimal valid asset',
    platform: 'node',
    href: '/p/routeserve/runs/run-11',
  },
};

const part = (root: Element, name: string) =>
  root.querySelector<HTMLElement>(`[data-part="${name}"]`);

describe('LatestRunCard', () => {
  it('passed: the pill, "Latest run · when · branch · sha", the test count and its line', () => {
    const { container, getByRole } = render(<LatestRunCard run={PASSED} />);
    const card = getByRole('article');

    expect(card.querySelector<HTMLElement>('[data-status]')?.dataset).toMatchObject({
      status: 'passed',
      variant: 'pill',
    });
    expect(part(card, 'meta')?.textContent).toBe('Latest run · 2 hours ago · main · 0e2d0b4');
    expect(part(card, 'sha')?.textContent).toBe('0e2d0b4');
    expect(part(card, 'figure')?.textContent).toBe('142');
    expect(part(card, 'figure')?.dataset.tone).toBe('ink');
    expect(part(card, 'line')?.textContent).toBe(
      'tests · 142 passed · 0 failed · 0 skipped · 36 s',
    );
    expect(part(container, 'failing')).toBeNull();
  });

  it('rows the 30-day pass rate with the recovery stats, and links to the run', () => {
    const { getByRole } = render(<LatestRunCard run={PASSED} />);
    const card = getByRole('article');

    const cells = [...(part(card, 'stats')?.querySelectorAll(':scope > [data-part="cell"]') ?? [])];
    expect(cells.map((cell) => cell.textContent)).toEqual([
      'Pass rate, 30 days100%',
      'Green streak8runsLongest8 runs',
      'Time to greenNoneNo recoveries in 90 days',
    ]);
    expect(within(card).getByRole('link', { name: 'View this run →' }).getAttribute('href')).toBe(
      '/p/ostomate2/runs/run-9',
    );
  });

  it('failed: the failed count in --fail and the first failing test, linked to the run', () => {
    const { getByRole } = render(<LatestRunCard run={FAILED} />);
    const card = getByRole('article');

    expect(part(card, 'figure')?.textContent).toBe('1');
    expect(part(card, 'figure')?.dataset.tone).toBe('fail');
    const failing = part(card, 'failing');
    expect(failing?.tagName).toBe('A');
    expect(failing?.getAttribute('href')).toBe('/p/routeserve/runs/run-11');
    expect(failing?.getAttribute('title')).toBe(
      'packages/shared/src/asset.test.ts › accepts a minimal valid asset',
    );
    expect(failing?.textContent).toBe('asset.test.ts › accepts a minimal valid assetnode');
  });

  it('leaves out what the view held back: an empty run’s figure, a missing pass rate', () => {
    const { getByRole } = render(
      <LatestRunCard
        run={{ ...PASSED, status: 'empty', figure: null, line: null, passRate30: null }}
      />,
    );
    const card = getByRole('article');

    expect(card.querySelector<HTMLElement>('[data-status]')?.dataset.status).toBe('empty');
    expect(part(card, 'figure')).toBeNull();
    expect(part(card, 'line')).toBeNull();
    expect(part(card, 'pass-rate')).toBeNull();
    // The recovery cells stay: they describe the project, not this run.
    expect(part(card, 'stats')?.querySelectorAll(':scope > [data-part="cell"]')).toHaveLength(2);
    expect(within(card).getByRole('link', { name: 'View this run →' })).toBeTruthy();
  });

  it('draws the card, figure and failing block as the project page does', () => {
    expect(ruleFor(CSS, '.card')).toEqual({
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      'border-radius': 'var(--radius-xl)',
      padding: 'var(--space-6) 26px',
      'box-shadow': 'var(--shadow-card)',
      'min-width': '0px',
    });
    expect(ruleFor(CSS, '.top')).toMatchObject({
      'justify-content': 'space-between',
      gap: 'var(--space-2) var(--space-3)',
      'font-size': '14px',
    });
    expect(ruleFor(CSS, '.meta')).toEqual({ color: 'var(--ink-3)' });
    expect(ruleFor(CSS, '.sha')).toEqual({
      'font-family': 'var(--font-mono)',
      color: 'var(--ink-2)',
    });
    expect(ruleFor(CSS, '.figureRow')).toMatchObject({
      'margin-top': '18px',
      gap: 'var(--space-3)',
    });
    expect(ruleFor(CSS, '.figure')).toEqual({
      font: '500 64px/1 var(--font-serif)',
      color: 'var(--ink)',
    });
    expect(ruleFor(CSS, '.fail')).toEqual({ color: 'var(--fail)' });
    expect(ruleFor(CSS, '.line')).toEqual({ 'font-size': '15px', color: 'var(--ink-2)' });
    expect(ruleFor(CSS, '.failing')).toMatchObject({
      'margin-top': '14px',
      padding: 'var(--space-3) 14px',
      'border-radius': 'var(--radius-md)',
      background: 'var(--fail-tint)',
      'min-height': 'var(--target-min)',
    });
    expect(ruleFor(CSS, '.failName')).toMatchObject({
      font: '13px var(--font-mono)',
      color: 'var(--ink)',
      'overflow-wrap': 'anywhere',
    });
    expect(ruleFor(CSS, '.stats')).toMatchObject({
      'grid-template-columns': 'repeat(3, minmax(0, 1fr))',
      'margin-top': '22px',
      'padding-top': '18px',
      'border-top': '1px solid var(--line)',
    });
    expect(ruleFor(CSS, '.statLabel')).toEqual({ 'font-size': '13px', color: 'var(--ink-3)' });
    expect(ruleFor(CSS, '.statValue')).toEqual({
      margin: 'var(--space-1) 0 0',
      font: '500 30px/1.15 var(--font-serif)',
    });
    expect(ruleFor(CSS, '.view')).toMatchObject({
      'min-height': 'var(--target-min)',
      'margin-top': '10px',
      'font-size': '14.5px',
      'font-weight': '600',
    });
  });
});
