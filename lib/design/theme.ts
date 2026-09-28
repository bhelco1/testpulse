import type { Theme } from './contrast';

export const THEME_STORAGE_KEY = 'testpulse-theme';

// How long html[data-theme-switching] stays set after a toggle. tokens.css transitions colours
// over --motion-base only while it is set, so hover and other transitions are left alone.
export const THEME_SWITCHING_MS = 200;

// A stored choice wins; with none, the system preference decides; dark is the default.
export function resolveTheme(stored: string | null, prefersLight: boolean): Theme {
  if (stored === 'light' || stored === 'dark') return stored;
  return prefersLight ? 'light' : 'dark';
}

// Inlined in <head> so the theme is set before first paint. It embeds resolveTheme's own source
// so the rule has one definition, and it guards storage and matchMedia because either can throw
// or be missing (private windows, blocked site data, old browsers).
export const themeInitScript =
  '(function(){' +
  `var resolve=${resolveTheme.toString()};` +
  'var stored=null;' +
  `try{stored=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})}catch(e){}` +
  'var prefersLight=false;' +
  "try{prefersLight=window.matchMedia('(prefers-color-scheme: light)').matches}catch(e){}" +
  "document.documentElement.setAttribute('data-theme',resolve(stored,prefersLight))" +
  '})()';
