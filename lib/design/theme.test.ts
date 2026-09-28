import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseThemeTokens } from './contrast';
import { resolveTheme, THEME_STORAGE_KEY, THEME_SWITCHING_MS, themeInitScript } from './theme';

describe('THEME_SWITCHING_MS', () => {
  it('keeps html[data-theme-switching] set for the --motion-base transition tokens.css runs', () => {
    const tokens = readFileSync(join(import.meta.dirname, '../../design/tokens.css'), 'utf8');
    expect(parseThemeTokens(tokens).dark.get('--motion-base')).toBe(`${THEME_SWITCHING_MS}ms`);
    expect(THEME_SWITCHING_MS).toBe(200);
  });
});

describe('resolveTheme', () => {
  it('uses a stored choice over the media preference', () => {
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('dark', true)).toBe('dark');
  });

  it('follows prefers-color-scheme when nothing is stored', () => {
    expect(resolveTheme(null, true)).toBe('light');
    expect(resolveTheme(null, false)).toBe('dark');
  });

  it('ignores a stored value that is not a theme', () => {
    expect(resolveTheme('sepia', true)).toBe('light');
    expect(resolveTheme('', false)).toBe('dark');
  });
});

interface ScriptEnv {
  stored?: string | null;
  storageThrows?: boolean;
  prefersLight?: boolean;
  noMatchMedia?: boolean;
}

// Runs the exact string the layout inlines, against stand-ins for the browser globals it reads.
function runInitScript(env: ScriptEnv): string | null {
  const attributes = new Map<string, string>();
  const document = {
    documentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value) },
  };
  const localStorage = {
    getItem: (key: string) => {
      if (env.storageThrows) throw new Error('SecurityError');
      return key === THEME_STORAGE_KEY ? (env.stored ?? null) : null;
    },
  };
  const window = env.noMatchMedia
    ? {}
    : {
        matchMedia: (query: string) => ({
          matches: query === '(prefers-color-scheme: light)' && env.prefersLight === true,
        }),
      };
  new Function('window', 'document', 'localStorage', themeInitScript)(
    window,
    document,
    localStorage,
  );
  return attributes.get('data-theme') ?? null;
}

describe('themeInitScript', () => {
  it('applies a stored light choice before paint', () => {
    expect(runInitScript({ stored: 'light', prefersLight: false })).toBe('light');
  });

  it('keeps a stored dark choice even when the system prefers light', () => {
    expect(runInitScript({ stored: 'dark', prefersLight: true })).toBe('dark');
  });

  it('follows the system preference when nothing is stored', () => {
    expect(runInitScript({ prefersLight: true })).toBe('light');
    expect(runInitScript({ prefersLight: false })).toBe('dark');
  });

  it('falls back to the system preference when storage is blocked', () => {
    expect(runInitScript({ storageThrows: true, prefersLight: true })).toBe('light');
  });

  it('stays dark when matchMedia is unavailable', () => {
    expect(runInitScript({ noMatchMedia: true })).toBe('dark');
  });
});
