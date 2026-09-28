import type { ComponentType } from 'react';

import { ClockIcon, type IconProps, LockIcon, XCircleIcon } from '../icons/icons';
import styles from './Notice.module.css';

export type NoticeIcon = 'clock' | 'x-circle' | 'lock';

export interface NoticeProps {
  tone: 'attn' | 'fail' | 'neutral';
  // Chosen per use, not per tone (design v4 item 2): clock for a stale project, x-circle for a
  // failed-run summary, lock for the private repository note.
  icon: NoticeIcon;
  title?: string;
  body: string;
  // Only for a Notice inserted after the page loaded, such as a project going stale while it is
  // open; one rendered with the page is not announced (design v4 item 1).
  live?: boolean;
}

// Stroke widths as the design system draws each icon.
const ICONS: Record<NoticeIcon, { Icon: ComponentType<IconProps>; strokeWidth: number }> = {
  clock: { Icon: ClockIcon, strokeWidth: 2.4 },
  'x-circle': { Icon: XCircleIcon, strokeWidth: 2.6 },
  lock: { Icon: LockIcon, strokeWidth: 2.2 },
};

// A page-level banner: stale project, private repository, failed-run summary. Never inside a card.
export function Notice({ tone, icon, title, body, live = false }: NoticeProps) {
  const { Icon, strokeWidth } = ICONS[icon];
  return (
    <div
      role={live ? 'status' : undefined}
      className={`${styles.notice} ${styles[tone]}`}
      data-tone={tone}
    >
      <Icon size={18} strokeWidth={strokeWidth} className={styles.icon} />
      <div>
        {title !== undefined && (
          <div className={styles.title} data-part="title">
            {title}
          </div>
        )}
        <div className={styles.body} data-part="body">
          {body}
        </div>
      </div>
    </div>
  );
}
