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
      // A run the project does not have.
      kind: 'run';
      path: ReactNode;
      project: { name: string; href: string };
    }
  | {
      // A test key the project does not have.
      kind: 'test';
      path: ReactNode;
      project: { name: string; href: string };
      // The project's latest run page, "Latest {project} results"; null before it has a run,
      // when the primary is "Go to {project}" (design v9 item 12), a state of this kind.
      latestRunHref: string | null;
    }
  | {
      // Any other address (design v17 item 19): the site-wide not-found page.
      kind: 'page';
      path: ReactNode;
    }
  | {
      // /admin/links/{id} with no such link (design v18 item 14), inside the admin frame.
      kind: 'tracked-link';
      path: ReactNode;
    };

// design/components.md "NotFound (page)": nothing failed, so there is no Error badge and no retry,
// only a way forward. The page serves it with HTTP 404.
export function NotFound(props: NotFoundProps) {
  return (
    <main
      id="main"
      className={props.kind === 'tracked-link' ? `${styles.main} ${styles.admin}` : styles.main}
    >
      <div className={styles.eyebrow} data-part="eyebrow">
        404 · Not found
      </div>
      {props.kind === 'project' ? (
        <NoProject {...props} />
      ) : props.kind === 'run' ? (
        <NoRun {...props} />
      ) : props.kind === 'test' ? (
        <NoTest {...props} />
      ) : props.kind === 'tracked-link' ? (
        <NoTrackedLink {...props} />
      ) : (
        <NoPage {...props} />
      )}
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

function NoTest({ path, project, latestRunHref }: Extract<NotFoundProps, { kind: 'test' }>) {
  return (
    <>
      <h1 className={styles.title}>This test isn’t in {project.name}</h1>
      <Path path={path} />
      <p className={styles.body}>
        Test history follows each test’s key, so a renamed or moved test starts a new history under
        its new name. Nothing has reported under this key.
      </p>
      <div className={styles.actions}>
        {latestRunHref !== null ? (
          <Button href={latestRunHref} variant="primary">
            Latest {project.name} results
          </Button>
        ) : (
          <Button href={project.href} variant="primary">
            Go to {project.name}
          </Button>
        )}
        <Link href="/" className={styles.link}>
          Overview
        </Link>
      </div>
    </>
  );
}

function NoPage({ path }: Extract<NotFoundProps, { kind: 'page' }>) {
  return (
    <>
      <h1 className={styles.title}>Nothing at this address</h1>
      <Path path={path} />
      <p className={styles.body}>
        There’s no page here. The link may be mistyped, or the page may have moved. Every project’s
        results start from the overview.
      </p>
      <div className={styles.actions}>
        <Button href="/" variant="primary">
          Go to overview
        </Button>
        <Link href="/how-its-tested" className={styles.link}>
          How it’s tested
        </Link>
      </div>
    </>
  );
}

function NoTrackedLink({ path }: Extract<NotFoundProps, { kind: 'tracked-link' }>) {
  return (
    <>
      <h1 className={styles.title}>No tracked link at this address</h1>
      <Path path={path} />
      <p className={styles.body}>
        The link may have been deleted, or the address may be mistyped. Every tracked link is listed
        on the admin page.
      </p>
      <div className={styles.actions}>
        <Button href="/admin#tracked-links" variant="primary">
          Go to tracked links
        </Button>
      </div>
    </>
  );
}
