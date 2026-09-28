// @vitest-environment jsdom
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { SwitcherProject } from '../ProjectSwitcher/ProjectSwitcher';
import { SiteHeader } from './SiteHeader';

beforeEach(() => document.documentElement.removeAttribute('data-theme'));
afterEach(cleanup);

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
    expect(within(nav).getByText('Live')).toBeTruthy();
    expect(within(nav).getByRole('button', { name: 'Switch to light theme' })).toBeTruthy();
  });

  it('shows the disconnected state of the live indicator', () => {
    const { getByText } = render(<SiteHeader projects={PROJECTS} connected={false} />);
    expect(getByText('Offline · reconnecting')).toBeTruthy();
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
