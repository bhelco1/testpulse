// Which rows of a run list arrived since the page loaded, for RunFeedRow's "New" chip
// (design/components.md). Pure: a live update re-renders the page on the server, so the browser
// tells an arrival from the ids it first rendered, never from the realtime payload.

/** The ids a list showed when the page loaded, for the scope the list was showing then. */
export interface Baseline {
  readonly scope: string;
  readonly seen: ReadonlySet<string>;
}

/**
 * The baseline for a list now showing `ids` in `scope`: the same one while the scope holds, a new
 * one from the rows shown when it changes (the project page's branch filter), since runs a filter
 * adds did not arrive.
 */
export function rebase(baseline: Baseline, scope: string, ids: readonly string[]): Baseline {
  return baseline.scope === scope ? baseline : { scope, seen: new Set(ids) };
}

/**
 * The rows above the first row that was seen: lists are newest first, so an arrival lands on
 * top, while runs a "Load 20 more" appends are older and land below. With none of the seen rows
 * left, every row arrived.
 */
export function arrivals(seen: ReadonlySet<string>, ids: readonly string[]): ReadonlySet<string> {
  const firstSeen = ids.findIndex((id) => seen.has(id));
  return new Set(firstSeen === -1 ? ids : ids.slice(0, firstSeen));
}
