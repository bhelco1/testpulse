// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ruleFor } from '../testing/stylesheet';
import { LiveDot, LiveIndicator } from './LiveIndicator';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'LiveIndicator.module.css');

describe('LiveIndicator', () => {
  it('reads "Live" with a filled, pulsing dot when connected', () => {
    const { container, getByText } = render(<LiveIndicator connected />);
    const root = container.firstElementChild as HTMLElement;

    expect(root.dataset.state).toBe('on');
    expect(getByText('Live')).toBeTruthy();
    const dot = root.querySelector('[data-part="dot"]');
    expect(dot?.getAttribute('aria-hidden')).toBe('true');
    expect((dot as HTMLElement | null)?.style.animation).toBe(
      'tp-pulse var(--motion-pulse) ease-out infinite',
    );
    expect(root.textContent).toBe('Live');
  });

  it('reads "Offline · reconnecting" with a ring when disconnected', () => {
    const { container, getByText } = render(<LiveIndicator connected={false} />);
    const root = container.firstElementChild as HTMLElement;

    expect(root.dataset.state).toBe('off');
    expect(getByText('Offline · reconnecting')).toBeTruthy();
    const dot = root.querySelector<HTMLElement>('[data-part="dot"]');
    expect(dot?.getAttribute('aria-hidden')).toBe('true');
    expect(dot?.style.animation).toBe('');
    expect(root.textContent).toBe('Offline · reconnecting');
  });
});

// The feed header shows the same dot beside its own words instead of "Live".
describe('LiveDot', () => {
  it('is the pulsing filled dot when connected', () => {
    const { container } = render(<LiveDot connected />);
    const dot = container.firstElementChild as HTMLElement;

    expect(dot.dataset.part).toBe('dot');
    expect(dot.dataset.state).toBe('on');
    expect(dot.getAttribute('aria-hidden')).toBe('true');
    expect(dot.style.animation).toBe('tp-pulse var(--motion-pulse) ease-out infinite');
    expect(dot.textContent).toBe('');
  });

  it('is the still ring when disconnected', () => {
    const { container } = render(<LiveDot connected={false} />);
    const dot = container.firstElementChild as HTMLElement;

    expect(dot.dataset.state).toBe('off');
    expect(dot.style.animation).toBe('');
  });

  it('draws on as an 8px --pass dot and off as a 1.5px --ink-3 ring', () => {
    expect(ruleFor(CSS, '.dot')).toEqual({
      width: '8px',
      height: '8px',
      'border-radius': '50%',
      flex: '0 0 auto',
      'box-sizing': 'border-box',
    });
    expect(ruleFor(CSS, '.dot.on')).toEqual({ background: 'var(--pass)', color: 'var(--pass)' });
    expect(ruleFor(CSS, '.dot.off')).toEqual({
      background: 'transparent',
      border: '1.5px solid var(--ink-3)',
    });
  });
});
