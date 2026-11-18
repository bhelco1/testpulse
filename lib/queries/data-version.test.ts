import { describe, expect, it } from 'vitest';

import { argsOf, fakeClient, type Answer } from './fake-client.test-support.ts';
import { readDataVersion } from './data-version.ts';

// The data version every cached public read is keyed by (decision 2026-11-17): how many reports
// there are and when the newest was written. A new or re-posted report adds a row with a newer
// created_at, and deleting a project removes its reports, so any write public pages show changes
// it, whatever path the write took. Proven against the database in data-version.int.test.ts.

const read = (answer: Answer) => {
  const fake = fakeClient(() => answer);
  return { version: readDataVersion(fake.client), queries: fake.queries };
};

describe('readDataVersion', () => {
  it('asks for the newest report’s created_at and an exact count, one row', async () => {
    const { version, queries } = read({
      data: [{ created_at: '2026-10-05T11:58:00.123456+00:00' }],
      count: 1368,
    });

    await expect(version).resolves.toBe('1368:2026-10-05T11:58:00.123456+00:00');
    const [query] = queries;
    if (query === undefined) throw new Error('no query was made');
    expect(query.table).toBe('reports');
    expect(argsOf(query, 'select')).toEqual([['created_at', { count: 'exact' }]]);
    expect(argsOf(query, 'order')).toEqual([['created_at', { ascending: false }]]);
    expect(argsOf(query, 'limit')).toEqual([[1]]);
  });

  it('reads an empty database as version 0', async () => {
    await expect(read({ data: [], count: 0 }).version).resolves.toBe('0:');
  });

  it('fails as a read fails, so the page shows its error state', async () => {
    await expect(
      read({ error: { code: 'PGRST002', message: 'Could not query' } }).version,
    ).rejects.toThrow('read the data version: PGRST002 Could not query');
  });

  it('refuses an answer without a count or with an unexpected row', async () => {
    await expect(read({ data: [] }).version).rejects.toThrow(/unexpected/);
    await expect(read({ data: [{ created_at: 'soon' }], count: 1 }).version).rejects.toThrow(
      /unexpected/,
    );
  });
});
