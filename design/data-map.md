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
| Card meta | `runs.finished_at` (relative) · `runs.branch` · `runs.commit_sha` (7 chars; link = `run_url`, public only) |
| Card name / private tag | `projects.name` · `projects.visibility = 'private'` |
| Card description | `projects.tagline` |
| Card total + sub | `runs.total`, `failed`, `skipped`, `duration_ms` |
| Layer bar | count distinct `tests` by `layer` in latest run |
| Coverage rows | `coverage` latest per `module`: `lines_covered / lines_total` when both are present, else `coverage.lines_pct` (spec §11); plotted against `projects.coverage_floors[module]` |
| Per-report block | `reports` of latest run: `job/module/platform` + `total`; side note = executions per platform |
| "Not counted" line | `projects.declared_suites` |
| Health marker | open `alerts` for project (`stale`, `empty_run`, `coverage_below_floor`) else "Reporting healthy" |
| Recent runs | view `runs_public` (anon-readable; public pages never read the `runs` table), all branches, newest first, limit 3 (landing) / paginated (project). Live updates: new rows in `runs_public` (live-update mechanism decided in Phase 5) |
| Feed row title | commit subject for push; "Pull request #N" for PR; hidden (lock + "Private repository") when private |
| Footer "Last report received" | max `reports.created_at` |

## Project `/p/[slug]`

| UI element | Source |
|---|---|
| Description | `projects.description` (markdown) |
| Dev / test stack | `projects.dev_stack`, `projects.test_stack` |
| Pyramid | §11 Test pyramid |
| Declared suites | `projects.declared_suites` (status: `authored_not_executed`, `run_not_reported`) |
| Trends | pass rate, test count, suite duration per run (backfill included for pass rate/count/coverage only) |
| Flaky list | §11 Flaky test, 30 days |
| Repo link | `projects.repo_url`, public only |

## Run detail `/p/[slug]/runs/[id]`

| UI element | Source |
|---|---|
| Header | `runs.*` (status, commit_sha, branch, event, started/finished, duration, `run_url` public only) |
| Report breakdown | `reports` by job/module/platform |
| Results table | `results` ⋈ `tests` (suite, name, layer, status, duration_ms) |
| Platform mismatch | same `test_id` with differing `status` across reports in the run (§11 Cross-platform parity) |
| Failure detail | `result_failures.message`, `.detail` — RLS returns nothing for private projects → `PrivateDetailsNotice` |
| Pruned notice | `runs.results_pruned_at` not null (§5.12) |

## Test history `/p/[slug]/tests/[testKey]`

Status timeline and duration trend from `results` for `tests.test_key`, ordered by run.

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
