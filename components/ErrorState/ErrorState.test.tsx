// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ruleFor } from '../testing/stylesheet';
import { ErrorState } from './ErrorState';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'ErrorState.module.css');

const PAGE = {
  title: 'Results couldn’t be loaded',
  message:
    'The database didn’t respond. Nothing is shown rather than numbers that might be out of date.',
};
const INLINE = {
  title: 'Chart couldn’t be loaded',
  message: 'The rest of the page is still current.',
};

function errorIconOf(svg: Element | null | undefined) {
  expect(svg?.getAttribute('aria-hidden')).toBe('true');
  expect(svg?.querySelector('circle')?.getAttribute('r')).toBe('10');
  expect(svg?.querySelector('path')?.getAttribute('d')).toBe('M12 7v6M12 17h.01');
}

describe('ErrorState, page variant', () => {
  it('announces the error with the Error status pill, a headline and the explanation', () => {
    const { getByRole } = render(<ErrorState variant="page" {...PAGE} retryHref="/" />);
    const alert = getByRole('alert');

    expect(alert.dataset.variant).toBe('page');
    const pill = within(alert).getByText('Error');
    expect(pill.dataset.status).toBe('error');
    expect(pill.dataset.variant).toBe('pill');
    errorIconOf(pill.querySelector('svg'));
    expect(within(alert).getByRole('heading', { level: 1 }).textContent).toBe(PAGE.title);
    expect(within(alert).getByText(PAGE.message).tagName).toBe('P');
  });

  // Design v9 item 7: the page variant is rendered by the server (HTTP 503), so "Try again" is
  // the primary Button's link form to the same URL and works without JavaScript.
  it('retries with a primary "Try again" link to the same URL and offers how it’s tested', () => {
    const { getByRole, queryByRole } = render(
      <ErrorState variant="page" {...PAGE} retryHref="/p/ostomate2?branches=all" />,
    );
    const retry = getByRole('link', { name: 'Try again' });

    expect(retry.getAttribute('href')).toBe('/p/ostomate2?branches=all');
    expect(retry.dataset.variant).toBe('primary');
    expect(queryByRole('button')).toBeNull();
    expect(getByRole('link', { name: 'How it’s tested' }).getAttribute('href')).toBe(
      '/how-its-tested',
    );
  });

  it('sets the headline serif clamp(34 to 48) over a serif 19 body', () => {
    expect(ruleFor(CSS, '.title')).toMatchObject({
      margin: 'var(--space-4) 0 0',
      font: '500 clamp(34px, 4.5vw, 48px) / 1.1 var(--font-serif)',
    });
    expect(ruleFor(CSS, '.message')).toMatchObject({
      margin: '14px 0px 0px',
      font: '400 19px/1.5 var(--font-serif)',
      color: 'var(--ink-2)',
    });
    expect(ruleFor(CSS, '.actions')).toMatchObject({
      gap: 'var(--space-3)',
      'margin-top': 'var(--space-5)',
    });
    expect(ruleFor(CSS, '.link')).toMatchObject({
      'min-height': 'var(--target-min)',
      padding: '0 var(--space-2)',
      'font-size': '15px',
    });
  });
});

describe('ErrorState, inline variant', () => {
  it('shows the error icon, a title and the explanation, and no page headline or link', () => {
    const { getByRole, queryByRole, getByText } = render(
      <ErrorState variant="inline" {...INLINE} onRetry={() => {}} />,
    );
    const alert = getByRole('alert');

    expect(alert.dataset.variant).toBe('inline');
    const icon = alert.querySelector('svg');
    errorIconOf(icon);
    expect(icon?.getAttribute('width')).toBe('18');
    expect(icon?.getAttribute('stroke-width')).toBe('2.6');
    expect(getByText(INLINE.title)).toBeTruthy();
    expect(getByText(INLINE.message)).toBeTruthy();
    expect(queryByRole('heading')).toBeNull();
    expect(queryByRole('link')).toBeNull();
    expect(within(alert).queryByText('Error')).toBeNull();
  });

  it('retries from a secondary "Try again"', () => {
    const onRetry = vi.fn();
    const { getByRole } = render(<ErrorState variant="inline" {...INLINE} onRetry={onRetry} />);
    const button = getByRole('button', { name: 'Try again' });

    expect(button.dataset.variant).toBe('secondary');
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('is a surface card with a fail-coloured icon, a serif 20 title and a 14px body', () => {
    expect(ruleFor(CSS, '.inline')).toMatchObject({
      display: 'flex',
      gap: 'var(--space-3)',
      'align-items': 'flex-start',
      padding: '22px var(--space-6)',
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      'border-radius': 'var(--radius-xl)',
    });
    expect(ruleFor(CSS, '.inlineIcon')).toMatchObject({
      color: 'var(--fail)',
      'margin-top': '3px',
    });
    expect(ruleFor(CSS, '.inlineTitle')).toEqual({ font: '500 20px var(--font-serif)' });
    expect(ruleFor(CSS, '.inlineMessage')).toEqual({
      'font-size': '14px',
      color: 'var(--ink-2)',
      'margin-top': 'var(--space-1)',
    });
    expect(ruleFor(CSS, '.inlineRetry')).toEqual({ 'margin-top': 'var(--space-3)' });
  });
});
