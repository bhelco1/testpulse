// Design v4 item 20 (TPKit.shortSuite): the ProjectCard names a failing test by its suite's last
// path segment ("jobs.test.ts") or last dotted segment ("HomeViewModelTest"); the full name goes
// in the title attribute.
export function shortSuite(suite: string): string {
  const separator = suite.includes('/') ? '/' : '.';
  return suite.slice(suite.lastIndexOf(separator) + 1);
}
