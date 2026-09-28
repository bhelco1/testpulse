// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ruleFor } from '../testing/stylesheet';
import { HealthMarker, type HealthMarkerProps } from './HealthMarker';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'HealthMarker.module.css');

const CASES: {
  props: HealthMarkerProps;
  text: string;
  tone: string;
  paths: string[];
  ring?: { dash?: string };
}[] = [
  {
    props: { health: 'healthy' },
    text: 'Reporting healthy',
    tone: 'pass',
    paths: ['M20 6 9 17l-5-5'],
  },
  {
    props: { health: 'stale', days: 12 },
    text: 'No report in 12 days',
    tone: 'attn',
    paths: ['M12 7v5l3 2'],
    ring: {},
  },
  {
    props: { health: 'empty' },
    text: 'Last run empty',
    tone: 'attn',
    paths: ['M8 12h8'],
    ring: { dash: '3.5 3' },
  },
  {
    props: { health: 'below_floor' },
    text: 'Coverage below floor',
    tone: 'attn',
    paths: ['M12 5v14M6 13l6 6 6-6'],
  },
  {
    props: { health: 'not_reporting' },
    text: 'Not reporting yet',
    tone: 'neutral',
    paths: [],
    ring: { dash: '3.5 3' },
  },
];

describe('HealthMarker', () => {
  for (const { props, text, tone, paths, ring } of CASES) {
    it(`${props.health}: "${text}" with its own icon at 13px, stroke 2.8`, () => {
      const { container } = render(<HealthMarker {...props} />);
      const marker = container.firstElementChild as HTMLElement;

      expect(marker.textContent).toBe(text);
      expect(marker.dataset.health).toBe(props.health);
      expect(marker.dataset.tone).toBe(tone);
      const icon = marker.querySelector('svg');
      expect(icon?.getAttribute('aria-hidden')).toBe('true');
      expect(icon?.getAttribute('width')).toBe('13');
      expect(icon?.getAttribute('stroke-width')).toBe('2.8');
      expect([...(icon?.querySelectorAll('path') ?? [])].map((p) => p.getAttribute('d'))).toEqual(
        paths,
      );
      const circle = icon?.querySelector('circle') ?? null;
      if (ring) {
        expect(circle?.getAttribute('stroke-dasharray') ?? undefined).toBe(ring.dash);
      } else {
        expect(circle).toBeNull();
      }
    });
  }

  it('stale: says "1 day" at one day (design v4 item 50)', () => {
    const { container } = render(<HealthMarker health="stale" days={1} />);
    expect(container.textContent).toBe('No report in 1 day');
  });

  it('is web size by default', () => {
    const { container } = render(<HealthMarker health="healthy" />);
    expect((container.firstElementChild as HTMLElement).dataset.size).toBe('web');
  });

  it('uses the same icon for an empty run as the Empty status', () => {
    const { container } = render(<HealthMarker health="empty" />);
    expect(container.querySelector('svg circle')?.getAttribute('stroke-dasharray')).toBe('3.5 3');
  });

  it('size kiosk: the same words and icon at 24px, icon 24, gap 10 (components.md `size`)', () => {
    const { container } = render(<HealthMarker health="healthy" size="kiosk" />);
    const marker = container.firstElementChild as HTMLElement;

    expect(marker.textContent).toBe('Reporting healthy');
    expect(marker.dataset.size).toBe('kiosk');
    expect(marker.querySelector('svg')?.getAttribute('width')).toBe('24');
    expect(marker.querySelector('svg')?.getAttribute('stroke-width')).toBe('2.8');
    expect(ruleFor(CSS, '.kiosk')).toEqual({ gap: '10px', 'font-size': '24px' });
  });

  it('is 14px/600 in every state on the web, where it has no other variant', () => {
    expect(ruleFor(CSS, '.marker')).toMatchObject({
      gap: '6px',
      'font-size': '14px',
      'font-weight': '600',
    });
    expect(() => ruleFor(CSS, '.page')).toThrow('found 0');
    expect(() => ruleFor(CSS, '.card.pass')).toThrow('found 0');
  });
});
