// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ruleFor } from '../testing/stylesheet';
import { AdminHeader } from './AdminHeader';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'AdminHeader.module.css');

// design/components.md, Admin: the same header as the site, with the ADMIN tag; "Signed in with
// magic link", View public site and Sign out when signed in; the theme toggle top right.
describe('AdminHeader', () => {
  it('puts a skip link to the main content first in tab order', () => {
    const { container } = render(<AdminHeader signOut={undefined} />);
    const first = container.querySelector('a, button');
    expect(first?.textContent).toBe('Skip to content');
    expect(first?.getAttribute('href')).toBe('#main');
  });

  it('signed out: the wordmark with its ADMIN tag, View public site and the theme toggle only', () => {
    const { getByRole } = render(<AdminHeader signOut={undefined} />);
    const banner = getByRole('banner');

    expect(within(banner).getByRole('link', { name: 'testpulse' }).getAttribute('href')).toBe(
      '/admin',
    );
    expect(within(banner).getByText('ADMIN')).toBeTruthy();
    const nav = within(banner).getByRole('navigation', { name: 'Admin' });
    expect(within(nav).getByRole('link', { name: 'View public site' }).getAttribute('href')).toBe(
      '/',
    );
    expect(within(banner).queryByText('Signed in with magic link')).toBeNull();
    expect(within(banner).queryByRole('button', { name: 'Sign out' })).toBeNull();
    expect(within(banner).getByRole('button', { name: 'Switch to light theme' })).toBeTruthy();
  });

  it('signed in: says how, and signs out with a POST of its own form', () => {
    const signOut = vi.fn(async () => undefined);
    const { getByRole } = render(<AdminHeader signOut={signOut} />);
    const nav = within(getByRole('banner')).getByRole('navigation', { name: 'Admin' });

    expect(within(nav).getByText('Signed in with magic link')).toBeTruthy();
    const button = within(nav).getByRole('button', { name: 'Sign out' });
    expect(button.getAttribute('type')).toBe('submit');
    expect(button.closest('form')).not.toBeNull();
  });

  // v18 item 13: below a content width of 760 px, two rows: the wordmark, ADMIN and the toggle,
  // then View public site (left, padding 0) and Sign out (right). "Signed in with magic link" is
  // not shown there, since Sign out already says so.
  it('lays itself out in two rows on a phone, without the sign-in method', () => {
    const PHONE = '(width < 760px)';
    expect(ruleFor(CSS, '.header')).toMatchObject({ 'container-type': 'inline-size' });
    expect(ruleFor(CSS, '.nav', PHONE)).toEqual({
      'flex-basis': '100%',
      'justify-content': 'space-between',
    });
    expect(ruleFor(CSS, '.link', PHONE)).toEqual({ padding: '0px' });
    expect(ruleFor(CSS, '.method, .spacer', PHONE)).toEqual({ display: 'none' });
    expect(ruleFor(CSS, '.link')).toMatchObject({ padding: '0px 12px' });
  });

  it('draws the ADMIN tag and the toggle where the design puts them', () => {
    expect(ruleFor(CSS, '.tag')).toMatchObject({
      font: '600 11px var(--font-mono)',
      'letter-spacing': '0.08em',
      padding: '3px 7px',
      'border-radius': '5px',
      background: 'var(--ink)',
      color: 'var(--on-ink)',
    });
    expect(ruleFor(CSS, '.controls')).toMatchObject({
      position: 'absolute',
      top: '18px',
      right: '0px',
    });
  });
});
