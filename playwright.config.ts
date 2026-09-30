import nextEnv from '@next/env';
import { defineConfig, devices } from '@playwright/test';

import { FIXED_NOW_VAR } from './lib/clock.ts';
import { SEED_NOW } from './lib/seed/plan.ts';

const CI = Boolean(process.env.CI);

// scripts/e2e-docker.sh sets this when the suite runs inside the pinned Playwright image, the
// only place visual snapshots render the same way twice (spec section 16, "Visual snapshots").
const IN_IMAGE = Boolean(process.env.TESTPULSE_E2E_IMAGE);
if (CI && !IN_IMAGE) {
  throw new Error('In CI, e2e runs inside the pinned Playwright image: npm run test:e2e:docker');
}
if (!IN_IMAGE) {
  console.info(
    'Visual snapshots are compared only inside the Playwright image; @visual tests are left out ' +
      'of this run. Use npm run test:e2e:docker for the full suite.',
  );
}

// Local keys live in .env.local; in CI and in the container they are already in the environment.
// Loaded here so the server is handed them explicitly and a missing one fails before the build.
nextEnv.loadEnvConfig(process.cwd(), true);
const SUPABASE_VARS = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] as const;
const supabaseEnv: Record<string, string> = {};
for (const name of SUPABASE_VARS) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`e2e needs ${name} for local Supabase; run supabase start (see .env.example)`);
  }
  supabaseEnv[name] = value;
}

// Viewports are the design bundle's artboards: desktop from design/pages/Review.dc.html
// (1440 × 900) and phone from design/pages/Phone Views.dc.html (390 × 844).
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const chrome = devices['Desktop Chrome'];
const phone = { ...chrome, viewport: PHONE, isMobile: true, hasTouch: true };

// Tags route tests to projects. @visual: a toHaveScreenshot comparison. @js: needs the page's
// scripts. @no-js: checks the page with scripts disabled.
const withJs = IN_IMAGE ? /@no-js/ : /@no-js|@visual/;
const withoutJs = /@js|@visual/;

// The live-feed spec writes reports while its pages are open, which changes the landing page and
// every page's header and footer, so it runs in a project of its own after every other project
// has finished, and deletes what it wrote (tests/e2e/support/ingest.ts).
const LIVE_SPEC = '**/live.spec.ts';
const PAGE_PROJECTS = ['desktop-dark', 'desktop-light', 'phone-dark', 'phone-light', 'no-js'];

export default defineConfig({
  testDir: 'tests/e2e',
  testIgnore: '**/support/**',
  // Pages go live as soon as they load; wait until Realtime is listening before any test runs.
  globalSetup: './tests/e2e/support/realtime-ready.ts',
  outputDir: 'test-results/e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: 0,
  // A private repository's runners have 2 CPUs, where Playwright's default is 1 worker and the
  // suite outgrew the job's time limit. The tests mostly wait on the browser and the server, so a
  // second worker pays off even on 2 CPUs.
  workers: CI ? 2 : undefined,
  // CI never writes a snapshot: a missing one is a failure, not a new baseline.
  updateSnapshots: CI ? 'none' : 'missing',
  reporter: [['list'], ['junit', { outputFile: 'test-results/e2e-junit.xml' }]],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-dark',
      testIgnore: ['**/harness/**', LIVE_SPEC],
      grepInvert: withJs,
      use: { ...chrome, viewport: DESKTOP, colorScheme: 'dark' },
    },
    {
      name: 'desktop-light',
      testIgnore: ['**/harness/**', LIVE_SPEC],
      grepInvert: withJs,
      use: { ...chrome, viewport: DESKTOP, colorScheme: 'light' },
    },
    {
      name: 'phone-dark',
      testIgnore: ['**/harness/**', LIVE_SPEC],
      grepInvert: withJs,
      use: { ...phone, colorScheme: 'dark' },
    },
    {
      name: 'phone-light',
      testIgnore: ['**/harness/**', LIVE_SPEC],
      grepInvert: withJs,
      use: { ...phone, colorScheme: 'light' },
    },
    {
      // Static content must work without JavaScript (spec section 13). With scripts off the
      // page renders the same pixels as desktop-dark, so it takes no snapshot of its own.
      name: 'no-js',
      testIgnore: ['**/harness/**', LIVE_SPEC],
      grepInvert: withoutJs,
      use: { ...chrome, viewport: DESKTOP, javaScriptEnabled: false },
    },
    {
      // Tests of the harness itself: the server it starts, and negative controls for its checks.
      name: 'harness',
      testDir: 'tests/e2e/harness',
      use: { ...chrome, viewport: DESKTOP },
    },
    {
      name: 'live',
      testMatch: LIVE_SPEC,
      dependencies: [...PAGE_PROJECTS, 'harness'],
      use: { ...chrome, viewport: DESKTOP, colorScheme: 'dark' },
    },
  ],
  webServer: {
    // The fixed clock is given to `next start` only, so the instant the server logs at startup
    // (instrumentation.ts) comes from the process that serves the pages, not from the build.
    command: `npm run build && ${FIXED_NOW_VAR}=${SEED_NOW} npm run start -- --hostname 127.0.0.1`,
    // The live-feed spec's writer holds the secret key; the server under test must not, so pages
    // are proven to render as anon. An empty value also stops Next.js loading it from .env.local.
    env: { ...supabaseEnv, SUPABASE_SECRET_KEY: '' },
    // Ready is printed when the server listens and register() runs just after it, so waiting for
    // both means requests will be served and the clock line was logged by that server. The
    // captured instant reaches tests as TESTPULSE_SERVER_FIXED_NOW.
    // (A RegExp literal with a named group would need an ES2018 target in tsconfig.json.)
    wait: {
      stdout: new RegExp(
        String.raw`Ready in[\s\S]*clock fixed by ${FIXED_NOW_VAR} at (?<testpulse_server_fixed_now>\S+)`,
      ),
    },
    // Never reuse a server: one left on :3000 from another run would be tested in place of this
    // build and without the fixed clock. The server binds 127.0.0.1, the address the tests use,
    // so a listener already there makes `next start` fail instead of sharing the port on ::.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
