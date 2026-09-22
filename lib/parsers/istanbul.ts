import { z } from 'zod';

import { parseJsonText, validateShape } from './json';
import type { NormalizedCoverage } from './types';

const metricSchema = z.object({
  covered: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

// Only `total` is read; the per-file entries of coverage-summary.json are ignored.
const summarySchema = z.object({
  total: z.object({
    lines: metricSchema,
    branches: metricSchema.optional(),
  }),
});

export function parseIstanbulSummary(text: string): NormalizedCoverage {
  const { total } = validateShape(summarySchema, parseJsonText(text));
  const coverage: NormalizedCoverage = {
    linesCovered: total.lines.covered,
    linesTotal: total.lines.total,
  };
  if (total.branches !== undefined) {
    coverage.branchesCovered = total.branches.covered;
    coverage.branchesTotal = total.branches.total;
  }
  return coverage;
}
