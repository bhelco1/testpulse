# testpulse: specification

Version 0.22, 2026-09-28. Status: Phases 0 to 4 complete; design track in progress.
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
| Realtime | Supabase Realtime on `reports` | Satisfies G2 without building a socket layer. Every `reports` column is public, so anon can subscribe; `runs` has hidden columns and is read through a view, so the browser refetches run rollups when a report event arrives |
| Admin auth | Supabase magic link, single allowlisted email | Real auth for the one private page |
| Hosting | Vercel free tier | Zero-config Next.js deploys, preview URLs per PR |
| Charts | Recharts | Sufficient for trends and pyramids; no licence cost |
| Validation | Zod | Same library as routeserve; one schema for API input and types |
| Unit/integration tests | Vitest | Fast, native TS |
| E2E tests | Playwright | Emits JUnit natively, so testpulse can ingest its own results |
| Local DB for tests | Supabase CLI (Docker) | Integration tests hit a real Postgres with real RLS |

Cost case (required by Ostomate2's `planning/08-test-strategy.md`): all services above are used within free tiers, recurring cost $0. Verify current free-tier terms before Phase 1, in particular Supabase's policy on pausing inactive projects and Vercel's request body size limit (see 6.5).

Free tier pauses inactive databases. Mitigated by the daily scheduled function (section 12). Database growth is bounded by retention (5.12); at 10 projects reporting daily with ~1,500 results each, steady state is roughly 3 million result rows, well under 500 MB with the indexes planned. Re-check when the fifth project joins.

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
| name_normalization | jsonb | Literal affixes stripped from `suite` and `name` at ingestion, see section 7. Default `{}` |
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
| lines_covered, lines_total | int null | Counted lines, as the coverage report gives them |
| lines_pct | numeric(5,2) null | Line coverage as a recorded percentage, 0 to 100 |
| branches_covered, branches_total | int null | |

Each row holds exactly one form of line coverage: both counts with `lines_pct` null, or `lines_pct` with both counts null, enforced by a check constraint. Live ingestion always writes counts; backfilled rows use the percentage, because the history files keep nothing else (Phase 4).

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

`visits`: `tracked_link_id` (null for anonymous; set to null if the link is deleted, so history survives), `session_id`, `path`, `entered_at`, `seconds_on_page`, `user_agent_class` (`browser`, `bot`, `preview`), `ip_hash` (salted hash, used only to count distinct visitors per link).

### 5.11 Operational tables

`heartbeats`: `id`, `created_at`, `note text null`. The daily scheduled function inserts one row per run (section 12) so the free-tier database never goes idle.

`rate_limit_buckets`: `api_key_hash text`, `minute timestamptz`, `count int`, primary key `(api_key_hash, minute)`. Backs the 60-requests-per-minute limit in 6.3; serverless functions share no memory, so the counter lives in the database. The daily prune job deletes buckets older than one day.

Neither table is readable by anon.

### 5.12 Data retention

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
| 400 | `meta` failed validation, a file could not be parsed, or the multipart shape is wrong (both `junit` and `jest`, two `jest` files, an unknown part). Body: `{error, part, field?}` naming the part and, when known, the field |
| 401 | Missing or unknown API key |
| 413 | Body too large (`Content-Length` over 4 MB, or more than 4 MB read from parts) |
| 415 | `Content-Encoding` other than identity. Compressed bodies are not accepted yet (see 6.5) |
| 422 | Parsed successfully but contained zero test cases. The report is stored, an `empty_run` alert is opened, and the run status is derived per 5.2 (`empty` only when every report in the run is empty). Body is the 201 body plus `error`, so a CI log line explains itself |
| 429 | Rate limit: 60 requests per minute per key |
| 500 | Unexpected failure: the deployment is misconfigured, or a dependency failed. The body is always `{error: "internal error"}` and never more, because the exception text and setting names would describe the deployment to an unauthenticated caller. The detail goes to the runtime log, prefixed `ingest:`, or `ingest: configuration:` when the Supabase settings are missing or malformed |

### 6.4 Behavior

- Checks run in this order: API key (401), rate limit (429; a refused request still counts), size (413), encoding (415), multipart shape and parsing (400), then the write. Nothing touches the body until the key and the rate limit have passed.
- No response is ever body-less. Every status, 500 included, is JSON, so a reporting project's CI log can always print a reason.
- Whole request is transactional: parse everything, then write everything, or write nothing. The write is one Postgres function, `ingest_report(payload)`, which re-validates the payload and raises before any row changes.
- Upserts `runs`, then replaces the matching `reports` row and its children (delete plus insert, so a re-post gets a new `report_id`), then recomputes run rollups and status. Run metadata (`commit_sha`, `branch`, `event`) follows the latest report for that CI run; `run_url` is kept when a later report omits it. `reports.failed` and `runs.failed` count failed and error results together; `results.status` keeps the distinction.
- Upserts `tests` by `test_key` (SHA-256 of `module`, `suite`, and `name` joined by U+0000, which the parsers guarantee cannot appear in any of them); keeps `first_seen_at`, moves `last_seen_at` forward only, and refreshes `layer` from the project's current rules on every report (a resync job re-resolves tests that stop reporting).
- Runs alert checks for the project after each write (section 12). In Phase 1 only `empty_run` is implemented: opened when a report has zero tests, re-pointed rather than duplicated on a re-post, resolved by the next non-empty report for the same `(job, module, platform)`. `stale`, `count_drop`, and `coverage_below_floor` arrive in Phase 6.
- A presented key must have the issued shape (`tp_` plus 43 base64url characters) before anything else happens; other strings get the same 401 without a database lookup. API keys are then resolved by looking up the SHA-256 hash of the presented key as an indexed equality on the unique `api_key_hash` column. The caller controls only the key, never the stored digest, so no timing-safe comparison in application code is needed.

### 6.5 Size

Target limit 4 MB per request. Verified 2026-09-21: Vercel Functions reject request bodies over 4.5 MB with 413 on every plan, so 4 MB leaves headroom. This is why reports are per module: routeserve's three Jest JSON files are posted as three requests. If a single file ever exceeds the limit, the reporter script will gzip it and send `Content-Encoding: gzip`; the endpoint answers 415 to any encoding until that support exists, because an inflated-size cap has to accompany it. The largest captured file today is routeserve's backend Jest JSON at 0.19 MB.

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
| Jest JSON | routeserve | `testResults[].name` minus `path_prefix` → suite. `assertionResults[].fullName` → name. `passed`/`focused`→passed, `failed`→failed, `pending`/`todo`/`skipped`/`disabled`→skipped. A file whose `status` is `failed` with no failed assertion (it did not load) becomes one synthetic `error` result named `<suite load failure>` carrying the file's message, so a broken test file can never ingest as green. `failureMessages[]` joined → detail, first line → message. Run pass/fail comes from these results, never from the process exit code, because the exit code also goes non-zero for reasons that are not test failures (routeserve's 80% coverage threshold fails the step with every test green) and the reporter step runs under `always()` regardless |
| JaCoCo XML | Ostomate2 | Report-level `counter` elements, `type=LINE` and `type=BRANCH`, `covered` and `missed` |
| istanbul summary | routeserve | `total.lines.covered/total`, `total.branches.covered/total` |

