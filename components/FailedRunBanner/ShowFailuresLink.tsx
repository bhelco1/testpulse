'use client';

import type { MouseEvent } from 'react';

import { useShowFailures } from '../RunResults/RunFilter';
import styles from './FailedRunBanner.module.css';

// "Show failure(s)": a link to Results, so it works without JavaScript, where every failure is
// already open. With scripts it also sets the table's status filter and focuses the first
// failing row, which the table does once it has the request.
export function ShowFailuresLink({ label, filter }: { label: string; filter: 'failed' | 'error' }) {
  const show = useShowFailures();
  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    document.getElementById('results')?.scrollIntoView();
    show(filter);
  }
  return (
    <a href="#results" className={styles.action} onClick={onClick}>
      {label}
    </a>
  );
}
