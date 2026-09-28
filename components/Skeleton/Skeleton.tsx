import styles from './Skeleton.module.css';

export interface SkeletonProps {
  // Sizes come from the design for the content being stood in for.
  width: string;
  height: number;
  radius?: number;
  className?: string;
}

// tp-shimmer is a global keyframes in tokens.css. It is named here rather than in the CSS module,
// which would rename it to a local keyframes that does not exist. The reduced-motion rule in
// tokens.css is !important, so it still stops the shimmer.
const SHIMMER = 'tp-shimmer 1.6s ease-in-out infinite';

export function Skeleton({ width, height, radius = 4, className }: SkeletonProps) {
  return (
    <span
      className={[styles.block, className].filter(Boolean).join(' ')}
      style={{ width, height, borderRadius: radius, animation: SHIMMER }}
      data-part="skeleton"
      aria-hidden="true"
    />
  );
}
