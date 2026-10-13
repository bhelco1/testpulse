'use client';

import { createContext, type ReactNode, useCallback, useContext, useState } from 'react';

import { ClockIcon } from '../icons/icons';
import styles from './AdminMain.module.css';

// Admin's signed-in page frame (design/pages/Admin.dc.html, SIGNED IN: MAIN and LINK DETAIL) and
// its session-expired alert (design/components.md, Admin, "Page states"): when an action is
// refused because the session has ended (401), an attn Notice at the top of the page, role=alert,
// says what was not done, that nothing changed, and offers "Sign in again". The sections report a
// refusal through useSessionEnded; what they hold (the create form's entries) stays as it was.

type Report = (sentence: string) => void;
const SessionEnded = createContext<Report>(() => undefined);

/** For an admin section: tells the page an action was refused for want of a session. */
export const useSessionEnded = (): Report => useContext(SessionEnded);

export interface AdminMainProps {
  readonly variant: 'main' | 'detail';
  /** What comes before the notice: the heading row on the main page, the breadcrumb on detail. */
  readonly top: ReactNode;
  readonly children: ReactNode;
}

export function AdminMain({ variant, top, children }: AdminMainProps) {
  const [sentence, setSentence] = useState<string | null>(null);
  const report = useCallback<Report>((text) => setSentence(text), []);
  return (
    <SessionEnded.Provider value={report}>
      <main id="main" className={`${styles.frame} ${styles[variant]}`}>
        {top}
        {sentence !== null && (
          <div role="alert" className={styles.notice}>
            <ClockIcon size={18} strokeWidth={2.6} className={styles.icon} />
            <div className={styles.text}>
              <div className={styles.title}>Your session has ended</div>
              <p className={styles.body}>{sentence}</p>
            </div>
            {/* A full load of /admin, which shows the sign-in form once the session is gone. */}
            <a href="/admin" className={styles.signIn}>
              Sign in again
            </a>
          </div>
        )}
        {children}
      </main>
    </SessionEnded.Provider>
  );
}
