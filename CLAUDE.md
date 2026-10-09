# testpulse

Public dashboard showing live test results for Bobby Helco's projects. Each project's CI posts results after every run. The site is also a portfolio piece for quality engineering leadership roles, so the code, tests, and commit history will be read by hiring managers. Work to that standard.

## Read first

- `docs/spec.md` is the source of truth: data model, API contract, stats definitions, phases, and acceptance criteria. Read the section for the current phase before proposing any work.
- `docs/reporting-standard.md` is the rulebook reporting projects conform to; it is versioned, and the version lives only there. Changes to what a project must send, or to `projects/*.yaml`, are checked against it.
- `docs/PROJECT_INVENTORY.md` describes the two projects that report first and the exact files their CI produces: Ostomate2 in full, routeserve (private) only in summary.
- `docs/design-brief.md` and the `design/` bundle define the visual design.

If a request conflicts with the spec, stop and say so. If a decision changes, update `docs/spec.md` (including its decision log) in the same PR as the code.

## Current phase

Phase 6: Alerts, tracked links, admin. Design v15 is in `design/` (its three-card kiosk not built yet); publishing the repository publicly is a follow-up, not a phase. Update this line when a phase completes.

## How to work

1. **Plan before code.** For each task, state which spec section and acceptance criteria it covers and propose an approach. Wait for approval on anything that touches the schema, the API contract, security, or dependencies.
2. **Test first.** Write failing tests from the acceptance criteria, confirm they fail for the right reason, then implement. A criterion is done only when an automated test proves it, unless the spec marks it (manual).
3. **Small PRs.** One branch per task, branched from `main`. Conventional commit messages (`feat:`, `fix:`, `test:`, `docs:`, `chore:`). No direct commits to `main`.
4. **Finish clean.** Before saying a task is done: lint, typecheck, and the full relevant test suite pass locally, and you report the actual output. Never report success you did not observe.

## Rules that do not bend

- **No masked failures.** No `|| true`, no `continue-on-error` on test steps, no `.skip` or `.only` committed, no lowering a coverage threshold to get green. If a test is flaky, fix or report it; do not retry it into passing.
- **Never weaken a test to make it pass.** If a test looks wrong, say why and ask.
- **Real fixtures.** Parser tests use the captured files in `fixtures/`. Do not hand-write substitute samples. Fixtures from private repos must be scrubbed before commit; ask if unsure.
- **Visibility is enforced in the database.** Anything hidden for private projects is protected by RLS and proven by a test using an anon client. UI-only hiding is a bug.
- **Secrets.** Never commit secrets, never print them in logs or test output, never read `.env*` contents into a response. The Supabase secret key is server-only; the browser gets only the publishable key.
- **Untrusted input.** Everything in an ingested report is untrusted: cap lengths, escape on output, keep DTDs and external entities disabled in XML parsing.
- **Dependencies.** Ask before adding any dependency. State what it is for, its size, and its maintenance status. Recurring cost must stay at $0.
- **Design.** Implement pages and components to match the `design/` bundle. Do not invent colors, spacing, type sizes, or component styles. If the design does not cover a case, stop and flag it so it can be designed first.
- **Scope.** Do only the task agreed. Note other problems you see; do not fix them unasked.
- **Other repos.** Changes to Ostomate2 or routeserve (CI steps, reporter script) are made in those repos under their own rules, never from a testpulse session without being asked.

## Stack

Next.js (App Router) · TypeScript strict · Supabase (Postgres, Realtime, Auth) · Zod · Recharts · Vitest · Playwright · GitHub Actions · Vercel. Rationale is in spec section 4.

## Layout

```
app/                 Next.js routes, including app/api/v1/reports
lib/parsers/         junit, jest-json, jacoco, istanbul: pure functions
lib/ingest/          validation, normalization, upsert, rollups
lib/stats/           stat calculations (spec section 11)
lib/alerts/          integrity alerts (spec section 12)
lib/visits/          user-agent class, address hash, the admin's visit figures (spec section 14)
lib/tracked-links/   tracked-link input, tokens and creation (spec section 14)
lib/jobs/            the daily scheduled function (heartbeat, stale check, prune) and its cron route's auth
lib/visibility/      public/private rules shared by queries and UI
lib/queries/         the only data source for public pages; publishable-key client only
lib/supabase/        server.ts (secret key, server-only), public.ts (publishable key)
lib/ci/              CI helpers: splitting Playwright's junit file by project
components/          built from the design bundle
projects/            one YAML per reporting project
fixtures/            real result files captured from reporting projects
supabase/migrations/ schema and RLS policies
scripts/             project:add, projects:sync, rotate-key, backfill, reporter copy, junit split
.github/actions/report/  the shared report action and the canonical reporter script
tests/e2e/           Playwright
design/              Claude Design handoff bundle (do not edit by hand)
docs/                spec, inventory, design brief
```

