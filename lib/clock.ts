// The one way pages and stats read the current time (spec section 16, "Fixed time"). Pure: the
// environment and the wall clock are passed in, and default to the process's own.

export const FIXED_NOW_VAR = 'TESTPULSE_FIXED_NOW';

export type ClockEnv = Readonly<Record<string, string | undefined>>;

// Only the form Date#toISOString produces, milliseconds optional. Anything looser, such as an
// offset or a bare date, is read differently by different parsers, so it is refused.
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

/** Longest prefix of a bad value worth echoing. The value is not a secret. */
const ECHO_LIMIT = 40;

function echoed(value: string): string {
  return JSON.stringify(value.length > ECHO_LIMIT ? `${value.slice(0, ECHO_LIMIT)}…` : value);
}

function parseFixedNow(value: string): Date {
  const parsed = new Date(value);
  // Date rolls 2026-02-30 over to March rather than rejecting it; the round trip catches that.
  const valid =
    UTC_INSTANT.test(value) &&
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 19) === value.slice(0, 19);
  if (!valid) {
    throw new Error(
      `${FIXED_NOW_VAR} must be a UTC instant like 2026-10-05T12:00:00.000Z; got ${echoed(value)}`,
    );
  }
  return parsed;
}

// Production is checked before the value is parsed, so any value there, well formed or not,
// gets the same refusal.
function readFixedNow(env: ClockEnv): Date | null {
  const value = env[FIXED_NOW_VAR];
  if (value === undefined) return null;
  if (env.VERCEL_ENV === 'production') {
    throw new Error(
      `testpulse refuses to start: ${FIXED_NOW_VAR} is set and VERCEL_ENV is production. ` +
        'A fixed clock would freeze the live site; remove it from the production environment.',
    );
  }
  return parseFixedNow(value);
}

/** The instant pages and stats treat as now. */
export function now(env: ClockEnv = process.env, wallClock: () => Date = () => new Date()): Date {
  const fixed = readFixedNow(env);
  return fixed ?? wallClock();
}

/**
 * Run once when a server starts (instrumentation.ts). Throws if the server must not start;
 * otherwise returns the line to log when the clock is fixed, so the setting is never silent.
 */
export function checkClockAtStartup(env: ClockEnv): string | null {
  const fixed = readFixedNow(env);
  return fixed === null
    ? null
    : `testpulse: clock fixed by ${FIXED_NOW_VAR} at ${fixed.toISOString()}`;
}
