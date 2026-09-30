# UI element → data field

Tables and columns refer to spec §5; stats to spec §11. Public pages read runs only through the anon-readable view `runs_public`. "Latest run" = latest default-branch run with `source = ci`.

## Landing `/`

| UI element | Source |
|---|---|
| Hero total ("1,190") | Σ projects: distinct `tests` in latest run (§11 Total tests). Empty runs contribute 0 and are called out in the note. |
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
| Card total + sub | latest default-branch CI run: distinct `tests` executed (not `runs_public.total`, which counts executions: Ostomate2 192 = JVM + iOS), with passed, failed (failed or error on any platform) and skipped counted per distinct test from the same run; `duration_ms` of the run. Same denominator as the Pass rate tile ("1,189 of 1,190") |
| Card failing test | first `results` with status failed/error in the latest run ⋈ `tests` (suite, name) + report platform → `failing: {suite, name, platform}[]`; the card shortens `suite` (last path or dotted segment, full name in `title`); "+N more" = remaining count. Shown for private projects too (names are public, §9) |
| Layer bar | `LayerBar.layers: {label, count, tone}[]`: count distinct `tests` by `layer` in latest run; `tone` from the fixed layer → tone table in components.md |
| Coverage rows | `CoverageBar {module, pct, floor}`: `module` is the stored key verbatim (`apps/backend`, `apps/mobile`, `packages/shared`, `shared`, `composeApp`), never shortened. `coverage` latest per `module`: `lines_covered / lines_total` when both are present, else `coverage.lines_pct` (spec §11); plotted against `projects.coverage_floors[module]`. Rows sorted by module key (code-point order); YAML order is not stored |
| Per-report block | `reports` of latest run: `job/module/platform` + `total`; header side = platform split: platform is the last key segment, totals summed per platform, always with counts ("jvm 142 · ios-sim 132") |
| "Not counted" line | `ProjectCard.declared[]` = `projects.declared_suites`, summarised by the components.md template (one suite / several with one status / mixed statuses); empty list → left side blank |
| Health marker | worked out from public data, never from `alerts`: stale = days since the latest `runs_public` row > the project’s expected cadence (`projects` YAML); empty = latest run total 0; below floor = any latest coverage module < its floor; else "Reporting healthy" |
| Recent runs | view `runs_public` (anon-readable; public pages never read the `runs` table). Landing: default branch only (spec §18 Q4), newest first, always 3 rows (a new run pushes the oldest out), no "All runs" link. Project page: default branch by default, "All branches" filter adds pull request and other runs; 10 rows, "Load 20 more". Live updates: new rows in `runs_public` (live-update mechanism decided in Phase 5) |
| Feed row title | From `runs.event` + `runs.branch` only: push → "Push to {branch}", pull_request → "Pull request from {branch}", schedule → "Scheduled run", workflow_dispatch → "Manual run", other → "Run on {branch}". Branch slot = `runs.branch` for every event. Commit messages and PR numbers are not stored. Private: lock + "Private repository" |
| Feed row count | passed: `total` + duration; failed: `failed` + "`passed` of `total`"; empty: "0 tests" + report count |
| Footer "Last report received" | max `reports.created_at` |

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
| Last 40 runs strip | `StatusTimeline kind: 'runs'`, `runs[]` = `runs_public` {status, event, branch, sha, created_at} of the last 40 default-branch CI runs (`source = ci`; imported history excluded); `defaultBranch` = `projects.default_branch`; not interactive; one image name "Last {n} runs on {branch}: …" |
| Flaky list | §11 Flaky test, 30 days. Rate: over the last 40 default-branch CI runs with a result for the test (m ≤ 40), n = runs with failed or error on any platform → "Failed {n} of last {m} runs"; n = 0 → "Flipped on {c} commits in 30 days" (c = commits in 30 days with both a pass and a fail on one platform) |
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

`StatusTimeline {kind: 'results', testName, runs: {title, branch, sha, when, href, results: {platform, status, duration}[]}[]}`: `results` for `tests.test_key` per report platform, grouped by run (title from `runs.event` + `runs.branch`, duration from `results.duration_ms`), ordered oldest → latest; strips are derived per platform; a run where the test has no result on that platform is a "not run" cell. Flaky cells: a pass and a fail on the same `commit_sha` and platform within 30 days (§11). Duration: TrendChart, one series per platform, CI runs only.

## How it’s tested `/how-its-tested`

Static copy from spec §3 and §16; live section reads project `testpulse` like any other (shows "Not reporting yet" until Phase 7).

## Admin `/admin`

| UI element | Source |
|---|---|
| Tracked link URL | shown and copied as `<site origin>/v/<token>`; origin comes from the running site, never hard-coded (domain undecided, spec open question 1) |
| Tracked links | `tracked_links` + aggregates over `visits` (exclude `user_agent_class in ('bot','preview')`): first/last seen, distinct `session_id`, distinct `ip_hash`, pages, time per project |
| Alerts | `alerts` open/resolved |
| Sync status | `projects:sync` result per YAML file |
| Scheduler | latest `heartbeats.created_at`; warning if > 36 h |
| Key rotation | writes `projects.api_key_hash`; key shown once |

## Kiosk

Same queries as landing (via `runs_public`). Tiles: Pass rate, Projects reporting, Projects passing (same source as the landing tile). Updates on new rows in `runs_public` (mechanism decided in Phase 5); clock is local time.

## Prop names (as built)

- `LayerBar.layers: {label, count, tone}[]`
- `Pyramid.declared: {name, layer, count, status}[]` from `projects.declared_suites`
- `ProjectCard.declared[]` from `projects.declared_suites`
- `StatusTimeline`: `runs[]` (oldest → latest) with per-platform `results` for one test (`kind: 'results'`), or run `status` for the project strip (`kind: 'runs'`, not interactive)

## Time and rounding (v8)
- Every relative time and date is computed on the server in UTC from the stored timestamp (`finished_at`, `created_at`, `received_at`); rules in components.md Relative time.
- Percentages (pass rate, coverage) round down to one decimal before display; floor comparisons use the stored value.
- Test history tiles, module and headline: from `results` for the test key over the strip's runs; module = the report's `module`; platforms are report platform keys, verbatim.
- Pruned runs: `runs.results_pruned_at` not null → run rows read "Results pruned · {duration}"; the run page shows "Pruned on {results_pruned_at date}".

## Chart tables and copy (v9)
- Chart table "When": `runs.finished_at` of each point's run (imported history: the backfilled run's recorded time). Link: `/p/{projects.slug}/runs/{runs.id}` for CI runs; imported (backfilled) runs have no run page, so `hrefs[i] = null`.
- Test History duration: the project's last 30 default-branch CI `runs`, then the test's `results` in each; a run without a result on a platform is a gap (null) at its place.
- New pill: `tests.first_seen_at` (survives pruning).
- Durations are whole ms (`results.duration_ms`); 0 reads "<1 ms".
- Privacy and How it's tested: static copy; Build progress reads spec §17 at build time.
