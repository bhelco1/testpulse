import type { DeclaredSuite, DeclaredSuiteStatus } from './schema';

// Which declared suite a test-stack tool stands for, so its tag can say the suite does not
// report yet (design v7 item 8; components.md, StackTagGroup "Match rule"). Pure.

// A version as the project files write one after a tool's name: "2.6.1", "30", "v2.6.1",
// "2.0.0-beta.1".
const TRAILING_VERSION = /^(.*\S)\s+v?\d[0-9A-Za-z.+-]*$/;

/**
 * The tool's name without a trailing version, which the match ignores (owner decision
 * 2026-09-29): "Maestro 2.6.1" is matched as "Maestro". The tag still shows the version.
 */
export function stackToolName(item: string): string {
  const trimmed = item.trim();
  return TRAILING_VERSION.exec(trimmed)?.[1] ?? trimmed;
}

const fold = (text: string): string => text.trim().toLowerCase();

/**
 * A suite matches when its name, trimmed and case-folded, equals the tool's or starts with it
 * followed by a space: "Maestro" matches "Maestro E2E (iOS)", "Jest" does not match
 * "jest-expo". Of several matches, one that runs in CI unreported wins; none leaves the tag
 * plain (undefined).
 */
export function declaredStatusFor(
  item: string,
  suites: readonly DeclaredSuite[],
): DeclaredSuiteStatus | undefined {
  const tool = fold(stackToolName(item));
  if (tool === '') return undefined;
  const matching = suites.filter((suite) => {
    const name = fold(suite.name);
    return name === tool || name.startsWith(`${tool} `);
  });
  if (matching.length === 0) return undefined;
  return matching.some((suite) => suite.status === 'runs_in_ci_not_reported')
    ? 'runs_in_ci_not_reported'
    : 'authored_not_executed';
}
