import { LockIcon } from '../icons/icons';
import styles from './PrivateDetailsNotice.module.css';

// Shown where a public project would show failure text. Hiding is enforced by RLS; this only
// tells the reader why nothing is there.
export function PrivateDetailsNotice() {
  return (
    <div className={styles.notice} data-part="private-notice">
      <LockIcon size={18} strokeWidth={2.2} className={styles.lock} />
      <div>
        <div className={styles.title}>Details hidden: private repository</div>
        <p className={styles.text}>
          This repository is private, so failure messages, stack traces and source links are hidden.
          Test names, counts and trends are real.
        </p>
      </div>
    </div>
  );
}