Unit tests sit next to the code as `*.test.ts`; component tests are `components/<Name>/<Name>.test.tsx` and opt into jsdom with a `// @vitest-environment jsdom` docblock. Integration tests are `*.int.test.ts` and need local Supabase running. E2E specs are `tests/e2e/*.spec.ts`, one per page, tagged `@js`, `@no-js` or `@visual` to choose their Playwright projects (see `playwright.config.ts`); tests of the harness itself are in `tests/e2e/harness/`, and `tests/e2e/leak-sweep.spec.ts`, which checks every page that can show a private project for hidden data, runs once in a project of its own. Every page spec runs `expectNoSeriousAxeViolations` from `tests/e2e/support/axe.ts`.

Playwright never reuses a server: it builds and starts its own on 127.0.0.1:3000 with `TESTPULSE_FIXED_NOW` set to `SEED_NOW`, so stop anything on :3000 first. Visual snapshots are generated and compared only in the pinned Playwright image (`npm run test:e2e:docker`, `npm run test:e2e:update`); bump that image in `scripts/e2e-docker.sh` together with `@playwright/test` and regenerate.

## Commands

Keep accurate as scripts are added. Until a command exists, do not assume it does.

```
npm run dev            start the site locally
npm run build          build for production
npm run start          serve the production build
npm run lint           ESLint
npm run format         Prettier, write
npm run format:check   Prettier, check only
npm run typecheck      tsc --noEmit
npm run test           Vitest unit tests with coverage (90% lines floor)
npm run check:secrets  fail if any tracked path looks like a secret
npm run check:contrast fail if a design token pair is under WCAG AA (4.5:1 text, 3:1 graphics)
npm run test:e2e       Playwright on this machine; leaves out @visual snapshot tests, refuses to run with CI set
npm run test:e2e:docker  full Playwright suite in the pinned Playwright image, as CI runs it (needs Docker, supabase start and db:seed)
npm run test:e2e:update  regenerate the visual snapshot PNGs in the pinned image; commit them
npm run db:reset       reset local database and apply migrations (requires `supabase start`)
npm run db:seed        seed local Supabase for e2e from committed fixtures (after db:reset; refuses non-local URLs)
npm run test:int       Vitest integration tests (requires `supabase start`)
npm run project:add <slug>         register projects/<slug>.yaml and print its API key once
npm run projects:sync              update database rows from projects/*.yaml; never touches API keys
npm run project:rotate-key <slug>  issue a new API key for a project and print it once
npm run backfill <slug> <file>     import a project's dashboard history as source=backfill runs; re-running is a no-op
```

## Conventions

- TypeScript strict, no `any`, no non-null assertions without a comment explaining why.
- Parsers and stat functions are pure: no I/O, no clock reads. Pass time in as an argument. Pages read it from `now()` in `lib/clock.ts`, never `new Date()` or `Date.now()`.
- Zod schemas are the single definition for API input; derive types from them.
- Database access goes through `lib/`; route handlers and components do not build queries inline.
- Accessibility is part of done: semantic HTML, labelled controls, visible focus, status never by color alone.
- Comments explain why, not what. No commented-out code.

## testpulse reporting

This project reports test results to testpulse and conforms to the
[testpulse reporting standard, v1](https://github.com/bhelco1/testpulse/blob/main/docs/reporting-standard.md)
(in a local checkout: `docs/reporting-standard.md`).
Any change to CI test jobs, test frameworks or result output is a reporting change:
follow the standard's Change checklist and update `projects/testpulse.yaml`.
`tests/ci/reporting.test.ts` checks `.github/workflows/ci.yml` against it.

## Definition of done for a phase

Every acceptance criterion in the spec for that phase has a passing test or a recorded manual check, CI is green on `main`, the spec and this file are current, and the "Current phase" line above is updated.
