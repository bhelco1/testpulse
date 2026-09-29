import type { ReactNode } from 'react';

import styles from './PageFrame.module.css';

// The page column every public page sits in (design/README.md, "Global layout").
export function PageFrame({ children }: { children: ReactNode }) {
  return <div className={styles.frame}>{children}</div>;
}
