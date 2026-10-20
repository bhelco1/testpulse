'use client';

import { useLayoutEffect } from 'react';

import { resolveTheme, THEME_STORAGE_KEY } from '../../lib/design/theme';

// Next.js 16 serves a page's notFound() as an empty error shell and builds the page in the
// browser (spec section 13.10). React creates <html> itself there, and a script React creates
// never runs, so the layout's head script cannot set the theme. This sets it before paint on
// such a page; wherever the head script ran, data-theme is already there and this does nothing.
export function ThemeRestore() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (root.hasAttribute('data-theme')) return;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      // Storage can be blocked; the system preference decides then, as in the head script.
    }
    let prefersLight = false;
    try {
      prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    } catch {
      // No matchMedia: the dark default.
    }
    root.setAttribute('data-theme', resolveTheme(stored, prefersLight));
  }, []);
  return null;
}
