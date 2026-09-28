import type { LayerSegment } from '../../lib/design/layers';
import styles from './LayerBar.module.css';

export interface LayerBarProps {
  // From layerSegments: section 8 order, each layer in its fixed tone.
  layers: readonly LayerSegment[];
  // kiosk: the kiosk ProjectCard, 14px tall with 24px labels.
  variant?: 'web' | 'kiosk';
}

const formatCount = new Intl.NumberFormat('en-US');

export function LayerBar({ layers, variant = 'web' }: LayerBarProps) {
  return (
    <div className={styles[variant]} data-variant={variant}>
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
            <span className={styles.count}>{formatCount.format(layer.count)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
