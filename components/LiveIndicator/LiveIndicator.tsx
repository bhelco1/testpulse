import styles from './LiveIndicator.module.css';

export interface LiveIndicatorProps {
  // The realtime connection, not the run status.
  connected: boolean;
}

// tp-pulse is a global keyframes in tokens.css. It is named here rather than in the CSS module,
// which would rename it to a local keyframes that does not exist. The reduced-motion rule in
// tokens.css is !important, so it still stops the pulse.
const PULSE = { animation: 'tp-pulse var(--motion-pulse) ease-out infinite' };

export function LiveIndicator({ connected }: LiveIndicatorProps) {
  const state = connected ? 'on' : 'off';
  return (
    <span className={`${styles.indicator} ${styles[state]}`} data-state={state}>
      <span
        className={styles.dot}
        data-part="dot"
        aria-hidden="true"
        style={connected ? PULSE : undefined}
      />
      <span>{connected ? 'Live' : 'Offline · reconnecting'}</span>
    </span>
  );
}
