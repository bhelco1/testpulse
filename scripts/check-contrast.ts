import { readFileSync } from 'node:fs';

// Node runs this file directly with type stripping, which needs the real extension on imports.
import {
  checkContrast,
  CONTRAST_AA_GRAPHIC,
  CONTRAST_AA_TEXT,
  formatRatio,
  type PairResult,
} from '../lib/design/contrast.ts';

const css = readFileSync(new URL('../design/tokens.css', import.meta.url), 'utf8');
const reports = checkContrast(css);

const describeLowest = (kind: string, lowest: PairResult | undefined): string =>
  lowest === undefined
    ? `no ${kind} pair could be measured`
    : `lowest ${kind} ${lowest.foreground} on ${lowest.background} ${formatRatio(lowest.ratio ?? 0)}:1`;

for (const { theme, results, lowest } of reports) {
  const texts = results.filter((result) => result.kind === 'text').length;
  const graphics = results.length - texts;
  console.log(
    `${theme}: ${texts} text pairs, ${describeLowest('text', lowest.text)}; ` +
      `${graphics} graphic pairs, ${describeLowest('graphic', lowest.graphic)}`,
  );
}

const failures = reports.flatMap(({ theme, failures }) =>
  failures.map((failure) => ({ theme, ...failure })),
);

if (failures.length > 0) {
  for (const { theme, foreground, background, kind, required, ratio, problem } of failures) {
    const detail = problem ?? `${formatRatio(ratio ?? 0)}:1, needs ${required}:1`;
    console.log(`FAIL ${theme}: ${kind} ${foreground} on ${background}: ${detail}`);
  }
  process.exit(1);
}

console.log(
  `All design token pairs meet WCAG AA: text ${CONTRAST_AA_TEXT}:1, graphics ${CONTRAST_AA_GRAPHIC}:1.`,
);
