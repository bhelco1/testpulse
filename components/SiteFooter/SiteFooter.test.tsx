// @vitest-environment jsdom
import { cleanup, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { timeLabel } from '../testing/time';
import { SiteFooter } from './SiteFooter';

afterEach(cleanup);

describe('SiteFooter', () => {
  it('links to privacy and the source, and says when the last report arrived', () => {
    const { getByRole } = render(
      <SiteFooter
        lastReport={timeLabel('2 h ago')}
        sourceHref="https://github.com/bobbyhelco/testpulse"
      />,
    );
    const footer = getByRole('contentinfo');

    expect(within(footer).getByRole('link', { name: 'Privacy' }).getAttribute('href')).toBe(
      '/privacy',
    );
    expect(
      within(footer).getByRole('link', { name: 'Source on GitHub' }).getAttribute('href'),
    ).toBe('https://github.com/bobbyhelco/testpulse');
    expect(footer.textContent).toContain('Last report received 2 h ago');
    expect(footer.querySelector('time')?.getAttribute('title')).toBe('5 Oct 2026, 11:56 UTC');
  });

  it('leaves out the last report before any project has reported', () => {
    const { getByRole } = render(<SiteFooter sourceHref="https://github.com/bhelco1/testpulse" />);
    const footer = getByRole('contentinfo');

    expect(footer.textContent).not.toContain('Last report received');
    expect(within(footer).getAllByRole('link')).toHaveLength(2);
  });
});
