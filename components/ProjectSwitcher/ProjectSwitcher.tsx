'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';

import { ChevronDownIcon, ChevronUpIcon } from '../icons/icons';
import { StatusBadge, type BadgeStatus } from '../StatusBadge/StatusBadge';
import styles from './ProjectSwitcher.module.css';

export interface SwitcherProject {
  name: string;
  href: string;
  // The latest run's status, or not_reporting for a project with no runs yet.
  status: BadgeStatus;
}

export interface ProjectSwitcherProps {
  projects: readonly SwitcherProject[];
  // The project page being shown, if any.
  currentHref?: string;
}

// A disclosure rather than an ARIA menu: the items are ordinary links, reached with Tab.
export function ProjectSwitcher({ projects, currentHref }: ProjectSwitcherProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) {
      setOpen(false);
      buttonRef.current?.focus();
    }
  }

  // Focus moving to nothing (a click on the page) is left to the pointerdown handler, because
  // Safari does not focus a clicked button and would otherwise close the panel on the way to
  // the click that toggles it.
  function onBlur(event: FocusEvent) {
    const next = event.relatedTarget;
    if (next instanceof Node && !rootRef.current?.contains(next)) setOpen(false);
  }

  const Chevron = open ? ChevronUpIcon : ChevronDownIcon;
  return (
    <div ref={rootRef} className={styles.switcher} onKeyDown={onKeyDown} onBlur={onBlur}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.button}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        Projects <Chevron size={14} strokeWidth={2.4} />
      </button>
      <div id={panelId} className={styles.panel} hidden={!open}>
        <ul className={styles.list}>
          {projects.map((project) => {
            const current = project.href === currentHref;
            return (
              <li key={project.href}>
                <Link
                  href={project.href}
                  className={styles.item}
                  aria-current={current ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                >
                  <span className={styles.label}>
                    <span className={styles.name}>{project.name}</span>
                    {current && <span className={styles.current}>Current</span>}
                  </span>
                  <StatusBadge status={project.status} variant="inline" />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
