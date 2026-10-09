# UI element → data field

Tables and columns refer to spec §5; stats to spec §11. Public pages read runs only through the anon-readable view `runs_public`. "Latest run" = latest default-branch run with `source = ci`.

## Landing `/`

| UI element | Source |
|---|---|
| Hero total ("3,802" = Ostomate2 160 + RouteServe 1,044 + testpulse 2,598) | Σ projects: distinct `tests` in latest run (§11 Total tests). Empty runs contribute 0 and are called out in the note. |
| Hero note | n = projects whose latest default-branch run has tests; failing = distinct failed/error tests per project; skipped from the same runs; empty = latest run total 0; stale = no report within `expected_cadence_days` (date = latest `finished_at`); never reported = project with no run. Templates in components.md Landing hero. Nothing stores disabled tests, so it isn't mentioned |
| Hero note | pass rate, skipped count, projects count from the same runs. Skipped is excluded from pass rate and always shown separately |
| Tile · Pass rate | passed / (passed + failed + error) over latest runs. Sub-line: Σ `runs.skipped` of latest runs, "N skipped, excluded" |
| Tile · Projects reporting | n = registered `projects` (never-reported included); r = projects whose latest `runs_public.finished_at` is within `expected_cadence_days`. Sub-line lists silent ones ("{d} days" = elapsed 24-hour periods) then never-reported ones. Public pages never read `alerts` |
| Tile · Runs in last 30 days | count of default-branch runs (`source = ci`) across all projects with `finished_at` in the last 30 days. Sub-line: same count per project, e.g. "Ostomate2 18 · RouteServe 6" |
| Tile · Projects passing | `runs_public`, default branch: n = projects with at least one run; p = projects whose latest run has `status = passed`. Red = latest run `failed`; red duration = now − `finished_at` of the first `failed` run after the last `passed` run (calendar time). Latest run `empty` → "{project} last run empty". Public data only |
| Card status pill | `runs.status` of latest run |
| Card meta | `runs_public.finished_at` (relative) · `runs_public.branch` (the run’s branch, never hard-coded) · `runs_public.commit_sha` (7 chars). Public: link to the run page. Private: plain text, no link (`run_url` is null) |
| Card name / private tag | `projects.name` · `projects.visibility = 'private'` |
| Card description | `projects.tagline` |
| Card total + sub | latest default-branch CI run: distinct `tests` executed (not `runs_public.total`, which counts executions across reports: Ostomate2 is 160 distinct tests in six reports), with passed, failed (failed or error on any platform) and skipped counted per distinct test from the same run; `duration_ms` of the run. Same denominator as the Pass rate tile ("3,801 of 3,802") |
| Card failing test | first `results` with status failed/error in the latest run ⋈ `tests` (suite, name) + report platform → `failing: {suite, name, platform}[]`; the card shortens `suite` (last path or dotted segment, full name in `title`); "+N more" = remaining count. Shown for private projects too (names are public, §9) |
| Layer bar | `LayerBar.layers: {label, count, tone}[]`: count distinct `tests` by `layer` in latest run; `tone` from the fixed layer → tone table in components.md |
| Coverage rows | `CoverageBar {module, pct, floor}`: `module` is the stored key verbatim (`apps/backend`, `apps/mobile`, `packages/shared`, `shared`, `composeApp`), never shortened. `coverage` latest per `module`: `lines_covered / lines_total` when both are present, else `coverage.lines_pct` (spec §11); plotted against `projects.coverage_floors[module]`. Rows sorted by module key (code-point order); YAML order is not stored |
| Per-report block | `reports` of latest run: `job/module/platform` + `total`; header side = platform split: platform is the last key segment, totals summed per platform, always with counts ("jvm 149 · android-emulator 8 · ios-sim 142"; Ostomate2 reports android/composeApp/jvm 61, android/shared/jvm 88, android-e2e/e2e/android-emulator 8, ios/composeApp/ios-sim 51, ios/shared/ios-sim 86, ios-e2e/e2e/ios-sim 5; pyramid Unit 110, Integration 30, Visual 10, E2E 10, E2E counting distinct flows once across platforms) |
| "Not counted" line | `ProjectCard.declared[]` = `projects.declared_suites`, summarised by the components.md template (one suite / several with one status / mixed statuses); empty list → left side blank |
| Health marker | worked out from public data, never from `alerts`: stale = days since the latest `runs_public` row > the project’s expected cadence (`projects` YAML); empty = latest run total 0; below floor = any latest coverage module < its floor; else "Reporting healthy" |
| Recent runs | view `runs_public` (anon-readable; public pages never read the `runs` table). Landing: default branch only (spec §18 Q4), newest first, always 3 rows (a new run pushes the oldest out), no "All runs" link. Project page: default branch by default, "All branches" filter adds pull request and other runs; 10 rows, "Load 20 more". Live updates: new rows in `runs_public` (live-update mechanism decided in Phase 5) |
| Feed row title | From `runs.event` + `runs.branch` only: push → "Push to {branch}", pull_request → "Pull request from {branch}", schedule → "Scheduled run", workflow_dispatch → "Manual run", other → "Run on {branch}". Branch slot = `runs.branch` for every event. Commit messages and PR numbers are not stored. Private: lock + "Private repository" |
| Feed row count | passed: `total` + duration; failed: `failed` + "`passed` of `total`"; empty: "0 tests" + report count |
| Footer "Last report received" | max `reports.received_at` (when testpulse received it; the same time dates a run) |

