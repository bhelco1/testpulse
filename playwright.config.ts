import nextEnv from '@next/env';
import { defineConfig, devices } from '@playwright/test';

import { FIXED_NOW_VAR } from './lib/clock.ts';
import { SEED_NOW } from './lib/seed/plan.ts';
import { E2E_ADMIN_EMAIL } from './tests/e2e/support/admin.ts';

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
// has finished, and deletes what it wrote (tests/e2e/support/ingest.ts). It is the teardown of
// `seeded`, an empty project every other project depends on: Playwright runs a teardown after
// its setup's dependents have finished, whether or not they passed, where a dependent project is
// skipped when a dependency fails. So a failing page test cannot stop the live feed's own checks
// running (tests/e2e/harness/order.spec.ts).
const LIVE_SPEC = '**/live.spec.ts';
// The pruned-results spec writes a project of its own and prunes, so it runs in the same project,
// after the live feed's spec and never beside it (tests/e2e/pruned.spec.ts).
const PRUNED_SPEC = '**/pruned.spec.ts';
// The tracked-link spec writes a link and, through a server of its own that holds the secret key,
// the visits its browsers make, so it runs there too (tests/e2e/tracked-link.spec.ts).
const TRACKED_SPEC = '**/tracked-link.spec.ts';
// The admin mail spec signs the owner in through emailed links, and the owner has one sign-in
// token at a time, so it runs there too, after the page projects' own admin sessions
// (tests/e2e/admin-mail.spec.ts).
const ADMIN_MAIL_SPEC = '**/admin-mail.spec.ts';
// Admin's sections read and write with the secret client, which the server under test is not
// given, so their spec starts a server of its own that is, seeds what admin shows and removes it
// afterwards; it runs there too (tests/e2e/admin-sections.spec.ts).
const ADMIN_SECTIONS_SPEC = '**/admin-sections.spec.ts';
const SEEDED = 'seeded';
// The private-data leak sweep visits every page that can show a private project, so it runs once,
// in a project of its own, rather than in every viewport and theme (tests/e2e/leak-sweep.spec.ts).
const SWEEP_SPEC = '**/leak-sweep.spec.ts';

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
      // No tests. Every project that reads the seed as db:seed left it depends on it, and `live`,
      // which writes to the database, is its teardown, so it runs after all of them.
      name: SEEDED,
      testMatch: [],
      teardown: 'live',
    },
    {
      name: 'desktop-dark',
      dependencies: [SEEDED],
      testIgnore: [
        '**/harness/**',
        LIVE_SPEC,
        PRUNED_SPEC,
        TRACKED_SPEC,
        ADMIN_MAIL_SPEC,
        ADMIN_SECTIONS_SPEC,
        SWEEP_SPEC,
      ],
      grepInvert: withJs,
      use: { ...chrome, viewport: DESKTOP, colorScheme: 'dark' },
    },
    {
      name: 'desktop-light',
      dependencies: [SEEDED],
      testIgnore: [
        '**/harness/**',
        LIVE_SPEC,
        PRUNED_SPEC,
        TRACKED_SPEC,
        ADMIN_MAIL_SPEC,
        ADMIN_SECTIONS_SPEC,
        SWEEP_SPEC,
      ],
      grepInvert: withJs,
      use: { ...chrome, viewport: DESKTOP, colorScheme: 'light' },
    },
    {
      name: 'phone-dark',
      dependencies: [SEEDED],
      testIgnore: [
        '**/harness/**',
        LIVE_SPEC,
        PRUNED_SPEC,
        TRACKED_SPEC,
        ADMIN_MAIL_SPEC,
        ADMIN_SECTIONS_SPEC,
        SWEEP_SPEC,
      ],
      grepInvert: withJs,
      use: { ...phone, colorScheme: 'dark' },
    },
    {
      name: 'phone-light',
      dependencies: [SEEDED],
      testIgnore: [
        '**/harness/**',
        LIVE_SPEC,
        PRUNED_SPEC,
        TRACKED_SPEC,
        ADMIN_MAIL_SPEC,
        ADMIN_SECTIONS_SPEC,
        SWEEP_SPEC,
      ],
      grepInvert: withJs,
      use: { ...phone, colorScheme: 'light' },
    },
    {
      // Static content must work without JavaScript (spec section 13). With scripts off the
      // page renders the same pixels as desktop-dark, so it takes no snapshot of its own.
      name: 'no-js',
      dependencies: [SEEDED],
      testIgnore: [
        '**/harness/**',
        LIVE_SPEC,
        PRUNED_SPEC,
        TRACKED_SPEC,
        ADMIN_MAIL_SPEC,
        ADMIN_SECTIONS_SPEC,
        SWEEP_SPEC,
      ],
      grepInvert: withoutJs,
      use: { ...chrome, viewport: DESKTOP, javaScriptEnabled: false },
    },
    {
      // Tests of the harness itself: the server it starts, and negative controls for its checks.
      name: 'harness',
      dependencies: [SEEDED],
      testDir: 'tests/e2e/harness',
      use: { ...chrome, viewport: DESKTOP },
    },
    {
      // A light system theme gives the sweep its signal that a page's client code has run: the
      // server renders the theme toggle for the dark default, and it relabels once hydrated.
      name: 'leak-sweep',
      dependencies: [SEEDED],
      testMatch: SWEEP_SPEC,
      use: { ...chrome, viewport: DESKTOP, colorScheme: 'light' },
    },
    {
      name: 'live',
      testMatch: [LIVE_SPEC, PRUNED_SPEC, TRACKED_SPEC, ADMIN_MAIL_SPEC, ADMIN_SECTIONS_SPEC],
      // One file at a time: each writes while the other's pages would be open.
      workers: 1,
      // Admin's sections take their own viewport × theme snapshots, in the image only.
      ...(IN_IMAGE ? {} : { grepInvert: /@visual/ }),
      use: { ...chrome, viewport: DESKTOP, colorScheme: 'dark' },
    },
  ],
  webServer: {
    // The fixed clock is given to `next start` only, so the instant the server logs at startup
    // (instrumentation.ts) comes from the process that serves the pages, not from the build.
    command: `npm run build && ${FIXED_NOW_VAR}=${SEED_NOW} npm run start -- --hostname 127.0.0.1`,
    // The writing specs' client holds the secret key; the server under test must not, so pages
    // are proven to render as anon. An empty value also stops Next.js loading it from .env.local.
    // The visit routes need the secret client too, so on this server they store nothing and
    // answer 204; the tracked-link spec starts a server of its own to prove them.
    // ADMIN_EMAIL is the spec's test-only owner address (tests/e2e/support/admin.ts); admin runs
    // on the publishable key and the owner's session, so it needs no secret key either.
    env: { ...supabaseEnv, SUPABASE_SECRET_KEY: '', ADMIN_EMAIL: E2E_ADMIN_EMAIL },
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
