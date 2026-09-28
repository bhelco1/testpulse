import { ArrowDownIcon } from '../icons/icons';
import styles from './CoverageBar.module.css';

export interface CoverageBarProps {
  module: string;
  pct: number;
  floor: number;
  // kiosk: the kiosk ProjectCard row, drawn with the figure only; its legend row explains the
  // floor marker.
  variant?: 'web' | 'kiosk';
}

function formatPct(pct: number): string {
  return pct === 100 ? '100%' : `${pct.toFixed(1)}%`;
}

const clamp = (n: number) => Math.min(100, Math.max(0, n));

// The scale always runs 0 to 100, so small headroom looks small.
export function CoverageBar({ module, pct, floor, variant = 'web' }: CoverageBarProps) {
  const state = pct < floor ? 'below' : pct === floor ? 'at' : 'above';
  const kiosk = variant === 'kiosk';
  const below = state === 'below';
  return (
    <div
      className={[styles.row, kiosk && styles.kiosk, below && styles.below]
        .filter(Boolean)
        .join(' ')}
      data-state={state}
      data-variant={variant}
    >
      <span className={styles.module} title={module}>
        {module}
      </span>
      <div className={styles.track} data-part="track" aria-hidden="true">
        <div className={styles.fill} data-part="fill" style={{ width: `${clamp(pct)}%` }} />
        <div className={styles.floor} data-part="floor" style={{ left: `${clamp(floor)}%` }} />
      </div>
      <span className={styles.value} data-part="value">
        {below && (
          <ArrowDownIcon size={kiosk ? 22 : 13} strokeWidth={2.8} className={styles.arrow} />
        )}
        <b className={styles.figure}>{formatPct(pct)}</b>
        {!kiosk && (
          <span className={styles.floorLabel}>
            {below ? `below floor ${floor}%` : `floor ${floor}%`}
          </span>
        )}
      </span>
    </div>
  );
}
