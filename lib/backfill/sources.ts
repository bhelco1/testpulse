import { toOstomate2BackfillRuns } from './ostomate2-history.ts';
import type { BackfillRun } from './types.ts';

/** Turns a parsed history file into the runs to import from the given default branch. */
export type BackfillSource = (file: unknown, defaultBranch: string) => BackfillRun[];

// Spec section 17, Phase 4: only Ostomate2's history can be imported. routeserve's has no test
// counts and no run IDs. A Map, so a slug such as "constructor" finds nothing.
const SOURCES: ReadonlyMap<string, BackfillSource> = new Map([
  ['ostomate2', toOstomate2BackfillRuns],
]);

export function backfillSourceFor(slug: string): BackfillSource {
  const source = SOURCES.get(slug);
  if (source === undefined) {
    throw new Error(
      `project "${slug}" has no backfill source; only ${[...SOURCES.keys()].join(', ')} has one ` +
        '(spec section 17, Phase 4)',
    );
  }
  return source;
}
