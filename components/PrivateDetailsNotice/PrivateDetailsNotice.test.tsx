// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ruleFor } from '../testing/stylesheet';
import { PrivateDetailsNotice } from './PrivateDetailsNotice';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'PrivateDetailsNotice.module.css');

describe('PrivateDetailsNotice', () => {
  it('stands in for failure text with a lock and says why, never a blank gap', () => {
    const { container, getByText } = render(<PrivateDetailsNotice />);
    const notice = container.firstElementChild as HTMLElement;

    expect(getByText('Details hidden: private repository')).toBeTruthy();
    expect(
      getByText(
        'This repository is private, so failure messages and stack traces are hidden. Test names and counts are real.',
      ).tagName,
    ).toBe('P');
    const lock = notice.querySelector('svg');
    expect(lock?.getAttribute('aria-hidden')).toBe('true');
    expect(lock?.getAttribute('width')).toBe('18');
    expect(lock?.querySelector('rect')).not.toBeNull();
    expect(lock?.querySelector('path')?.getAttribute('d')).toBe('M8 11V7a4 4 0 0 1 8 0v4');
  });

  it('is a dashed inset panel with the row radius', () => {
    expect(ruleFor(CSS, '.notice')).toMatchObject({
      padding: '14px var(--space-4)',
      'border-radius': 'var(--radius-md)',
      border: '1.5px dashed var(--line-strong)',
      background: 'var(--inset)',
    });
  });
});
