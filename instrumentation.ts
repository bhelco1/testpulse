import { checkClockAtStartup } from './lib/clock.ts';

// Next.js calls register() once when a server instance starts. Next 16 only logs a throw from
// here and keeps the server listening, answering every request with a 500, so in the Node.js
// runtime a refusal exits the process instead: the server does not start at all.
// tests/e2e/harness/server.spec.ts proves it against a real `next start`.
export async function register(): Promise<void> {
  let clockNotice: string | null;
  try {
    clockNotice = checkClockAtStartup(process.env);
  } catch (error) {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
    throw error;
  }
  if (clockNotice !== null) console.info(clockNotice);
}
