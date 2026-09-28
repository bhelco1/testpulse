import { LAYER_LABEL, type LayerSegment } from '../../lib/design/layers';
import { LAYER_ORDER, type Layer } from '../../lib/ingest/layer-rules';
import type { DeclaredSuite } from '../../lib/projects/schema';
import styles from './Pyramid.module.css';

export interface PyramidProps {
  // From layerSegments: section 8 order, unit first, each layer in its fixed tone.
  layers: readonly LayerSegment[];
  declared: readonly DeclaredSuite[];
  // Tests executed in the latest run; each layer's share is of this.
  total: number;
  // Beside the total, such as which platform is counted.
  note?: string;
}

const formatCount = new Intl.NumberFormat('en-US');

// A present layer never reads 0%, as the design draws it.
const shareOf = (count: number, total: number) =>
  `${Math.max(1, Math.round((count / total) * 100))}%`;

// Declared suites add up per layer and sit above the bars, tip first like the bars.
function declaredRows(declared: readonly DeclaredSuite[]): { layer: Layer; count: number }[] {
  const byLayer = new Map<Layer, number>();
  for (const suite of declared) {
    byLayer.set(suite.layer, (byLayer.get(suite.layer) ?? 0) + suite.count);
  }
  return [...LAYER_ORDER].reverse().flatMap((layer) => {
    const count = byLayer.get(layer);
    return count === undefined ? [] : [{ layer, count }];
  });
}

export function Pyramid({ layers, declared, total, note }: PyramidProps) {
  if (layers.length === 0) {
    return (
      <figure className={styles.pyramid}>
        <p className={styles.none} data-part="none">
          No tests executed yet.
        </p>
      </figure>
    );
  }
  const largest = Math.max(...layers.map((layer) => layer.count));
  return (
    <figure className={styles.pyramid}>
      <div className={styles.head} data-part="head">
        <div className={styles.totalGroup}>
          <span className={styles.total}>{formatCount.format(total)}</span>
          <span className={styles.caption}>tests executed in the latest run</span>
        </div>
        {note && <span className={styles.note}>{note}</span>}
      </div>
      <ul className={styles.rows}>
        {declaredRows(declared).map(({ layer, count }) => (
          <li
            key={`declared-${layer}`}
            className={`${styles.row} ${styles.declared}`}
            data-part="row"
            data-declared="true"
          >
            <span className={styles.label}>{LAYER_LABEL[layer]}</span>
            <span className={styles.declaredText}>
              {count} {layer === 'e2e' ? 'flows' : 'tests'} declared · not counted
            </span>
            <span />
          </li>
        ))}
        {[...layers].reverse().map((layer) => (
          <li key={layer.label} className={styles.row} data-part="row">
            <span className={styles.label}>{layer.label}</span>
            <div className={styles.barCell}>
              <div
                className={`${styles.bar} ${styles[`tone${layer.tone}`]}`}
                style={{ width: `${(layer.count / largest) * 100}%` }}
                data-part="bar"
                data-tone={layer.tone}
                aria-hidden="true"
              />
            </div>
            <span className={styles.count}>
              <b className={styles.figure}>{formatCount.format(layer.count)}</b>
              <span className={styles.pct} data-part="pct">
                {shareOf(layer.count, total)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
