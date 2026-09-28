import { spawn } from 'node:child_process';
import { once } from 'node:events';

import { expect, test } from '@playwright/test';

import { FIXED_NOW_VAR as FIXED_NOW } from '../../../lib/clock.ts';
import { SEED_NOW } from '../../../lib/seed/plan.ts';

// The server under test and the startup refusal (spec section 16, "Fixed time"). These run
// against the production build the webServer made, with `next start` itself as the entry point.

test('the server under test runs on the seed clock', () => {
  // playwright.config.ts captures this from the server's own startup log (instrumentation.ts).
  expect(process.env.TESTPULSE_SERVER_FIXED_NOW, 'instant logged by the server').toBe(SEED_NOW);
});

interface Started {
  readonly output: () => string;
  readonly exited: Promise<number | null>;
  readonly stop: () => Promise<void>;
}

// Each test has its own port, so a server that failed to stop cannot answer for another test.
function startNext(port: number, env: Record<string, string>): Started {
  const child = spawn('node_modules/.bin/next', ['start', '--port', String(port)], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
  const exited = once(child, 'exit').then(([code]) => code as number | null);
  return {
    output: () => output,
    exited,
    stop: async () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        await exited;
      }
    },
  };
}

async function reachable(port: number): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${port}/`);
    return true;
  } catch {
    return false;
  }
}

test.describe('next start with a fixed clock', () => {
  test('refuses to start when VERCEL_ENV is production', async () => {
    const server = startNext(3101, { [FIXED_NOW]: SEED_NOW, VERCEL_ENV: 'production' });
    try {
      expect(await server.exited, server.output()).toBe(1);
      expect(server.output()).toContain(
        `testpulse refuses to start: ${FIXED_NOW} is set and VERCEL_ENV is production.`,
      );
      expect(await reachable(3101), 'nothing listens after the refusal').toBe(false);
    } finally {
      await server.stop();
    }
  });

  test('refuses to start on a malformed instant', async () => {
    const server = startNext(3102, { [FIXED_NOW]: 'next tuesday', VERCEL_ENV: 'preview' });
    try {
      expect(await server.exited, server.output()).toBe(1);
      expect(server.output()).toContain(`${FIXED_NOW} must be a UTC instant`);
      expect(await reachable(3102), 'nothing listens after the refusal').toBe(false);
    } finally {
      await server.stop();
    }
  });

  // Control for the two above: the same build, command and check do start and serve outside
  // production, so their refusals are the clock check and not a server that cannot start at all.
  test('starts and serves on a preview deployment', async () => {
    const server = startNext(3103, { [FIXED_NOW]: SEED_NOW, VERCEL_ENV: 'preview' });
    try {
      await expect
        .poll(server.output, { timeout: 15_000 })
        .toContain(`clock fixed by ${FIXED_NOW} at ${SEED_NOW}`);
      const response = await fetch('http://127.0.0.1:3103/');
      expect(response.status).toBe(200);
    } finally {
      await server.stop();
    }
  });
});