## Project `/p/[slug]`

| UI element | Source |
|---|---|
| Description | `projects.description` (markdown) |
| Dev / test stack | `projects.dev_stack`, `projects.test_stack` |
| Pyramid | `Pyramid {layers: {label, count, tone}[], declared: DeclaredSuite[], total}`: §11 Test pyramid, rows in §8 order; `declared` from `projects.declared_suites` rendered as text rows only |
| Declared suites | `projects.declared_suites` {name, layer, count, status: `authored_not_executed` \| `runs_in_ci_not_reported`, note}. Unit: "flows" for e2e, "tests" otherwise |
| Stack tags | `dev_stack`, `test_stack`; a test-stack item gets `declaredStatus` when, after dropping a trailing version token from the item ("Maestro 2.6.1" → "Maestro"), a declared suite's name (trimmed, case-folded) equals it or starts with it + space. The tag shows the full name with version. Rules in components.md StackTagGroup |
| Green streak | §11 Green streak over default-branch `runs_public`: current (consecutive `passed` from the latest; 0 when the latest is `failed`) and longest |
| Time to green | §11 Time to green over default-branch `runs_public`, 90 days, calendar time (`finished_at` of the failed run → `finished_at` of the next passed): median, worst, count k. k = 0 → "None" / "No recoveries in 90 days". Red now: latest `failed` → now − `finished_at` of the first failed run of the episode |
| Trends | Window: last 30 default-branch runs per chart. Coverage: one chart per module (module-key order), each with its own floor. Pass rate per run, coverage per run per module: default branch, CI and imported history. Test count per run: distinct tests, default branch, CI runs only (imported history is JVM-only; mixing it would jump when iOS results arrive). Duration per run: CI runs only (imported history has no durations). Runs per UTC day (bar): default branch, CI and imported history (spec §11) |
| Last 40 runs strip | `StatusTimeline kind: 'runs'`, `runs[]` = `runs_public` {status, event, branch, sha, received_at} of the last 40 default-branch CI runs (`source = ci`; imported history excluded); `defaultBranch` = `projects.default_branch`; not interactive; one image name "Last {n} runs on {branch}: …" |
| Flaky list | §11 Flaky test, 30 days. Rate: over the last 40 default-branch CI runs with a result for the test (m ≤ 40), n = runs drawn Failed (final failed or error on any platform, not part of a flip; spec §11: a flip is a pass and a fail on one commit and platform, in default-branch CI runs of the last 30 days, including inside one run; either side is Flaky; pull-request or older pairs aren't flips, so their failing side is Failed) → "Failed {n} of last {m} runs"; n = 0 → "Flipped on {c} commits in 30 days" (c = commits in 30 days with both a pass and a fail on one platform) |
| Repo link | `projects.repo_url`, public only |

## Run detail `/p/[slug]/runs/[id]`

| UI element | Source |
|---|---|
| Header | `runs.*` (status, commit_sha, branch, event, started/finished, duration, `run_url` public only) |
| Report breakdown | `reports` by job/module/platform: tests, failed, skipped, `received_at`, duration. A report whose files held no test cases has tests 0 → Empty. Header "Reports {n}" = count of `reports` for the run; no expected count exists. No note or footer text |
| Results table | `results` ⋈ `tests` (suite, name, layer, status, duration_ms) |
| Platform mismatch | same `test_id` with any differing `status` across reports in the run (§11 Cross-platform parity); sentence groups failed, errored, passed, skipped, as components.md ResultsTable |
| Failure detail | `result_failures.message`, `.detail` for failed and error results — RLS returns nothing for private projects → private-details notice (with Test history link; mismatch line still shown) |
| Status filter | counts distinct tests (rows), not results: each test counted once under its row status (worst across platforms: failed, error, passed, skipped); groups sum to All |
| Attempt | `runs.run_attempt`; shown only when > 1 |
| Row time | per platform, Σ `results.duration_ms` of that platform's results for the test in the run (retries included); then the max across platforms |
| Failure detail (several) | one entry per failed/error result: report platform, status, duration, `result_failures.message`, `.detail` |
| Pruned notice | `runs.results_pruned_at` not null (§5.12) |

## Test history `/p/[slug]/tests/[testKey]`

`StatusTimeline {kind: 'results', testName, runs: {title, branch, sha, when, href, results: {platform, status, duration}[]}[]}`: `results` for `tests.test_key` per report platform, grouped by run (title from `runs.event` + `runs.branch`, duration from `results.duration_ms`), ordered oldest → latest; strips are derived per platform; a run where the test has no result on that platform is a "not run" cell. Flaky cells: a flip (§11): a pass and a fail on one `commit_sha` and platform, in default-branch CI runs of the last 30 days, including inside one run. A pull-request or older pair isn't a flip; its failing side is Failed. Duration: TrendChart, one series per platform, CI runs only.

## How it’s tested `/how-its-tested`

Static copy from spec §3 and §16; live section reads project `testpulse` like any other (reporting since 7 Oct: results card from the latest default-branch run like any project; "Coverage against the floor" from `coverage` latest per module for project testpulse — today one module, `unit`, 3,125 of 3,141 lines, floor `coverage_floors.unit` = 90).

## Admin `/admin`

| UI element | Source |
|---|---|
| Tracked link URL | shown and copied as `<site origin>/v/<token>`; origin comes from the running site, never hard-coded (domain undecided, spec open question 1) |
| Tracked links | `tracked_links` + aggregates over `visits` (exclude `user_agent_class in ('bot','preview')`): first/last seen, distinct `session_id`, distinct `ip_hash`, pages, time per project |
| Alerts | `alerts` where open (not resolved, not acknowledged); kind ∈ stale, count_drop, empty_run, coverage_below_floor; payload gives the figures. Acknowledge (count_drop only) sets `acknowledged_at`; the other kinds are resolved by the daily job or ingestion |
| Sync status | computed when the page loads: each `projects/*.yaml` deployed with the site vs its `projects` row by slug → In sync, Differs (field list), Not registered (file, no row), No YAML (row, no file) |
| Daily job | latest job-run summary: started/finished, heartbeat written, stale alerts opened/closed (names), prune counts (results, failure text, visits, rate-limit buckets), failed step + error; none → "Never run"; finished > 36 h ago → overdue warning |
| Key rotation | writes `projects.api_key_hash`; key shown once |

## Kiosk

Same queries as landing (via `runs_public`). Tiles: Pass rate, Projects reporting, Projects passing (same source as the landing tile). Updates on new rows in `runs_public` (mechanism decided in Phase 5); clock is local time.

## Prop names (as built)

- `LayerBar.layers: {label, count, tone}[]`
- `Pyramid.declared: {name, layer, count, status}[]` from `projects.declared_suites`
- `ProjectCard.declared[]` from `projects.declared_suites`
- `StatusTimeline`: `runs[]` (oldest → latest) with per-platform `results` for one test (`kind: 'results'`), or run `status` for the project strip (`kind: 'runs'`, not interactive)

## Time and rounding (v8)
- Every relative time and date is computed on the server in UTC from the stored timestamp (`finished_at`, `received_at`; runs are dated by `received_at` and have no `created_at`, spec 5.2); rules in components.md Relative time.
- Percentages (pass rate, coverage) round down to one decimal before display; floor comparisons use the stored value.
- Test history tiles, module and headline: from `results` for the test key over the strip's runs; module = the report's `module`; platforms are report platform keys, verbatim.
- Pruned runs: `runs.results_pruned_at` not null → run rows read "Results pruned · {duration}"; the run page shows "Pruned on {results_pruned_at date}".

## Chart tables and copy (v9)
- Chart table "When": `runs.finished_at` of each point's run (imported history: the backfilled run's recorded time). Link: `/p/{projects.slug}/runs/{runs.id}` for CI runs; imported (backfilled) runs have no run page, so `hrefs[i] = null`.
- Test History duration: the project's last 30 default-branch CI `runs`, then the test's `results` in each; a run without a result on a platform is a gap (null) at its place.
- New pill: `tests.first_seen_at` (survives pruning).
- Durations are whole ms (`results.duration_ms`); 0 reads "<1 ms".
- Privacy and How it's tested: static copy; Build progress reads `docs/build-progress.json`, dated by its own `asOf`.

