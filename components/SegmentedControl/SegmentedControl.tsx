'use client';

import type { KeyboardEvent } from 'react';

import { formatCount } from '../../lib/copy/count';

import styles from './SegmentedControl.module.css';

export interface SegmentedOption<V extends string> {
  value: V;
  label: string;
  // Shown after the label, such as the number of results with that status.
  count?: number;
  // Failed and Error read in --fail while there are any.
  tone?: 'fail';
}

export interface SegmentedControlProps<V extends string> {
  // The group's accessible name.
  label: string;
  options: readonly SegmentedOption<V>[];
  value: V;
  onChange: (value: V) => void;
  wrap?: boolean;
}

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

// The design draws a radio group, so it behaves as one (WAI-ARIA radio group pattern): one Tab
// stop on the checked option, and the arrow keys move and select, wrapping at the ends.
const STEP: Readonly<Record<string, (index: number, count: number) => number>> = {
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowDown: (index, count) => (index + 1) % count,
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  ArrowUp: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_index, count) => count - 1,
};

export function SegmentedControl<V extends string>({
  label,
  options,
  value,
  onChange,
  wrap = false,
}: SegmentedControlProps<V>) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = STEP[event.key];
    if (!step) return;
    event.preventDefault();
    const next = step(index, options.length);
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
      [next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={label} className={cx(styles.group, wrap && styles.wrap)}>
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className={cx(styles.option, checked && styles.on, option.tone && styles[option.tone])}
            data-tone={option.tone}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            <span>{option.label}</span>
            {/* The space keeps "Failed 1" two words for assistive technology; flex drops it. */}
            {option.count !== undefined && (
              <>
                {' '}
                <span>{formatCount(option.count)}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
