export type Theme = 'dark' | 'light';

export type PairKind = 'text' | 'graphic';

export interface TokenPair {
  readonly foreground: string;
  readonly background: string;
  readonly kind: PairKind;
}

export interface PairResult extends TokenPair {
  readonly required: number;
  readonly ratio: number | null;
  readonly passes: boolean;
  readonly problem?: string;
}

export interface ThemeReport {
  readonly theme: Theme;
  readonly results: readonly PairResult[];
  readonly failures: readonly PairResult[];
  readonly lowest: Readonly<Record<PairKind, PairResult | undefined>>;
}

// WCAG 2.x SC 1.4.3 minimum for normal-size text.
export const CONTRAST_AA_TEXT = 4.5;
// WCAG 2.x SC 1.4.11 minimum for graphical objects and UI component boundaries.
export const CONTRAST_AA_GRAPHIC = 3;

const REQUIRED_RATIO: Record<PairKind, number> = {
  text: CONTRAST_AA_TEXT,
  graphic: CONTRAST_AA_GRAPHIC,
};

const SURFACES = ['--bg', '--surface', '--inset', '--raised'] as const;
const INKS = ['--ink', '--ink-2', '--ink-3'] as const;
const STATUSES = ['--pass', '--fail', '--attn', '--neutral'] as const;

const text = (foreground: string, background: string): TokenPair => ({
  foreground,
  background,
  kind: 'text',
});
const graphic = (foreground: string, background: string): TokenPair => ({
  foreground,
  background,
  kind: 'graphic',
});

export const REQUIRED_PAIRS: readonly TokenPair[] = [
  ...INKS.flatMap((foreground) => SURFACES.map((background) => text(foreground, background))),
  ...STATUSES.flatMap((foreground) =>
    [...SURFACES, `${foreground}-tint`].map((background) => text(foreground, background)),
  ),
  text('--ink-3', '--pass-tint'),
  text('--ink-3', '--fail-tint'),
  text('--ink-2', '--fail-tint'),
  text('--on-ink', '--fail'),
  text('--on-ink', '--ink'),
  graphic('--attn', '--surface'),
  graphic('--layer-4', '--surface'),
  graphic('--pass', '--surface'),
];

const THEME_SELECTORS: Record<Theme, string> = {
  dark: ':root',
  light: '[data-theme="light"]',
};

const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

interface RuleBlock {
  readonly selector: string;
  readonly body: string;
}

// Walks the top-level rules after comments are removed, so a selector named in a comment (the
// tokens.css header names the light selector) is never mistaken for the rule itself. Nested
// blocks such as @keyframes stay inside their parent's body and are not matched.
function topLevelBlocks(css: string): RuleBlock[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks: RuleBlock[] = [];
  let depth = 0;
  let selectorStart = 0;
  let bodyStart = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '{') {
      if (depth === 0) bodyStart = index + 1;
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        blocks.push({
          selector: text.slice(selectorStart, bodyStart - 1).trim(),
          body: text.slice(bodyStart, index),
        });
        selectorStart = index + 1;
      }
    }
  }
  return blocks;
}

function customProperties(body: string): Map<string, string> {
  const properties = new Map<string, string>();
  for (const declaration of body.split(';')) {
    const match = /^\s*(--[\w-]+)\s*:\s*([\s\S]*?)\s*$/.exec(declaration);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      properties.set(match[1], match[2]);
    }
  }
  return properties;
}

export function parseThemeTokens(css: string): Record<Theme, ReadonlyMap<string, string>> {
  const blocks = topLevelBlocks(css);
  const tokensFor = (theme: Theme): Map<string, string> => {
    const selector = THEME_SELECTORS[theme];
    const block = blocks.find((candidate) => candidate.selector === selector);
    if (block === undefined) {
      throw new Error(`No ${selector} rule found for the ${theme} theme`);
    }
    return customProperties(block.body);
  };
  const dark = tokensFor('dark');
  // The light rule overrides :root, so anything it leaves unset keeps the dark value.
  const light = new Map([...dark, ...tokensFor('light')]);
  return { dark, light };
}

function channel(value: number): number {
  const srgb = value / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  if (!HEX_COLOUR.test(hex)) {
    throw new Error(`Not a 6-digit hex colour: ${hex}`);
  }
  const [red, green, blue] = [1, 3, 5].map((offset) =>
    channel(Number.parseInt(hex.slice(offset, offset + 2), 16)),
  ) as [number, number, number];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (a, b) => b - a,
  ) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

function tokenProblem(tokens: ReadonlyMap<string, string>, name: string): string | undefined {
  const value = tokens.get(name);
  if (value === undefined) return `${name} is missing`;
  if (!HEX_COLOUR.test(value)) return `${name} is not a 6-digit hex colour: ${value}`;
  return undefined;
}

export function evaluatePairs(
  tokens: ReadonlyMap<string, string>,
  pairs: readonly TokenPair[] = REQUIRED_PAIRS,
): PairResult[] {
  return pairs.map((pair) => {
    const { foreground, background } = pair;
    const required = REQUIRED_RATIO[pair.kind];
    const problems = [tokenProblem(tokens, foreground), tokenProblem(tokens, background)].filter(
      (problem) => problem !== undefined,
    );
    if (problems.length > 0) {
      return { ...pair, required, ratio: null, passes: false, problem: problems.join('; ') };
    }
    // Both values were just checked to be present and valid hex.
    const ratio = contrastRatio(tokens.get(foreground) as string, tokens.get(background) as string);
    return { ...pair, required, ratio, passes: ratio >= required };
  });
}

function lowestOf(results: readonly PairResult[], kind: PairKind): PairResult | undefined {
  return results
    .filter((result) => result.kind === kind && result.ratio !== null)
    .reduce<PairResult | undefined>(
      (low, result) =>
        low === undefined || (result.ratio ?? Infinity) < (low.ratio ?? Infinity) ? result : low,
      undefined,
    );
}

export function checkContrast(css: string): ThemeReport[] {
  const tokens = parseThemeTokens(css);
  return (['dark', 'light'] as const).map((theme) => {
    const results = evaluatePairs(tokens[theme]);
    return {
      theme,
      results,
      failures: results.filter((result) => !result.passes),
      lowest: { text: lowestOf(results, 'text'), graphic: lowestOf(results, 'graphic') },
    };
  });
}

export function formatRatio(ratio: number): string {
  return ratio.toFixed(2);
}
