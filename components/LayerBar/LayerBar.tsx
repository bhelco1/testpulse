import type { LayerSegment } from '../../lib/design/layers';
import styles from './LayerBar.module.css';

export interface LayerBarProps {
  // From layerSegments: section 8 order, each layer in its fixed tone.
  layers: readonly LayerSegment[];
}

const formatCount = new Intl.NumberFormat('en-US');

export function LayerBar({ layers }: LayerBarProps) {
  return (
    <div>
      <div className={styles.bar} data-part="bar" aria-hidden="true">
        {layers.map((layer) => (
          <div
            key={layer.label}
            className={`${styles.segment} ${styles[`tone${layer.tone}`]}`}
            style={{ flexGrow: layer.count, flexShrink: 1, flexBasis: 0 }}
            data-tone={layer.tone}
          />
        ))}
      </div>
      <ul className={styles.labels}>
        {layers.map((layer) => (
          <li key={layer.label} className={styles.label}>
            <span>{layer.label}</span>
            <span>{formatCount.format(layer.count)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
