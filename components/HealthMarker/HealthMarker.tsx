import type { ComponentType } from 'react';

import {
  ArrowDownIcon,
  CheckIcon,
  ClockIcon,
  DashedCircleIcon,
  EmptyIcon,
  type IconProps,
} from '../icons/icons';
import styles from './HealthMarker.module.css';

export type Health = 'healthy' | 'stale' | 'empty' | 'below_floor' | 'not_reporting';

// `days` is required for stale, the only state whose words include it.
export type HealthMarkerProps =
  { health: 'stale'; days: number } | { health: Exclude<Health, 'stale'> };

interface Look {
  label: string;
  tone: 'pass' | 'attn' | 'neutral';
  Icon: ComponentType<IconProps>;
}

function lookOf(props: HealthMarkerProps): Look {
  switch (props.health) {
    case 'healthy':
      return { label: 'Reporting healthy', tone: 'pass', Icon: CheckIcon };
    case 'stale':
      return { label: `No report in ${props.days} days`, tone: 'attn', Icon: ClockIcon };
    case 'empty':
      return { label: 'Last run empty', tone: 'attn', Icon: EmptyIcon };
    case 'below_floor':
      return { label: 'Coverage below floor', tone: 'attn', Icon: ArrowDownIcon };
    case 'not_reporting':
      return { label: 'Not reporting yet', tone: 'neutral', Icon: DashedCircleIcon };
  }
}

export function HealthMarker(props: HealthMarkerProps) {
  const { label, tone, Icon } = lookOf(props);
  return (
    <span
      className={`${styles.marker} ${styles[tone]}`}
      data-health={props.health}
      data-tone={tone}
    >
      <Icon size={13} strokeWidth={2.8} />
      {label}
    </span>
  );
}
