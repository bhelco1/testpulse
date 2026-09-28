import { LockIcon } from '../icons/icons';
import styles from './PrivateTag.module.css';

export interface PrivateTagProps {
  variant?: 'web' | 'kiosk';
}

// Marks a private project beside its name. Hiding its details is enforced by RLS, not here.
export function PrivateTag({ variant = 'web' }: PrivateTagProps) {
  const kiosk = variant === 'kiosk';
  return (
    <span className={`${styles.tag} ${styles[variant]}`} data-variant={variant}>
      <LockIcon size={kiosk ? 30 : 12} strokeWidth={kiosk ? 2.2 : 2.4} />
      {kiosk ? 'Private' : 'Private repository'}
    </span>
  );
}
