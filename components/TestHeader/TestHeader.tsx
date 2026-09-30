import { FlakyIcon } from '../icons/icons';
import styles from './TestHeader.module.css';

export interface TestHeaderProps {
  name: string;
  // The full suite; the breadcrumb carries the shortened one.
  suite: string;
  // The layer's label, such as "Unit" (lib/design/layers.ts).
  layer: string;
  // Section 11's flag: a pass and a fail on one commit and platform within 30 days.
  flaky: boolean;
}

// The top of the test history page (design/pages/Test History.dc.html): the layer tag and the
// Flaky pill, then the test's name and suite. The mock's other tags and its stat tiles are held
// back (docs/spec.md section 13.6).
export function TestHeader({ name, suite, layer, flaky }: TestHeaderProps) {
  return (
    <section className={styles.header} aria-labelledby="test-name">
      <div className={styles.tags}>
        <span className={styles.layer} data-part="layer">
          {layer}
        </span>
        {flaky && (
          <span className={styles.flaky} data-part="flaky">
            <FlakyIcon size={14} strokeWidth={2.6} />
            Flaky
          </span>
        )}
      </div>
      <h1 id="test-name" className={styles.name}>
        {name}
      </h1>
      <div className={styles.suite} data-part="suite">
        {suite}
      </div>
    </section>
  );
}
