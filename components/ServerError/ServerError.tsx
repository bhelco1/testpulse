'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { MouseEvent } from 'react';

import {
  SERVER_ERROR_BODY,
  SERVER_ERROR_HEADLINE,
  SERVER_ERROR_TITLE,
  serverErrorKind,
} from '../../lib/pages/server-error';
import { SOURCE_URL } from '../../lib/pages/site';
import { Breaks } from '../Breaks/Breaks';
import { Button } from '../Button/Button';
import { PageFrame } from '../PageFrame/PageFrame';
import { SiteFooter } from '../SiteFooter/SiteFooter';
import { SiteHeader } from '../SiteHeader/SiteHeader';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import styles from './ServerError.module.css';

// The site's own page when a project, run or test page's data read fails (design v21 item 1,
// components.md "Server error (page)"; ServerError.dc.html), rendered by the route's error
// boundary. The read failed, so nothing from the database is shown: no breadcrumbs (they need the
// project's name), no Live, no "Last report received", and the Projects menu says so. Only the
// requested path comes from the URL. The copy names no cause: a boundary cannot tell an outage
// from a bug.

export function ServerError({ onRetry }: { onRetry: () => void }) {
  const path = usePathname();
  const search = useSearchParams().toString();
  const retryHref = search === '' ? path : `${path}?${search}`;
  // Without scripts "Try again" is a link to this address. With them it retries in place: a
  // navigation to the page already shown would leave the boundary as it is.
  const retry = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    onRetry();
  };
  return (
    <PageFrame>
      <title>{SERVER_ERROR_TITLE}</title>
      <SiteHeader projects="unavailable" />
      <main id="main" className={styles.main}>
        <section role="alert">
          <StatusBadge status="error" />
          <h1 className={styles.title}>{SERVER_ERROR_HEADLINE[serverErrorKind(path)]}</h1>
          {/* A flex chip, as NotFound's: the path is one span so its soft breaks wrap as a run. */}
          <div className={styles.path} data-part="path">
            <span className={styles.pathText}>
              <Breaks text={path} rule="path" />
            </span>
          </div>
          <p className={styles.body}>{SERVER_ERROR_BODY}</p>
          <div className={styles.actions}>
            <Button href={retryHref} onClick={retry}>
              Try again
            </Button>
            <Link href="/" className={styles.link}>
              Go to overview
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter sourceHref={SOURCE_URL} />
    </PageFrame>
  );
}
