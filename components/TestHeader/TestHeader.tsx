import type { ReactNode } from 'react';

import type { TimeLabel } from '../../lib/copy/time';
import { FlakyIcon, XCircleIcon } from '../icons/icons';
import { RelativeTime } from '../RelativeTime/RelativeTime';
import styles from './TestHeader.module.css';

export interface TestHeaderProps {
  name: string;
  // The full suite; the breadcrumb carries the shortened one.
  suite: string;
  // The report's module, such as "composeApp" (tests.module).
  module: string;
  // The layer's label, such as "Unit" (lib/design/layers.ts).
  layer: string;
  // Section 11's flag: a pass and a fail on one commit and platform within 30 days.
  flaky: boolean;
  // "Platform mismatch in {k} run(s)" and the latest such run's title and when; null for none.
  mismatch: { text: string; run: string; when: TimeLabel } | null;
  // When the test was first seen, while it is new; null after.
  firstSeen: TimeLabel | null;
  // The page's stat tiles, under the suite.
  children?: ReactNode;
}

// The top of the test history page (design/pages/Test History.dc.html, components.md "Test
// history page"): the module and layer tags, the Flaky pill, the mismatch headline and the New
// pill, then the test's name and suite, and the tiles below them.
export function TestHeader({
  name,
  suite,
  module,
  layer,
  flaky,
  mismatch,
  firstSeen,
  children,
}: TestHeaderProps) {
  return (
    <section className={styles.header} aria-labelledby="test-name">
      <div className={styles.tags} data-part="tags">
        <span className={styles.module} data-part="module">
          {module}
        </span>
        <span className={styles.layer} data-part="layer">
          {layer}
        </span>
        {flaky && (
          <span className={styles.flaky} data-part="flaky">
            <FlakyIcon size={14} strokeWidth={2.6} />
            Flaky
          </span>
        )}
        {mismatch !== null && (
          <span className={styles.mismatch} data-part="mismatch">
            <XCircleIcon size={14} strokeWidth={2.6} />
            <span>{mismatch.text}</span>
            <span className={styles.mismatchRun} data-part="mismatch-run">
              · {mismatch.run}, <RelativeTime when={mismatch.when} />
            </span>
          </span>
        )}
        {firstSeen !== null && (
          <span className={styles.new} data-part="new">
            New · first seen <RelativeTime when={firstSeen} />
          </span>
        )}
      </div>
      <h1 id="test-name" className={styles.name}>
        {name}
      </h1>
      <div className={styles.suite} data-part="suite">
        {suite}
      </div>
      {children}
    </section>
  );
}
