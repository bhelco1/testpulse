import Link from 'next/link';
import type { ReactNode } from 'react';

import { Button } from '../Button/Button';
import type { SwitcherProject } from '../ProjectSwitcher/ProjectSwitcher';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import styles from './NotFound.module.css';

export type NotFoundProps =
  | {
      kind: 'project';
      // The requested path, shown as it was asked for.
      path: ReactNode;
      projects: readonly SwitcherProject[];
    }
  | {
      // A run the project does not have. The test kind comes with its page.
      kind: 'run';
      path: ReactNode;
      project: { name: string; href: string };
    };

// design/components.md "NotFound (page)": nothing failed, so there is no Error badge and no retry,
// only a way forward. The page serves it with HTTP 404.
export function NotFound(props: NotFoundProps) {
  return (
    <main id="main" className={styles.main}>
      <div className={styles.eyebrow} data-part="eyebrow">
        404 · Not found
      </div>
      {props.kind === 'project' ? <NoProject {...props} /> : <NoRun {...props} />}
    </main>
  );
}

function Path({ path }: { path: ReactNode }) {
  return (
    <div className={styles.path} data-part="path">
      {path}
    </div>
  );
}

function NoProject({ path, projects }: Extract<NotFoundProps, { kind: 'project' }>) {
  return (
    <>
      <h1 className={styles.title}>No project at this address</h1>
      <Path path={path} />
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
    </>
  );
}

function NoRun({ path, project }: Extract<NotFoundProps, { kind: 'run' }>) {
  return (
    <>
      <h1 className={styles.title}>This run isn’t in {project.name}</h1>
      <Path path={path} />
      <p className={styles.body}>
        Run summaries are kept permanently, so this run was never recorded for this project. The ID
        may be mistyped, or the run may belong to another project.
      </p>
      <div className={styles.actions}>
        <Button href={project.href} variant="primary">
          {project.name} runs
        </Button>
        <Link href="/" className={styles.link}>
          Overview
        </Link>
      </div>
    </>
  );
}
