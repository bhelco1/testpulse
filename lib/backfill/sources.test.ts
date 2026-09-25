import { describe, expect, it } from 'vitest';

import { toOstomate2BackfillRuns } from './ostomate2-history.ts';
import { backfillSourceFor } from './sources.ts';

describe('backfillSourceFor (spec section 17, Phase 4 decisions)', () => {
  it('reads Ostomate2 history for ostomate2', () => {
    expect(backfillSourceFor('ostomate2')).toBe(toOstomate2BackfillRuns);
  });

  it('refuses routeserve, whose history has no counts or run IDs to import', () => {
    expect(() => backfillSourceFor('routeserve')).toThrow(
      'project "routeserve" has no backfill source; only ostomate2 has one',
    );
  });

  // A plain object lookup would hand back Object.prototype members for these.
  it.each(['constructor', 'toString', '__proto__'])('refuses the slug "%s"', (slug) => {
    expect(() => backfillSourceFor(slug)).toThrow(`project "${slug}" has no backfill source`);
  });
});
