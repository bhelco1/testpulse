import type { ComponentType } from 'react';

import {
  AlertCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  DashedCircleIcon,
  EmptyIcon,
  FlakyIcon,
  MinusCircleIcon,
  XCircleIcon,
  type IconProps,
} from '../icons/icons';
import styles from './StatusBadge.module.css';

// No "running": runs are reported only once finished (spec non-goal: no streaming).
export const BADGE_STATUSES = [
  'passed',
  'failed',
  'error',
  'empty',
  'skipped',
  'flaky',
  'stale',
  'not_reporting',
] as const;
export type BadgeStatus = (typeof BADGE_STATUSES)[number];

// pill: headers and cards. inline: rows, tables and the project switcher. kiosk: the pill on the
// kiosk ProjectCard.
export const BADGE_VARIANTS = ['pill', 'inline', 'kiosk'] as const;
export type BadgeVariant = (typeof BADGE_VARIANTS)[number];

type Tone = 'pass' | 'fail' | 'attn' | 'neutral';

const STATUS: Record<BadgeStatus, { word: string; tone: Tone; Icon: ComponentType<IconProps> }> = {
  passed: { word: 'Passed', tone: 'pass', Icon: CheckCircleIcon },
  failed: { word: 'Failed', tone: 'fail', Icon: XCircleIcon },
  error: { word: 'Error', tone: 'fail', Icon: AlertCircleIcon },
  empty: { word: 'Empty', tone: 'attn', Icon: EmptyIcon },
  skipped: { word: 'Skipped', tone: 'neutral', Icon: MinusCircleIcon },
  flaky: { word: 'Flaky', tone: 'attn', Icon: FlakyIcon },
  stale: { word: 'Stale', tone: 'attn', Icon: ClockIcon },
  not_reporting: { word: 'Not reporting yet', tone: 'neutral', Icon: DashedCircleIcon },
};

const ICON_SIZE: Record<BadgeVariant, number> = { pill: 14, inline: 15, kiosk: 26 };

export interface StatusBadgeProps {
  status: BadgeStatus;
  variant?: BadgeVariant;
}

export function StatusBadge({ status, variant = 'pill' }: StatusBadgeProps) {
  const { word, tone, Icon } = STATUS[status];
  return (
    <span
      className={[styles.badge, variant === 'kiosk' && styles.pill, styles[variant], styles[tone]]
        .filter(Boolean)
        .join(' ')}
      data-status={status}
      data-variant={variant}
      data-tone={tone}
    >
      <Icon size={ICON_SIZE[variant]} strokeWidth={2.6} />
      {word}
    </span>
  );
}
