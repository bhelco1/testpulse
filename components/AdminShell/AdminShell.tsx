import { AlertCircleIcon } from '../icons/icons';
import { Skeleton } from '../Skeleton/Skeleton';
import styles from './AdminShell.module.css';

export interface AdminShellProps {
  // loading: the owner is signed in and the sections' data is on its way. unavailable: Supabase
  // or the database did not answer, so nothing of admin can be shown.
  state: 'loading' | 'unavailable';
}

// The four sections and the height of the block each stands in for while loading.
const SKELETON = [
  ['Open alerts', 84],
  ['Tracked links', 220],
  ['Projects', 180],
  ['Daily job', 110],
] as const;

// Admin's loading and error states (design/pages/Admin.dc.html, LOADING and ERROR;
// design/components.md, Admin, "Page states").
export function AdminShell({ state }: AdminShellProps) {
  if (state === 'loading') {
    return (
      <main id="main" className={styles.main} aria-busy="true">
        <h1 className={styles.h1}>Admin</h1>
        <span role="status" className={styles.hidden}>
          Loading admin
        </span>
        {SKELETON.map(([heading, height]) => (
          <section key={heading} className={styles.loading}>
            <h2 className={styles.loadingH2}>{heading}</h2>
            <Skeleton width="100%" height={height} radius={16} />
          </section>
        ))}
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
