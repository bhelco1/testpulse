import { ParseError, type ParseErrorOptions, type TestFailure } from './types';

// Spec section 5.6 caps failure text; suite and name caps are the Phase 1 "oversized fields" rule.
export const MAX_NAME_LENGTH = 1000;
export const MAX_FAILURE_MESSAGE_LENGTH = 2000;
export const MAX_FAILURE_DETAIL_LENGTH = 10_000;

type TextField = 'suite' | 'name' | 'message' | 'detail';

const LONE_SURROGATE = /[\uD800-\uDFFF]/u;

function errorOptions(field: TextField, location: string | undefined): ParseErrorOptions {
  return location === undefined ? { field } : { field, location };
}

/**
 * Postgres `text` rejects U+0000 and any string that is not valid UTF-8, which a lone surrogate
 * is not. Both can arrive from JSON escapes or a raw byte, so they are refused here with a
 * specific message instead of surfacing as a database error.
 */
export function assertStorableText(field: TextField, value: string, location?: string): string {
  if (value.includes('\u0000')) {
    throw new ParseError(
      `${field} contains U+0000, which cannot be stored`,
      errorOptions(field, location),
    );
  }
  const lone = LONE_SURROGATE.exec(value);
  if (lone !== null) {
    const codeUnit = lone[0].charCodeAt(0).toString(16).toUpperCase();
    throw new ParseError(
      `${field} contains a lone surrogate U+${codeUnit}, which cannot be stored`,
      errorOptions(field, location),
    );
  }
  return value;
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
