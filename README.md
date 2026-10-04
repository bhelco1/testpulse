# testpulse

testpulse is a public website that shows live test results for all of Bobby Helco's software
projects. Every project's CI pipeline reports into it after each run. It serves hiring managers
evaluating quality engineering leadership work, and doubles as a working cross-project QA
dashboard. The site is itself a portfolio piece, built test-first, and reports its own results
on its own dashboard.

Live site: https://testpulse-iota.vercel.app

The specification in `docs/spec.md` is the source of truth for the data model, API contract,
stats, phases, and acceptance criteria.

## Status

The build runs in phases 0 to 7 (spec section 17). Phases 0 to 5 and the design track are
complete, so the public site is built. Alerts, tracked links and admin (Phase 6) are next, and
self-reporting (Phase 7) is still to come.

## Reporting projects

- **Ostomate2**: public. Kotlin Multiplatform app; its CI reports JUnit XML and JaCoCo coverage,
  and its failure details, repository and CI links are shown in full.
- **routeserve**: private. Its test names, counts, trends and coverage are shown; its repository
  link, CI run links, failure text and full commit SHAs are hidden, enforced by row-level
  security in the database (spec section 9). Its internals are deliberately left out of this
  repo's docs.
- **testpulse**: this repo reports its own results from Phase 7.

`docs/PROJECT_INVENTORY.md` describes what each project reports.

## Stack

Next.js (App Router), TypeScript strict, Supabase (Postgres, Realtime, Auth), Zod, Recharts,
Vitest, Playwright, GitHub Actions, Vercel. The rationale is in spec section 4.

## Setup

Prerequisites:

- Node.js, the version in `.nvmrc` (24)
- the Supabase CLI
- Docker, which the local Supabase stack and the pinned Playwright image run in

Steps:

```
npm ci
cp .env.example .env.local   # then fill in the keys that `supabase start` prints
supabase start
npm run db:reset
npm run db:seed
npm run dev
```

`.env.local` is gitignored. The Supabase secret key is server-only; the browser gets only the
publishable key.

## Commands

- `npm run dev` starts the site locally
- `npm run build` builds for production
- `npm run start` serves the production build
- `npm run lint` runs ESLint
- `npm run format` formats with Prettier
- `npm run format:check` checks formatting
- `npm run typecheck` runs `tsc --noEmit`
- `npm run test` runs Vitest unit tests with coverage (90% lines floor)
- `npm run check:secrets` fails if any tracked path looks like a secret
- `npm run check:contrast` fails if a design token pair is under WCAG AA (4.5:1 text, 3:1 graphics)
- `npm run test:e2e` runs the Playwright end-to-end tests in Chromium against the production build, leaving out the visual snapshot tests
- `npm run test:e2e:docker` runs the full end-to-end suite, visual snapshots included, in the pinned Playwright Docker image, as CI does (needs `supabase start` and `npm run db:seed`)
- `npm run test:e2e:update` regenerates the visual snapshot PNGs in that image
- `npm run db:reset` resets the local database and applies migrations (needs `supabase start`)
- `npm run db:seed` seeds the local database for end-to-end tests from committed fixtures; it refuses any non-local Supabase URL
- `npm run test:int` runs the Vitest integration tests against the local database
- `npm run project:add <slug>` registers `projects/<slug>.yaml` and prints its API key once
- `npm run projects:sync` updates database rows from `projects/*.yaml`; it never touches API keys
- `npm run project:rotate-key <slug>` issues a new API key for a project and prints it once
- `npm run backfill <slug> <file>` imports a project's dashboard history as backfilled runs; re-running is a no-op

## Test strategy

The full strategy is spec section 16.

- **Unit**: Vitest, with a 90% lines coverage floor enforced in CI. Parsers are tested against
  real result files captured from the reporting projects (`fixtures/README.md`), never
  hand-written samples.
- **Integration**: Vitest against a local Supabase: the ingestion path against real Postgres,
  and row-level security proven with an anonymous client.
- **End to end**: Playwright against the production build and a database seeded from the
  committed fixtures, with the clock fixed, at desktop and phone widths in light and dark, plus a
  pass with JavaScript disabled. Every page spec runs axe accessibility checks.
- **Visual snapshots**: generated and compared only in a pinned Playwright Docker image, so local
  and CI render identically.
- **Private-data leak checks**: for the private project, the end-to-end specs prove that failure
  text, repository links and full SHAs appear in neither the rendered HTML nor any network
  response.
- **Contrast**: `npm run check:contrast` checks every design token pair against WCAG AA.

## Continuous integration

CI runs on every pull request and on every push to `main`. It checks formatting, lints,
typechecks, checks for tracked secrets, runs the unit tests with coverage, builds the site, and
then runs two jobs in parallel: the integration tests against a local Supabase started on the
runner, and the end-to-end tests: local Supabase on the runner, seeded from the committed fixtures,
and Playwright in the pinned Playwright Docker image against the production build, with the clock
fixed to the seed's instant, desktop and phone widths in light and dark, a no-JavaScript pass,
axe accessibility checks and visual snapshot comparisons.

## Reporting

`scripts/testpulse-report.sh` is the canonical reporter (spec Appendix A): each reporting
project copies it verbatim into its own repo and calls it from CI after every test run. Its
contract with `POST /api/v1/reports` is proven by `scripts/testpulse-report.test.ts`.

## License

The code is under the [MIT License](LICENSE). The bundled fonts in `app/fonts/` (Source Serif 4,
Public Sans, JetBrains Mono) keep their own SIL Open Font License, included beside each font.
