import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import suite from '../../../playwright.config.ts';

// How Playwright schedules the suite's projects (spec section 16): the live-feed project runs
// after every other project has finished, and runs even when one of them fails, so a red page
// test cannot hide the live feed's own leak checks. Each case runs the real project graph with
// one trivial test per project (tests/e2e/support/order/), failing in one project at a time.

const CONFIG = 'tests/e2e/support/order/playwright.config.ts';
const LIVE = 'live';

interface Result {
  readonly status: string;
  readonly startTime: string;
  readonly duration: number;
}
interface Report {
  readonly suites: readonly {
    readonly specs: readonly {
      readonly tests: readonly { readonly projectName: string; readonly results: Result[] }[];
    }[];
  }[];
}
interface Ran {
  readonly status: string;
  readonly start: number;
  readonly end: number;
}

async function runGraph(
  fail: string | null,
): Promise<{ code: number | null; ran: Map<string, Ran> }> {
  const output = test.info().outputPath(fail ?? 'green');
  // A nested run must not see the variables this worker was started with.
  const env = { ...process.env };
  for (const name of Object.keys(env)) if (/^(TEST_|PW_)/.test(name)) delete env[name];
  const child = spawn('node_modules/.bin/playwright', ['test', '--config', CONFIG], {
    env: { ...env, TESTPULSE_ORDER_OUTPUT: output, TESTPULSE_ORDER_FAIL: fail ?? '' },
    stdio: 'ignore',
  });
  const [code] = (await once(child, 'exit')) as [number | null];
  const report = JSON.parse(readFileSync(path.join(output, 'report.json'), 'utf8')) as Report;
  const ran = new Map<string, Ran>();
  for (const spec of report.suites.flatMap((file) => file.specs)) {
    for (const { projectName, results } of spec.tests) {
      for (const result of results) {
        const start = Date.parse(result.startTime);
        ran.set(projectName, { status: result.status, start, end: start + result.duration });
      }
    }
  }
  return { code, ran };
}

// Every project that holds tests in the suite holds one here.
const withTests = (suite.projects ?? [])
  .filter(({ testMatch }) => !(Array.isArray(testMatch) && testMatch.length === 0))
  .map(({ name }) => String(name));

function expectLiveLast(ran: Map<string, Ran>) {
  const live = ran.get(LIVE);
  expect(live, 'the live project ran').toBeDefined();
  for (const [name, other] of ran) {
    if (name !== LIVE)
      expect(live?.start, `${LIVE} starts after ${name} ends`).toBeGreaterThanOrEqual(other.end);
  }
}

test.describe('the e2e project graph', () => {
  test('runs every project, the live feed last, when all pass', async () => {
    const { code, ran } = await runGraph(null);
    expect(code).toBe(0);
    expect([...ran.keys()].sort()).toEqual([...withTests].sort());
    expect([...ran.values()].map(({ status }) => status)).toEqual(withTests.map(() => 'passed'));
    expectLiveLast(ran);
  });

  for (const failing of withTests.filter((name) => name !== LIVE)) {
    test(`still runs the leak sweep and the live feed, last, when ${failing} fails`, async () => {
      const { code, ran } = await runGraph(failing);
      // The run stays red: one failure anywhere fails the whole command.
      expect(code).toBe(1);
      expect([...ran.keys()].sort()).toEqual([...withTests].sort());
      for (const [name, { status }] of ran)
        expect(status, name).toBe(name === failing ? 'failed' : 'passed');
      expectLiveLast(ran);
    });
  }
});
