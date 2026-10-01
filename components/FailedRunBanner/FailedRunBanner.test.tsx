// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, fireEvent, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RunFilterProvider, useRunFilterRequest } from '../RunResults/RunFilter';
import { ruleFor } from '../testing/stylesheet';
import { FailedRunBanner } from './FailedRunBanner';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'FailedRunBanner.module.css');

const BANNER = {
  title: '2 failed, 1 errored',
  body: 'In shared. On jvm.',
  action: 'Show failures',
  filter: 'failed',
} as const;

function Requests() {
  const request = useRunFilterRequest();
  return <output data-part="request">{request ? `${request.status} ${request.seq}` : ''}</output>;
}

// components.md, Run page, and the Design System's failed-run banners (section 10).
describe('FailedRunBanner', () => {
  it('is a fail Notice with the x-circle, its head and its sub-line', () => {
    const { container } = render(<FailedRunBanner banner={BANNER} />);
    const notice = container.querySelector<HTMLElement>('[data-tone]');
    expect(notice?.dataset.tone).toBe('fail');
    expect(notice?.querySelector('[data-part="title"]')?.textContent).toBe('2 failed, 1 errored');
    expect(notice?.querySelector('[data-part="body"]')?.textContent).toBe('In shared. On jvm.');
    expect(notice?.querySelector('svg')?.getAttribute('width')).toBe('18');
  });

  // Without JavaScript the link still jumps to Results, where failures are open.
  it('links its action to #results, so it works without JavaScript', () => {
    const html = renderToStaticMarkup(<FailedRunBanner banner={BANNER} />);
    expect(html).toContain('href="#results"');
    expect(html).toContain('>Show failures</a>');
  });

  it('asks the results table for its filter, and scrolls to Results', () => {
    const results = document.createElement('section');
    results.id = 'results';
    results.scrollIntoView = vi.fn();
    document.body.append(results);
    const { getByRole, container } = render(
      <RunFilterProvider>
        <FailedRunBanner banner={{ ...BANNER, filter: 'error' }} />
        <Requests />
      </RunFilterProvider>,
    );
    const request = () => container.querySelector('[data-part="request"]')?.textContent;
    expect(request()).toBe('');
    const event = fireEvent.click(getByRole('link', { name: 'Show failures' }));
    expect(event).toBe(false);
    expect(request()).toBe('error 1');
    expect(results.scrollIntoView).toHaveBeenCalledTimes(1);
    fireEvent.click(getByRole('link', { name: 'Show failures' }));
    expect(request()).toBe('error 2');
    results.remove();
  });

  it('draws the action as the design does: 44 px, 1 px --fail, 15/600, no underline', () => {
    expect(ruleFor(CSS, '.action')).toEqual({
      flex: '0 0 auto',
      'align-self': 'center',
      'min-height': '44px',
      display: 'flex',
      'align-items': 'center',
      padding: '0px 16px',
      'border-radius': 'var(--radius-sm)',
      border: '1px solid var(--fail)',
      color: 'var(--fail)',
      'font-size': '15px',
      'font-weight': '600',
      'text-decoration': 'none',
    });
  });
});
