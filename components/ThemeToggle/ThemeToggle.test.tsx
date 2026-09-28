// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { THEME_STORAGE_KEY, THEME_SWITCHING_MS } from '../../lib/design/theme';
import { ThemeToggle } from './ThemeToggle';

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-theme-switching');
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const switching = () => document.documentElement.hasAttribute('data-theme-switching');

describe('ThemeToggle', () => {
  it('offers light while the page is dark, the default', () => {
    const { getByRole } = render(<ThemeToggle />);
    const button = getByRole('button', { name: 'Switch to light theme' });
    expect(button.querySelector('[data-part="glyph"]')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders the dark default on the server, where no theme has been applied', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    expect(renderToString(<ThemeToggle />)).toContain('aria-label="Switch to light theme"');
  });

  it('reads the theme the head script already applied', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    const { getByRole } = render(<ThemeToggle />);
    expect(getByRole('button', { name: 'Switch to dark theme' })).toBeTruthy();
  });

  it('switches the page theme, stores the choice and updates its own label', () => {
    const { getByRole } = render(<ThemeToggle />);

    fireEvent.click(getByRole('button', { name: 'Switch to light theme' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');

    fireEvent.click(getByRole('button', { name: 'Switch to dark theme' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(getByRole('button', { name: 'Switch to light theme' })).toBeTruthy();
  });

  it('still switches when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const { getByRole } = render(<ThemeToggle />);

    fireEvent.click(getByRole('button', { name: 'Switch to light theme' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(getByRole('button', { name: 'Switch to dark theme' })).toBeTruthy();
  });

  it('keeps two toggles on one page in step', () => {
    const { getAllByRole } = render(
      <>
        <ThemeToggle />
        <ThemeToggle />
      </>,
    );
    fireEvent.click(getAllByRole('button')[0]!);
    expect(getAllByRole('button', { name: 'Switch to dark theme' })).toHaveLength(2);
  });

  it('marks the page as switching for the transition window only', () => {
    vi.useFakeTimers();
    const { getByRole } = render(<ThemeToggle />);
    expect(switching()).toBe(false);

    fireEvent.click(getByRole('button', { name: 'Switch to light theme' }));
    expect(switching()).toBe(true);
    vi.advanceTimersByTime(THEME_SWITCHING_MS - 1);
    expect(switching()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(switching()).toBe(false);
  });

  it('restarts the window when the theme is switched again inside it', () => {
    vi.useFakeTimers();
    const { getByRole } = render(<ThemeToggle />);

    fireEvent.click(getByRole('button', { name: 'Switch to light theme' }));
    vi.advanceTimersByTime(150);
    fireEvent.click(getByRole('button', { name: 'Switch to dark theme' }));
    vi.advanceTimersByTime(150);
    expect(switching()).toBe(true);
    vi.advanceTimersByTime(THEME_SWITCHING_MS - 150);
    expect(switching()).toBe(false);
  });
});
