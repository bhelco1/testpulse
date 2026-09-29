import type { ReactNode } from 'react';

import type { HeroView } from '../../lib/pages/project';
import { HealthMarker } from '../HealthMarker/HealthMarker';
import { ExternalLinkIcon, LockIcon } from '../icons/icons';
import { Notice } from '../Notice/Notice';
import styles from './ProjectHero.module.css';

export interface ProjectHeroProps {
  hero: HeroView;
  // The latest run card, beside the introduction.
  children: ReactNode;
}

const PRIVATE_NOTE =
  'This repository is private, so failure details and source links are hidden. Counts, trends, and test names are real.';

// The top of the project page (design/pages/Project Page.dc.html): a stale project's notice,
// then the project's name, tagline, description and reporting health beside its latest run.
export function ProjectHero({ hero, children }: ProjectHeroProps) {
  return (
    <>
      {hero.stale && (
        <div className={styles.stale}>
          <Notice tone="attn" icon="clock" title={hero.stale.title} body={hero.stale.body} />
        </div>
      )}
      <section className={styles.hero}>
        <div className={styles.intro}>
          <h1 className={styles.name}>
            {hero.name}
            {hero.private && (
              <span role="img" aria-label="Private repository" className={styles.lock}>
                <LockIcon size={26} strokeWidth={2.2} />
              </span>
            )}
          </h1>
          <p className={styles.tagline}>{hero.tagline}</p>
          {hero.paragraphs.map((paragraph, index) => (
            <p key={index} className={styles.description}>
              {paragraph}
            </p>
          ))}
          <div className={styles.meta}>
            <span className={styles.health}>
              <HealthMarker {...hero.health} />
              {hero.healthDetail !== null && (
                <span className={styles.detail} data-part="health-detail">
                  {hero.healthDetail}
                </span>
              )}
            </span>
            {hero.repoUrl !== null && (
              <a href={hero.repoUrl} className={styles.source}>
                Source on GitHub
                <ExternalLinkIcon size={13} strokeWidth={2.4} />
              </a>
            )}
          </div>
          {hero.private && (
            <div className={styles.privateNote}>
              <Notice tone="neutral" icon="lock" body={PRIVATE_NOTE} />
            </div>
          )}
        </div>
        {children}
      </section>
    </>
  );
}
