import { useId, type ReactNode } from 'react';

import styles from './PageSection.module.css';

export interface PageSectionProps {
  // Shown two digits wide ("01") before the heading, in the order the page gives.
  number: number;
  title: string;
  // The page's last section has more room below it before the footer.
  last?: boolean;
  children: ReactNode;
}

// A numbered part of a page under a hairline (design/pages/Project Page.dc.html). The number is
// decoration: the heading alone names the section.
export function PageSection({ number, title, last = false, children }: PageSectionProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={[styles.section, last && styles.last].filter(Boolean).join(' ')}
    >
      <div className={styles.head}>
        <span className={styles.number} data-part="number" aria-hidden="true">
          {String(number).padStart(2, '0')}
        </span>
        <h2 id={headingId} className={styles.title}>
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}
