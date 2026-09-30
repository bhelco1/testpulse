import { formatCount, qty } from '../../lib/copy/count';
import { LAYER_LABEL, type LayerSegment } from '../../lib/design/layers';
import { LAYER_ORDER, type Layer } from '../../lib/ingest/layer-rules';
import type { DeclaredSuite } from '../../lib/projects/schema';
import { Skeleton } from '../Skeleton/Skeleton';
import styles from './Pyramid.module.css';

export interface PyramidData {
  // From layerSegments: section 8 order, unit first, each layer in its fixed tone.
  layers: readonly LayerSegment[];
  declared: readonly DeclaredSuite[];
  // Tests executed in the latest run; each layer's share is of this.
  total: number;
  // Beside the total, such as which platform is counted.
  note?: string;
}

export type PyramidProps = (PyramidData & { loading?: false }) | { loading: true };

// Design v4 item 6: the nearest whole percent, except that a share under 1% reads "<1%" rather
// than rounding to 0% or up to 1%.
const shareOf = (count: number, total: number) =>
  count / total < 0.01 ? '<1%' : `${Math.round((count / total) * 100)}%`;

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

// The bar widths the design draws for the loading rows, top to bottom.
const SKELETON_BARS = ['25%', '45%', '70%', '100%'];

export function Pyramid(props: PyramidProps) {
  return <div className={styles.root}>{props.loading ? <Loading /> : <Figure {...props} />}</div>;
}

function Loading() {
  return (
    <figure className={styles.pyramid} aria-busy="true" aria-label="Loading test layers">
      <div className={styles.rows}>
        <div className={styles.skeletonHead} data-part="skeleton-head">
          <Skeleton width="96px" height={44} radius={6} />
          <Skeleton width="45%" height={14} />
        </div>
        {SKELETON_BARS.map((width) => (
          <div key={width} className={styles.row} data-part="skeleton-row">
            <Skeleton width="64px" height={12} className={styles.skeletonLabel} />
            <div className={styles.barCell}>
              <Skeleton width={width} height={30} />
            </div>
            <Skeleton width="56px" height={12} />
          </div>
        ))}
      </div>
    </figure>
  );
}

function Figure({ layers, declared, total, note }: PyramidData) {
  if (layers.length === 0) {
    return (
      <figure className={styles.pyramid}>
        <p className={styles.none} data-part="none">
          No tests executed yet.
        </p>
      </figure>
    );
  }
  return (
    <figure className={styles.pyramid}>
      <div className={styles.head} data-part="head">
        <div className={styles.totalGroup}>
          <span className={styles.total}>{formatCount(total)}</span>
          <span className={styles.caption}>tests executed in the latest run</span>
        </div>
        {note && (
          <span className={styles.note} data-part="note">
            {note}
          </span>
        )}
      </div>
      <PyramidRows layers={layers} declared={declared} total={total} />
    </figure>
  );
}

export type PyramidRowsProps = Pick<PyramidData, 'layers' | 'declared' | 'total'>;

// The rows alone, tip first, for a card that states the total itself (design/pages/How Its
// Tested.dc.html, "testpulse’s own results"). The narrow grid needs a container around them.
export function PyramidRows({ layers, declared, total }: PyramidRowsProps) {
  const largest = Math.max(...layers.map((layer) => layer.count));
  return (
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
            {qty(count, layer === 'e2e' ? 'flow' : 'test')} declared · not counted
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
            <b className={styles.figure}>{formatCount(layer.count)}</b>
            <span className={styles.pct} data-part="pct">
              {shareOf(layer.count, total)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
