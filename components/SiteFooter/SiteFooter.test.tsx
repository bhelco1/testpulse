// @vitest-environment jsdom
import { cleanup, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SiteFooter } from './SiteFooter';

afterEach(cleanup);

describe('SiteFooter', () => {
  it('links to privacy and the source, and says when the last report arrived', () => {
    const { getByRole } = render(
      <SiteFooter
        lastReport="4 minutes ago"
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
    expect(within(footer).getByText('Last report received 4 minutes ago')).toBeTruthy();
  });

  it('leaves out the last report before any project has reported', () => {
    const { getByRole } = render(<SiteFooter sourceHref="https://github.com/bhelco1/testpulse" />);
    const footer = getByRole('contentinfo');

    expect(footer.textContent).not.toContain('Last report received');
    expect(within(footer).getAllByRole('link')).toHaveLength(2);
  });
});
