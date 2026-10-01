'use client';

import { useState } from 'react';

import type { RunPageView } from '../../lib/pages/run';
import { EmptyIcon } from '../icons/icons';
import { ResultsTable } from '../ResultsTable/ResultsTable';
import { useRunFilterRequest } from './RunFilter';
import styles from './RunResults.module.css';

const PAGE = 50;

// The run page's results: the table, the retention note for a pruned run, or one card for an
// empty run (components.md, Run page). The table owns its filters; how many rows it shows is kept
// here, 50 more each time "Load 50 more" is pressed, and the failed-run banner's request reaches
// it through RunFilterProvider. Without JavaScript the first 50 rows render, every failure open,
// and the controls do nothing.
export function RunResults({ results }: { results: RunPageView['results'] }) {
  const [limit, setLimit] = useState(PAGE);
  const request = useRunFilterRequest();
  if (results.kind === 'pruned') {
    return <ResultsTable pruned={results.totals} prunedOn={results.prunedOn} />;
  }
  if (results.kind === 'empty') {
    return (
      <div className={styles.empty} data-part="empty-run">
        <EmptyIcon size={22} strokeWidth={2.6} className={styles.emptyIcon} />
        <div>
          <div className={styles.emptyTitle} data-part="empty-run-title">
            No test results in this run
          </div>
          <p className={styles.emptyText} data-part="empty-run-text">
            {results.body}
          </p>
        </div>
      </div>
    );
  }
  return (
    <ResultsTable
      results={results.rows}
      visibility={results.visibility}
      limit={limit}
      onLoadMore={() => setLimit((shown) => shown + PAGE)}
      request={request}
    />
  );
}
