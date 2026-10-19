'use client';

import { useState } from 'react';

import { AlertCircleIcon } from '../icons/icons';
import styles from './CopyLink.module.css';

// Copying a tracked link (design/components.md, Admin, "Tracked links table", Copy): the button
// reads "Copied" once the browser took it; when the browser refuses, the full address is offered in
// a read-only field that selects itself on focus, under the row or in the link card.

export type CopyState = 'idle' | 'copied' | 'refused';

export function useCopy(url: string): { readonly state: CopyState; readonly copy: () => void } {
  const [state, setState] = useState<CopyState>('idle');
  const copy = () => {
    try {
      // Typed as always present; it is missing outside a secure context.
      const clipboard = navigator.clipboard as Clipboard | undefined;
      if (clipboard === undefined) {
        setState('refused');
        return;
      }
      clipboard.writeText(url).then(
        () => setState('copied'),
        () => setState('refused'),
      );
    } catch {
      setState('refused');
    }
  };
  return { state, copy };
}

export interface CopyButtonProps {
  readonly company: string;
  readonly state: CopyState;
  readonly copy: () => void;
  readonly className?: string;
}

export function CopyButton({ company, state, copy, className }: CopyButtonProps) {
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy link for ${company}`}
      className={className}
    >
      {state === 'copied' ? 'Copied' : 'Copy'}
    </button>
  );
}

/**
 * A link's address. The link card shows it whole; the table (`short`) shows "…/v/{token}", the
 * origin dropped since every row shares it, and keeps the whole address in the title
 * (design/components.md, Admin, "Tracked links table", LINK; v18 item 12).
 */
export function LinkAddress({
  origin,
  path,
  className,
  short = false,
}: {
  origin: string;
  path: string;
  className?: string;
  short?: boolean;
}) {
  if (!short) {
    return (
      <code className={className}>
        <span>{origin}</span>
        <span>{path}</span>
      </code>
    );
  }
  return (
    <code className={className} title={`${origin}${path}`}>
      <span aria-hidden="true">…</span>
      <span>{path}</span>
    </code>
  );
}

export interface CopyFallbackProps {
  readonly url: string;
  readonly company: string;
  /** row: under a table row, wrapping beside the words; stacked: in a card or a phone row. */
  readonly layout: 'row' | 'stacked';
}

export function CopyFallback({ url, company, layout }: CopyFallbackProps) {
  return (
    <div role="status" className={`${styles.fallback} ${styles[layout]}`}>
      <span className={styles.say}>
        <AlertCircleIcon size={15} strokeWidth={2.6} className={styles.icon} />
        Your browser blocked copying. Select the link and copy it.
      </span>
      <input
        readOnly
        value={url}
        onFocus={(event) => event.currentTarget.select()}
        aria-label={`Link for ${company}`}
        className={styles.field}
      />
    </div>
  );
}