Parser requirements: reject XML with DTDs or external entities (XXE), tolerate unknown attributes, fail with a specific message on malformed input. Entity processing is off; only the five predefined entities and numeric character references are decoded, in one non-recursive pass. JaCoCo is the one exception to the DOCTYPE rule: every JaCoCo report opens with its own public DOCTYPE, so exactly that declaration is stripped before the check and any other DOCTYPE, internal subset, or SYSTEM identifier is still rejected. `suite` and `name` over 1,000 characters are rejected, not truncated, and so are empty ones; per-test durations above 2,147,483,647 ms and report durations above one year are rejected because the columns and timestamps cannot hold them; `message` and `detail` are truncated per 5.6. Text containing U+0000, lone surrogates, or numeric references outside the XML character range is rejected, since Postgres cannot store it. The DOCTYPE check covers the prolog; after the root element a markup-level DOCTYPE is malformed XML and is rejected by the validator, while one inside CDATA or a comment is data and is kept. CDATA content is never entity-decoded. JUnit `time` must be a plain decimal; `timestamp` values without an offset are read as UTC so parsing does not depend on the server's timezone.

### 7.1 Name normalization

A toolchain may stamp the platform it ran on into the names it reports, which would make one logical test two. Kotlin Multiplatform does: the test the Ostomate2 JVM run reports as suite `com.ostomate.app.ui.home.HomeViewModelTest`, name `rendersToday` arrives from the iOS simulator as suite `iosSimulatorArm64Test.com.ostomate.app.ui.home.HomeViewModelTest`, name `rendersToday[iosSimulatorArm64]`. Since `test_key` hashes module, suite and name (5.4), that split the `tests` table in two, and the prefixed suite matched none of the project's layer globs, so every iOS test resolved to the default layer.

A project therefore declares in `projects/<slug>.yaml`, and in the `name_normalization` column, the literal affixes its toolchain adds:

```yaml
name_normalization:
  suite_prefixes: ['iosSimulatorArm64Test.']
  name_suffixes: ['[iosSimulatorArm64]']
```

Ingestion strips the first matching prefix from `suite` and the first matching suffix from `name` before it computes the test key and before it resolves the layer, so identity and layer are platform independent and the stored suite and name are the same whichever runner posted them. Matching is literal, never a regular expression; order within a list is significant and at most one affix is removed from each field; an absent or empty list changes nothing. Each list holds at most 10 entries of at most 200 characters. A strip that would leave an empty suite or name is refused with 400 naming the field, because an empty identifier is not storable. The parsers are unaffected: they stay generic and pure, and the same file posted by a project without normalization is read exactly as before.

## 8. Layer mapping

Result files do not say whether a test is unit, integration, or E2E. Each project supplies ordered rules; first match wins.

```yaml
layer_rules:
  - match: { module: "apps/backend", suite: "apps/backend/**/*.postgis.test.ts" }
    layer: integration
  - match: { module: "apps/backend", suite: "apps/backend/src/routes/**" }
    layer: api
  - match: { job: "android-e2e" }
    layer: e2e
  - default: unit
```

Match keys: `job`, `module`, `platform` (exact), `suite` (glob, anchored, `**` crosses `/`; a dot is an ordinary character, so a JVM class name is one segment). Suites are repo-relative (section 7), so globs carry the workspace prefix. The rule list has exactly one `default`, and it is last. Globs use picomatch syntax, so `{a,b}`, `!`, `@(...)`, and `[...]` are live; escape a literal `[ ] ( ) { } ! ? + @ *` with a backslash (Expo Router directories such as `(tabs)` need this). Allowed layers: `unit`, `component`, `integration`, `api`, `visual`, `e2e`. Pyramid charts order them in that sequence.

Acceptance check for each project's rules: resolved counts per layer match the inventory's layer table for that project against the captured fixtures (routeserve backend: api 269, unit 229; the PostGIS suite resolves to integration but was excluded when the fixture was captured, so it contributes 3 only in CI).

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
2. Run `npm run project:add <slug>`. It validates the YAML, inserts the row, generates an API key (32 random bytes, presented as `tp_` plus base64url), stores its SHA-256 hash, and prints the key once.
3. In the project's repo, add `TESTPULSE_TOKEN` as a secret and `TESTPULSE_URL` as a variable.
4. Add the reporting step to CI (appendix A).

`npm run projects:sync` runs on every deploy and updates database rows from the YAML files. It never touches `api_key_hash`, skips a file whose slug has no row yet, reports rows that have no file, and exits non-zero if any file fails validation before writing anything. Rows are updated one at a time, which is acceptable at this scale. `npm run project:rotate-key <slug>` issues a new key.

## 11. Stats definitions

All trend stats use default-branch runs with `source = ci` unless stated. Backfilled runs contribute to pass-rate, count, and coverage trends only.

| Stat | Definition |
|---|---|
| Total tests | Distinct `tests` rows seen in the latest default-branch run, per project and summed. Same test on two platforms counts once here; "executions" counts both |
| Pass rate | passed / (passed + failed + error), latest run and 30/90-day trend. Skipped excluded and shown separately |
| Test pyramid | Count of distinct tests per layer in the latest default-branch run |
| Coverage | Latest lines % per module, plotted against that module's `coverage_floors` value. Lines % is `lines_covered / lines_total` when the counts are present, else `lines_pct` |
| Suite duration | Sum of report durations per run, trended over CI runs only, since backfilled runs have `duration_ms` 0; slowest 10 tests listed |
| Test growth | Distinct tests per week since first report |
| Flaky test | A test with both a passing and a failing result on the same `commit_sha` and platform (across attempts or re-runs) within 30 days. Flake rate = flaky tests / total tests |
| Flip rate | Secondary signal: tests that changed status between consecutive default-branch runs more than twice in 30 days |
| Time to green | For each default-branch run that turned `failed` after a `passed` run, elapsed time until the next `passed` run. Report median and worst, 90 days |
| Green streak | Consecutive `passed` default-branch runs, current and longest |
| Cross-platform parity | Tests executed on more than one platform, and any whose status differs between platforms in the same run |
| Days since last report | Per project; feeds staleness |

