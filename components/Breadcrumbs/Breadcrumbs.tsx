import Link from 'next/link';

import styles from './Breadcrumbs.module.css';

export interface BreadcrumbLink {
  label: string;
  href: string;
}

export interface BreadcrumbsProps {
  items: readonly BreadcrumbLink[];
  current: string;
  // Test names are shown in monospace, as everywhere else on the site.
  currentMono?: boolean;
}

export function Breadcrumbs({ items, current, currentMono = false }: BreadcrumbsProps) {
  const currentClass = [styles.target, styles.current, currentMono && styles.mono]
    .filter(Boolean)
    .join(' ');
  return (
    <nav aria-label="Breadcrumb">
      <ol className={styles.list}>
        {items.map((item) => (
          <li key={item.href} className={styles.item}>
            <Link href={item.href} className={styles.target}>
              {item.label}
            </Link>
            <span aria-hidden="true">/</span>
          </li>
        ))}
        <li className={styles.item}>
          <span aria-current="page" className={currentClass} data-mono={String(currentMono)}>
            {current}
          </span>
        </li>
      </ol>
    </nav>
  );
}
