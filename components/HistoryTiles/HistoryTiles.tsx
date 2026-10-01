import type { HistoryTile } from '../../lib/pages/test-history';
import { TimedText } from '../RelativeTime/RelativeTime';
import styles from './HistoryTiles.module.css';

// The test history page's tiles (design/pages/Test History.dc.html; components.md, Test history
// page, "Tiles"): Runs, Failed, Flaky and Median time. The figure takes its tone; the label and
// sub-line say what it counts, so no status rests on colour alone.
export function HistoryTiles({ tiles }: { tiles: readonly HistoryTile[] }) {
  return (
    <ul className={styles.tiles} data-part="tiles">
      {tiles.map((tile) => (
        <li key={tile.label} className={styles.tile} data-tone={tile.tone}>
          <div className={styles.label} data-part="label">
            {tile.label}
          </div>
          <div className={styles.value} data-part="value">
            {tile.value}
          </div>
          <div className={styles.sub} data-part="sub">
            <TimedText parts={tile.sub} />
          </div>
        </li>
      ))}
    </ul>
  );
}
