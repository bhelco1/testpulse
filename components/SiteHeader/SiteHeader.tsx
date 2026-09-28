import Link from 'next/link';

import { LiveIndicator } from '../LiveIndicator/LiveIndicator';
import { ProjectSwitcher, type SwitcherProject } from '../ProjectSwitcher/ProjectSwitcher';
import { ThemeToggle } from '../ThemeToggle/ThemeToggle';
import styles from './SiteHeader.module.css';

export interface SiteHeaderProps {
  projects: readonly SwitcherProject[];
  // The href of the project page being shown, if any.
  currentProject?: string;
  connected: boolean;
  current?: 'home' | 'how-its-tested';
}

const currentIf = (match: boolean) => (match ? ('page' as const) : undefined);

export function SiteHeader({ projects, currentProject, connected, current }: SiteHeaderProps) {
  return (
    <>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <header className={styles.header}>
        <Link href="/" className={styles.wordmark} aria-current={currentIf(current === 'home')}>
          <span className={styles.mark} data-part="mark" aria-hidden="true" />
          testpulse
        </Link>
        <nav aria-label="Site" className={styles.nav}>
          <ProjectSwitcher projects={projects} currentHref={currentProject} />
          <Link
            href="/how-its-tested"
            className={styles.link}
            aria-current={currentIf(current === 'how-its-tested')}
          >
            How it&apos;s tested
          </Link>
          <LiveIndicator connected={connected} />
          <ThemeToggle />
        </nav>
      </header>
    </>
  );
}