Headline tiles on the landing page: total tests, overall pass rate, projects reporting, runs in last 30 days, median time to green, current green streaks.

How the trend, time-to-green and flakiness definitions are computed (`lib/stats`):

- **Which runs.** Pass-rate, run-count and coverage trends read default-branch runs with `source` `ci` or `backfill`; every other stat reads `ci` only. One pair of predicates in `lib/stats/rules.ts` holds this rule.
- **When a run happened.** Every window, ordering and bucket uses `finished_at`, when the run's status became known. Backfilled runs have `started_at` equal to `finished_at`.
- **Windows.** "30 days" and "90 days" are the N whole UTC days ending on the current UTC day, up to the present moment. Whole days keep daily buckets the same length; UTC because viewers are in every time zone.
- **Trend buckets.** Pass rate has a point per run and a bucket per UTC day. Run count has a bucket per UTC day, with empty days included. Coverage has a point per run per module. A day's pass rate adds up the day's counts, so a large run outweighs a small one; it is not the mean of the day's run rates. `runs.failed` already includes errors (5.2), so the pass rate is `passed / (passed + failed)`. A run or day with nothing passed or failed has no rate. A count-form coverage row with `lines_total` 0 has no percentage and is left out.
- **Time to green.** Runs are ordered by `finished_at`; ties go by `started_at`, then run ID, then attempt. Elapsed time runs from the failing run's `finished_at` to the next passed run's. An episode belongs to the 90 days holding its failing run, and the passed run before it may be older. A branch still red at the present moment is reported on its own and left out of median and worst. With an even count, the median is the mean of the middle two.
- **Flakiness.** A passing result is `passed`; a failing result is `failed` or `error`. Results come from default-branch CI runs that finished in the 30 days. A result is compared only with results for the same test on the same platform, the platform being its report's; a test that passes on one platform and fails on another is a cross-platform parity finding, not a flake. The denominator is "Total tests" for the latest default-branch CI run in that window; with no such run, or no results, there is no flake rate.

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

Evidence recorded 2026-09-22, each criterion proven by an automated test in CI:

- Schema and RLS: PR #11, `supabase/migrations/20260922034936_initial_schema.sql`, `lib/visibility/rls.int.test.ts` (32 tests with secret, anon, and signed-in clients).
- Parsers and rejection: PR #13, `lib/parsers/*.test.ts` (97 tests against the fixtures; totals 82 + 60 and 498 + 428 + 119; DOCTYPE, malformed, oversized, and unstorable inputs rejected with named errors).
- Layer rules: PR #12, `lib/ingest/layer-rules.test.ts` (acceptance counts against the fixtures).
- Ingestion: PR #15, `supabase/migrations/20260922104026_ingest_report.sql`, `lib/ingest/ingest.int.test.ts` (45 integration tests: every 6.3 status, two reports on one run with totals 142, replace, `empty` with alert, rollback).
- Visibility for anon: `lib/visibility/rls.int.test.ts` and the private-project cases in `lib/ingest/ingest.int.test.ts`.
- Project scripts: PR #14, `lib/projects/repo.int.test.ts` (the three scripts run as subprocesses against local Postgres).

Phase 1 complete 2026-09-22.

### Phase 2: Ostomate2 reporting live

- `projects/ostomate2.yaml` written; layer rules resolve to the inventory's layer counts.
- Reporter script (appendix A) added to Ostomate2 `ci.yml`: `android` job posts `shared` and `composeApp` JVM results with JaCoCo; `ios` job posts iOS simulator results as platform `ios-sim`.
- Weekly `schedule:` trigger added to Ostomate2 CI.
- A push to Ostomate2 main produces one run in production with at least two reports, correct totals, and coverage. (manual verification, then captured as a fixture)
- With testpulse unreachable, Ostomate2 CI still passes and logs a warning.

Evidence recorded 2026-09-22:

- `projects/ostomate2.yaml` landed in PR #14; its layer rules are asserted against the captured fixtures in `lib/ingest/layer-rules.test.ts`.
- Reporter and CI steps: Ostomate2 PR #24, merged. The reporter is `scripts/testpulse-report.sh` copied byte for byte from this repo, where PR #17 covers it with 24 contract tests.
- Weekly `schedule:` trigger added in the same PR. The three end-to-end and dashboard jobs were narrowed from "not a pull request" to `push` or `workflow_dispatch` so the new trigger does not pull a macOS runner in every week.
- Production run 35776037304, the merge commit of that PR, produced one run of 274 executions with four reports: `android`/`shared`/`jvm` 82, `android`/`composeApp`/`jvm` 60, `ios`/`shared`/`ios-sim` 82, `ios`/`composeApp`/`ios-sim` 50, with JaCoCo coverage 457/490 and 497/527 lines. All six CI jobs were green.
- That run exposed the platform-stamped names described in section 7; the fix in PR #19 makes one test one row, and the affixes were confirmed against all 132 iOS rows in production before those rows were cleared so the next report repopulates them correctly.
- Unreachable endpoint: proven by the reporter's contract test, which asserts exit 0 and a warning carrying `HTTP 000` when the server cannot be reached, against the same file Ostomate2 runs. Not drilled as a live outage.

Phase 2 complete 2026-09-22.

### Phase 3: routeserve reporting live

- `projects/routeserve.yaml` written with `visibility: private`; layer rules resolve to the inventory's counts; Maestro flows listed under `declared_suites` as `authored_not_executed`.
- routeserve `ci.yml` `test` job runs `test:ci`, which emits Jest JSON, and posts three reports (backend, mobile, shared) with istanbul summaries. Nothing posts from `dashboard.yml`.
- Weekly `schedule:` trigger added.
- A failing test in routeserve produces a `failed` run in testpulse regardless of the CI step's exit code.

Evidence recorded 2026-09-24:

