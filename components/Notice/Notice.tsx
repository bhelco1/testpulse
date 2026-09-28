import { ClockIcon, LockIcon, XCircleIcon } from '../icons/icons';
import styles from './Notice.module.css';

// The neutral notice is drawn as one line of body text with no title.
export type NoticeProps =
  { tone: 'attn' | 'fail'; title: string; body: string } | { tone: 'neutral'; body: string };

// A page-level banner: stale project, private repository, failed-run summary. Never inside a card.
export function Notice(props: NoticeProps) {
  if (props.tone === 'neutral') {
    return (
      <div className={`${styles.notice} ${styles.neutral}`} data-tone="neutral">
        <LockIcon size={18} strokeWidth={2.2} className={styles.icon} />
        <div className={styles.body} data-part="body">
          {props.body}
        </div>
      </div>
    );
  }
  const attn = props.tone === 'attn';
  const Icon = attn ? ClockIcon : XCircleIcon;
  return (
    <div
      role={attn ? 'status' : 'alert'}
      className={`${styles.notice} ${styles[props.tone]}`}
      data-tone={props.tone}
    >
      <Icon size={18} strokeWidth={attn ? 2.4 : 2.6} className={styles.icon} />
      <div>
        <div className={styles.title} data-part="title">
          {props.title}
        </div>
        <div className={styles.body} data-part="body">
          {props.body}
        </div>
      </div>
    </div>
  );
}
