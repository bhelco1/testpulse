// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { THEME_STORAGE_KEY } from '../../lib/design/theme';
import { ThemeToggle } from '../ThemeToggle/ThemeToggle';
import { ThemeRestore } from './ThemeRestore';

const theme = () => document.documentElement.getAttribute('data-theme');

function systemPrefers(light: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-color-scheme: light)' && light,
  }));
}

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ThemeRestore', () => {
  it('renders nothing on the server', () => {
    expect(renderToString(<ThemeRestore />)).toBe('');
  });

  it('leaves the theme the head script applied as it is', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    systemPrefers(true);
    render(<ThemeRestore />);
    expect(theme()).toBe('dark');
  });

  it('applies a stored choice when no script has set the theme', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    systemPrefers(false);
    render(<ThemeRestore />);
    expect(theme()).toBe('light');
  });

  it('follows the system preference when nothing is stored', () => {
    systemPrefers(true);
    render(<ThemeRestore />);
    expect(theme()).toBe('light');
  });

  it('falls back to the system preference when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    systemPrefers(true);
    render(<ThemeRestore />);
    expect(theme()).toBe('light');
  });

  it('uses the dark default when the browser has no matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);
    render(<ThemeRestore />);
    expect(theme()).toBe('dark');
  });

  it('is applied before the theme toggle settles, so the toggle offers the other theme', async () => {
    systemPrefers(true);
    const { findByRole } = render(
      <>
        <ThemeRestore />
        <ThemeToggle />
      </>,
    );
    expect(await findByRole('button', { name: 'Switch to dark theme' })).toBeTruthy();
  });
});
