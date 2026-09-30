// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ruleFor } from '../testing/stylesheet';
import { timeLabel } from '../testing/time';
import { SiteFooter } from './SiteFooter';
import styles from './SiteFooter.module.css';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'SiteFooter.module.css');

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

  it('marks Privacy as the current page in ink on the privacy page, and nothing elsewhere', () => {
    const { getByRole, rerender } = render(
      <SiteFooter sourceHref="https://github.com/bhelco1/testpulse" current="privacy" />,
    );
    const privacy = getByRole('link', { name: 'Privacy' });
    expect(privacy.getAttribute('aria-current')).toBe('page');
    expect(privacy.classList.contains(String(styles.current))).toBe(true);
    expect(getByRole('link', { name: 'Source on GitHub' }).hasAttribute('aria-current')).toBe(
      false,
    );
    // design/pages/Privacy.dc.html draws the current link and its underline in --ink.
    expect(ruleFor(CSS, '.current')).toEqual({
      color: 'var(--ink)',
      'text-decoration-color': 'var(--ink)',
    });

    rerender(<SiteFooter sourceHref="https://github.com/bhelco1/testpulse" />);
    expect(getByRole('link', { name: 'Privacy' }).hasAttribute('aria-current')).toBe(false);
    expect(getByRole('link', { name: 'Privacy' }).classList.contains(String(styles.current))).toBe(
      false,
    );
  });
});
