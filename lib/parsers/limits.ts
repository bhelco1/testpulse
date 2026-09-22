import { ParseError, type ParseErrorOptions, type TestFailure } from './types';

// Spec section 5.6 caps failure text; suite and name caps are the Phase 1 "oversized fields" rule.
export const MAX_NAME_LENGTH = 1000;
export const MAX_FAILURE_MESSAGE_LENGTH = 2000;
export const MAX_FAILURE_DETAIL_LENGTH = 10_000;

// `results.duration_ms` is int4, so a per-test duration is capped at its maximum; a report
// duration is added to a timestamp, so it is capped at one year, far beyond any real run.
export const MAX_TEST_DURATION_MS = 2_147_483_647;
export const MAX_REPORT_DURATION_MS = 31_536_000_000;

// The largest epoch-millisecond value a Date can hold; beyond it `toISOString` throws.
export const MAX_EPOCH_MS = 8.64e15;

type TextField = 'suite' | 'name' | 'message' | 'detail';

const LONE_SURROGATE = /[\uD800-\uDFFF]/u;

function errorOptions(field: string, location: string | undefined): ParseErrorOptions {
  return location === undefined ? { field } : { field, location };
}

/**
 * Postgres `text` rejects U+0000 and any string that is not valid UTF-8, which a lone surrogate
 * is not. Both can arrive from JSON escapes or a raw byte. Returns what is wrong with the text
 * as the tail of a sentence, or undefined when it can be stored.
 */
export function storabilityIssue(value: string): string | undefined {
  if (value.includes('\u0000')) return 'U+0000, which cannot be stored';
  const lone = LONE_SURROGATE.exec(value);
  if (lone === null) return undefined;
  const codeUnit = lone[0].charCodeAt(0).toString(16).toUpperCase();
  return `a lone surrogate U+${codeUnit}, which cannot be stored`;
}

export function assertStorableText(field: TextField, value: string, location?: string): string {
  const issue = storabilityIssue(value);
  if (issue !== undefined) {
    throw new ParseError(`${field} contains ${issue}`, errorOptions(field, location));
  }
  return value;
}

/**
 * Refuses a duration the database cannot hold. The comparison is written so that NaN and
 * Infinity, which a huge decimal in the input produces, fail it too.
 */
export function assertDuration(
  scope: 'test' | 'report',
  field: string,
  valueMs: number,
  location?: string,
): number {
  const max = scope === 'test' ? MAX_TEST_DURATION_MS : MAX_REPORT_DURATION_MS;
  if (!(valueMs <= max)) {
    throw new ParseError(
      `${field} gives a ${scope} duration of ${valueMs} ms, above the ` +
        `${max.toLocaleString('en-US')} ms that can be stored`,
      errorOptions(field, location),
    );
  }
  return valueMs;
}

export function assertName(field: 'suite' | 'name', value: string, location?: string): string {
  assertStorableText(field, value, location);
  if (value.trim() === '') {
    throw new ParseError(`${field} is empty`, errorOptions(field, location));
  }
  if (value.length > MAX_NAME_LENGTH) {
    throw new ParseError(
      `${field} is longer than ${MAX_NAME_LENGTH.toLocaleString('en-US')} characters`,
      errorOptions(field, location),
    );
  }
  return value;
}

/** Truncates to at most `max` UTF-16 code units without leaving half of a surrogate pair behind. */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return LONE_SURROGATE.test(cut.slice(-1)) ? cut.slice(0, -1) : cut;
}

export function toFailure(message: string, detail: string, location?: string): TestFailure {
  assertStorableText('message', message, location);
  assertStorableText('detail', detail, location);
  return {
    message: truncate(message, MAX_FAILURE_MESSAGE_LENGTH),
    detail: truncate(detail, MAX_FAILURE_DETAIL_LENGTH),
  };
}

export function firstNonEmptyLine(text: string): string {
  return (
    text
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line !== '') ?? ''
  );
}

// Jest colours the per-file console report for the terminal; the codes are noise in stored text.
const ANSI_ESCAPE = /\u001b\[[0-?]*[ -/]*[@-~]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE, '');
}
