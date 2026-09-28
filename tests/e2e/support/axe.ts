import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

// axe-core is only a transitive dependency, so its types are taken from AxeBuilder's.
type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>;
type Result = AxeResults['violations'][number];

// Spec section 17, Phase 5: axe reports no serious or critical violations. Moderate and minor
// findings are left to review rather than failing the build.
const BLOCKING: ReadonlySet<Result['impact']> = new Set(['serious', 'critical']);

function describe(violation: Result): string {
  const targets = violation.nodes.map((node) => node.target.join(' ')).join(', ');
  return `${violation.id} (${violation.impact}): ${violation.help} at ${targets}`;
}

/** Runs axe on the page as it is now and fails on any serious or critical violation. */
export async function expectNoSeriousAxeViolations(page: Page): Promise<AxeResults> {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((violation) => BLOCKING.has(violation.impact));
  expect(blocking.map(describe), 'serious or critical axe violations').toEqual([]);
  return results;
}
