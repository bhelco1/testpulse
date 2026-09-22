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
