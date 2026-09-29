'use client';

// A client component: its handlers guard busy and disabled clicks, and a server page that uses
// the link form (NotFound's "Go to overview") cannot hand those handlers across the boundary.
import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, MouseEvent } from 'react';

import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface CommonProps {
  variant?: ButtonVariant;
  // Work in progress: the caller changes the label (such as "Saving…") and a ring turns before it.
  busy?: boolean;
  disabled?: boolean;
}

// With href the Button is a link, for an action that navigates (design v5 item 13): the same
// styling and states, only the element changes.
export type ButtonProps =
  | (CommonProps & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined })
  | (CommonProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { href: string });

function Spinner() {
  return (
    <svg
      className={styles.spinner}
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={3}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" className={styles.track} />
      <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

// Disabled is aria-disabled rather than the native attribute, as the design specifies, so the
// button stays in the Tab order and can still be read; it is made inert here instead.
export function Button({
  variant = 'primary',
  busy = false,
  disabled = false,
  className,
  children,
  ...rest
}: ButtonProps) {
  const inert = busy || disabled;
  const classes = [styles.button, styles[variant], !inert && styles.live, className]
    .filter(Boolean)
    .join(' ');
  const state = {
    className: classes,
    'data-variant': variant,
    'aria-disabled': disabled || undefined,
    'aria-busy': busy || undefined,
  };
  const content = (
    <>
      {busy && <Spinner />}
      {children}
    </>
  );

  if (rest.href !== undefined) {
    const { href, onClick, ...anchor } = rest;
    const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
      if (inert) {
        event.preventDefault();
        return;
      }
      onClick?.(event);
    };
    return (
      <Link href={href} {...anchor} {...state} onClick={handleClick}>
        {content}
      </Link>
    );
  }

  const { onClick, type = 'button', ...button } = rest;
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (inert) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
  return (
    <button type={type} {...button} {...state} onClick={handleClick}>
      {content}
    </button>
  );
}
