// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ruleFor } from '../testing/stylesheet';

import type { SwitcherProject } from '../ProjectSwitcher/ProjectSwitcher';
import { SiteHeader } from './SiteHeader';

beforeEach(() => document.documentElement.removeAttribute('data-theme'));
afterEach(cleanup);

const CSS = join(import.meta.dirname, 'SiteHeader.module.css');
const LIVE_CSS = join(import.meta.dirname, '../LiveIndicator/LiveIndicator.module.css');
const PHONE = '(max-width: 559px)';

const PROJECTS: SwitcherProject[] = [
  { name: 'Ostomate2', href: '/p/ostomate2', status: 'passed' },
  { name: 'RouteServe', href: '/p/routeserve', status: 'passed' },
];

describe('SiteHeader', () => {
  it('puts a skip link to the main content first in tab order', () => {
    const { container } = render(<SiteHeader projects={PROJECTS} connected />);
    const first = container.querySelector('a, button');
    expect(first?.textContent).toBe('Skip to content');
    expect(first?.getAttribute('href')).toBe('#main');
  });

  it('shows the wordmark, the projects menu, the how-it-is-tested link, live status and theme toggle', () => {
    const { getByRole } = render(<SiteHeader projects={PROJECTS} connected />);
    const banner = getByRole('banner');

    const wordmark = within(banner).getByRole('link', { name: 'testpulse' });
    expect(wordmark.getAttribute('href')).toBe('/');
    expect(wordmark.querySelector('[data-part="mark"]')?.getAttribute('aria-hidden')).toBe('true');

    const nav = within(banner).getByRole('navigation', { name: 'Site' });
    expect(within(nav).getByRole('button', { name: 'Projects' })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: 'How it’s tested' }).getAttribute('href')).toBe(
      '/how-its-tested',
    );
    // Live and the theme toggle sit beside the nav, not in it: on a phone they share the
    // wordmark's row and the nav takes the next (design v8 item 37, PHONE HEADER · 390).
    const controls = banner.querySelector<HTMLElement>('[data-part="controls"]');
    expect(within(controls as HTMLElement).getByText('Live')).toBeTruthy();
    expect(
      within(controls as HTMLElement).getByRole('button', { name: 'Switch to light theme' }),
    ).toBeTruthy();
    expect(within(nav).queryByText('Live')).toBeNull();
  });

  it('keeps the tab order wordmark, Projects, How it’s tested, theme toggle', () => {
    const { getByRole } = render(<SiteHeader projects={PROJECTS} connected />);
    // The closed project list is hidden, so its links are not in the tab order.
    const focusable = [...getByRole('banner').querySelectorAll('a, button')]
      .filter((element) => !element.closest('[hidden]'))
      .map((element) => element.textContent?.trim() || element.getAttribute('aria-label'));
    expect(focusable).toEqual([
      'testpulse',
      'Projects',
      'How it’s tested',
      'Switch to light theme',
    ]);
  });

  it('below 560 px lays out two rows: wordmark with Live and the toggle, then the nav', () => {
    expect(ruleFor(CSS, '.header', PHONE)).toMatchObject({
      display: 'grid',
      'grid-template-columns': 'minmax(0, 1fr) auto',
      'grid-template-areas': "'mark controls' 'nav nav'",
      gap: '4px 8px',
      padding: '12px 0px',
    });
    expect(ruleFor(CSS, '.wordmark', PHONE)).toMatchObject({
      'grid-area': 'mark',
      'font-size': '22px',
    });
    expect(ruleFor(CSS, '.controls', PHONE)).toMatchObject({
      'grid-area': 'controls',
      gap: 'var(--space-1)',
    });
    expect(ruleFor(CSS, '.nav', PHONE)).toMatchObject({ 'grid-area': 'nav' });
    expect(ruleFor(LIVE_CSS, '.indicator', PHONE)).toEqual({ padding: '0px 8px' });
  });

  it('shows the disconnected state of the live indicator', () => {
    const { getByText } = render(<SiteHeader projects={PROJECTS} connected={false} />);
    expect(getByText('Offline · reconnecting')).toBeTruthy();
  });

  // The project page renders before realtime reaches it (Phase 5 PR 8): claiming "Live" or
  // "Offline · reconnecting" would both be untrue, so the indicator waits for a connection.
  it('has no live indicator when no connection state is given', () => {
    const { getByRole } = render(<SiteHeader projects={PROJECTS} />);
    const banner = getByRole('banner');

    expect(within(banner).queryByText('Live')).toBeNull();
    expect(within(banner).queryByText('Offline · reconnecting')).toBeNull();
    expect(banner.querySelector('[data-part="dot"]')).toBeNull();
    expect(within(banner).getByRole('button', { name: 'Switch to light theme' })).toBeTruthy();
  });

  it('marks the current page on the matching link only', () => {
    const { getByRole, rerender } = render(
      <SiteHeader projects={PROJECTS} connected current="home" />,
    );
    expect(getByRole('link', { name: 'testpulse' }).getAttribute('aria-current')).toBe('page');
    expect(getByRole('link', { name: 'How it’s tested' }).hasAttribute('aria-current')).toBe(false);

    rerender(<SiteHeader projects={PROJECTS} connected current="how-its-tested" />);
    expect(getByRole('link', { name: 'testpulse' }).hasAttribute('aria-current')).toBe(false);
    expect(getByRole('link', { name: 'How it’s tested' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  // design/pages/How Its Tested.dc.html: the current nav link is underlined in --ink, 6 px below.
  it('underlines the current nav link, and only it', () => {
    expect(ruleFor(CSS, '.link')).toMatchObject({ 'text-decoration': 'none' });
    expect(ruleFor(CSS, ".link[aria-current='page']")).toEqual({
      'text-decoration': 'underline',
      'text-decoration-color': 'var(--ink)',
      'text-underline-offset': '6px',
    });
  });

  it('opens the project menu in place (menu open state)', () => {
    const { getByRole } = render(<SiteHeader projects={PROJECTS} connected />);
    const button = getByRole('button', { name: 'Projects' });
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(getByRole('link', { name: /Ostomate2/ }).getAttribute('href')).toBe('/p/ostomate2');
  });

  it('tells the project switcher which project page is showing', () => {
    const { getByRole } = render(
      <SiteHeader projects={PROJECTS} connected currentProject="/p/routeserve" />,
    );
    fireEvent.click(getByRole('button', { name: 'Projects' }));
    expect(getByRole('link', { name: /RouteServe/ }).getAttribute('aria-current')).toBe('page');
    expect(getByRole('link', { name: /Ostomate2/ }).hasAttribute('aria-current')).toBe(false);
  });
});
