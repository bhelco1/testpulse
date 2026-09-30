'use client';

import { useState } from 'react';

import type { RunPageView } from '../../lib/pages/run';
import { ResultsTable } from '../ResultsTable/ResultsTable';

const PAGE = 50;

// The run page's results: the table, or the retention note for a pruned run. The table owns its
// filters; how many rows it shows is kept here, 50 more each time "Load 50 more" is pressed
// (design/components.md, ResultsTable). Without JavaScript the first 50 rows render, every
// failure open, and the controls do nothing.
export function RunResults({ results }: { results: NonNullable<RunPageView['results']> }) {
  const [limit, setLimit] = useState(PAGE);
  if (results.kind === 'pruned') return <ResultsTable pruned={results.totals} />;
  return (
    <ResultsTable
      results={results.rows}
      visibility={results.visibility}
      limit={limit}
      onLoadMore={() => setLimit((shown) => shown + PAGE)}
    />
  );
}
