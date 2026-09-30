import Link from 'next/link';

import { Button } from '../Button/Button';
import { AlertCircleIcon } from '../icons/icons';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import styles from './ErrorState.module.css';

interface Copy {
  title: string;
  message: string;
}

// page: a whole page failed (landing, project, run), rendered by the server with HTTP 503, so
// "Try again" is a link to the same URL and works without JavaScript (design v9 item 7). The
// server names that URL: a component cannot know it. inline: one section, feed or table, on the
// client, retried by a button; charts draw their own error inside the chart card (v5 item 3).
export type ErrorStateProps = Copy &
  (
    | { variant: 'page'; retryHref: string }
    // A function prop, so this renders inside a client boundary.
    | { variant: 'inline'; onRetry: () => void }
  );

// Shown in place of the content that failed: no stale numbers are shown beside it.
export function ErrorState(props: ErrorStateProps) {
  const { variant, title, message } = props;
  if (props.variant === 'inline') {
    const { onRetry } = props;
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
        <Button href={props.retryHref}>Try again</Button>
        <Link href="/how-its-tested" className={styles.link}>
          How it’s tested
        </Link>
      </div>
    </section>
  );
}
