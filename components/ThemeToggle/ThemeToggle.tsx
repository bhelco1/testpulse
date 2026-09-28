'use client';

import { useSyncExternalStore } from 'react';

import type { Theme } from '../../lib/design/contrast';
import { THEME_STORAGE_KEY, THEME_SWITCHING_MS } from '../../lib/design/theme';
import styles from './ThemeToggle.module.css';

// The theme lives on <html data-theme>, set before paint by the layout's head script. Only this
// toggle changes it afterwards, so it notifies its own subscribers instead of observing the DOM.
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

// Dark is the default and what the server renders.
function serverTheme(): Theme {
  return 'dark';
}

let switchingTimer: ReturnType<typeof setTimeout> | undefined;

// The switching flag goes on before the theme changes, so the colour change itself transitions.
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.setAttribute('data-theme-switching', '');
  root.setAttribute('data-theme', theme);
  clearTimeout(switchingTimer);
  switchingTimer = setTimeout(
    () => root.removeAttribute('data-theme-switching'),
    THEME_SWITCHING_MS,
  );
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can be blocked; the choice then lasts for this page only.
  }
  listeners.forEach((listener) => listener());
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, serverTheme);
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className={styles.toggle}
      aria-label={`Switch to ${next} theme`}
      onClick={() => applyTheme(next)}
    >
      <span className={styles.glyph} data-part="glyph" aria-hidden="true" />
    </button>
  );
}