## v10
- Run page "Received": `reports.received_at` (when testpulse received the report), not the file's finish time.
- Last 40 strip notes: counted on the server over every run in the window.
- Test History Failed tile and flaky-list rate: runs whose final result for the test was failed or error on any platform and that aren't part of a flip; either side of a flip is Flaky.
- Hero note stale date: the project's latest report on any branch.
- Build progress (How it's tested): `docs/build-progress.json`, dated by its `asOf`.

## v11
| UI element | Source |
|---|---|
| How it's tested · coverage card | `coverage` rows of project `testpulse`'s latest default-branch run, one per `module` (today `unit`: `lines_covered` 3,125, `lines_total` 3,141), floor `projects.coverage_floors[module]` (90), module-key order, round down. Note per module: "{module}: {lines_covered} of {lines_total} lines covered." (no job name: coverage is stored per module) |
| How it's tested · results card | latest default-branch run of `testpulse`, like any project card: distinct tests per layer (pyramid; layer from `projects/testpulse.yaml` rules as each result is received), total = distinct tests, sub-line failed/skipped/duration. Live 7 Oct: Unit 1,528, Component 655, Integration 180, E2E 235 = 2,598 |
- Run times: a run is dated by its reports' `received_at`.
- Flaky runs are never Failed: tiles, flaky-list rate and strip count final failed/error not part of a flip (spec §11 window: one commit and platform, default-branch CI runs, last 30 days, including inside one run).

## v13
| UI element | Source |
|---|---|
| Run duration | `runs.duration_ms` = Σ `reports.duration_ms` (spec §5); reports table: `reports.duration_ms` each, formatted by `TPKit.runDur`: "27 s", "11m 34s", "1h 05m" |
| Run totals vs reports | Σ `reports.total` = executions (RouteServe 1,048: backend 501, mobile 428, shared 119; Ostomate2 299); run total = distinct tests (RouteServe 1,044, Ostomate2 160). The reports table shows executions per report; the run header shows distinct tests. Any foot text says only "Reports add up to {executions} executions of {distinct} distinct tests." |
| Kiosk cards | one per registered project (three today), same sources as the landing ProjectCard |

## v16
| UI element | Source |
|---|---|
| Admin link detail | `tracked_links` (company, role, contact, lead_project_slug, sent_on, notes, token) + `visits` for that link, excluding `user_agent_class in ('bot','preview')`: first/last `created_at`, count distinct `session_id` (sessions), count distinct `ip_hash` (visitors), per path views and summed time, time summed per project slug |
| Admin table SENT | `tracked_links.sent_on` (date; form defaults to today UTC) |
| Admin table notes | `tracked_links.notes` (admin only, never on a public page) |
| Delete link | deletes the `tracked_links` row; `visits.tracked_link_id` set null (history kept, unlinked) |
| Landing card order | session's `tracked_links.lead_project_slug` → that card first; nothing about the link is rendered |
| Sign-in | Supabase magic link to the one allowed address; the "sent" message is the same for every address |
