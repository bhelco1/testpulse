import Link from 'next/link';
import type { ReactNode } from 'react';

import { Button } from '../Button/Button';
import type { SwitcherProject } from '../ProjectSwitcher/ProjectSwitcher';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import styles from './NotFound.module.css';

export interface NotFoundProps {
  // Only the project kind is built so far; the run and test kinds come with their pages.
  kind: 'project';
  // The requested path, shown as it was asked for.
  path: ReactNode;
  projects: readonly SwitcherProject[];
}

// design/components.md "NotFound (page)", project kind: nothing failed, so there is no Error badge
// and no retry, only a way forward. The page serves it with HTTP 404.
export function NotFound({ path, projects }: NotFoundProps) {
  return (
    <main id="main" className={styles.main}>
      <div className={styles.eyebrow} data-part="eyebrow">
        404 · Not found
      </div>
      <h1 className={styles.title}>No project at this address</h1>
      <div className={styles.path} data-part="path">
        {path}
      </div>
      <p className={styles.body}>
        The link may be mistyped, or the project may have been renamed. These are the projects
        testpulse reports on.
      </p>
      <ul aria-label="Projects" className={styles.projects}>
        {projects.map((project) => (
          <li key={project.href}>
            <Link href={project.href} className={styles.project}>
              <span className={styles.name}>{project.name}</span>
              <StatusBadge status={project.status} variant="inline" />
            </Link>
          </li>
        ))}
      </ul>
      <div className={styles.actions}>
        <Button href="/" variant="primary">
          Go to overview
        </Button>
      </div>
    </main>
  );
}