- `projects/routeserve.yaml` landed in PR #14; its layer rules are asserted against the captured fixtures in `lib/ingest/layer-rules.test.ts`.
- Reporter and CI steps: a routeserve PR. The `test` step switched from `test:coverage` to `test:ci`, a strict superset (the same Jest run plus `--json --outputFile`), so there is still one test run. The reporter is copied byte for byte from this repo. `dashboard.yml` is untouched.
- Weekly `schedule:` trigger, Sunday 06:43 UTC, added in the same PR.
- npm runs every workspace even when one fails and exits non-zero at the end, and the failing workspace still writes its Jest JSON, so a red run reports all three modules. Verified locally with a temporary failing test before the PR.
- Production run for CI run 36071406865, the push to main: status `passed`, 1048 executions across three reports, `test`/`apps/backend`/`node` 501, `test`/`apps/mobile`/`node` 428, `test`/`packages/shared`/`node` 119, with istanbul line coverage 1870/1968 (backend), 1496/1551 (mobile), and 102/102 (shared). CI was green, and so was the QA Dashboard workflow on the same commit.
- Layer counts in production for `apps/backend`: api 269, unit 229, integration 3. The PostGIS suite's 3 is now proven by CI, as the section 8 acceptance note anticipated.
- Failing run: proven by a live drill, a deliberately failing test in `packages/shared` on the PR branch. CI run 36052961901 went red and production recorded that run as `failed`, 1049 executions, 1 failed, attributed to `packages/shared/src/testpulseDrill.test.ts`. The test was reverted on the branch before merge (CI run 36053871423 green, recorded `passed` with 1048); `main` never carried it.
- Private visibility: verified live on 2026-09-24 as the anon role with the publishable key against production. `projects` and `runs` refuse anon with permission denied; `projects_public` returns routeserve with `repo_url` null and no `api_key_hash`; `runs_public` returns all four routeserve runs (36051124972, the PR's first run with the key; the drill and its revert; the push to main) with `run_url` null and `commit_sha` truncated to 7 characters; the drill's one `result_failures` row is visible to the service role and returns nothing to anon; `alerts`, `tracked_links`, and `visits` refuse anon. `lib/visibility/rls.int.test.ts` covers the same rules locally.
- Registration: the production row was created by `project:add` on 2026-09-24, but its key never reached the routeserve repo, so the key was rotated with `project:rotate-key` before first use. The key now in routeserve's `TESTPULSE_TOKEN` is the only valid one.

Phase 3 complete 2026-09-24.

### Phase 4: Backfill

- First task: inspect the actual `history.json` shape on each project's dashboard branch and record it in this spec.
- `npm run backfill <slug> <file>` imports the default-branch entries of a project's history file as `source = backfill` runs with per-module summary totals and line-coverage percentages; re-running it creates no duplicates and never alters a `source = ci` run.
- Trend queries include backfilled runs; flakiness and time-to-green exclude them.

#### Backfill sources

Recorded 2026-09-24 from each project's dashboard branch and the script that writes it.

**Ostomate2.** Branch `test-dashboard`, a single commit force-pushed on every publish; file `history.json`. Written by `scripts/generate_test_dashboard.py` (`append_history`, `HISTORY_LIMIT = 200`, so the newest 200 entries are kept) in CI's `Publish QA dashboard` job, which runs on `push` and `workflow_dispatch`. The file is a JSON array, oldest first. Each entry:

- `generatedAt`: ISO 8601 timestamp to the second in UTC, written as `+00:00` (`datetime.isoformat(timespec="seconds")`). It is when the dashboard was built, not when the tests ran.
- `run`: `sha` (40 hex characters), `branch`, and `url`, the Actions run URL, whose last path segment is the run ID.
- `unit`, `integration`, `ui`: each `{tests, failed, status}`. `failed` is JUnit failures plus errors. `status` is `pass`, `fail`, or `empty` (zero tests).
- `cicd`: `pass`, `fail`, or `empty`, derived from the workflow's job conclusions, not from test results.
- `coverage`: `{shared, composeApp}`, JaCoCo line coverage as a percentage rounded to one decimal, or `null` when that module's JaCoCo report was missing.

The counts are JVM host tests only. `unit` is the `shared` suites whose name does not contain `.data.`, `integration` is the `shared` suites whose name does, and `ui` is `composeApp`. So `unit` plus `integration` is module `shared` and `ui` is module `composeApp`, both job `android`, platform `jvm`, the same keys the live reports use. Not recorded: skipped counts, durations, iOS results, branch coverage, the triggering event, and the run attempt.

As captured (`fixtures/ostomate2/history/history.json`, taken 2026-09-24 from branch commit `ec92502` of 2026-09-22): 30 entries generated from 2026-07-13 10:48:11 to 2026-09-22 20:14:18 UTC, 13 on `main` and 17 on feature branches. The GitHub API shows all 13 `main` entries were `push` events, attempt 1. Of the 29 distinct runs, 16 were `workflow_dispatch`; run 29269066815 appears twice (attempts 1 and 2, which the file cannot tell apart). Every entry has all three test categories `pass`; `cicd` is `fail` in 16. No entry has a `null` coverage value.

**routeserve.** Branch `qa-dashboard`, file `history.json`. Written by `scripts/build-dashboard.mjs` in `dashboard.yml`, which runs on push to `main` and `workflow_dispatch`. It keeps the last 10 entries (`prevHistory.slice(-9)` plus the new one). Each entry: `timestamp` (ISO 8601), `sha` (first 7 characters), `green` (every workspace's Jest JSON had zero failed tests), `coverage` (backend line percentage, a legacy field), and `coverages` `{backend, mobile, shared}` (line percentages). There are no test counts, no run ID or URL, and no branch (it is always `main`). As of 2026-09-24 it holds 10 entries starting 2026-07-16; the newest is also a live CI run in testpulse.

Decisions (section 19, 2026-09-24):

- Backfill imports Ostomate2 only. routeserve's history has no test counts to supply summary totals and no run ID to deduplicate on, and 9 of its 10 entries predate go-live. routeserve's trend starts at go-live, 2026-09-24.
- Only default-branch entries are imported, as event `push`, attempt 1, which the API confirms for all 13. Trends read only the default branch, so feature-branch entries carry no stat value, and their events and attempts cannot be recovered from the file.
- Backfilled coverage is stored as the recorded percentage. A later migration adds a nullable `lines_pct` to `coverage`, makes the count columns nullable, and checks that each row has either counts or a percentage. Section 5.7 changes with that migration.

Write path. `npm run backfill <slug> <file>` picks the parser by slug (only `ostomate2` has one), reads the project's `default_branch`, and calls the Postgres function `backfill_run(payload)` once per run with the secret key. Each call is one transaction and re-validates the payload before any write, as `ingest_report` does. If `(project_id, ci_run_id, run_attempt)` already exists, whether from CI or an earlier backfill, it changes nothing and says which; otherwise it inserts the run with `source = backfill`, `duration_ms` 0, a zero-length span at `generatedAt`, totals and status derived as in 5.2, and one report per module with its coverage in the `lines_pct` form. Only `service_role` may execute it.

Evidence recorded 2026-09-24:

- `history.json` shapes: recorded in PR #22, squash-merged as `5374ac8`, as the Backfill sources subsection above. The Ostomate2 file is captured as `fixtures/ostomate2/history/history.json`.
- `npm run backfill`: PR #23, squash-merged as `7d99665`, with migration `20260924234718_backfill`. The command refuses a project with no backfill source, so routeserve cannot be imported by mistake (`lib/backfill/sources.test.ts`, `scripts/backfill.test.ts`).
- Default-branch entries only: `lib/backfill/ostomate2-history.test.ts` keeps exactly the 13 `main` entries of the captured fixture and keeps only the branch it is given.
- `source = backfill` with per-module totals and line-coverage percentages: `lib/backfill/backfill.int.test.ts` imports the real fixture and finds 13 runs, all `source = backfill`, `branch` `main`, `push`, attempt 1, with 26 reports and 26 coverage rows in the `lines_pct` form. The first and last runs roll up from their `shared` and `composeApp` reports with the recorded totals and percentages.
- No duplicates: in the same file, running the import again inserts nothing and leaves every row as it was.
- Never alters a `source = ci` run: in the same file, a run first posted through `/api/v1/reports` is left exactly as `ingest_report` stored it, with its reports and count-form coverage, while the other 12 are imported.
- `backfill_run` is refused to anon and authenticated with permission denied, and writes nothing (`lib/backfill/backfill.int.test.ts`).
- Trends include backfilled runs; flakiness and time-to-green exclude them: PR #24, squash-merged as `285ad43`. The rule lives in one pair of predicates, `countsTowardTrends` and `countsTowardCiOnlyStats`, tested in `lib/stats/rules.test.ts`. `lib/stats/trends.test.ts` shows pass-rate, run-count, and coverage trends taking both CI and backfilled runs, coverage from counts for CI and from the recorded percentage for backfill. `lib/stats/time-to-green.test.ts` shows a backfilled red to green pair ignored, and a backfilled pass neither ending a CI red episode nor opening one. `lib/stats/flaky.test.ts` ignores results from backfilled runs, even on a commit CI also ran.
- End to end: `lib/stats/load.int.test.ts` backfills the real fixture, posts one CI run, and loads the stats input with the anon client. Every trend contains the 13 backfilled runs and the CI run; time-to-green and flakiness see the CI run alone.
- Production: migration `20260924234718_backfill` applied on 2026-09-24. `npm run backfill ostomate2 fixtures/ostomate2/history/history.json` inserted 13 runs with `source = backfill` and 26 coverage rows in the `lines_pct` form, two modules per run; running it again inserted 0. As the anon role with the publishable key, calling `backfill_run` is refused with Postgres error 42501, permission denied.
- CI on `main` after #24: run 36077709946, with checks, e2e, and integration all green.

Phase 4 complete 2026-09-24.

### Design track (runs alongside Phases 1 to 4, must finish before Phase 5)

- Design brief written from sections 11, 13, and 13.1 and used as the opening prompt in Claude Design. (manual)
- Design system and all screens in 13.1 produced in Claude Design, reviewed on desktop and phone, in light and dark. (manual)
- Token contrast pairs pass WCAG AA; the check is scripted so it can run in CI once tokens are in the repo.
- Handoff bundle exported and committed under `design/`. Tokens are implemented as CSS variables and the core components are built and unit tested before any page work starts.

Evidence recorded 2026-09-25:

- Design brief as the opening prompt (manual): Bobby confirmed on 2026-09-25 that `docs/design-brief.md` was added to the Claude Design project as a reference file, and that the opening prompt he used there was written from that brief.
- Design system and all screens reviewed (manual): Bobby reviewed the design system and every screen on desktop and phone, in light and dark, on 2026-09-25, after the v2 corrections below.
- v2 corrections to the first export: the landing tiles were brought in line with section 11, with Skipped or disabled replaced by Runs in last 30 days and the skipped count moved to the Pass rate sub-line; light `--pass` was darkened from `#1b7a3d` to `#197339` because `--pass` on `--raised` was 4.41:1; the data map was corrected to read runs through `runs_public`, to fall back to `lines_pct` for coverage, and to leave the live-update transport to Phase 5; admin tracked links are shown as `<site origin>/v/<token>`.
- v3 handoff (2026-09-26): v2 contradicted itself across the Design System page, `components.md` and the pages. This was found while building the foundation components, then confirmed by a full audit of the data components. v3 makes the Design System page canonical, answers 74 numbered items in the README's "Changes in v3", and every page matches it.
- Token contrast: `npm run check:contrast` reads `design/tokens.css` and checks, per theme, 37 text pairs at 4.5:1 (WCAG 1.4.3) and 3 graphic pairs at 3:1 (WCAG 1.4.11). Text: each of `--ink`, `--ink-2`, `--ink-3` on each of `--bg`, `--surface`, `--inset`, `--raised`; each status colour on those four surfaces and on its own tint; `--ink-3` on `--pass-tint` and `--fail-tint`; `--ink-2` on `--fail-tint`; `--on-ink` on `--fail` and on `--ink`. Graphics: `--attn`, `--layer-4` and `--pass` on `--surface`. A missing or malformed token fails the check. Lowest text pairs: dark `--ink-3` on `--pass-tint` 5.90:1, light `--pass` on `--raised` 4.84:1. Lowest graphic pairs: `--layer-4` on `--surface`, dark 3.27:1, light 3.47:1. It runs as the `Check design token contrast` step of the CI `checks` job. `lib/design/contrast.test.ts` proves every pair passes in both themes, that a graphic pair is judged at 3:1 and the same colours as text at 4.5:1, that the v1 light `--pass` is caught at 4.41:1 on `--raised`, and that `design/contrast.md` lists exactly the required pairs with the computed ratios and thresholds.
- Handoff bundle: the approved v3 export, which replaced v2, is committed under `design/` as exported. Tokens as CSS variables and the core components are recorded in the next item.
- Tokens and foundation components (criterion 4, first half): `app/layout.tsx` imports `design/tokens.css` itself as the global stylesheet, so the file `check:contrast` guards is the one the site ships. Fonts are self-hosted through `next/font` (Source Serif 4 with its opsz axis, Public Sans 400 to 700, JetBrains Mono 400 to 600, `display: swap`); `app/globals.css` re-points `--font-serif`, `--font-sans` and `--font-mono` at the `next/font` families with the same fallbacks, and overrides nothing else. Dark is the default; an inline head script applies a stored choice or else `prefers-color-scheme` before first paint, and `lib/design/theme.test.ts` runs that exact script against stand-in browser globals. The theme toggle sets `html[data-theme-switching]` for `THEME_SWITCHING_MS` (tested equal to `--motion-base`), the window in which `tokens.css` transitions colours. The foundation components are built to the v3 handoff, with the Design System page as the spec and `components.md` for props, states and variants, each in `components/<Name>/<Name>.tsx` with its test beside it: `StatusBadge` (pill and inline; no running status), `PrivateTag` (web and kiosk), `HealthMarker`, `LiveIndicator`, `Button` (primary, secondary, ghost and danger, with disabled and busy), `Breadcrumbs`, `SiteHeader` (with `ThemeToggle`), `ProjectSwitcher`, `SiteFooter`, `StatTile` (web and kiosk), `CoverageBar`, `LayerBar`, `PrivateDetailsNotice`, `DeclaredSuiteNote`, `Skeleton` and `ErrorState` (page and inline). The layer-to-tone rule and layer names live once in `lib/design/layers.ts`. Component tests read each CSS module through jsdom's CSS parser (`components/testing/stylesheet.ts`) to hold the sizes and colours the design fixes, and a test fails if a CSS module names a `tokens.css` keyframes, which CSS Modules would rename to one that does not exist. `SampleTag` is not built, as the design README marks it design-only. The data components and charts (`ProjectCard`, `RunFeedRow`, `RunFeed`, `ResultsTable`, `StatusTimeline`, `StackTagGroup`, `TrendChart`, `Pyramid`) are the next PR, so criterion 4 is not yet met.

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
- Commit subject on run titles (optional `runs.commit_subject` from the reporter).

## 18. Open questions

| # | Question | Default if undecided |
|---|---|---|
| 1 | Domain name | Decide before Phase 7; `testpulse` plus an available TLD |
| 2 | Should routeserve test names be public, or only counts? | Names shown, failures hidden (section 9) |
| 3 | Email notifications for alerts | Off; admin page only |
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
| 2026-09-21 | Phase 1 dependencies: `@supabase/supabase-js`, `fast-xml-parser`, `picomatch`, `yaml` | Each is the maintained standard for its job and small; no other runtime dependencies are planned for Phase 1 |
| 2026-09-21 | Anon reads `projects` and `runs` only through `projects_public` and `runs_public`, definer views owned by `postgres`; no direct grant on the tables | The views choose the columns, so `api_key_hash`, private `repo_url`, `run_url`, and full private SHAs never reach the browser regardless of UI code |
| 2026-09-21 | `result_failures` policy walks result → report → run → project through a `security definer` function | anon has no grant on `runs` or `projects`, so a plain policy subquery would fail; the function keeps the walk inside the database |
| 2026-09-21 | `projects.api_key_hash` is `not null unique` | Ingestion resolves the project from the key hash; two projects sharing a hash would make auth ambiguous |
| 2026-09-21 | `heartbeats` and `rate_limit_buckets` added to section 5 | Section 12 already needed the heartbeat; the rate limit in 6.3 cannot live in serverless memory |
| 2026-09-21 | Transactional report write is a Postgres function called by RPC with the secret key | supabase-js has no transactions; a database function makes the whole write atomic and testable from the integration suite |
| 2026-09-21 | Realtime subscribes to `reports` only; `runs` is never in the publication | Realtime evaluates the subscriber's table grants, and anon has none on `runs` by design; granting them would leak `run_url` and full private SHAs |
| 2026-09-21 | `anon` and `authenticated` lose all table grants by default; each table is opened by an explicit grant plus policy | RLS does not cover TRUNCATE, and Supabase's default grants would otherwise hand every new table to any signed-up user |
| 2026-09-21 | Deleting a tracked link sets `visits.tracked_link_id` to null instead of cascading | Visits are retained for 365 days as history; a deleted link should not erase them |
| 2026-09-21 | Failing-test fixtures are captured from the real tools: testpulse's own Playwright JUnit with one deliberately failing spec, and routeserve Jest JSON with one test broken in an uncommitted local change | No captured CI file contains a failure, and hand-written samples are forbidden; tool output from a forced failure is still real output, and the capture command is recorded |
| 2026-09-22 | JaCoCo's own `<!DOCTYPE report PUBLIC "-//JACOCO//DTD Report 1.1//EN" "report.dtd">` is stripped before the DOCTYPE rejection; nothing else is | Every real JaCoCo file carries it, so the blanket rule would refuse all coverage uploads; the exception is exact-match and keeps internal subsets and SYSTEM ids rejected |
| 2026-09-22 | `suite` and `name` capped at 1,000 characters and rejected above it; failure `message` and `detail` truncated at 2,000 and 10,000 | Identifiers that long are not real test names and would bloat the `tests` table forever; failure text is display-only, so truncation loses nothing that matters |
| 2026-09-22 | XML entities: processing off, only the five predefined entities and numeric character references decoded in a single pass | Kotlin names such as `&lt;init&gt;` must read correctly without opening the door to entity expansion attacks |
| 2026-09-22 | `zod` declared as a direct dependency | It was only present transitively; production code now imports it and it is part of the approved stack |
| 2026-09-22 | Layer globs match the repo-relative suite, so project rules carry the workspace prefix | Section 7 makes suites repo-relative for stability across runners; Appendix B's globs were workspace-relative and never matched. Keeping globs anchored and standard was preferred over per-workspace `path_prefix` values |
| 2026-09-22 | API keys are `tp_` + base64url of 32 random bytes; the database stores the SHA-256 hex of the presented string | The prefix makes a leaked key recognisable in logs and secret scanners; hashing the presented string keeps lookup a single indexed equality on a digest |
| 2026-09-22 | `projects/<slug>.yaml` requires `description`; the secret-key client lives in `lib/supabase/server.ts` and ESLint forbids importing it from `app/` or `components/` | The column has no database default, so an omitted description would be an empty project page; a lint rule is the only enforceable boundary against shipping the secret client to the browser |
| 2026-09-22 | A 500 body says only `internal error`; the cause is recoverable from the operator's runtime log, and `NEXT_PUBLIC_SUPABASE_URL` is validated as an absolute http or https URL at startup | A misconfigured deployment answered every request with a body-less 500, so a reporting repository logged `HTTP 500:` and nothing else. The caller learns nothing about the deployment, the operator gets one greppable line, and the commonest mistake, a pasted URL with quotes or no scheme, now names the variable instead of surfacing a minified library stack |
| 2026-09-22 | Compressed request bodies are refused with 415 until a real file needs them | The largest captured file is 0.19 MB against a 4 MB limit; accepting gzip without an inflated-size cap would let a small body expand past every limit |
| 2026-09-22 | `test_key` hashes `module`, `suite`, `name` joined by U+0000 | A separator that cannot appear in the parts makes `ab`+`c` and `a`+`bc` distinct without rejecting any legal test name; newlines are legal in JUnit and Jest names, NUL is not storable and is already refused |
| 2026-09-22 | Ingestion refuses in the order key, rate limit, size, encoding, body | An unknown caller learns nothing and costs nothing beyond a hash lookup; the body is never read before the cheap checks pass |
| 2026-09-22 | The route handler calls `ingestReportWithSecretClient`, never the secret client directly | `app/` cannot import the secret client by lint rule, so the boundary lives one level down in `lib/ingest` |
| 2026-09-22 | Platform affixes in test names are stripped by per-project `name_normalization` at ingestion, not by the parsers | Ostomate2's first reporting run stored 274 tests where there are 142, and resolved every iOS test to `unit`, because Kotlin Multiplatform's simulator target prefixes the suite and suffixes the name. The affixes belong to one project's toolchain, so encoding them in the JUnit parser would make a generic parser project-specific and would still miss the next toolchain; as configuration they are reviewable in the project file, apply before both the test key and the layer, and leave the parsers pure |
| 2026-09-22 | Layer acceptance counts are asserted against what the captured fixtures contain | The backend fixture omits the PostGIS suite, so "integration 3" is unprovable from it; the glob is proven by a unit test and the count by CI once the project reports |
| 2026-09-24 | routeserve's CI reports from `test:ci` rather than from a separate reporting run | `test:ci` is `test:coverage` plus `--json --outputFile`, so one run produces both the gate and the report; a second run would double CI time and could disagree with the first |
| 2026-09-24 | Backfill imports Ostomate2's `history.json` only; routeserve's history is not a backfill source and its trend starts at go-live | routeserve's entries carry no test counts to supply summary totals and no run ID to deduplicate on, and 9 of its 10 entries predate go-live |
| 2026-09-24 | Backfill imports only default-branch entries, as event `push`, attempt 1 | Trends read only the default branch, so feature-branch runs carry no stat value; the file records neither event nor attempt, and the GitHub API confirms `push`, attempt 1 for all 13 `main` entries |
| 2026-09-24 | `backfill_run` never alters an existing run, including an earlier backfill, and inserts with `ON CONFLICT DO NOTHING` rather than a lookup first | CI's report is the better record of a run and must win; a no-op re-run makes the command safe to repeat after a partial failure; the conflict clause closes the gap between a check and an insert if CI reports the same run concurrently |
| 2026-09-24 | When a history file lists one run ID twice, the later entry is imported | A re-run keeps its run ID and the file cannot tell attempts apart, so both would be attempt 1 and only one can be stored; the later entry is the run's final outcome |
| 2026-09-24 | Backfilled coverage is stored as the recorded line percentage: a later migration adds a nullable `lines_pct` to `coverage`, makes the count columns nullable, and checks that a row has counts or a percentage | The history file keeps only a percentage rounded to one decimal; inventing covered and total counts to fit the current columns would store numbers nobody measured |
| 2026-09-24 | Stats use `finished_at` for windows, ordering and buckets. Windows are whole UTC days ending today. Daily pass rate adds up the day's counts. Time to green runs from the failing run's finish to the next passed run's finish, and a branch still red is reported apart from median and worst | Section 11 names the stats but not these mechanics. `finished_at` is when a status became known, and measuring between finishes never goes negative for overlapping runs. Whole UTC days keep chart buckets equal and zone-neutral. Adding up counts weighs runs by size, as one run of all their tests would |
| 2026-09-24 | Time to green: `passed`, `empty`, `failed` does not count as turning red. "After a passed run" means the run immediately before; an empty run neither starts nor ends a red spell | An empty run is neither passed nor failed, so it says nothing about whether the branch turned red or recovered |
| 2026-09-24 | Flakiness is measured on default-branch runs only | Section 11 applies default-branch runs to every stat unless it states otherwise, and the flaky-test definition states no exception |
| 2026-09-24 | A test passing on one platform and failing on another is not flaky. Flakiness compares results for the same test on the same platform and commit, across runs and attempts | That disagreement is what the cross-platform parity stat reports. Ostomate2 reports the same test from the JVM and the iOS simulator, and a deterministic iOS-only failure would otherwise read as flakiness |
| 2026-09-24 | The "count" trend that backfill feeds is run count per day, not test count | Backfilled runs have no per-test rows, so a test-count trend would mean different things for the two sources |
| 2026-09-25 | The project switcher is a disclosure of plain links, not the `role="menu"` the design markup uses | An ARIA menu promises arrow-key navigation and takes its items out of the Tab order; a disclosure keeps every project a normal link reachable with Tab, and Escape still closes it and returns focus to the button |
| 2026-09-26 | Run titles are fallback titles chosen by `runs.event` (the design shows "Push to {branch}", "Pull request #{n}", "Scheduled run"). Commit messages are not stored. The pull request number is not stored either and `workflow_dispatch` has no designed title; both go back to design before the run components are built | Storing a commit subject would change the schema, the API contract, and both reporting projects' reporters, and adds another untrusted free-text field. Listed as a later candidate (section 17) |
| 2026-09-26 | Suite duration trends read CI runs only; pass-rate, run-count and coverage trends include imported history | Imported history has no durations: backfill stores `duration_ms` 0, which would plot as runs taking no time |
| 2026-09-26 | The public landing feed shows default-branch runs only; pull request runs appear on the project page run list under an "All branches" filter | Settles open question 4 on its stated default, which is removed from section 18 |

---

## Appendix A: reporter script and CI steps

`scripts/testpulse-report.sh`, copied into each reporting repo. It must never fail the build.

```bash
#!/usr/bin/env bash
# Canonical testpulse reporter. Each reporting repo copies this file verbatim into its own
# scripts/ directory; do not edit a copy, edit this one. It is specified in docs/spec.md,
# Appendix A, and its contract is proven by scripts/testpulse-report.test.ts.
# Usage: testpulse-report.sh <job> <module> <platform> <format> <results-glob> [coverage-format coverage-file]
set -uo pipefail

if [ -z "${TESTPULSE_TOKEN:-}" ] || [ -z "${TESTPULSE_URL:-}" ]; then
  echo "::notice::testpulse not configured (fork PR or missing secret); skipping"
  exit 0
fi

# Every variable below is expanded with a default so that a missing one cannot abort the job
# under `set -u`. The values that identify a run are then checked explicitly: a half-built meta
# would only be refused by the endpoint, so it is worth less than a warning naming what is gone.
branch="${GITHUB_HEAD_REF:-${GITHUB_REF_NAME:-}}"
require_env() {
  if [ -z "$2" ]; then
    echo "::warning::testpulse: missing $1; skipping"
    exit 0
  fi
}
require_env GITHUB_RUN_ID "${GITHUB_RUN_ID:-}"
require_env GITHUB_SHA "${GITHUB_SHA:-}"
require_env GITHUB_EVENT_NAME "${GITHUB_EVENT_NAME:-}"
require_env "GITHUB_HEAD_REF or GITHUB_REF_NAME" "$branch"

# The arguments get the same treatment: a typo in a workflow is a skip and a usage line, never
# an unbound-variable abort that reddens a build whose tests all passed.
job="${1:-}"; module="${2:-}"; platform="${3:-}"; format="${4:-}"; glob="${5:-}"
cov_format="${6:-}"; cov_file="${7:-}"
if [ -z "$job" ] || [ -z "$module" ] || [ -z "$platform" ] || [ -z "$format" ] || [ -z "$glob" ]; then
  echo "::warning::testpulse: usage: testpulse-report.sh <job> <module> <platform> <format> <results-glob> [coverage-format coverage-file]; skipping"
  exit 0
fi

# The meta is assembled by hand because jq is not on every runner, so a backslash or a double
# quote in a branch or module name has to be escaped here or the endpoint gets invalid JSON.
json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '%s' "$value"
}

# run_attempt is the one bare number in the document, where escaping cannot help: anything but
# a positive integer would make the whole meta unparseable, so it falls back to the first try.
run_attempt="${GITHUB_RUN_ATTEMPT:-1}"
case "$run_attempt" in
  '' | *[!0-9]* | 0*) run_attempt=1 ;;
esac

# run_url is optional (section 6.2), and a half-built one fails its URL check and takes the
# whole report down with it, so the key is left out entirely unless both halves are there.
run_url_field=""
if [ -n "${GITHUB_SERVER_URL:-}" ] && [ -n "${GITHUB_REPOSITORY:-}" ]; then
  run_url="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID:-}"
  run_url_field=" \"run_url\":\"$(json_escape "$run_url")\","
fi

meta=$(cat <<JSON
{"ci_run_id":"$(json_escape "${GITHUB_RUN_ID:-}")","run_attempt":${run_attempt},
 "job":"$(json_escape "$job")","module":"$(json_escape "$module")","platform":"$(json_escape "$platform")",
 "commit_sha":"$(json_escape "${GITHUB_SHA:-}")","branch":"$(json_escape "$branch")",
 "event":"$(json_escape "${GITHUB_EVENT_NAME:-}")",
${run_url_field}
 "path_prefix":"$(json_escape "${GITHUB_WORKSPACE:-}/")"}
JSON
)

args=(-F "meta=${meta};type=application/json")
shopt -s nullglob
# globstar arrived in bash 4; the stock macOS bash is 3.2, where the glob still expands, only
# without `**`. The redirect keeps that from printing a warning no reporting repo can act on.
shopt -s globstar 2>/dev/null
# $glob is unquoted on purpose: the shell expands it here. Paths with spaces are not supported.
for f in $glob; do args+=(-F "${format}=@${f}"); done
if [ -n "$cov_file" ] && [ -f "$cov_file" ]; then args+=(-F "${cov_format}=@${cov_file}"); fi

# A response file per call, because one runner can report two modules at once. The template is
# spelled out so this works on the BSD mktemp of the macOS runners as well as on GNU.
out=$(mktemp "${TMPDIR:-/tmp}/testpulse.XXXXXX")
trap 'rm -f "$out"' EXIT

# curl writes 000 itself when it never got a response, so the default is only for curl failing
# to run at all. Adding `|| echo 000` here instead would concatenate the two into 000000.
code=$(curl -sS -o "$out" -w '%{http_code}' --max-time 30 --retry 2 \
  -H "Authorization: Bearer ${TESTPULSE_TOKEN}" "${args[@]}" \
  "${TESTPULSE_URL}/api/v1/reports")
code=${code:-000}

if [ "$code" != "200" ] && [ "$code" != "201" ]; then
  echo "::warning::testpulse report failed (HTTP ${code}): $(head -c 500 "$out" 2>/dev/null)"
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

`projects/routeserve.yaml`. Layer rules are drawn from the inventory's directory table and checked against the captured fixtures in `lib/ingest/layer-rules.test.ts`; the PostGIS rule is confirmed against a real CI run in Phase 3.

```yaml
slug: routeserve
name: RouteServe
tagline: Field-service CRM, scheduling, and route planning. Mobile app plus multi-tenant API.
description: Field-service CRM with scheduling, SMS reminders, and route-corridor trip planning. Expo and React Native app plus an Express API; multi-tenant core, piano service first.
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
  - match: { module: apps/backend, suite: 'apps/backend/**/*.postgis.test.ts' }
    layer: integration
  - match: { module: apps/backend, suite: 'apps/backend/src/routes/**' }
    layer: api
  - match: { module: apps/mobile, suite: 'apps/mobile/src/screens/**' }
    layer: component
  - match: { module: apps/mobile, suite: 'apps/mobile/src/components/**' }
    layer: component
  - match: { module: apps/mobile, suite: 'apps/mobile/src/hooks/**' }
    layer: component
  - match: { module: apps/mobile, suite: 'apps/mobile/src/app/**' }
    layer: component
  - default: unit

declared_suites:
  - name: Maestro E2E (iOS)
    layer: e2e
    count: 13
    status: authored_not_executed
    note: Flows written; not yet certified on a simulator. Workflow is manual-only.
```
