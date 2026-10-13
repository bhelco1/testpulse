import { AlertCircleIcon } from '../icons/icons';
import styles from './AdminShell.module.css';

export interface AdminShellProps {
  // ready: the owner is signed in. unavailable: Supabase did not answer, so whether anyone is
  // signed in is unknown and nothing of admin is shown.
  state: 'ready' | 'unavailable';
}

// Admin's page frame once signed in (design/pages/Admin.dc.html, SIGNED IN: MAIN), and its error
// state (ERROR). The sections it frames arrive with their data.
export function AdminShell({ state }: AdminShellProps) {
  if (state === 'ready') {
    return (
      <main id="main" className={styles.main}>
        <h1 className={styles.h1}>Admin</h1>
      </main>
    );
  }
  return (
    <main id="main" className={`${styles.main} ${styles.errorMain}`}>
      <h1 className={styles.h1}>Admin</h1>
      <div role="alert" className={styles.error}>
        <AlertCircleIcon size={22} strokeWidth={2.4} className={styles.errorIcon} />
        <div className={styles.errorText}>
          <h2 className={styles.h2}>Admin couldn’t load</h2>
          <p className={styles.message}>
            The database didn’t answer, so nothing here can be shown or changed right now. Nothing
            was lost.
          </p>
          {/* A full reload of /admin, as the design's "Try again" is. */}
          <a href="/admin" className={styles.retry}>
            Try again
          </a>
        </div>
      </div>
    </main>
  );
}
