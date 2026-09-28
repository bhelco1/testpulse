import { qty } from '../copy/count';
import type { DeclaredSuite, DeclaredSuiteStatus } from './schema';

// Design v4 item 17 (TPKit.declaredSummary): the ProjectCard footer's "Not counted" line.
const PHRASE: Readonly<Record<DeclaredSuiteStatus, string>> = {
  runs_in_ci_not_reported: 'run in CI, not yet reported',
  authored_not_executed: 'authored, not yet executed',
};

// Run in CI first when statuses are mixed.
const STATUS_ORDER: readonly DeclaredSuiteStatus[] = [
  'runs_in_ci_not_reported',
  'authored_not_executed',
];

type Unit = 'flow' | 'test';
const unitOf = (suite: DeclaredSuite): Unit => (suite.layer === 'e2e' ? 'flow' : 'test');

// Counts per unit, flows before tests, joined with "and": "7 flows and 1 test".
function counts(suites: readonly DeclaredSuite[]): string {
  const byUnit: Record<Unit, number> = { flow: 0, test: 0 };
  for (const suite of suites) byUnit[unitOf(suite)] += suite.count;
  return (['flow', 'test'] as const)
    .filter((unit) => byUnit[unit] > 0)
    .map((unit) => qty(byUnit[unit], unit))
    .join(' and ');
}

export function declaredSummary(suites: readonly DeclaredSuite[]): string {
  const [only] = suites;
  if (only === undefined) return '';
  if (suites.length === 1) {
    // Design v5 item 12 (tp-kit.js): without a count the brackets go.
    const count = only.count > 0 ? ` (${counts(suites)})` : '';
    return `Not counted: ${only.name}${count}, ${PHRASE[only.status]}`;
  }
  const groups = STATUS_ORDER.map(
    (status) => [status, suites.filter((suite) => suite.status === status)] as const,
  ).filter(([, group]) => group.length > 0);
  const [single] = groups;
  if (groups.length === 1 && single) {
    const [status, group] = single;
    return `Not counted: ${counts(group)} in ${group.length} suites, ${PHRASE[status]}`;
  }
  return `Not counted: ${groups.map(([status, group]) => `${counts(group)} ${PHRASE[status]}`).join('; ')}`;
}
