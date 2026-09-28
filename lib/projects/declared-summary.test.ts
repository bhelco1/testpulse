import { describe, expect, it } from 'vitest';

import { declaredSummary } from './declared-summary';
import type { DeclaredSuite } from './schema';

const iosFlows: DeclaredSuite = {
  name: 'Maestro E2E · iOS',
  layer: 'e2e',
  count: 13,
  status: 'authored_not_executed',
};

// Design v4 item 17 (TPKit.declaredSummary and the components.md template).
describe('declaredSummary', () => {
  it('is empty when nothing is declared, so the footer left side stays blank', () => {
    expect(declaredSummary([])).toBe('');
  });

  it('names one suite with its count and status', () => {
    expect(declaredSummary([iosFlows])).toBe(
      'Not counted: Maestro E2E · iOS (13 flows), authored, not yet executed',
    );
  });

  it('counts tests, not flows, for layers other than e2e', () => {
    expect(
      declaredSummary([
        { name: 'Contract', layer: 'integration', count: 6, status: 'runs_in_ci_not_reported' },
      ]),
    ).toBe('Not counted: Contract (6 tests), run in CI, not yet reported');
  });

  it('is singular at one', () => {
    expect(declaredSummary([{ ...iosFlows, count: 1 }])).toBe(
      'Not counted: Maestro E2E · iOS (1 flow), authored, not yet executed',
    );
  });

  // Design v5 item 12: projects:sync rejects a count below 1, so this only guards a row written
  // before that rule; the brackets go rather than print "(0 flows)".
  it('drops the brackets for one suite without a count', () => {
    expect(declaredSummary([{ ...iosFlows, count: 0 }])).toBe(
      'Not counted: Maestro E2E · iOS, authored, not yet executed',
    );
  });

  it('sums several suites with one status', () => {
    expect(
      declaredSummary([
        { name: 'Maestro · Android', layer: 'e2e', count: 7, status: 'runs_in_ci_not_reported' },
        { name: 'Maestro · iOS', layer: 'e2e', count: 5, status: 'runs_in_ci_not_reported' },
      ]),
    ).toBe('Not counted: 12 flows in 2 suites, run in CI, not yet reported');
  });

  it('joins flows and tests with "and" inside one status', () => {
    expect(
      declaredSummary([
        { name: 'Maestro', layer: 'e2e', count: 7, status: 'runs_in_ci_not_reported' },
        { name: 'Contract', layer: 'integration', count: 1, status: 'runs_in_ci_not_reported' },
      ]),
    ).toBe('Not counted: 7 flows and 1 test in 2 suites, run in CI, not yet reported');
  });

  it('gives one clause per status when mixed, run in CI first', () => {
    expect(
      declaredSummary([
        { ...iosFlows, count: 5 },
        { name: 'Maestro · Android', layer: 'e2e', count: 7, status: 'runs_in_ci_not_reported' },
      ]),
    ).toBe('Not counted: 7 flows run in CI, not yet reported; 5 flows authored, not yet executed');
  });
});
