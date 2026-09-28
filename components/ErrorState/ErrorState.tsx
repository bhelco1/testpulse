import Link from 'next/link';

import { Button } from '../Button/Button';
import { AlertCircleIcon } from '../icons/icons';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import styles from './ErrorState.module.css';

export interface ErrorStateProps {
  // page: a whole page failed (landing, project, run). inline: one section, feed or table; charts
  // draw their own error inside the chart card (design v5 item 3).
  variant: 'page' | 'inline';
  title: string;
  message: string;
  // A function prop, so this renders inside a client boundary such as an error.tsx.
  onRetry: () => void;
}

// Shown in place of the content that failed: no stale numbers are shown beside it.
export function ErrorState({ variant, title, message, onRetry }: ErrorStateProps) {
  if (variant === 'inline') {
    return (
      <div role="alert" className={styles.inline} data-variant={variant}>
        <AlertCircleIcon size={18} strokeWidth={2.6} className={styles.inlineIcon} />
        <div>
          <div className={styles.inlineTitle}>{title}</div>
          <div className={styles.inlineMessage}>{message}</div>
          <Button variant="secondary" className={styles.inlineRetry} onClick={onRetry}>
            Try again
          </Button>
        </div>
      </div>
    );
  }
  return (
    <section role="alert" className={styles.page} data-variant={variant}>
      <StatusBadge status="error" />
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.message}>{message}</p>
      <div className={styles.actions}>
        <Button onClick={onRetry}>Try again</Button>
        <Link href="/how-its-tested" className={styles.link}>
          How it’s tested
        </Link>
      </div>
    </section>
  );
}
