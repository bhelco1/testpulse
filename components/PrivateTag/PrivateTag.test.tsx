// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ruleFor } from '../testing/stylesheet';
import { PrivateTag } from './PrivateTag';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'PrivateTag.module.css');

function lockOf(tag: HTMLElement) {
  const svg = tag.querySelector('svg');
  expect(svg?.getAttribute('aria-hidden')).toBe('true');
  expect(svg?.querySelector('rect')).not.toBeNull();
  expect(svg?.querySelector('path')?.getAttribute('d')).toBe('M8 11V7a4 4 0 0 1 8 0v4');
  return svg;
}

describe('PrivateTag', () => {
  it('on the web reads "Private repository" beside a 12px lock, as a neutral pill', () => {
    const { container } = render(<PrivateTag />);
    const tag = container.firstElementChild as HTMLElement;

    expect(tag.textContent).toBe('Private repository');
    expect(tag.dataset.variant).toBe('web');
    const lock = lockOf(tag);
    expect(lock?.getAttribute('width')).toBe('12');
    expect(lock?.getAttribute('stroke-width')).toBe('2.4');
    expect(ruleFor(CSS, '.web')).toMatchObject({
      gap: '6px',
      font: '500 13px var(--font-sans)',
      color: 'var(--ink-2)',
      background: 'var(--neutral-tint)',
      padding: '5px 10px',
      'border-radius': 'var(--radius-pill)',
    });
  });

  it('on the kiosk reads "Private" beside a 30px lock, with no fill', () => {
    const { container } = render(<PrivateTag variant="kiosk" />);
    const tag = container.firstElementChild as HTMLElement;

    expect(tag.textContent).toBe('Private');
    expect(tag.dataset.variant).toBe('kiosk');
    const lock = lockOf(tag);
    expect(lock?.getAttribute('width')).toBe('30');
    expect(lock?.getAttribute('stroke-width')).toBe('2.2');
    const kiosk = ruleFor(CSS, '.kiosk');
    expect(kiosk).toMatchObject({ gap: '10px', 'font-size': '24px', color: 'var(--ink-3)' });
    expect(kiosk.background).toBeUndefined();
  });
});
