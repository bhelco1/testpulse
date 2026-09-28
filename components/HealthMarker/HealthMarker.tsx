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
export type HealthState = { health: 'stale'; days: number } | { health: Exclude<Health, 'stale'> };

// kiosk: the kiosk ProjectCard footer, 24px.
export type HealthMarkerProps = HealthState & { variant?: 'web' | 'kiosk' };

interface Look {
  label: string;
  tone: 'pass' | 'attn' | 'neutral';
  Icon: ComponentType<IconProps>;
}

function lookOf(props: HealthState): Look {
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
  const variant = props.variant ?? 'web';
  return (
    <span
      className={`${styles.marker} ${styles[variant]} ${styles[tone]}`}
      data-health={props.health}
      data-tone={tone}
      data-variant={variant}
    >
      <Icon size={variant === 'kiosk' ? 24 : 13} strokeWidth={2.8} />
      {label}
    </span>
  );
}
