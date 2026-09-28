import type { PublicClient } from '../supabase/public.ts';

// A stand-in for the publishable-key client in loader unit tests: it records every query
// builder call and, when the chain is awaited, answers from the test. What the rows mean for
// real data read as anon is proven against the seeded database in lib/seed/seed.int.test.ts.

export type Call = readonly [method: string, ...args: unknown[]];

export interface Query {
  readonly table: string;
  readonly calls: readonly Call[];
}

export interface Answer {
  readonly data?: unknown;
  readonly error?: { code: string; message: string } | null;
}

export const argsOf = (query: Query, method: string): unknown[][] =>
  query.calls.filter(([name]) => name === method).map(([, ...args]) => args);

/** The first argument pair of the query's first call to `method`, such as an `in` filter. */
export const firstArgs = (query: Query, method: string): unknown[] =>
  argsOf(query, method)[0] ?? [];

export function fakeClient(answer: (query: Query) => Answer): {
  client: PublicClient;
  queries: Query[];
} {
  const queries: Query[] = [];
  const settle = (query: Query) => {
    queries.push(query);
    const { data = null, error = null } = answer(query);
    return { data, error };
  };
  const chain = (query: Query): unknown =>
    new Proxy(
      {},
      {
        get: (_, property) => {
          if (property === 'then') {
            return (resolve: (value: unknown) => void) => resolve(settle(query));
          }
          return (...args: unknown[]) =>
            chain({ ...query, calls: [...query.calls, [String(property), ...args]] });
        },
      },
    );
  const client = {
    from: (table: string) => chain({ table, calls: [] }),
  } as unknown as PublicClient;
  return { client, queries };
}
