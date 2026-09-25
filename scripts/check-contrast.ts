import { readFileSync } from 'node:fs';

// Node runs this file directly with type stripping, which needs the real extension on imports.
import { checkContrast, CONTRAST_AA_TEXT, formatRatio } from '../lib/design/contrast.ts';

const css = readFileSync(new URL('../design/tokens.css', import.meta.url), 'utf8');
const reports = checkContrast(css);

for (const { theme, results, lowest } of reports) {
  const lowestText =
    lowest === undefined
      ? 'no pair could be measured'
      : `lowest ${lowest.foreground} on ${lowest.background} ${formatRatio(lowest.ratio ?? 0)}:1`;
  console.log(`${theme}: ${results.length} pairs, ${lowestText}`);
}

const failures = reports.flatMap(({ theme, failures }) =>
  failures.map((failure) => ({ theme, ...failure })),
);

if (failures.length > 0) {
  for (const { theme, foreground, background, ratio, problem } of failures) {
    const detail = problem ?? `${formatRatio(ratio ?? 0)}:1, needs ${CONTRAST_AA_TEXT}:1`;
    console.log(`FAIL ${theme}: ${foreground} on ${background}: ${detail}`);
  }
  process.exit(1);
}

console.log(`All design token text pairs meet WCAG AA ${CONTRAST_AA_TEXT}:1.`);
