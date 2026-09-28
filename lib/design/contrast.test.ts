import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  checkContrast,
  CONTRAST_AA_GRAPHIC,
  CONTRAST_AA_TEXT,
  contrastRatio,
  evaluatePairs,
  formatRatio,
  parseThemeTokens,
  type PairKind,
  REQUIRED_PAIRS,
  type Theme,
  type ThemeReport,
} from './contrast';

const designDir = fileURLToPath(new URL('../../design/', import.meta.url));
const tokensCss = readFileSync(`${designDir}tokens.css`, 'utf8');
const contrastTable = readFileSync(`${designDir}contrast.md`, 'utf8');

const LIGHT_SELECTOR = '[data-theme="light"] {';

// Edits one declaration inside a single rule block of the real tokens.css, and fails loudly if
// the text it expects is not there, so a changed bundle cannot turn these tests into no-ops.
function editBlock(
  css: string,
  selector: ':root {' | typeof LIGHT_SELECTOR,
  from: string,
  to: string,
) {
  const start = css.lastIndexOf(`\n${selector}`);
  expect(start, `${selector} block`).toBeGreaterThan(-1);
  const end = css.indexOf('\n}', start);
  const block = css.slice(start, end);
  expect(block, `${selector} block contains ${from}`).toContain(from);
  return css.slice(0, start) + block.replace(from, to) + css.slice(end);
}

const reportFor = (reports: readonly ThemeReport[], theme: Theme): ThemeReport => {
  const report = reports.find((entry) => entry.theme === theme);
  expect(report, `${theme} report`).toBeDefined();
  // Guarded by the expect above; vitest throws before this line if it is missing.
  return report as ThemeReport;
};

// contrast.md marks a graphic pair with a (graphic) suffix, so --pass on --surface can be required
// once as text and once as a graphic.
const pairKey = (foreground: string, background: string, kind: PairKind = 'text'): string =>
  `${foreground}${kind === 'graphic' ? ' (graphic)' : ''} on ${background}`;

describe('contrastRatio', () => {
  it('is 21:1 for black on white, in either order', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 10);
  });

  it('is 1:1 for identical colours', () => {
    expect(contrastRatio('#1a1917', '#1a1917')).toBe(1);
  });

  it('rejects a colour that is not a 6-digit hex', () => {
    expect(() => contrastRatio('#fff', '#000000')).toThrow(/Not a 6-digit hex colour: #fff/);
  });

  // W3C ACT rule afw4f7 "Text has minimum contrast": Passed Example 1 states #333 on #FFF is
  // 12.6:1 and Failed Example 1 states #AAA on white is 2.3:1.
  it('matches the published W3C ACT rule examples', () => {
    expect(contrastRatio('#333333', '#ffffff').toFixed(1)).toBe('12.6');
    expect(contrastRatio('#aaaaaa', '#ffffff').toFixed(1)).toBe('2.3');
  });
});

describe('parseThemeTokens', () => {
  it('reads the dark tokens from :root and the light overrides from the light rule', () => {
    const { dark, light } = parseThemeTokens(tokensCss);
    expect(dark.get('--bg')).toBe('#121110');
    expect(light.get('--bg')).toBe('#f6f4f0');
    expect(dark.get('--pass')).toBe('#7fd79a');
    expect(light.get('--pass')).toBe('#197339');
  });

  it('lets the light theme inherit tokens it does not override', () => {
    const { light } = parseThemeTokens(tokensCss);
    expect(light.get('--space-1')).toBe('4px');

    const withoutLightOnInk = editBlock(tokensCss, LIGHT_SELECTOR, ' --on-ink: #f6f4f0;', '');
    expect(parseThemeTokens(withoutLightOnInk).light.get('--on-ink')).toBe('#121110');
  });

  it('ignores a light selector written inside a comment', () => {
    // The real header comment already names [data-theme="light"]; this adds a full fake rule in
    // a comment ahead of both real blocks to prove comments never supply tokens.
    const trapped = `/* [data-theme="light"] { --bg: #000000; } :root { --bg: #000000; } */\n${tokensCss}`;
    const { dark, light } = parseThemeTokens(trapped);
    expect(dark.get('--bg')).toBe('#121110');
    expect(light.get('--bg')).toBe('#f6f4f0');
  });

  it('ignores a lookalike selector nested inside an at-rule', () => {
    // tokens.css already nests html[data-theme-switching] * inside @media; this nests rules that
    // look exactly like the theme rules, ahead of the real ones, to prove only top-level rules
    // supply tokens.
    const nested =
      '@media (prefers-reduced-motion: no-preference) {\n' +
      '  :root { --bg: #000000; }\n' +
      '  [data-theme="light"] { --bg: #000000; }\n' +
      '}\n';
    const { dark, light } = parseThemeTokens(nested + tokensCss);
    expect(dark.get('--bg')).toBe('#121110');
    expect(light.get('--bg')).toBe('#f6f4f0');
    expect(() => parseThemeTokens(nested)).toThrow(/No :root rule/);
  });

  it('throws when a theme rule is missing', () => {
    const withoutLight = tokensCss.replace(LIGHT_SELECTOR, '[data-theme="sepia"] {');
    expect(() => parseThemeTokens(withoutLight)).toThrow(/data-theme="light"/);
  });
});

