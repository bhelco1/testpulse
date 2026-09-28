import type { ReactNode } from 'react';

// Stroke icons redrawn from the design bundle's inline SVGs (24 viewBox). Each shape is fixed by
// the design; callers choose only the rendered size and stroke width the design gives for that use.
// Every icon sits beside the words it stands for, so all are hidden from assistive technology.
export interface IconProps {
  size: number;
  strokeWidth: number;
  className?: string;
}

interface SvgProps extends IconProps {
  linecap?: 'round';
  linejoin?: 'round';
  children: ReactNode;
}

function Svg({ size, strokeWidth, className, linecap, linejoin, children }: SvgProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap={linecap}
      strokeLinejoin={linejoin}
      className={className}
      focusable="false"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const Ring = () => <circle cx="12" cy="12" r="10" />;

export function CheckCircleIcon(props: IconProps) {
  return (
    <Svg {...props} linecap="round" linejoin="round">
      <Ring />
      <path d="m8 12 3 3 5-6" />
    </Svg>
  );
}

export function XCircleIcon(props: IconProps) {
  return (
    <Svg {...props} linecap="round">
      <Ring />
      <path d="m15 9-6 6M9 9l6 6" />
    </Svg>
  );
}

// Error only: a ring around "!". There is no triangle icon (v3).
export function AlertCircleIcon(props: IconProps) {
  return (
    <Svg {...props} linecap="round">
      <Ring />
      <path d="M12 7v6M12 17h.01" />
    </Svg>
  );
}

// Empty: a dashed ring around a dash. The dash is on the ring only, so the glyph stays solid.
export function EmptyIcon(props: IconProps) {
  return (
    <Svg {...props} linecap="round">
      <circle cx="12" cy="12" r="10" strokeDasharray="3.5 3" />
      <path d="M8 12h8" />
    </Svg>
  );
}

export function FlakyIcon(props: IconProps) {
  return (
    <Svg {...props} linecap="round" linejoin="round">
      <path d="M2 12h4l3-7 6 14 3-7h4" />
    </Svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Svg {...props} linecap="round">
      <Ring />
      <path d="M12 7v5l3 2" />
    </Svg>
  );
}

export function MinusCircleIcon(props: IconProps) {
  return (
    <Svg {...props} linecap="round">
      <Ring />
      <path d="M8 12h8" />
    </Svg>
  );
}

// "Runs in CI, not yet reported" uses 3.5 3 dashes; "Authored, not yet executed" uses round dots.
export function DashedCircleIcon({ dots = false, ...props }: IconProps & { dots?: boolean }) {
  return (
    <Svg {...props} linecap="round">
      <circle cx="12" cy="12" r="10" strokeDasharray={dots ? '1 3.2' : '3.5 3'} />
    </Svg>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </Svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Svg {...props} linecap="round">
      <path d="m6 9 6 6 6-6" />
    </Svg>
  );
}

export function ChevronUpIcon(props: IconProps) {
  return (
    <Svg {...props} linecap="round">
      <path d="m18 15-6-6-6 6" />
    </Svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Svg {...props} linecap="round">
      <path d="m9 6 6 6-6 6" />
    </Svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props} linecap="round" linejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </Svg>
  );
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <Svg {...props} linecap="round">
      <path d="M12 5v14M6 13l6 6 6-6" />
    </Svg>
  );
}
