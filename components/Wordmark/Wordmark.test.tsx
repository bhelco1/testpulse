// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ruleFor } from '../testing/stylesheet';
import { Wordmark } from './Wordmark';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'Wordmark.module.css');

// design/components.md, "Site name, wordmark and page titles" (v20): "Test" 600 and "ament" 400,
// both --ink, in one aria-hidden span, then a visually hidden "Testament", so a screen reader
// hears one word.
describe('Wordmark', () => {
  it('draws "Test" and "ament" in one hidden span, then says "Testament" once', () => {
    const { container } = render(<Wordmark />);
    const shown = container.querySelector<HTMLElement>('[data-part="wordmark-shown"]');
    expect(shown?.getAttribute('aria-hidden')).toBe('true');
    expect(shown?.textContent).toBe('Testament');
    expect(shown?.firstChild?.textContent).toBe('Test');
    expect(shown?.querySelector('[data-part="wordmark-light"]')?.textContent).toBe('ament');

    const spoken = container.querySelector<HTMLElement>('[data-part="wordmark-spoken"]');
    expect(spoken?.textContent).toBe('Testament');
    expect(spoken?.closest('[aria-hidden="true"]')).toBeNull();
  });

  it('shows the pun by weight only: "ament" at 400 in the wordmark’s own colour', () => {
    expect(ruleFor(CSS, '.light')).toEqual({ 'font-weight': '400' });
  });

  it('hides the spoken name visually without hiding it from screen readers', () => {
    expect(ruleFor(CSS, '.spoken')).toEqual({
      position: 'absolute',
      width: '1px',
      height: '1px',
      margin: '-1px',
      padding: '0px',
      border: '0px',
      overflow: 'hidden',
      // jsdom serializes rect(0 0 0 0) as one value.
      clip: 'rect(0px)',
      'clip-path': 'inset(50%)',
      'white-space': 'nowrap',
    });
  });
});
