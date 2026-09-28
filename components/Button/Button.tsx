import type { ButtonHTMLAttributes, MouseEvent } from 'react';

import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  // Work in progress: the caller changes the label (such as "Saving…") and a ring turns before it.
  busy?: boolean;
}

// Disabled is aria-disabled rather than the native attribute, as the design specifies, so the
// button stays in the Tab order and can still be read; it is made inert here instead.
export function Button({
  variant = 'primary',
  type = 'button',
  busy = false,
  disabled = false,
  className,
  onClick,
  children,
  ...rest
}: ButtonProps) {
  const inert = busy || disabled;
  const classes = [styles.button, styles[variant], !inert && styles.live, className]
    .filter(Boolean)
    .join(' ');
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (inert) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }
  return (
    <button
      type={type}
      className={classes}
      data-variant={variant}
      aria-disabled={disabled || undefined}
      aria-busy={busy || undefined}
      onClick={handleClick}
      {...rest}
    >
      {busy && (
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
      )}
      {children}
    </button>
  );
}
