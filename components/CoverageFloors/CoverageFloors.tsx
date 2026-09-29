import { CoverageBar } from '../CoverageBar/CoverageBar';
import styles from './CoverageFloors.module.css';

export interface CoverageFloorsProps {
  modules: readonly { module: string; pct: number; floor: number }[];
}

// The project page's coverage card (design/pages/Project Page.dc.html): each module's latest line
// coverage against the floor its CI enforces. The page draws no card without modules.
export function CoverageFloors({ modules }: CoverageFloorsProps) {
  if (modules.length === 0) return null;
  return (
    <div className={styles.card}>
      <h3 className={styles.title}>Line coverage against enforced floors</h3>
      <p className={styles.note}>
        The amber tick is the floor CI enforces; a build below it fails. Scale 0 to 100.
      </p>
      <div className={styles.rows}>
        {modules.map((row) => (
          <CoverageBar key={row.module} module={row.module} pct={row.pct} floor={row.floor} />
        ))}
      </div>
    </div>
  );
}
