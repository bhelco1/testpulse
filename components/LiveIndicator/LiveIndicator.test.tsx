// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LiveIndicator } from './LiveIndicator';

afterEach(cleanup);

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
