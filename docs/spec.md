# testpulse: specification

Version 0.5, 2026-09-21. Status: Phase 0 complete; Phase 1 in progress.
Source material: `docs/PROJECT_INVENTORY.md` (survey of Ostomate2 and routeserve, 2026-09-21).

This document is the source of truth for what testpulse is and how it is built. When a decision changes during the build, update this file in the same commit. Standing rules for coding sessions (stack, commands, conventions) live in `CLAUDE.md` at the repo root; this file holds the what and the why.

---

## 1. Purpose

testpulse is a public website that shows live test results for all of Bobby Helco's software projects. Every project's CI pipeline reports into it after each run. It has two audiences:

1. **Hiring managers** evaluating Bobby for Manager/Director of Quality Engineering roles. They should be able to see, in under a minute, real test suites, real numbers, and the engineering judgment behind them, and then drill into any project as deep as they like.
2. **Bobby**, as a working cross-project QA dashboard that replaces the per-project Raspberry Pi kiosk pages.

The site is itself a portfolio piece. Its own code, tests, and CI will be read by the same audience, so it is built test-first and reports its own results on its own dashboard.

## 2. Goals and non-goals

### Goals

- G1. Accept test and coverage results from any project's CI with a single HTTP POST.
- G2. Show results within seconds of a CI job finishing.
- G3. Adding a new project requires no application code changes: one config file, one API key, one CI step.
- G4. Present stats that demonstrate senior QA judgment: pyramid shape, trends, flakiness, time to green, coverage against enforced floors.
- G5. Report honestly. Suites that exist but have never run are shown as such. Empty runs are never green.
- G6. Detect silent CI failure (no reports arriving, test counts collapsing).
- G7. Let Bobby see which companies visited, with no login or friction for visitors.
- G8. Run at $0 recurring cost on free tiers.
- G9. Look and feel like a polished modern product: visually strong, easy to navigate, professional. The visual design is done in Claude Design and handed off to Claude Code (section 13.1).

### Non-goals

- Streaming individual test results while a suite is still executing.
- Being a general-purpose multi-user SaaS. One owner, one admin.
- Storing build artifacts, screenshots, videos, or logs.
- Replacing CI. testpulse displays results; it never gates merges.
- Visitor accounts or passwords.

## 3. Principles

- **Test-first.** Every phase starts with failing tests derived from its acceptance criteria.
- **Real fixtures.** Parsers are tested against actual result files captured from Ostomate2 and routeserve, not hand-written samples.
- **Normalize on the server.** Projects send the files their tools already produce. testpulse does the parsing, so a project's CI step stays a few lines.
- **Never fail the caller's build.** A testpulse outage must not turn a project's CI red. The reporting step always exits 0 and logs a warning.
- **Private stays private.** Failure details from private repos are never exposed publicly, enforced in the database, not only in the UI.
- **No swallowed failures** in testpulse's own pipeline. No `|| true`, no `continue-on-error` on test steps.

## 4. Architecture

```
 Project CI (GitHub Actions)                testpulse
 ┌───────────────────────┐      POST      ┌─────────────────────────────┐
 │ tests run             │ ─────────────▶ │ /api/v1/reports              │
 │ JUnit / Jest JSON     │  multipart +   │  auth → parse → normalize    │
 │ JaCoCo / istanbul     │  bearer token  │  → upsert                    │
 └───────────────────────┘                └──────────────┬──────────────┘
                                                         ▼
                                          ┌─────────────────────────────┐
                                          │ Postgres (Supabase)          │
                                          │ RLS enforces visibility      │
                                          └──────────────┬──────────────┘
                                 realtime (runs, reports)│  server reads
                                                         ▼
                                          ┌─────────────────────────────┐
                                          │ Next.js site                 │
                                          │ dashboard · project · run    │
                                          │ admin (magic-link auth)      │
                                          └─────────────────────────────┘
```

### Stack decisions

| Area | Choice | Reason |
|---|---|---|
| Web framework | Next.js (App Router), TypeScript strict | Server components for data pages, route handlers for the API, one deployable |
| Database | Postgres on Supabase | Already used in routeserve; realtime and auth included; free tier |
| Realtime | Supabase Realtime on `runs` and `reports` | Satisfies G2 without building a socket layer |
| Admin auth | Supabase magic link, single allowlisted email | Real auth for the one private page |
| Hosting | Vercel free tier | Zero-config Next.js deploys, preview URLs per PR |
| Charts | Recharts | Sufficient for trends and pyramids; no licence cost |
| Validation | Zod | Same library as routeserve; one schema for API input and types |
| Unit/integration tests | Vitest | Fast, native TS |
| E2E tests | Playwright | Emits JUnit natively, so testpulse can ingest its own results |
| Local DB for tests | Supabase CLI (Docker) | Integration tests hit a real Postgres with real RLS |

