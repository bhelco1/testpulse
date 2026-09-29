import { formatElapsed } from '../../lib/copy/elapsed';
import { formatCount, qty } from '../../lib/copy/count';
import type { GreenStreak } from '../../lib/stats/streak';
import type { TimeToGreen } from '../../lib/stats/time-to-green';
import { XCircleIcon } from '../icons/icons';
import styles from './RecoveryStats.module.css';

// Design v6 item 3; components.md RecoveryStats. The project page's two recovery cells, from
// spec section 11, for one project only: its green streak and its time to green, with "Red now"
// while its latest default-branch run is failed. The page's stat row is a wrapping flex row, and
// each cell brings its flex basis (design v7 item 17).

export interface RecoveryStatsProps {
  greenStreak: GreenStreak;
  timeToGreen: TimeToGreen;
}

export function RecoveryStats({ greenStreak, timeToGreen }: RecoveryStatsProps) {
  const { recoveries, medianMs, worstMs, stillRed } = timeToGreen;
  const recovered = recoveries.length > 0 && medianMs !== null && worstMs !== null;
  return (
    <>
      <div className={styles.streakCell} data-part="cell">
        <div className={styles.label} data-part="label">
          Green streak
        </div>
        <div className={styles.streakValue} data-part="value">
          <span className={styles.value}>{formatCount(greenStreak.current)}</span>
          <span className={styles.unit}>{greenStreak.current === 1 ? 'run' : 'runs'}</span>
        </div>
        <div className={`${styles.sub} ${styles.longest}`} data-part="sub">
          <span>Longest</span>
          <span>{qty(greenStreak.longest, 'run')}</span>
        </div>
      </div>
      <div className={styles.greenCell} data-part="cell">
        <div className={styles.label} data-part="label">
          Time to green
        </div>
        <div className={`${styles.value} ${styles.greenValue}`} data-part="value">
          {recovered ? formatElapsed(medianMs) : 'None'}
        </div>
        <div className={`${styles.sub} ${styles.greenSub}`} data-part="sub">
          {recovered
            ? `Median of ${formatCount(recoveries.length)}, 90 days · worst ${formatElapsed(worstMs)}`
            : 'No recoveries in 90 days'}
        </div>
        {stillRed !== null && (
          <div className={styles.redNow} data-part="red-now">
            <XCircleIcon size={12} strokeWidth={2.8} />
            <span>Red now for</span>
            <span>{formatElapsed(stillRed.elapsedMs)}</span>
          </div>
        )}
      </div>
    </>
  );
}
