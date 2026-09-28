# UI element → data field

Tables and columns refer to spec §5; stats to spec §11. Public pages read runs only through the anon-readable view `runs_public`. "Latest run" = latest default-branch run with `source = ci`.

## Landing `/`

| UI element | Source |
|---|---|
| Hero total ("1,190") | Σ projects: distinct `tests` in latest run (§11 Total tests). Empty runs contribute 0 and are called out in the note. |
| Hero note | pass rate, skipped count, projects count from the same runs. Skipped is excluded from pass rate and always shown separately |
| Tile · Pass rate | passed / (passed + failed + error) over latest runs. Sub-line: Σ `runs.skipped` of latest runs, "N skipped, excluded" |
| Tile · Projects reporting | count of projects with a latest run and no open `stale` alert; sub-line lists silent ones |
| Tile · Runs in last 30 days | count of default-branch runs (`source = ci`) across all projects with `finished_at` in the last 30 days. Sub-line: same count per project, e.g. "Ostomate2 18 · RouteServe 6" |
| Tile · Median time to green | §11 Time to green, median over 90 days, computed from CI runs (backfilled runs excluded by design) |
| Tile · Green streak | §11 Green streak, current |
| Card status pill | `runs.status` of latest run |
| Card meta | `runs_public.finished_at` (relative) · `runs_public.branch` (the run's branch, never hard-coded) · `runs_public.commit_sha` (7 chars). Public: link to the run page. Private: plain text, no link (`run_url` is null) |
| Card name / private tag | `projects.name` · `projects.visibility = 'private'` |
| Card description | `projects.tagline` |
| Card total + sub | `runs_public.total`, `failed`, `skipped`, `duration_ms` |
| Card failing test | first `results` with status failed/error in the latest run ⋈ `tests` (suite, name) + report platform; "+N more" = remaining count. Shown for private projects too (names are public, §9) |
| Layer bar | `LayerBar.layers: {label, count, tone}[]`: count distinct `tests` by `layer` in latest run; `tone` from the fixed layer → tone table in components.md |
| Coverage rows | `CoverageBar {module, pct, floor}`: `module` is the stored key verbatim (`apps/backend`, `apps/mobile`, `packages/shared`, `shared`, `composeApp`), never shortened. `coverage` latest per `module`: `lines_covered / lines_total` when both are present, else `coverage.lines_pct` (spec §11); plotted against `projects.coverage_floors[module]` |
| Per-report block | `reports` of latest run: `job/module/platform` + `total`; side note = executions per platform |
| "Not counted" line | `ProjectCard.declared[]` = `projects.declared_suites`; empty list → left side blank |
| Health marker | open `alerts` for project (`stale`, `empty_run`, `coverage_below_floor`) else "Reporting healthy" |
| Recent runs | view `runs_public` (anon-readable; public pages never read the `runs` table). Landing: default branch only (spec §18 Q4), newest first, 3 rows, no "All runs" link. Project page: default branch by default, "All branches" filter adds pull request and other runs; 10 rows, "Load 20 more". Live updates: new rows in `runs_public` (live-update mechanism decided in Phase 5) |
| Feed row title | From `runs.event`: push → "Push to {branch}", pull_request → "Pull request #{n}", schedule → "Scheduled run". Commit messages are not stored. Private: lock + "Private repository" |
| Feed row count | passed: `total` + duration; failed: `failed` + "`passed` of `total`"; empty: "0 tests" + report count |
| Footer "Last report received" | max `reports.created_at` |

## Project `/p/[slug]`

| UI element | Source |
|---|---|
| Description | `projects.description` (markdown) |
| Dev / test stack | `projects.dev_stack`, `projects.test_stack` |
| Pyramid | `Pyramid {layers: {label, count, tone}[], declared: DeclaredSuite[], total}`: §11 Test pyramid, rows in §8 order; `declared` from `projects.declared_suites` rendered as text rows only |
| Declared suites | `projects.declared_suites` {name, layer, count, status: `authored_not_executed` \| `runs_in_ci_not_reported`, note}. Unit: "flows" for e2e, "tests" otherwise |
| Stack tags | `dev_stack`, `test_stack`; a test-stack item whose tool matches a declared suite gets `declaredStatus` from that suite |
| Trends | Pass rate per run, test count per run, coverage per run per module: default branch, CI and imported history. Duration per run: CI runs only (imported history has no durations). Runs per UTC day (bar): default branch, CI and imported history (spec §11) |
| Last 40 runs strip | `StatusTimeline kind: 'runs'`, cells = `runs_public.status` of the last 40 default-branch runs; not interactive |
| Flaky list | §11 Flaky test, 30 days |
| Repo link | `projects.repo_url`, public only |

## Run detail `/p/[slug]/runs/[id]`

| UI element | Source |
|---|---|
| Header | `runs.*` (status, commit_sha, branch, event, started/finished, duration, `run_url` public only) |
| Report breakdown | `reports` by job/module/platform |
| Results table | `results` ⋈ `tests` (suite, name, layer, status, duration_ms) |
| Platform mismatch | same `test_id` with differing `status` across reports in the run (§11 Cross-platform parity) |
| Failure detail | `result_failures.message`, `.detail` for failed and error results — RLS returns nothing for private projects → private-details notice (with Test history link; mismatch line still shown) |
| Status filter | counts by `results.status`: passed, failed, error, skipped |
| Pruned notice | `runs.results_pruned_at` not null (§5.12) |

## Test history `/p/[slug]/tests/[testKey]`

`StatusTimeline {strips: {platform, cells}[]}`: `results` for `tests.test_key` per report platform, ordered by run; a run where the test has no result on that platform is a "not run" cell. Flaky cells: a pass and a fail on the same `commit_sha` and platform within 30 days (§11). Duration: TrendChart, one series per platform, CI runs only.

## How it's tested `/how-its-tested`

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

Same queries as landing (via `runs_public`). Tiles: Pass rate, Projects reporting, Green streak. Updates on new rows in `runs_public` (mechanism decided in Phase 5); clock is local time.

## Prop names (as built)

- `LayerBar.layers: {label, count, tone}[]`
- `Pyramid.declared: {name, layer, count, status}[]` from `projects.declared_suites`
- `ProjectCard.declared[]` from `projects.declared_suites`
- `StatusTimeline`: `strips[].cells[]` from results for one test (`kind: 'results'`), or from runs for the project strip (`kind: 'runs'`, `interactive: false`)
