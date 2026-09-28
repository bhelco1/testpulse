// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { keyframesIn } from '../testing/stylesheet';
import { Skeleton } from './Skeleton';

afterEach(cleanup);

describe('Skeleton', () => {
  it('draws a block of the given shape that assistive technology skips', () => {
    const { container } = render(<Skeleton width="60%" height={12} />);
    const block = container.firstElementChild as HTMLElement;

    expect(block.getAttribute('aria-hidden')).toBe('true');
    expect(block.dataset.part).toBe('skeleton');
    expect(block.style.width).toBe('60%');
    expect(block.style.height).toBe('12px');
    expect(block.style.borderRadius).toBe('4px');
    expect(block.style.animation).toBe('tp-shimmer 1.6s ease-in-out infinite');
    expect(block.textContent).toBe('');
  });

  it('takes the corner radius the design gives for the shape', () => {
    const { container } = render(<Skeleton width="45%" height={34} radius={6} />);
    expect((container.firstElementChild as HTMLElement).style.borderRadius).toBe('6px');
  });

  it('keeps no keyframes of its own; the shimmer is the one in tokens.css', () => {
    expect(keyframesIn(join(import.meta.dirname, 'Skeleton.module.css'))).toEqual([]);
  });
});