describe('evaluatePairs', () => {
  it('reports a missing token as a failure, not a skip', () => {
    const tokens = new Map([['--bg', '#121110']]);
    const [result] = evaluatePairs(tokens, [
      { foreground: '--ink', background: '--bg', kind: 'text' },
    ]);
    expect(result).toMatchObject({
      foreground: '--ink',
      background: '--bg',
      ratio: null,
      passes: false,
    });
    expect(result?.problem).toMatch(/--ink is missing/);
  });

  it('reports a token that is not a 6-digit hex as a failure', () => {
    const tokens = new Map([
      ['--ink', '#fff'],
      ['--bg', '#121110'],
    ]);
    const [result] = evaluatePairs(tokens, [
      { foreground: '--ink', background: '--bg', kind: 'text' },
    ]);
    expect(result).toMatchObject({ ratio: null, passes: false });
    expect(result?.problem).toMatch(/--ink is not a 6-digit hex colour: #fff/);
  });

  it('fails a pair below 4.5:1 and passes one at or above it', () => {
    const tokens = new Map([
      ['--grey', '#777777'],
      ['--dark', '#767676'],
      ['--white', '#ffffff'],
    ]);
    const results = evaluatePairs(tokens, [
      { foreground: '--grey', background: '--white', kind: 'text' },
      { foreground: '--dark', background: '--white', kind: 'text' },
    ]);
    expect(results.map((result) => result.passes)).toEqual([false, true]);
    expect(results.map((result) => result.required)).toEqual([4.5, 4.5]);
  });

  // WCAG 2.x SC 1.4.11 asks 3:1 of graphical objects; SC 1.4.3 asks 4.5:1 of normal text.
  it('judges a graphic pair at 3:1 and the same colours as text at 4.5:1', () => {
    const tokens = new Map([
      ['--mid', '#909090'],
      ['--white', '#ffffff'],
    ]);
    const [graphic, text] = evaluatePairs(tokens, [
      { foreground: '--mid', background: '--white', kind: 'graphic' },
      { foreground: '--mid', background: '--white', kind: 'text' },
    ]);
    expect(formatRatio(graphic?.ratio ?? 0)).toBe('3.19');
    expect(graphic).toMatchObject({ required: CONTRAST_AA_GRAPHIC, passes: true });
    expect(text).toMatchObject({ required: CONTRAST_AA_TEXT, passes: false });
  });

  it('fails a graphic pair below 3:1 even when it rounds to 3.00', () => {
    const tokens = new Map([
      ['--pale', '#959595'],
      ['--white', '#ffffff'],
    ]);
    const [result] = evaluatePairs(tokens, [
      { foreground: '--pale', background: '--white', kind: 'graphic' },
    ]);
    expect(formatRatio(result?.ratio ?? 0)).toBe('3.00');
    expect(result).toMatchObject({ required: 3, passes: false });
  });
});

describe('REQUIRED_PAIRS', () => {
  const keysOf = (kind: PairKind): string[] =>
    REQUIRED_PAIRS.filter((pair) => pair.kind === kind).map((pair) =>
      pairKey(pair.foreground, pair.background, pair.kind),
    );

  it('lists the 37 text pairs the design must meet, once each', () => {
    const keys = keysOf('text');
    expect(keys).toHaveLength(37);
    expect(new Set(keys).size).toBe(37);
    expect(keys).toContain('--on-ink on --ink');
    expect(keys).toContain('--ink-2 on --fail-tint');
    expect(keys).toContain('--attn on --attn-tint');
    expect(keys).toContain('--ink-3 on --pass-tint');
    expect(keys).toContain('--ink-3 on --fail-tint');
    expect(keys).toContain('--on-ink on --fail');
    expect(keys).not.toContain('--pass on --fail-tint');
  });

  it('lists the 3 graphic pairs the design must meet', () => {
    expect(keysOf('graphic')).toEqual([
      '--attn (graphic) on --surface',
      '--layer-4 (graphic) on --surface',
      '--pass (graphic) on --surface',
    ]);
    expect(REQUIRED_PAIRS).toHaveLength(40);
  });
});

describe('checkContrast on the committed design/tokens.css', () => {
  const reports = checkContrast(tokensCss);

  it.each<Theme>(['dark', 'light'])('passes every required pair in the %s theme', (theme) => {
    const report = reportFor(reports, theme);
    expect(report.results).toHaveLength(REQUIRED_PAIRS.length);
    expect(report.failures).toEqual([]);
  });

  it('names the lowest text pair and the lowest graphic pair in each theme', () => {
    const dark = reportFor(reports, 'dark');
    const light = reportFor(reports, 'light');
    expect(dark.lowest.text).toMatchObject({ foreground: '--ink-3', background: '--pass-tint' });
    expect(light.lowest.text).toMatchObject({ foreground: '--pass', background: '--raised' });
    for (const report of [dark, light]) {
      expect(report.lowest.graphic).toMatchObject({
        foreground: '--layer-4',
        background: '--surface',
        kind: 'graphic',
      });
    }
  });

  it('catches the v1 light --pass, which was 4.41:1 on --raised', () => {
    const v1 = editBlock(tokensCss, LIGHT_SELECTOR, '--pass: #197339;', '--pass: #1b7a3d;');
    const light = reportFor(checkContrast(v1), 'light');
    expect(light.failures).toHaveLength(1);
    const [failure] = light.failures;
    expect(failure).toMatchObject({ foreground: '--pass', background: '--raised', passes: false });
    expect(formatRatio(failure?.ratio ?? 0)).toBe('4.41');
    expect(reportFor(checkContrast(v1), 'dark').failures).toEqual([]);
  });

  it('fails a theme whose token is missing', () => {
    const withoutDarkInk3 = editBlock(tokensCss, ':root {', '--ink-3: #a8a298;', '');
    const reportsWithout = checkContrast(withoutDarkInk3);
    const darkFailures = reportFor(reportsWithout, 'dark').failures;
    expect(
      darkFailures.map((failure) => pairKey(failure.foreground, failure.background)).sort(),
    ).toEqual(
      [
        '--ink-3 on --bg',
        '--ink-3 on --surface',
        '--ink-3 on --inset',
        '--ink-3 on --raised',
        '--ink-3 on --pass-tint',
        '--ink-3 on --fail-tint',
      ].sort(),
    );
    expect(reportFor(reportsWithout, 'light').failures).toEqual([]);
  });
});

describe('design/contrast.md', () => {
  // The table is generated by Claude Design; this keeps it and the scripted check in agreement.
  const SECTION_HEADINGS: Record<Theme, string> = { dark: 'Dark', light: 'Light' };

  interface TableRow {
    readonly ratio: string;
    readonly required: string;
  }

  const tableRows = (theme: Theme): Map<string, TableRow> => {
    const heading = SECTION_HEADINGS[theme];
    const section = contrastTable.split(/^## /m).find((part) => part.startsWith(`${heading}\n`));
    expect(section, `## ${heading} section`).toBeDefined();
    const rows = new Map<string, TableRow>();
    for (const match of (section ?? '').matchAll(
      /^\| (--[\w-]+)( \(graphic\))? \| (--[\w-]+) \| ([\d.]+):1 \| ([\d.]+):1 \|$/gm,
    )) {
      const [, foreground, graphic, background, ratio, required] = match;
      const key = pairKey(foreground ?? '', background ?? '', graphic ? 'graphic' : 'text');
      expect(rows.has(key), `${key} listed once`).toBe(false);
      rows.set(key, { ratio: ratio ?? '', required: required ?? '' });
    }
    return rows;
  };

  const reports = checkContrast(tokensCss);

  it.each<Theme>(['dark', 'light'])('lists 37 text and 3 graphic pairs for %s', (theme) => {
    const rows = [...tableRows(theme).keys()];
    expect(rows.filter((key) => key.includes(' (graphic) '))).toHaveLength(3);
    expect(rows.filter((key) => !key.includes(' (graphic) '))).toHaveLength(37);
  });

  it.each<Theme>(['dark', 'light'])('lists exactly the required pairs for %s', (theme) => {
    const required = REQUIRED_PAIRS.map((pair) =>
      pairKey(pair.foreground, pair.background, pair.kind),
    );
    expect([...tableRows(theme).keys()].sort()).toEqual([...required].sort());
  });

  it.each<Theme>(['dark', 'light'])(
    'states the computed %s ratios to 2 dp and the same thresholds',
    (theme) => {
      const computed = new Map(
        reportFor(reports, theme).results.map((result) => [
          pairKey(result.foreground, result.background, result.kind),
          { ratio: formatRatio(result.ratio ?? 0), required: String(result.required) },
        ]),
      );
      expect(Object.fromEntries(tableRows(theme))).toEqual(Object.fromEntries(computed));
    },
  );
});
