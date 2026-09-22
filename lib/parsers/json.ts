import type { z } from 'zod';

import { ParseError } from './types';

export function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ParseError(`Invalid JSON: ${reason}`);
  }
}

export function formatPath(path: ReadonlyArray<PropertyKey>): string {
  return path.reduce<string>((rendered, segment) => {
    if (typeof segment === 'number') return `${rendered}[${segment}]`;
    return rendered === '' ? String(segment) : `${rendered}.${String(segment)}`;
  }, '');
}

/** Validates against a Zod schema, converting the first issue into a ParseError naming its path. */
export function validateShape<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const message = issue?.message ?? 'Input does not match the expected shape';
  const location = issue === undefined ? '' : formatPath(issue.path);
  throw new ParseError(message, location === '' ? {} : { location });
}
