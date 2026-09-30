import { formatTrendValue } from '../../lib/charts/format';
import { ArrowDownIcon } from '../icons/icons';
import styles from './CoverageBar.module.css';

export interface CoverageBarProps {
  module: string;
  pct: number;
  // Null for a module missing from coverage_floors: no marker, no floor text, never amber
  // (design v8 item 15).
  floor: number | null;
  // kiosk: the kiosk ProjectCard row, drawn with the figure only; its legend row explains the
  // floor marker.
  variant?: 'web' | 'kiosk';
}

// The design writes full coverage as "100%"; anything else takes one decimal, rounded down by the
// shared percentage rule so 79.96% under an 80% floor never reads "80.0%".
function formatPct(pct: number): string {
  return pct === 100 ? '100%' : formatTrendValue(pct, 'pct', true);
}

const clamp = (n: number) => Math.min(100, Math.max(0, n));

// The scale always runs 0 to 100, so small headroom looks small.
export function CoverageBar({ module, pct, floor, variant = 'web' }: CoverageBarProps) {
  const state = floor === null ? 'none' : pct < floor ? 'below' : pct === floor ? 'at' : 'above';
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
        {floor !== null && (
          <div className={styles.floor} data-part="floor" style={{ left: `${clamp(floor)}%` }} />
        )}
      </div>
      <span className={styles.value} data-part="value">
        {below && (
          <ArrowDownIcon size={kiosk ? 22 : 13} strokeWidth={2.8} className={styles.arrow} />
        )}
        <b className={styles.figure}>{formatPct(pct)}</b>
        {!kiosk && floor !== null && (
          <span className={styles.floorLabel}>
            {below ? `below floor ${floor}%` : `floor ${floor}%`}
          </span>
        )}
      </span>
    </div>
  );
}
