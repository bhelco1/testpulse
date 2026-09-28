import { useId } from 'react';

import { qty } from '../../lib/copy/count';
import { LAYER_LABEL } from '../../lib/design/layers';
import type { DeclaredSuite, DeclaredSuiteStatus } from '../../lib/projects/schema';
import { DashedCircleIcon } from '../icons/icons';
import styles from './DeclaredSuiteNote.module.css';

const STATUS_LABEL: Record<DeclaredSuiteStatus, string> = {
  runs_in_ci_not_reported: 'Runs in CI, not yet reported',
  authored_not_executed: 'Authored, not yet executed',
};

export interface DeclaredSuiteNoteProps {
  suites: readonly DeclaredSuite[];
}

// Spec 5.8: suites that exist but do not report. Neutral in tone, and never part of any total.
export function DeclaredSuiteNote({ suites }: DeclaredSuiteNoteProps) {
  const headingId = useId();
  if (suites.length === 0) return null;
  return (
    <section className={styles.panel} aria-labelledby={headingId}>
      <div className={styles.head}>
        <h3 id={headingId} className={styles.title}>
          Declared suites
        </h3>
        <p className={styles.intro}>
          These tests exist but don’t report here yet. They aren’t counted in any total.
        </p>
      </div>
      <ul className={styles.list}>
        {suites.map((suite) => (
          <li key={suite.name} className={styles.row}>
            <span className={styles.name}>{suite.name}</span>
            <span className={styles.layer}>{LAYER_LABEL[suite.layer]}</span>
            <span className={styles.count}>
              {qty(suite.count, suite.layer === 'e2e' ? 'flow' : 'test')}
            </span>
            <span className={styles.status} data-status={suite.status}>
              <DashedCircleIcon
                size={14}
                strokeWidth={2.6}
                className={styles.icon}
                dots={suite.status === 'authored_not_executed'}
              />
              {STATUS_LABEL[suite.status]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
