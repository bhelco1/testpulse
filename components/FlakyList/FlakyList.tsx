import Link from 'next/link';
import { useId } from 'react';

import type { FlakyView } from '../../lib/pages/project';
import { CheckIcon, FlakyIcon } from '../icons/icons';
import styles from './FlakyList.module.css';

export interface FlakyListProps {
  tests: readonly FlakyView[];
}

// The project page's flaky tests (design/pages/Project Page.dc.html, spec section 11). Each row
// shows "Failed {n} of last {m} runs" (design v7 item 6), its layer and its platforms; a row whose
// test failed in none of its last runs has no rate, which the design does not draw (13.2).
export function FlakyList({ tests }: FlakyListProps) {
  const titleId = useId();
  return (
    <section className={styles.card} aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.title}>
        Flaky tests
      </h3>
      <p className={styles.definition}>
        Flaky: passed and failed on the same commit and platform within the last 30 days.
      </p>
      {tests.length === 0 ? (
        <div className={styles.none} data-part="none">
          <CheckIcon size={18} strokeWidth={3} className={styles.check} />
          <div>
            <div className={styles.noneTitle}>No flaky tests in the last 30 days</div>
            <div className={styles.noneText}>
              No test passed and failed on the same commit and platform.
            </div>
          </div>
        </div>
      ) : (
        <ul className={styles.list}>
          {tests.map((test) => (
            <li key={test.testKey}>
              <Link href={test.href} className={styles.row}>
                <span className={styles.top}>
                  <span className={styles.name} data-part="name">
                    {test.name}
                  </span>
                  <span className={styles.pill} data-part="flaky">
                    <FlakyIcon size={12} strokeWidth={2.6} />
                    Flaky
                  </span>
                </span>
                <span className={styles.suite} data-part="suite">
                  {test.suite}
                </span>
                <span className={styles.meta} data-part="meta">
                  {test.rate !== null && <span>{test.rate}</span>}
                  <span>{test.layer}</span>
                  <span>{test.platforms}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
