import type { ComponentType } from 'react';

import { ArrowDownIcon, ClockIcon, EmptyIcon, XCircleIcon, type IconProps } from '../icons/icons';
import { Skeleton } from '../Skeleton/Skeleton';
import styles from './StatTile.module.css';

export interface StatTileAttention {
  icon: 'stale' | 'empty' | 'below_floor';
  text: string;
}

const ATTENTION_ICON: Record<StatTileAttention['icon'], ComponentType<IconProps>> = {
  stale: ClockIcon,
  empty: EmptyIcon,
  below_floor: ArrowDownIcon,
};

interface Common {
  label: string;
  value: string;
  sub?: string;
  loading?: boolean;
}

// Neither colours the value. Attention replaces the sub-line (web) or the label (kiosk) with its
// text; fail (design v6: Projects passing while a project is red) shows the sub-line (web) or the
// label (kiosk) in --fail. A tile is one or the other.
type Tone = { attention?: StatTileAttention; fail?: never } | { attention?: never; fail?: boolean };

export type StatTileProps = Common & Tone & { variant?: 'web' | 'kiosk' };

function Attention({ attention, kiosk }: { attention: StatTileAttention; kiosk: boolean }) {
  const Icon = ATTENTION_ICON[attention.icon];
  return (
    <div className={styles.attention} data-part="attention">
      <Icon size={kiosk ? 22 : 12} strokeWidth={kiosk ? 2.6 : 2.8} />
      <span>{attention.text}</span>
    </div>
  );
}

function Fail({ text, kiosk }: { text: string; kiosk: boolean }) {
  return (
    <div className={styles.fail} data-part="fail">
      <XCircleIcon size={kiosk ? 22 : 12} strokeWidth={kiosk ? 2.6 : 2.8} />
      <span>{text}</span>
    </div>
  );
}

// Design v4 item 51: loading containers carry a hidden name.
const LOADING_LABEL = 'Loading stats';

export function StatTile({
  label,
  value,
  sub,
  attention,
  fail = false,
  loading = false,
  variant = 'web',
}: StatTileProps) {
  const hasAttention = attention !== undefined;

  if (variant === 'kiosk') {
    if (loading) {
      return (
        <div
          className={`${styles.tile} ${styles.kiosk}`}
          data-variant={variant}
          aria-busy="true"
          aria-label={LOADING_LABEL}
        >
          <Skeleton width="45%" height={22} />
          <Skeleton width="120px" height={52} radius={6} />
        </div>
      );
    }
    return (
      <div
        className={`${styles.tile} ${styles.kiosk}`}
        data-variant={variant}
        data-attention={hasAttention}
        data-fail={fail}
      >
        <span className={styles.kioskText}>
          {attention ? (
            <Attention attention={attention} kiosk />
          ) : fail ? (
            <Fail text={label} kiosk />
          ) : (
            <span className={styles.label} data-part="label">
              {label}
            </span>
          )}
          {sub && (
            <span className={styles.sub} data-part="sub">
              {sub}
            </span>
          )}
        </span>
        <span className={styles.value} data-part="value">
          {value}
        </span>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className={`${styles.tile} ${styles.web}`}
        data-variant={variant}
        aria-busy="true"
        aria-label={LOADING_LABEL}
      >
        <Skeleton width="60%" height={12} />
        <Skeleton width="45%" height={34} radius={6} className={styles.second} />
        <Skeleton width="75%" height={10} className={styles.third} />
      </div>
    );
  }

  return (
    <div
      className={`${styles.tile} ${styles.web}`}
      data-variant={variant}
      data-attention={hasAttention}
      data-fail={fail}
    >
      <div className={styles.label} data-part="label">
        {label}
      </div>
      <div className={styles.value} data-part="value">
        {value}
      </div>
      {attention ? (
        <Attention attention={attention} kiosk={false} />
      ) : fail && sub ? (
        <Fail text={sub} kiosk={false} />
      ) : (
        sub && (
          <div className={styles.sub} data-part="sub">
            {sub}
          </div>
        )
      )}
    </div>
  );
}