Cost case (required by Ostomate2's `planning/08-test-strategy.md`): all services above are used within free tiers, recurring cost $0. Verify current free-tier terms before Phase 1, in particular Supabase's policy on pausing inactive projects and Vercel's request body size limit (see 6.5).

Free tier pauses inactive databases. Mitigated by the daily scheduled function (section 12). Database growth is bounded by retention (5.11); at 10 projects reporting daily with ~1,500 results each, steady state is roughly 3 million result rows, well under 500 MB with the indexes planned. Re-check when the fifth project joins.

## 5. Data model

All tables have `id uuid primary key default gen_random_uuid()` and `created_at timestamptz default now()` unless noted.

### 5.1 `projects`

| Column | Type | Notes |
|---|---|---|
| slug | text unique | URL segment, e.g. `ostomate2` |
| name | text | Display name |
| tagline | text | One sentence |
| description | text | Markdown, shown on project page |
| visibility | text | `public` or `private` (see section 9) |
| repo_url | text null | Shown only when visibility is `public` |
| default_branch | text | Usually `main` |
| dev_stack | jsonb | Array of `{category, items[]}` |
| test_stack | jsonb | Array of `{category, items[]}` |
| layer_rules | jsonb | Ordered rules, see section 8 |
| declared_suites | jsonb | Suites that exist outside reported results, see 5.8 |
| coverage_floors | jsonb | `{module: line_pct}` as enforced in that project's CI |
| expected_cadence_days | int | Staleness threshold, default 8 |
| api_key_hash | text | SHA-256 of the API key; the key itself is never stored |
| sort_order | int | Dashboard ordering |

Source of truth for everything except `api_key_hash` is `projects/<slug>.yaml` in the testpulse repo, synced to the database on deploy (section 10).

### 5.2 `runs`

One row per CI pipeline execution per project.

| Column | Type | Notes |
|---|---|---|
| project_id | uuid fk | |
| ci_run_id | text | `GITHUB_RUN_ID` |
| run_attempt | int | `GITHUB_RUN_ATTEMPT`, default 1 |
| commit_sha | text | |
| branch | text | |
| event | text | `push`, `pull_request`, `schedule`, `workflow_dispatch` |
| run_url | text null | Hidden for private projects |
| started_at | timestamptz | Earliest report start |
| finished_at | timestamptz | Latest report finish |
| status | text | Derived: `passed`, `failed`, `empty` |
| total, passed, failed, skipped | int | Rolled up from reports |
| duration_ms | bigint | Sum of report durations |
| source | text | `ci` or `backfill` |

Unique: `(project_id, ci_run_id, run_attempt)`.

Status derivation: `failed` if any report has failures or errors; `empty` if zero tests executed across all reports; otherwise `passed`. An `empty` run is displayed as a problem, never as green.

### 5.3 `reports`

One row per POST. A run has many reports because jobs finish at different times on different runners (Ostomate2: `android`, `ios`, E2E jobs) and because monorepos report per workspace (routeserve: backend, mobile, shared).

| Column | Type | Notes |
|---|---|---|
| run_id | uuid fk | |
| job | text | CI job name, e.g. `android`, `test` |
| module | text | Workspace or Gradle module, e.g. `shared`, `apps/backend` |
| platform | text | `jvm`, `ios-sim`, `node`, `android-emulator`, etc. |
| format | text | `junit`, `jest-json` |
| total, passed, failed, skipped | int | |
| duration_ms | bigint | |
| started_at, finished_at | timestamptz | |

Unique: `(run_id, job, module, platform)`. Re-posting the same key replaces the report and its results (idempotent retries).

### 5.4 `tests`

Stable identity for a test case across runs. This is what makes flakiness and per-test history possible.

| Column | Type | Notes |
|---|---|---|
| project_id | uuid fk | |
| test_key | text | SHA-256 of `module + suite + name` |
| module, suite, name | text | |
| layer | text | Resolved from `layer_rules` at ingestion |
| first_seen_at, last_seen_at | timestamptz | |

Unique: `(project_id, test_key)`.

### 5.5 `results`

| Column | Type | Notes |
|---|---|---|
| report_id | uuid fk | |
| test_id | uuid fk | |
| status | text | `passed`, `failed`, `error`, `skipped` |
| duration_ms | int | |

### 5.6 `result_failures`

Kept in a separate table so row-level security can hide it entirely for private projects.

| Column | Type | Notes |
|---|---|---|
| result_id | uuid fk unique | |
| message | text | Truncated to 2,000 chars |
| detail | text | Stack trace, truncated to 10,000 chars |

### 5.7 `coverage`

| Column | Type | Notes |
|---|---|---|
| report_id | uuid fk | |
| module | text | |
| format | text | `jacoco`, `istanbul` |
| lines_covered, lines_total | int | |
| branches_covered, branches_total | int null | |

### 5.8 Declared suites

`projects.declared_suites` lists test assets that exist but do not yet report, so the site can show them honestly:

```yaml
declared_suites:
  - name: Maestro E2E (iOS)
    layer: e2e
    count: 13
    status: authored_not_executed   # or: runs_in_ci_not_reported
    note: Flows written; not yet certified on a simulator.
```

These are displayed on the project page with their status. They are never added to executed-test totals or pyramids.

### 5.9 `alerts`

| Column | Type | Notes |
|---|---|---|
| project_id | uuid fk | |
| kind | text | `stale`, `count_drop`, `empty_run`, `coverage_below_floor` |
| detail | jsonb | |
| opened_at, resolved_at | timestamptz | |

### 5.10 `tracked_links` and `visits`

`tracked_links`: `token` (12-char random, unique), `company`, `role`, `contact`, `sent_at`, `notes`, `lead_project_slug` (optional, which project to feature first).

`visits`: `tracked_link_id` (null for anonymous), `session_id`, `path`, `entered_at`, `seconds_on_page`, `user_agent_class` (`browser`, `bot`, `preview`), `ip_hash` (salted hash, used only to count distinct visitors per link).

### 5.11 Data retention

testpulse runs on the Supabase free tier (500 MB database). Row-level results are the only table that grows without bound, so retention is tiered:

| Data | Retained | Reason |
|---|---|---|
| projects, runs, reports, coverage, alerts | forever | Small; these drive every trend chart |
| tests (identity rows) | forever | Small; one row per distinct test |
| results, result_failures | rolling 180 days | Flakiness and time-to-green look back at most 90 days; 180 gives headroom |
| results for the most recent 5 runs per project | always kept, regardless of age | An idle project must still show a drillable latest run |
| visits | rolling 365 days | Tracked-link history for a job search |

Add to `runs`: `results_pruned_at timestamptz null`. When a run's results are deleted, set this and keep the run row. The run detail page shows "per-test results retained for 180 days; summary totals are permanent" in place of the results table.

A prune job runs daily (same scheduled function as the stale check). It deletes in batches of 5,000 rows to avoid long locks, is idempotent, and logs rows removed per project. Add a `retention_days` column to `projects` (default 180) so a project can override.

## 6. Ingestion API

### 6.1 Endpoint

`POST /api/v1/reports`
`Authorization: Bearer <project api key>`
`Content-Type: multipart/form-data`

The project is identified by the API key. One request equals one report (section 5.3).

### 6.2 Parts

| Part | Required | Content |
|---|---|---|
| `meta` | yes | JSON, schema below |
| `junit` | one of `junit` / `jest` | One or more JUnit XML files (repeat the field) |
| `jest` | one of `junit` / `jest` | One Jest `--json` output file |
| `jacoco` | no | One JaCoCo XML report |
| `istanbul` | no | One `coverage-summary.json` |

`meta` schema (Zod, shared between server and any client tooling):

```json
{
  "ci_run_id": "35642780279",
  "run_attempt": 1,
  "job": "android",
  "module": "shared",
  "platform": "jvm",
  "commit_sha": "0e2d0b4...",
  "branch": "main",
  "event": "push",
  "run_url": "https://github.com/.../actions/runs/35642780279",
  "path_prefix": "/home/runner/work/routeserve/routeserve/"
}
```

`path_prefix` is optional. When present it is stripped from file paths in Jest output so suite names are repo-relative and stable across runners.

### 6.3 Responses

| Code | Meaning |
|---|---|
| 201 | Report created. Body: `{run_id, report_id, totals, run_status}` |
| 200 | Same key re-posted; report replaced |
| 400 | `meta` failed validation, or a file could not be parsed. Body names the part and the error |
| 401 | Missing or unknown API key |
| 413 | Body too large |
| 422 | Parsed successfully but contained zero test cases. Report is stored with run status `empty` and an `empty_run` alert is opened |
| 429 | Rate limit: 60 requests per minute per key |

### 6.4 Behavior

- Whole request is transactional: parse everything, then write everything, or write nothing.
- Upserts `runs`, then replaces the matching `reports` row and its children, then recomputes run rollups and status.
- Upserts `tests` by `test_key`; resolves `layer` on first sight and whenever `layer_rules` change (a resync job re-resolves existing tests).
- Runs alert checks for the project after each write (section 12).
- API keys are compared by SHA-256 hash in constant time.

### 6.5 Size

Target limit 4 MB per request; confirm against the hosting platform's current request body limit. This is why reports are per module: routeserve's three Jest JSON files are posted as three requests. If a single file exceeds the limit, the reporter script gzips it and sends `Content-Encoding: gzip`.

## 7. Parsers

Each parser is a pure function `(file contents, meta) → NormalizedReport`, with no I/O, fully unit tested against real fixtures in `fixtures/<project>/`.

```ts
type NormalizedReport = {
  tests: Array<{
    suite: string;          // class name or repo-relative file path
    name: string;
    status: 'passed' | 'failed' | 'error' | 'skipped';
    durationMs: number;
    failure?: { message: string; detail: string };
  }>;
  startedAt?: string;
  durationMs: number;
};
```

| Format | Source | Mapping notes |
|---|---|---|
| JUnit XML | Gradle (Ostomate2), Playwright (testpulse), Maestro `--format junit` (future) | `testcase@classname` → suite, `@name` → name, `@time` s → ms. Child `failure`/`error`/`skipped` sets status. Handles both a single `testsuite` root and a `testsuites` wrapper. Multiple files per request are merged |
| Jest JSON | routeserve | `testResults[].name` minus `path_prefix` → suite. `assertionResults[].fullName` → name. `passed`→passed, `failed`→failed, `pending`/`todo`/`skipped`→skipped. `failureMessages[]` joined → detail, first line → message. Run pass/fail comes from these results, never from the process exit code, because routeserve's `test:ci` script masks it |
| JaCoCo XML | Ostomate2 | Report-level `counter` elements, `type=LINE` and `type=BRANCH`, `covered` and `missed` |
| istanbul summary | routeserve | `total.lines.covered/total`, `total.branches.covered/total` |

Parser requirements: reject XML with DTDs or external entities (XXE), tolerate unknown attributes, fail with a specific message on malformed input.

## 8. Layer mapping

Result files do not say whether a test is unit, integration, or E2E. Each project supplies ordered rules; first match wins.

```yaml
layer_rules:
  - match: { module: "apps/backend", suite: "src/routes/**" }
    layer: api
  - match: { module: "apps/backend", suite: "**/*.postgis.test.ts" }
    layer: integration
  - match: { job: "android-e2e" }
    layer: e2e
  - default: unit
```

Match keys: `job`, `module`, `platform`, `suite` (glob). Allowed layers: `unit`, `component`, `integration`, `api`, `visual`, `e2e`. Pyramid charts order them in that sequence.

Acceptance check for each project's rules: resolved counts per layer match the inventory's layer table for that project (for example routeserve: api 269, integration 3).

## 9. Visibility

| | `public` project | `private` project |
|---|---|---|
| Totals, trends, pyramid, coverage | shown | shown |
| Test and suite names | shown | shown |
| Failure messages and stack traces | shown | hidden |
| Repo link, commit links, CI run links | shown | hidden |
| Commit SHA | full, linked | first 7 chars, unlinked |

Enforcement is in Postgres row-level security, so the publishable key used by the browser for realtime, which runs as the `anon` database role, cannot read hidden data even if the UI has a bug:

- `result_failures`: anon `select` allowed only where the owning project is `public`.
- `projects`: anon reads go through a view that omits `api_key_hash` and nulls `repo_url` for private projects.
- `runs`: anon reads go through a view that nulls `run_url` and truncates `commit_sha` for private projects.
- `tracked_links`, `visits`, `alerts`: no anon access.

Initial settings: Ostomate2 `public`, routeserve `private`, testpulse `public`.

## 10. Adding a project

1. Create `projects/<slug>.yaml` (metadata, stacks, layer rules, declared suites, coverage floors).
2. Run `npm run project:add <slug>`. It validates the YAML, inserts the row, generates an API key, stores its hash, and prints the key once.
3. In the project's repo, add `TESTPULSE_TOKEN` as a secret and `TESTPULSE_URL` as a variable.
4. Add the reporting step to CI (appendix A).

`npm run projects:sync` runs on every deploy and updates database rows from the YAML files. It never touches `api_key_hash`. `npm run project:rotate-key <slug>` issues a new key.

## 11. Stats definitions

All trend stats use default-branch runs with `source = ci` unless stated. Backfilled runs contribute to pass-rate, count, and coverage trends only.

| Stat | Definition |
|---|---|
| Total tests | Distinct `tests` rows seen in the latest default-branch run, per project and summed. Same test on two platforms counts once here; "executions" counts both |
| Pass rate | passed / (passed + failed + error), latest run and 30/90-day trend. Skipped excluded and shown separately |
| Test pyramid | Count of distinct tests per layer in the latest default-branch run |
| Coverage | Latest lines % per module, plotted against that module's `coverage_floors` value |
| Suite duration | Sum of report durations per run, trended; slowest 10 tests listed |
| Test growth | Distinct tests per week since first report |
| Flaky test | A test with both a passing and a failing result on the same `commit_sha` (across attempts or re-runs) within 30 days. Flake rate = flaky tests / total tests |
| Flip rate | Secondary signal: tests that changed status between consecutive default-branch runs more than twice in 30 days |
| Time to green | For each default-branch run that turned `failed` after a `passed` run, elapsed time until the next `passed` run. Report median and worst, 90 days |
| Green streak | Consecutive `passed` default-branch runs, current and longest |
| Cross-platform parity | Tests executed on more than one platform, and any whose status differs between platforms in the same run |
| Days since last report | Per project; feeds staleness |

Headline tiles on the landing page: total tests, overall pass rate, projects reporting, runs in last 30 days, median time to green, current green streaks.

## 12. Integrity alerts

These exist because of real incidents recorded in Ostomate2's post-mortems: CI silently dead for 11 days, and E2E reporting green without ever passing.

| Alert | Trigger | Resolves when |
|---|---|---|
| `stale` | No report for a project in `expected_cadence_days` | Next report arrives |
| `count_drop` | Executed tests for a `(job, module, platform)` fall by more than 20% versus the previous default-branch run | Count recovers, or admin acknowledges |
| `empty_run` | A report parses but contains zero tests | Next non-empty report for the same key |
| `coverage_below_floor` | Reported lines % is under the project's declared floor | Next report at or above floor |
| `keep_alive` | (not an alert) The daily scheduled function writes a row to a `heartbeats` table every run. This keeps the free-tier database out of Supabase's inactivity pause, which triggers after roughly a week without database queries and would take the site offline until manually restored. | n/a |

Staleness only works if CI runs when no one is committing. Each reporting project adds a weekly `schedule:` trigger to its main workflow; `expected_cadence_days` defaults to 8 to match. A stale check runs daily as a scheduled function.

Open alerts appear on the admin page and as a small status marker on the public project page ("reporting healthy" / "no report in 12 days"). Email notification to the admin is optional and only if a free-tier mail service is used.

The scheduled function therefore does three things each day: write heartbeat, run stale check, run prune. It is triggered by Vercel cron. Its last-run timestamp is shown on the admin page; if it is more than 36 hours old, that is itself displayed as a warning.

## 13. Pages

| Route | Content |
|---|---|
| `/` | Headline tiles, per-project cards (status, pass rate, tests, coverage, last run), live feed of recent runs (realtime), short "about this site" blurb |
| `/p/[slug]` | Description, dev stack, test stack, pyramid, declared suites with status, coverage vs floors, trends (pass rate, count, duration), flaky list, recent runs, reporting-health marker |
| `/p/[slug]/runs/[id]` | Run metadata, per-report breakdown by job/module/platform, results table filterable by status and layer, failure detail where visibility allows |
| `/p/[slug]/tests/[testKey]` | One test's history: status timeline, duration trend |
| `/how-its-tested` | testpulse's own strategy, pyramid, and live results; link to repo |
| `/privacy` | What is logged about visitors |
| `/v/[token]` | Records the tracked link, sets the session cookie, redirects to `/` (or to the link's lead project) |
| `/admin` | Magic-link protected. Tracked links (create, list, visit summaries), alerts, project sync status, key rotation |

Requirements for all public pages: responsive, keyboard navigable, WCAG AA contrast, works with JavaScript disabled for the static content (realtime feed degrades to server-rendered list), Lighthouse performance and accessibility ≥ 90.

### 13.1 Visual design

The look of the site is a first-class requirement (G9). A hiring manager forms an opinion in the first few seconds, before reading a single number.

**Process.** Visual design is done in Claude Design, not improvised during coding sessions. Output is (a) a design system: color tokens for light and dark themes, type scale, spacing scale, and core components; and (b) high-fidelity screens for the pages below. The finished design is exported as a handoff bundle for Claude Code and committed under `design/`. Claude Code implements pages to match the bundle and does not invent visual styling. Any visual change after handoff goes back through Claude Design first, then is re-synced.

**Screens to design**, in priority order: landing dashboard, project page, run detail, test history, how-its-tested, admin. Each in desktop and phone widths, light and dark.

**Design with real numbers.** Every mock uses the actual figures from `PROJECT_INVENTORY.md` (142 and 1,048 tests, real coverage percentages, real stack names), never lorem ipsum or invented stats. Layouts must also be shown in their awkward states: a failed run, an `empty` run, a stale project, a private project with hidden failure detail, a project with a single run, and a declared suite marked `authored_not_executed`.

**Design requirements.**
- Status is never conveyed by color alone: pass, fail, skipped, empty, and stale each have an icon or label as well.
- WCAG AA contrast in both themes, verified on the tokens before handoff.
- Data first: charts are legible at a glance, with direct labels in preference to legends, and no decorative chart types.
- Navigation: any project reachable in one click from the landing page; any run in two. Breadcrumbs on all drill-down pages.
- Motion is limited to the realtime feed and state transitions, and respects `prefers-reduced-motion`.
- Chart styling must be achievable in Recharts. If the design calls for something Recharts cannot do, change the charting decision in section 4 deliberately; do not approximate.

## 14. Visitor tracking

- A tracked link is an opaque token mapped to a company and role. No visitor login.
- `/v/[token]` sets a first-party, httpOnly session cookie and redirects, so the token does not stay in the address bar.
- Visits are logged by a client-side beacon after page load, not by the server request, which filters out most link-preview fetchers and mail scanners. User agent is classified and known bots and preview agents are stored as such and excluded from counts.
- Logged per page view: session, path, time on page, user-agent class, salted IP hash. No raw IPs, no third-party analytics, no fingerprinting.
- Untracked visits are logged anonymously.
- Admin view per link: first seen, last seen, distinct sessions, distinct IP hashes (signal that the link was shared internally), pages viewed, time per project.
- `/privacy` states all of the above in plain language, and the footer links to it.

## 15. Security

- API keys: 32 random bytes, shown once, stored as SHA-256 hash, per project, rotatable.
- Ingestion: size limit, rate limit, strict Zod validation, XML parser with DTD and entity expansion disabled, all text fields length-capped, all output HTML-escaped (failure messages are untrusted input).
- The Supabase secret key (`sb_secret_…`, the successor to the service-role key) is used only in server code and never shipped to the browser. The browser uses the publishable key (`sb_publishable_…`, the successor to the anon key), which runs as the `anon` database role and is constrained by RLS (section 9).
- Admin: magic link, single allowlisted email, checked server-side on every admin route and action.
- Secrets live in Vercel and GitHub environment settings. `.env*` files are gitignored from the first commit, and a CI check fails the build if a file matching common secret patterns is tracked.

## 16. How testpulse is tested

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest | Parsers (against real fixtures), layer resolution, stat calculations, alert rules, token and key utilities, bot classification |
| Integration | Vitest + local Supabase | Ingestion endpoint end to end against real Postgres: idempotency, transactions, rollups, RLS policies verified with an anon client. Prune job: verified against a seeded database that rows older than the window are removed, the latest 5 runs per project are always kept, run rows and rollups are untouched, and re-running deletes nothing further. |
| E2E | Playwright | Seeded database; landing, project, run, test-history pages; visibility rules in the rendered UI; tracked-link flow; admin auth |
| Accessibility | axe via Playwright | Every public page |
| Contract | Vitest | Appendix A reporter script against a local server |

Rules: coverage floor 90% lines, enforced in CI via Vitest thresholds. CI runs lint, typecheck, unit, integration, and E2E on every PR. No failure masking. From Phase 7, CI posts its own JUnit and coverage output to the production testpulse instance as project `testpulse`.

## 17. Phases and acceptance criteria

Each phase is one or more PRs. A phase is done when every criterion has a passing automated test, unless marked (manual).

### Phase 0: Foundations

- Repo initialized; Next.js, TypeScript strict, ESLint, Prettier, Vitest, Playwright installed; `CLAUDE.md` written.
- GitHub Actions workflow runs lint, typecheck, and an initial passing test on PRs and main.
- Supabase project created; local Supabase runs via CLI; Vercel project connected with preview deploys. (manual)
- Real result files captured into `fixtures/`: Ostomate2 JUnit XML (shared, composeApp) and JaCoCo XML; routeserve Jest JSON (three workspaces) and istanbul summaries. Private-repo fixtures are scrubbed of anything sensitive before commit. (manual review)
- Housekeeping in source projects, tracked here because it affects what the public sees (manual, separate repos):
  - Ostomate2: gitignore `iosApp/iosApp/Secrets.swift`; fix `com.ostimate.app` in `fastlane/Appfile`; correct stale test counts in CLAUDE.md.
  - routeserve: remove `|| true` from `test:ci`; add the documented 80% `coverageThreshold` to the three Jest configs.

Manual checks recorded 2026-09-21:

- Hosted Supabase project `testpulse` created in region us-west-2, Postgres 17.6, matching `major_version = 17` in `supabase/config.toml`. Linked with `supabase link`; link state is gitignored.
- Local Supabase runs with Studio, analytics, and edge runtime disabled (PR #7) and storage disabled (PR #8). `npm run db:reset` completes against it.
- Vercel project connected through the GitHub import. Production deploys on push to `main`; preview deploys observed on every push to PR #8.
- Fixtures reviewed before commit (PR #6): the only scrub is the path-prefix rewrite recorded in `fixtures/README.md`.
- Source-project housekeeping done: Ostomate2 PR #23 (Fastlane bundle id, composeApp test count; `Secrets.swift` was already gitignored in `14feb88`) and a routeserve PR (`|| true` removed from `test:ci`, 80% lines and branches `coverageThreshold` in all three Jest configs, verified in that repo's CI: backend 81.76%, mobile 87.46%, shared 100% branches).

Phase 0 complete 2026-09-21.

### Phase 1: Schema, parsers, ingestion

- Migrations create all tables in section 5 with constraints and RLS policies.
- Each of the four parsers turns its real fixtures into the expected `NormalizedReport`; totals match the inventory (Ostomate2 JVM: 82 + 60; routeserve: 498 + 428 + 119).
- Malformed input, XXE payloads, and oversized fields are rejected with specific errors.
- `POST /api/v1/reports` implements section 6 exactly: auth, validation, transactional write, idempotent replace, rollups, status derivation including `empty`.
- Two reports for the same `ci_run_id` attach to one run; run totals equal the sum of reports.
- An anon database client cannot read `result_failures` for a private project, `api_key_hash`, `tracked_links`, or `visits`.
- `project:add`, `projects:sync`, and `project:rotate-key` work against a local database.

### Phase 2: Ostomate2 reporting live

- `projects/ostomate2.yaml` written; layer rules resolve to the inventory's layer counts.
- Reporter script (appendix A) added to Ostomate2 `ci.yml`: `android` job posts `shared` and `composeApp` JVM results with JaCoCo; `ios` job posts iOS simulator results as platform `ios-sim`.
- Weekly `schedule:` trigger added to Ostomate2 CI.
- A push to Ostomate2 main produces one run in production with at least two reports, correct totals, and coverage. (manual verification, then captured as a fixture)
- With testpulse unreachable, Ostomate2 CI still passes and logs a warning.

### Phase 3: routeserve reporting live

- `projects/routeserve.yaml` written with `visibility: private`; layer rules resolve to the inventory's counts; Maestro flows listed under `declared_suites` as `authored_not_executed`.
- routeserve `ci.yml` `test` job emits Jest JSON and posts three reports (backend, mobile, shared) with istanbul summaries. Nothing posts from `dashboard.yml`.
- Weekly `schedule:` trigger added.
- A failing test in routeserve produces a `failed` run in testpulse regardless of the CI step's exit code.

### Phase 4: Backfill

- First task: inspect the actual `history.json` shape on each project's dashboard branch and record it in this spec.
- `npm run backfill <slug> <file>` imports historical runs as `source = backfill` with summary totals and coverage only. Re-running it creates no duplicates.
- Trend queries include backfilled runs; flakiness and time-to-green exclude them.

### Design track (runs alongside Phases 1 to 4, must finish before Phase 5)

- Design brief written from sections 11, 13, and 13.1 and used as the opening prompt in Claude Design. (manual)
- Design system and all screens in 13.1 produced in Claude Design, reviewed on desktop and phone, in light and dark. (manual)
- Token contrast pairs pass WCAG AA; the check is scripted so it can run in CI once tokens are in the repo.
- Handoff bundle exported and committed under `design/`. Tokens are implemented as CSS variables and the core components are built and unit tested before any page work starts.

### Phase 5: Public site

- Pages are implemented from the `design/` bundle. Playwright visual regression snapshots are recorded for each page in desktop and phone widths, light and dark, and compared on every PR.

- Pages in section 13 (all except `/admin` and `/v`) render from a seeded database and match their content requirements.
- Stats in section 11 each have unit tests with hand-computed expected values, including edge cases (no runs, single run, all skipped).
- A new report appears in the landing page feed without reload. (Playwright, against local Supabase realtime)
- For a private project, failure text, repo links, and full SHAs are absent from the rendered HTML and from every network response.
- Declared suites display with their status and are excluded from totals.
- Axe reports no serious or critical violations; Lighthouse ≥ 90 for performance and accessibility. (Lighthouse manual or CI job)

### Phase 6: Alerts, tracked links, admin

- Each alert in section 12 opens and resolves under its defined conditions; the daily stale check runs as a scheduled function.
- Admin requires magic-link sign-in from the allowlisted email; any other email is refused; every admin action re-checks the session server-side.
- Creating a tracked link yields a unique token; visiting `/v/[token]` sets the cookie, redirects, and subsequent page views attach to that link.
- Requests classified as bot or preview are stored but excluded from visit counts. Test set includes Slackbot, LinkedInBot, and common mail-scanner user agents.
- No raw IP is stored anywhere. `/privacy` exists and is linked from every page.
- Daily scheduled function (heartbeat, stale check, prune) deployed and observed running on two consecutive days. (manual)
- Run detail page shows the pruned-results notice for a run with results_pruned_at set.

### Phase 7: Self-reporting and launch

- testpulse CI posts its own Vitest (JUnit reporter), Playwright JUnit, and coverage output to production as project `testpulse`.
- `/how-its-tested` shows live data for testpulse itself.
- The Raspberry Pi kiosks point at testpulse. (manual)
- Custom domain configured. (manual)
- Launch review: every public page read end to end as a hiring manager would, on desktop and phone. (manual)

### Later candidates (not scheduled)

- Maestro JUnit output from Ostomate2's E2E jobs, then routeserve's once flows are certified.
- A third reporting project built on an open source codebase with a Playwright framework written from scratch.
- A `gate_events` result type for agent-behavior gating data (Dev Agent/Gatekeeper), which does not fit pass/fail test cases.
- Public README badge endpoint (`/api/v1/badge/[slug].svg`).

## 18. Open questions

| # | Question | Default if undecided |
|---|---|---|
| 1 | Domain name | Decide before Phase 7; `testpulse` plus an available TLD |
| 2 | Should routeserve test names be public, or only counts? | Names shown, failures hidden (section 9) |
| 3 | Email notifications for alerts | Off; admin page only |
| 4 | Show PR runs publicly, or default branch only? | All runs stored; public pages show default branch, with PR runs on the run list behind a filter |
| 5 | Personalized greeting on tracked links | Off at launch; `lead_project_slug` ordering only |

## 19. Decision log

| Date | Decision | Reason |
|---|---|---|
| 2026-09-21 | No visitor login; tracked links | Goal is knowing who visited; a shared password adds friction and is not real security |
| 2026-09-21 | Server-side parsing of native formats | Keeps per-project CI changes minimal; routeserve cannot add `jest-junit` without approval |
| 2026-09-21 | One POST per (job, module, platform) | Jobs finish at different times; keeps requests under body-size limits; gives a module dimension for coverage |
| 2026-09-21 | Failure details in a separate table | Lets RLS enforce private-project visibility in the database |
| 2026-09-21 | "Real time" means seconds after a job ends | Live per-test streaming needs custom reporters in every project for little benefit |
| 2026-09-21 | Visual design in Claude Design, handed off to Claude Code as a bundle | Appearance is a primary goal; design gets a fast visual loop, and coding sessions implement a fixed target instead of inventing styling |
| 2026-09-21 | Weekly scheduled CI in each project | Makes staleness detection meaningful when no commits are landing |
| 2026-09-21 | Rolling 180-day retention for per-test results; summaries permanent | Keeps free-tier storage bounded for 5 to 10 projects; no displayed stat needs row-level data older than 90 days |
| 2026-09-21 | Daily heartbeat write | Free-tier Supabase pauses after about a week of inactivity; weekly CI posts are not enough |
| 2026-09-21 | TypeScript 5.9, Node 24, Next.js 16 | Next.js 16 is the current major. TypeScript 7.0 shipped in July 2026 with a new compiler; staying on 5.9 keeps foundations free of a compiler migration, to be revisited after Phase 1. Node 24 is read from `.nvmrc` by CI and developers and from `engines` by Vercel |
| 2026-09-21 | No styling library until the design bundle exists | The design decides the visual system; choosing a library first would be guessing |
| 2026-09-21 | Supabase CLI from Homebrew locally, with OrbStack as the Docker runtime. When the integration job is added in Phase 1, CI will install the same CLI version through `supabase/setup-cli` and the version will be recorded in the workflow | Identical CLI behaviour in both places; OrbStack is lighter than Docker Desktop and free for personal use |
| 2026-09-21 | Supabase publishable and secret keys (`sb_publishable_…`, `sb_secret_…`) instead of the legacy anon and service-role JWTs | Supabase's current key model; the legacy keys are being retired. Env var names: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` |
| 2026-09-21 | Unit coverage scope is `lib/` and `components/`; `app/` is covered by Playwright | Route and page files are integration surface; counting them in unit coverage would reward shallow tests |
| 2026-09-21 | Local Supabase runs without Studio, analytics, edge runtime, or storage | The spec uses none of them; a smaller stack starts faster locally and in CI |
| 2026-09-21 | Migrations will be hand-written SQL in `supabase/migrations/`; the CLI's schema diff engine setting is left at its default and unused | Every schema and RLS change is reviewable as written |
| 2026-09-21 | Hosted Supabase project in us-west-2 | Close to the owner |
| 2026-09-21 | Vercel connected through the GitHub import, no Vercel CLI | Preview deploys per PR and production on `main` without another global tool to keep current |
| 2026-09-21 | Squash merges only; every PR is reviewed adversarially before merge | `main` reads as one conventional commit per task, which is the history hiring managers will see |
| 2026-09-21 | Private-repo fixtures: rewrite the local checkout path to the GitHub Actions workspace path, change nothing else | Removes the only sensitive content found; keeps the files byte-faithful to the tool output otherwise |

---

## Appendix A: reporter script and CI steps

`scripts/testpulse-report.sh`, copied into each reporting repo. It must never fail the build.

```bash
#!/usr/bin/env bash
# Usage: testpulse-report.sh <job> <module> <platform> <format> <results-glob> [coverage-format coverage-file]
set -uo pipefail

if [ -z "${TESTPULSE_TOKEN:-}" ] || [ -z "${TESTPULSE_URL:-}" ]; then
  echo "::notice::testpulse not configured (fork PR or missing secret); skipping"
  exit 0
fi

job="$1"; module="$2"; platform="$3"; format="$4"; glob="$5"
cov_format="${6:-}"; cov_file="${7:-}"

meta=$(cat <<JSON
{"ci_run_id":"${GITHUB_RUN_ID}","run_attempt":${GITHUB_RUN_ATTEMPT:-1},
 "job":"${job}","module":"${module}","platform":"${platform}",
 "commit_sha":"${GITHUB_SHA}","branch":"${GITHUB_HEAD_REF:-$GITHUB_REF_NAME}",
 "event":"${GITHUB_EVENT_NAME}",
 "run_url":"${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}",
 "path_prefix":"${GITHUB_WORKSPACE}/"}
JSON
)

args=(-F "meta=${meta};type=application/json")
shopt -s nullglob globstar
for f in $glob; do args+=(-F "${format}=@${f}"); done
if [ -n "$cov_file" ] && [ -f "$cov_file" ]; then args+=(-F "${cov_format}=@${cov_file}"); fi

code=$(curl -sS -o /tmp/testpulse.out -w '%{http_code}' --max-time 30 --retry 2 \
  -H "Authorization: Bearer ${TESTPULSE_TOKEN}" "${args[@]}" \
  "${TESTPULSE_URL}/api/v1/reports" || echo "000")

if [ "$code" != "200" ] && [ "$code" != "201" ]; then
  echo "::warning::testpulse report failed (HTTP ${code}): $(head -c 500 /tmp/testpulse.out 2>/dev/null)"
fi
exit 0
```

Form field names are `junit` or `jest` for results and `jacoco` or `istanbul` for coverage, matching section 6.2.

Ostomate2, `ci.yml`, job `android`, after "Upload JUnit results":

```yaml
- name: Report to testpulse
  if: always()
  env:
    TESTPULSE_URL: ${{ vars.TESTPULSE_URL }}
    TESTPULSE_TOKEN: ${{ secrets.TESTPULSE_TOKEN }}
  run: |
    scripts/testpulse-report.sh android shared jvm junit \
      "shared/build/test-results/testAndroidHostTest/TEST-*.xml" \
      jacoco shared/build/reports/jacoco/jacocoHostTestReport/jacocoHostTestReport.xml
    scripts/testpulse-report.sh android composeApp jvm junit \
      "composeApp/build/test-results/testAndroidHostTest/TEST-*.xml" \
      jacoco composeApp/build/reports/jacoco/jacocoHostTestReport/jacocoHostTestReport.xml
```

Ostomate2, job `ios`, after the simulator test step: same pattern with job `ios`, platform `ios-sim`, and the `iosSimulatorArm64Test` result paths. No coverage arguments.

routeserve, `ci.yml`, job `test`, after the test step (which must now emit `test-results.json` per workspace):

```yaml
- name: Report to testpulse
  if: always()
  env:
    TESTPULSE_URL: ${{ vars.TESTPULSE_URL }}
    TESTPULSE_TOKEN: ${{ secrets.TESTPULSE_TOKEN }}
  run: |
    for ws in apps/backend apps/mobile packages/shared; do
      scripts/testpulse-report.sh test "$ws" node jest \
        "$ws/test-results.json" istanbul "$ws/coverage/coverage-summary.json"
    done
```

## Appendix B: example project file

`projects/routeserve.yaml`. Layer rules are drawn from the inventory's directory table; confirm each against real suite paths in Phase 3.

```yaml
slug: routeserve
name: RouteServe
tagline: Field-service CRM, scheduling, and route planning. Mobile app plus multi-tenant API.
visibility: private
default_branch: main
expected_cadence_days: 8
sort_order: 20

dev_stack:
  - category: Mobile
    items: [Expo SDK 57, React Native 0.86, React 19, WatermelonDB, TanStack Query]
  - category: API
    items: [Express 5, Prisma 7, PostgreSQL 18 + PostGIS 3.6, Zod 4]
  - category: Services
    items: [Supabase Auth, Twilio SMS, Anthropic Claude, Google Maps, Sentry]
  - category: Delivery
    items: [GitHub Actions, Railway, EAS Build]

test_stack:
  - category: Runners
    items: [Jest 30, jest-expo]
  - category: API and service
    items: [Supertest, nock]
  - category: Component
    items: [React Native Testing Library, msw]
  - category: E2E
    items: [Maestro]

coverage_floors:
  apps/backend: 80
  apps/mobile: 80
  packages/shared: 80

layer_rules:
  - match: { module: apps/backend, suite: "**/*.postgis.test.ts" }
    layer: integration
  - match: { module: apps/backend, suite: "src/routes/**" }
    layer: api
  - match: { module: apps/mobile, suite: "src/screens/**" }
    layer: component
  - match: { module: apps/mobile, suite: "src/components/**" }
    layer: component
  - match: { module: apps/mobile, suite: "src/hooks/**" }
    layer: component
  - match: { module: apps/mobile, suite: "src/app/**" }
    layer: component
  - default: unit

declared_suites:
  - name: Maestro E2E (iOS)
    layer: e2e
    count: 13
    status: authored_not_executed
    note: Flows written; not yet certified on a simulator. Workflow is manual-only.
```
