// Design v4 item 20 and v8 item 12 (TPKit.shortSuite; components.md ProjectCard, "Short suite"):
// a test is named by its suite's last path segment ("jobs.test.ts"), a bare file name with a
// source extension whole ("zz-deliberate-failure.spec.ts"), or else its last dotted segment
// ("HomeViewModelTest"). The full name goes in the title attribute.
const SOURCE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|kt|kts|swift|py|rb|go)$/;

export function shortSuite(suite: string): string {
  if (suite.includes('/')) return suite.slice(suite.lastIndexOf('/') + 1);
  if (SOURCE_FILE.test(suite)) return suite;
  return suite.slice(suite.lastIndexOf('.') + 1);
}
