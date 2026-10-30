import Link from 'next/link';

import { ThemeToggle } from '../ThemeToggle/ThemeToggle';
import { Wordmark } from '../Wordmark/Wordmark';
import styles from './AdminHeader.module.css';

export interface AdminHeaderProps {
  // The sign-out server action, given only when the owner is signed in; the header then says how
  // and offers Sign out (design/components.md, Admin).
  signOut: (() => Promise<void>) | undefined;
}

// Admin's header (design/pages/Admin.dc.html): the site's wordmark with an ADMIN tag, then
// "Signed in with magic link", View public site and Sign out, and the theme toggle top right; two
// rows on a phone, without the sign-in method (v18).
export function AdminHeader({ signOut }: AdminHeaderProps) {
  return (
    <>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <header className={styles.header}>
        <div className={styles.brand}>
          <Link href="/admin" className={styles.wordmark}>
            <span className={styles.mark} aria-hidden="true" />
            <Wordmark />
          </Link>
          <span className={styles.tag}>ADMIN</span>
        </div>
        <nav aria-label="Admin" className={styles.nav}>
          {signOut !== undefined && (
            <span className={styles.method}>Signed in with magic link</span>
          )}
          <Link href="/" className={styles.link}>
            View public site
          </Link>
          {signOut !== undefined && (
            <form action={signOut} className={styles.signOutForm}>
              <button type="submit" className={styles.signOut}>
                Sign out
              </button>
            </form>
          )}
          {/* Keeps the nav clear of the toggle, which sits over its row's end. */}
          <span aria-hidden="true" className={styles.spacer} />
        </nav>
        <div className={styles.controls}>
          <ThemeToggle />
        </div>
      </header>
    </>
  );
}
