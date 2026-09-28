// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ruleFor } from '../testing/stylesheet';
import {
  BADGE_STATUSES,
  BADGE_VARIANTS,
  StatusBadge,
  type BadgeStatus,
  type BadgeVariant,
} from './StatusBadge';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'StatusBadge.module.css');

// Each status: its word, its colour family, and the shape that tells it apart without colour.
const EXPECTED: Record<
  BadgeStatus,
  { word: string; tone: string; paths: string[]; ring: boolean; dash?: string }
> = {
  passed: { word: 'Passed', tone: 'pass', paths: ['m8 12 3 3 5-6'], ring: true },
  failed: { word: 'Failed', tone: 'fail', paths: ['m15 9-6 6M9 9l6 6'], ring: true },
  error: { word: 'Error', tone: 'fail', paths: ['M12 7v6M12 17h.01'], ring: true },
  empty: { word: 'Empty', tone: 'attn', paths: ['M8 12h8'], ring: true, dash: '3.5 3' },
  skipped: { word: 'Skipped', tone: 'neutral', paths: ['M8 12h8'], ring: true },
  flaky: { word: 'Flaky', tone: 'attn', paths: ['M2 12h4l3-7 6 14 3-7h4'], ring: false },
  stale: { word: 'Stale', tone: 'attn', paths: ['M12 7v5l3 2'], ring: true },
  not_reporting: {
    word: 'Not reporting yet',
    tone: 'neutral',
    paths: [],
    ring: true,
    dash: '3.5 3',
  },
};

const STATUSES = Object.keys(EXPECTED) as BadgeStatus[];
const VARIANTS: BadgeVariant[] = ['pill', 'inline'];
const ICON_SIZE: Record<BadgeVariant, string> = { pill: '14', inline: '15' };

describe('StatusBadge', () => {
  it('has exactly the statuses and variants the design lists, with no "running"', () => {
    expect(BADGE_STATUSES).toEqual(STATUSES);
    expect(BADGE_VARIANTS).toEqual(VARIANTS);
  });

  for (const status of STATUSES) {
    for (const variant of VARIANTS) {
      it(`${status} as ${variant} pairs the word with its icon shape`, () => {
        const expected = EXPECTED[status];
        const { getByText } = render(<StatusBadge status={status} variant={variant} />);
        const badge = getByText(expected.word);

        expect(badge.dataset.status).toBe(status);
        expect(badge.dataset.variant).toBe(variant);
        expect(badge.dataset.tone).toBe(expected.tone);

        const icon = badge.querySelector('svg');
        expect(icon?.getAttribute('aria-hidden')).toBe('true');
        expect(icon?.getAttribute('width')).toBe(ICON_SIZE[variant]);
        expect(icon?.getAttribute('viewBox')).toBe('0 0 24 24');
        expect(icon?.getAttribute('stroke-width')).toBe('2.6');
        const paths = [...(icon?.querySelectorAll('path') ?? [])].map((p) => p.getAttribute('d'));
        expect(paths).toEqual(expected.paths);
        const circle = icon?.querySelector('circle');
        if (expected.ring) {
          expect(circle?.getAttribute('r')).toBe('10');
          expect(circle?.getAttribute('stroke-dasharray') ?? undefined).toBe(expected.dash);
        } else {
          expect(circle).toBeNull();
        }
      });
    }
  }

  it('defaults to the pill variant', () => {
    const { getByText } = render(<StatusBadge status="passed" />);
    expect(getByText('Passed').dataset.variant).toBe('pill');
  });

  it('gives no two statuses the same icon, so none depends on colour', () => {
    const shapes = STATUSES.map((status) => {
      const { container } = render(<StatusBadge status={status} />);
      const shape = container.querySelector('svg')?.innerHTML ?? '';
      cleanup();
      return shape;
    });
    expect(new Set(shapes).size).toBe(STATUSES.length);
  });

  it('sets both variants in 14px/600 text, the pill padded 4 by 11 on its tint', () => {
    expect(ruleFor(CSS, '.badge')).toMatchObject({
      gap: '6px',
      'font-size': '14px',
      'font-weight': '600',
    });
    expect(ruleFor(CSS, '.pill')).toEqual({
      padding: '4px 11px',
      'border-radius': 'var(--radius-pill)',
    });
  });
});
