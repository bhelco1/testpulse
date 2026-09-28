# testpulse

testpulse is a public website that shows live test results for all of Bobby Helco's software
projects. Every project's CI pipeline reports into it after each run. It serves hiring managers
evaluating quality engineering leadership work, and doubles as a working cross-project QA
dashboard. The site is itself a portfolio piece, built test-first, and reports its own results
on its own dashboard.

The specification in `docs/spec.md` is the source of truth for the data model, API contract,
stats, phases, and acceptance criteria.

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
- `npm run test:e2e` runs the Playwright end-to-end test in Chromium against the production build
- `npm run db:reset` resets the local database and applies migrations (needs `supabase start`)
- `npm run db:seed` seeds the local database for end-to-end tests from committed fixtures; it refuses any non-local Supabase URL
- `npm run test:int` runs the Vitest integration tests against the local database
- `npm run project:add <slug>` registers `projects/<slug>.yaml` and prints its API key once
- `npm run projects:sync` updates database rows from `projects/*.yaml`; it never touches API keys
- `npm run project:rotate-key <slug>` issues a new API key for a project and prints it once

## Continuous integration

CI runs on every pull request and on every push to `main`. It checks formatting, lints,
typechecks, checks for tracked secrets, runs the unit tests with coverage, builds the site, and
then runs two jobs in parallel: the integration tests against a local Supabase started on the
runner, and the end-to-end test in Chromium against the production build.

## Reporting

`scripts/testpulse-report.sh` is the canonical reporter (spec Appendix A): each reporting
project copies it verbatim into its own repo and calls it from CI after every test run. Its
contract with `POST /api/v1/reports` is proven by `scripts/testpulse-report.test.ts`.
