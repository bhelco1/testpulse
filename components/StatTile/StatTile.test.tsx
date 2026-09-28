// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ruleFor } from '../testing/stylesheet';
import { StatTile, type StatTileAttention } from './StatTile';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'StatTile.module.css');

const part = (root: Element, name: string) =>
  root.querySelector<HTMLElement>(`[data-part="${name}"]`);

const ICON_PATH: Record<StatTileAttention['icon'], string> = {
  stale: 'M12 7v5l3 2',
  empty: 'M8 12h8',
  below_floor: 'M12 5v14M6 13l6 6 6-6',
};

describe('StatTile', () => {
  it('shows the label, the figure and its line of context', () => {
    const { container } = render(
      <StatTile label="Pass rate" value="100%" sub="Latest runs · 0 skipped, excluded" />,
    );
    const tile = container.firstElementChild as HTMLElement;

    expect(tile.dataset.variant).toBe('web');
    expect(tile.hasAttribute('aria-busy')).toBe(false);
    expect(part(tile, 'label')?.textContent).toBe('Pass rate');
    expect(part(tile, 'value')?.textContent).toBe('100%');
    expect(part(tile, 'sub')?.textContent).toBe('Latest runs · 0 skipped, excluded');
    expect(part(tile, 'attention')).toBeNull();
  });

  it('leaves out the context line when there is none', () => {
    const { container } = render(<StatTile label="Projects reporting" value="2" />);
    expect(part(container, 'sub')).toBeNull();
  });

  for (const icon of ['stale', 'empty', 'below_floor'] as const) {
    it(`on attention (${icon}) puts the reason with its icon in the sub-line, value unchanged`, () => {
      const { container } = render(
        <StatTile
          label="Projects reporting"
          value="1 of 2"
          sub="Both reporting"
          attention={{ icon, text: 'RouteServe silent 12 days' }}
        />,
      );
      const tile = container.firstElementChild as HTMLElement;
      const attention = part(tile, 'attention');

      expect(tile.dataset.attention).toBe('true');
      expect(part(tile, 'value')?.textContent).toBe('1 of 2');
      expect(part(tile, 'sub')).toBeNull();
      expect(attention?.textContent).toBe('RouteServe silent 12 days');
      const svg = attention?.querySelector('svg');
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
      expect(svg?.getAttribute('width')).toBe('12');
      expect(svg?.getAttribute('stroke-width')).toBe('2.8');
      expect(svg?.querySelector('path')?.getAttribute('d')).toBe(ICON_PATH[icon]);
    });
  }

  it('colours only the attention line, 13/600 in --attn; the value stays ink', () => {
    expect(ruleFor(CSS, '.attention')).toMatchObject({
      gap: '6px',
      'font-size': '13px',
      'font-weight': '600',
      color: 'var(--attn)',
    });
    expect(ruleFor(CSS, '.value')).not.toHaveProperty('color');
    expect(() => ruleFor(CSS, '.attention .value')).toThrow('found 0');
  });

  it('shows three busy bars in the shape of the tile while loading, and no figure', () => {
    const { container } = render(<StatTile label="Pass rate" value="100%" loading />);
    const tile = container.firstElementChild as HTMLElement;

    expect(tile.getAttribute('aria-busy')).toBe('true');
    // Design v4 item 51: loading containers carry a hidden name.
    expect(tile.getAttribute('aria-label')).toBe('Loading stats');
    const blocks = [...tile.querySelectorAll<HTMLElement>('[data-part="skeleton"]')];
    expect(blocks.map((b) => [b.style.width, b.style.height, b.style.borderRadius])).toEqual([
      ['60%', '12px', '4px'],
      ['45%', '34px', '6px'],
      ['75%', '10px', '4px'],
    ]);
    expect(tile.textContent).toBe('');
  });

  it('sets the web tile at 18 by 20 on the surface, 32px figures on a phone', () => {
    expect(ruleFor(CSS, '.tile')).toEqual({
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      'border-radius': 'var(--radius-lg)',
      'box-shadow': 'var(--shadow-card)',
    });
    expect(ruleFor(CSS, '.web')).toEqual({ padding: '18px 20px' });
    expect(ruleFor(CSS, '.value')).toMatchObject({ font: 'var(--text-stat)' });
    expect(ruleFor(CSS, '.value', '(max-width: 640px)')).toEqual({ 'font-size': '32px' });
  });

  describe('kiosk variant', () => {
    it('is one row: label left, value right', () => {
      const { container } = render(<StatTile variant="kiosk" label="Pass rate" value="100%" />);
      const tile = container.firstElementChild as HTMLElement;

      expect(tile.dataset.variant).toBe('kiosk');
      expect(part(tile, 'label')?.textContent).toBe('Pass rate');
      expect(part(tile, 'value')?.textContent).toBe('100%');
      expect(part(tile, 'sub')).toBeNull();
      expect(ruleFor(CSS, '.kiosk')).toMatchObject({
        display: 'flex',
        'justify-content': 'space-between',
        padding: '20px 26px',
      });
      expect(ruleFor(CSS, '.kiosk .label')).toEqual({ 'font-size': '24px' });
      expect(ruleFor(CSS, '.kiosk .value')).toEqual({
        flex: '0 0 auto',
        font: '500 52px/1 var(--font-serif)',
        'margin-top': '0px',
      });
      expect(ruleFor(CSS, '.kioskText')).toEqual({
        display: 'flex',
        'flex-direction': 'column',
        gap: '4px',
        'min-width': '0px',
      });
    });

    // Design v4 item 33.
    it('puts a sub-line 20px --ink-3 under the label', () => {
      const { container } = render(
        <StatTile
          variant="kiosk"
          label="Runs in last 30 days"
          value="46"
          sub="Ostomate2 31 · RouteServe 15"
        />,
      );
      const tile = container.firstElementChild as HTMLElement;

      expect(part(tile, 'label')?.textContent).toBe('Runs in last 30 days');
      expect(part(tile, 'sub')?.textContent).toBe('Ostomate2 31 · RouteServe 15');
      expect(ruleFor(CSS, '.kiosk .sub')).toEqual({
        'font-size': '20px',
        color: 'var(--ink-3)',
        'margin-top': '0px',
      });
    });

    for (const icon of ['stale', 'empty', 'below_floor'] as const) {
      it(`draws the ${icon} attention with the HealthMarker glyph at 22px, stroke 2.6`, () => {
        const { container } = render(
          <StatTile
            variant="kiosk"
            label="Projects reporting"
            value="1 of 2"
            attention={{ icon, text: 'Needs attention' }}
          />,
        );
        const svg = part(container, 'attention')?.querySelector('svg');
        expect(svg?.getAttribute('width')).toBe('22');
        expect(svg?.getAttribute('stroke-width')).toBe('2.6');
        expect(svg?.querySelector('path')?.getAttribute('d')).toBe(ICON_PATH[icon]);
      });
    }

    it('while loading shows a label bar and a value bar, named for screen readers', () => {
      const { container } = render(
        <StatTile variant="kiosk" label="Pass rate" value="100%" loading />,
      );
      const tile = container.firstElementChild as HTMLElement;

      expect(tile.dataset.variant).toBe('kiosk');
      expect(tile.getAttribute('aria-busy')).toBe('true');
      expect(tile.getAttribute('aria-label')).toBe('Loading stats');
      const blocks = [...tile.querySelectorAll<HTMLElement>('[data-part="skeleton"]')];
      expect(blocks.map((b) => [b.style.width, b.style.height, b.style.borderRadius])).toEqual([
        ['45%', '22px', '4px'],
        ['120px', '52px', '6px'],
      ]);
      expect(tile.textContent).toBe('');
    });

    it('on attention replaces the label with the reason in amber and a 22px icon', () => {
      const { container } = render(
        <StatTile
          variant="kiosk"
          label="Projects reporting"
          value="1 of 2"
          attention={{ icon: 'stale', text: '1 silent 12 days' }}
        />,
      );
      const tile = container.firstElementChild as HTMLElement;
      const attention = part(tile, 'attention');

      expect(part(tile, 'label')).toBeNull();
      expect(attention?.textContent).toBe('1 silent 12 days');
      expect(attention?.querySelector('svg')?.getAttribute('width')).toBe('22');
      expect(attention?.querySelector('svg')?.getAttribute('stroke-width')).toBe('2.6');
      expect(part(tile, 'value')?.textContent).toBe('1 of 2');
      expect(ruleFor(CSS, '.kiosk .attention')).toEqual({
        gap: '10px',
        'font-size': '24px',
        'margin-top': '0px',
      });
    });
  });
});
