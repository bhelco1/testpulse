// Design v9 item 6 (components.md "Landing hero"): every list of project names on the site reads
// "A", "A and B", "A, B and C", with no Oxford comma, in the order the caller gives. The site has
// few projects, so a long list is not truncated.
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}
