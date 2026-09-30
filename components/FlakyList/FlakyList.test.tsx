// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { FlakyView } from '../../lib/pages/project';
import { ruleFor } from '../testing/stylesheet';
import { FlakyList } from './FlakyList';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'FlakyList.module.css');

const FLAKY: FlakyView = {
  testKey: 'key-1',
  name: 'assetCreateSchema accepts a minimal valid asset',
  suite: 'packages/shared/src/schemas/asset.test.ts',
  rate: 'Failed 4 of last 10 runs',
  layer: 'Unit',
  platforms: 'node',
  href: '/p/routeserve/tests/key-1',
};

const DEFINITION =
  'Flaky: passed and failed on the same commit and platform within the last 30 days.';

describe('FlakyList', () => {
  it('heads the card, defines flaky, and links each test to its history', () => {
    const { getByRole, container } = render(<FlakyList tests={[FLAKY]} />);

    expect(getByRole('heading', { level: 3 }).textContent).toBe('Flaky tests');
    expect(container.querySelector('p')?.textContent).toBe(DEFINITION);
    const links = within(getByRole('list')).getAllByRole('link');
    expect(links).toHaveLength(1);
    const link = links[0] as HTMLElement;
    expect(link.getAttribute('href')).toBe('/p/routeserve/tests/key-1');
    expect(link.querySelector('[data-part="name"]')?.textContent).toBe(FLAKY.name);
    expect(link.querySelector('[data-part="suite"]')?.textContent).toBe(FLAKY.suite);
    expect(link.querySelector('[data-part="flaky"]')?.textContent).toBe('Flaky');
    expect(link.querySelector('[data-part="flaky"] svg')?.getAttribute('width')).toBe('12');
    const meta = [...(link.querySelector('[data-part="meta"]')?.children ?? [])];
    expect(meta.map((span) => span.textContent)).toEqual([
      'Failed 4 of last 10 runs',
      'Unit',
      'node',
    ]);
  });

  // Design v8 item 20: "Failed 0 of last 40 runs" is not drawn, so that row shows no rate.
  it('leaves the rate out of a row that has none', () => {
    const { container } = render(<FlakyList tests={[{ ...FLAKY, rate: null }]} />);

    const meta = [...(container.querySelector('[data-part="meta"]')?.children ?? [])];
    expect(meta.map((span) => span.textContent)).toEqual(['Unit', 'node']);
  });

  it('says so when nothing was flaky in the 30 days', () => {
    const { container, queryByRole } = render(<FlakyList tests={[]} />);

    expect(queryByRole('list')).toBeNull();
    const none = container.querySelector<HTMLElement>('[data-part="none"]');
    expect(none?.textContent).toBe(
      'No flaky tests in the last 30 daysNo test passed and failed on the same commit and platform.',
    );
    expect(none?.querySelector('svg')?.getAttribute('width')).toBe('18');
  });

  it('draws the card, rows, pill and empty box as the project page does', () => {
    expect(ruleFor(CSS, '.card')).toEqual({
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      'border-radius': 'var(--radius-xl)',
      padding: '22px var(--space-6)',
      'box-shadow': 'var(--shadow-card)',
    });
    expect(ruleFor(CSS, '.row')).toMatchObject({
      display: 'block',
      padding: 'var(--space-3) 14px',
      'border-radius': 'var(--radius-md)',
      background: 'var(--inset)',
      border: '1px solid var(--line)',
      'text-decoration': 'none',
    });
    expect(ruleFor(CSS, '.row:hover')).toEqual({ background: 'var(--raised)' });
    expect(ruleFor(CSS, '.name')).toMatchObject({
      font: '13.5px var(--font-mono)',
      'overflow-wrap': 'anywhere',
    });
    expect(ruleFor(CSS, '.pill')).toMatchObject({
      padding: '2px var(--space-2)',
      'border-radius': 'var(--radius-pill)',
      background: 'var(--attn-tint)',
      color: 'var(--attn)',
      'font-size': '12px',
      'font-weight': '600',
    });
    expect(ruleFor(CSS, '.suite')).toMatchObject({
      font: '12px var(--font-mono)',
      color: 'var(--ink-3)',
      'margin-top': '3px',
    });
    expect(ruleFor(CSS, '.meta')).toMatchObject({
      gap: 'var(--space-1) 14px',
      'margin-top': '10px',
      'font-size': '13px',
      color: 'var(--ink-2)',
    });
    expect(ruleFor(CSS, '.none')).toMatchObject({
      padding: 'var(--space-4)',
      'border-radius': 'var(--radius-md)',
      border: '1px dashed var(--line-strong)',
    });
  });
});
