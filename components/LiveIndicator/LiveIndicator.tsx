import styles from './LiveIndicator.module.css';

export interface LiveIndicatorProps {
  // The realtime connection, not the run status.
  connected: boolean;
}

// tp-pulse is a global keyframes in tokens.css. It is named here rather than in the CSS module,
// which would rename it to a local keyframes that does not exist. The reduced-motion rule in
// tokens.css is !important, so it still stops the pulse.
const PULSE = { animation: 'tp-pulse var(--motion-pulse) ease-out infinite' };

// The dot alone, for places that say something other than "Live" beside it (the RunFeed header).
export function LiveDot({ connected }: LiveIndicatorProps) {
  const state = connected ? 'on' : 'off';
  return (
    <span
      className={`${styles.dot} ${styles[state]}`}
      data-part="dot"
      data-state={state}
      aria-hidden="true"
      style={connected ? PULSE : undefined}
    />
  );
}

export function LiveIndicator({ connected }: LiveIndicatorProps) {
  return (
    <span className={styles.indicator} data-state={connected ? 'on' : 'off'}>
      <LiveDot connected={connected} />
      <span>{connected ? 'Live' : 'Offline · reconnecting'}</span>
    </span>
  );
}
