# Components (v4, canonical)

`pages/Design System.dc.html` is the canonical drawing of everything here; this file lists the same props, states and variants. Every state below is drawn there. Token names refer to `tokens.css`. Where a literal size appears (px), it is stated once here and on the Design System page.

Shared rules
- Targets: every interactive element ≥ 44×44 px, including breadcrumbs, tabs, table toggles and "Show table". Exempt: links inside running prose (WCAG 2.5.8 inline exception) — none of the listed controls are inline.
- Status is always icon + word. Status icons are 24-unit stroke SVGs, round caps.
- Layer tones are fixed per spec §8 layer (see LayerBar), same in every project and chart.
- Theme change: `background-color, border-color, color, fill, stroke` transition over `--motion-base` (200 ms, ease), only while `<html data-theme-switching>` is set (for 200 ms after the toggle), so hover and other transitions are unaffected. Nothing else animates on theme change. Reduced motion: no transition (the rule sits inside `@media (prefers-reduced-motion: no-preference)`).
- Awkward states drawn wherever they apply: loading, empty, private, failed, one item.
- Copy: apostrophes are curly (’) in every rendered string. Count nouns are singular at 1: "1 test", "1 report", "1 flow", "1 run", "1 suite", "1 day". Participles stay as they are: "1 failed", "1 skipped", "1 passed".
- Loading containers carry `aria-busy="true"` and a hidden name via `aria-label`: "Loading runs", "Loading results", "Loading project", "Loading chart", "Loading test layers", "Loading stats".

## StatusBadge
Props: `status: 'passed' | 'failed' | 'error' | 'empty' | 'skipped' | 'flaky' | 'stale' | 'not_reporting'`, `variant: 'pill' | 'inline'`.
| status | icon | word | ink / tint |
|---|---|---|---|
| passed | circle + check | Passed | `--pass` / `--pass-tint` |
| failed | circle + ✕ | Failed | `--fail` / `--fail-tint` |
| error | circle + ! | Error | `--fail` / `--fail-tint` |
| empty | dashed circle (dash 3.5 3) + horizontal dash | Empty | `--attn` / `--attn-tint` |
| skipped | circle + horizontal dash | Skipped | `--neutral` / `--neutral-tint` |
| flaky | zig-zag pulse line | Flaky | `--attn` / `--attn-tint` |
| stale | circle + clock hands | Stale | `--attn` / `--attn-tint` |
| not_reporting | dashed circle, empty | Not reporting yet | `--neutral` / `--neutral-tint` |
- pill: 14px/600, padding 4×11, gap 6, icon 14, `--radius-pill`.
- inline: 14px/600, gap 6, icon 15, no fill. Used in rows, tables and the project switcher.
- kiosk: pill at kiosk size, 26px/600, icon 26, padding 8×18, gap 10. Kiosk ProjectCard.
- inline-kiosk: 24px/600, icon 22, gap 8, no fill. Kiosk run tiles.
- "running" is removed: runs are only reported when finished (spec non-goal: no streaming).

## PrivateTag
Lock icon 12 + "Private repository". 13px/500 `--ink-2` on `--neutral-tint`, padding 5×10, pill. Kiosk variant: lock 30 `--ink-3` + "Private" 24px `--ink-3`, no fill.

## HealthMarker
Props: `health: 'healthy' | 'stale' | 'empty' | 'below_floor' | 'not_reporting'`, `days?`, `size: 'web' | 'kiosk'` (default web). web: 14px/600, icon 13, stroke 2.8. kiosk: 24px/600, icon 24, stroke 2.8, gap 10.
- healthy: check, `--pass`, "Reporting healthy"
- stale: clock, `--attn`, "No report in {days} days" ("1 day" at 1)
- empty: empty icon, `--attn`, "Last run empty"
- below_floor: arrow-down, `--attn`, "Coverage below floor"
- not_reporting: dashed circle, `--neutral`, "Not reporting yet"
- Page detail (project page) is not part of the marker: the page puts a separate 14px `--ink-3` span after it, gap 8: "Last report {relative}" when healthy, "Expected every {n} days" when stale.

## Button
Props: `variant: 'primary' | 'secondary' | 'ghost' | 'danger'`, `busy?`, `disabled?`. Height 44, padding 0 16, `--radius-sm`, 15px/600, cursor pointer.
| variant | default | hover | pressed |
|---|---|---|---|
| primary | bg `--ink`, text `--on-ink` | bg `--ink-2` | bg `--ink-3` |
| secondary | bg `--surface`, 1px `--line-strong`, text `--ink` | bg `--raised` | bg `--raised`, border `--ink-3` |
| ghost | no bg or border, text `--ink` | bg `--raised` | bg `--raised` |
| danger | no bg, 1px `--fail`, text `--fail` | bg `--fail-tint` | bg `--fail-tint`, border 2px, padding 0 15 (label does not move) |
- Hover and pressed: `background-color, border-color` transition over `--motion-fast` (120 ms, ease); none under reduced motion.
- focus: 2px `--ink` outline, offset 2.
- disabled: bg `--raised`, text `--ink-3`, no border, `aria-disabled`, cursor `not-allowed`.
- busy: keeps its variant colours, label changes (e.g. "Saving…"), 14px ring before the label (24 viewBox, stroke-width 3 = 1.75px at 14px; track `--ink-3` at 50%, quarter arc `currentColor`, rotating 0.9 s; static under reduced motion), `aria-busy="true"`, not clickable, cursor `progress`. Replaces the old standalone "Saving" pill.
- "Rotate API key" is Button `danger`.

## SiteHeader, SiteFooter, Breadcrumbs, LiveIndicator
- SiteHeader: wordmark, ProjectSwitcher, "How it’s tested", LiveIndicator, theme toggle (44×44).
- Breadcrumbs: 14.5px `--ink-3`, current page `--ink`, links are 44px tall flex items, gap 8, separator "/".
- LiveIndicator: `connected`. On: 8px `--pass` dot pulsing (`--motion-pulse`), "Live". Off: 8px 1.5px `--ink-3` ring, "Offline · reconnecting".
- SiteFooter: Privacy · Source on GitHub (44px) · "Last report received {relative}".

## ProjectSwitcher
Disclosure, not an ARIA menu: a button (`aria-expanded`, `aria-controls`) toggling a list of links, so Tab reaches every project. Panel: `--raised`, 1px `--line-strong`, `--radius-md`, `--shadow-menu`, 320 wide, padding 6. Items: 44px links, radius `--radius-tag`, name 15px/600 + inline StatusBadge of the latest run on the right.
- Current project: bg `--surface`, `aria-current="page"`, and a 13px `--ink-3` "Current" after the name.
- Hover / focus: bg `--surface` (same fill; the "Current" word is what marks the current one).
- Closes on: selecting, Escape (focus returns to the button), click outside, focus leaving the panel.
- Projects not reporting: same link, StatusBadge `not_reporting`.

## StatTile
Props: `label`, `value`, `sub`, `attention?: {icon: 'stale' | 'empty' | 'below_floor', text}`, `loading?`. Surface, `--radius-lg`, padding 18×20, label 14 `--ink-3`, value `--text-stat` `--ink`, sub 13 `--ink-3`.
- attention: the value stays `--ink`; the sub-line becomes 13/600 `--attn` with a 12px icon before the text ("1 silent for 12 days"). The value never turns amber.
- loading: three `--raised` bars (label 60%, value 45%×34, sub 75%).
- Landing set (spec §11) beside the hero total: Pass rate (sub "Latest runs · N skipped, excluded"), Projects reporting, Runs in last 30 days (sub per project), Median time to green, Green streak. Grid `repeat(auto-fit, minmax(min(100%, 200px), 1fr))`, gap 12: 5 across at 1440, 4 + 1 at 1024, 1 per row at 390.
- Variant `kiosk`: one horizontal row, label 24 `--ink-3` left, value 52 serif right, padding 20×26, `--radius-lg`. `sub`: 20px `--ink-3` under the label, gap 4. Attention: label text replaced by the attention text in `--attn` 600 with a 22px icon (stroke 2.6; same glyph as HealthMarker: clock for stale, dashed ring + dash for empty, arrow-down for below_floor); value stays `--ink`. Loading: label bar 45%×22 and value bar 120×52, `--raised`, shimmer.

## ProjectCard
Props: `project {name, tagline, visibility, href}`, `latestRun: {status, when, branch, sha, href, total, failed, skipped, duration} | null`, `layers: {label, count, tone}[]`, `coverage: {module, pct, floor}[]`, `reports: {key, total}[]`, `declared: DeclaredSuite[]`, `health: {health, days}`, `failing?: {suite, name, platform}[]`, `loading?`, `variant: 'web' | 'kiosk'`, `headingLevel` (default 3; the page sets it).
Web variant (canonical, one layout for every state):
- Surface, 1px `--line`, `--radius-xl`, padding `24px var(--pad-card-x) 0`.
- Row 1: StatusBadge pill + meta "{relative} · {branch} · {sha7}". SHA is a link to the run page on public projects (inline-flex, min-height 44, so row 1 is 44 tall); plain mono text on private projects (no run URL exists). Branch is `runs.branch`.
- Name `--text-title` as a link to `project.href` (inline-flex, min-height 44) + PrivateTag when private. Tagline 15.5px `--ink-2`.
- Total `--text-count` + sub-line "tests · {failed} failed · {skipped} skipped · {duration}" ("test" at 1). When failed > 0, "{n} failed" is `--fail` 600; the total stays `--ink`.
- Failed: inset block `--fail-tint`, `--radius-md`, padding 12×14, min-height 44: first failing test "{short suite} › {name}" mono 13 `--ink` (full name in `title`), platform 13 `--ink-3`, "+{n} more" when more than one; links to the run page (testpulse’s own page, so also on private projects; spec §9: test names are public). The failure message is never on the card.
- Short suite: path-style suites keep the last path segment ("apps/backend/src/routes/jobs.test.ts" → "jobs.test.ts"); dotted class names keep the last segment ("com.ostomate.app.ui.home.HomeViewModelTest" → "HomeViewModelTest"). The block wraps; it never truncates.
- LayerBar, then CoverageBar rows (grid `128px minmax(40px,1fr) auto`, gap 14), then the per-report block (inset, mono 13: header "{n} reports in this run" + platform split; body `repeat(auto-fill, minmax(200px,1fr))` key/count pairs).
- Platform split: platform = last segment of the report key "job/module/platform"; totals summed per platform, in first-seen order, always with counts: "jvm 142 · ios-sim 132", "node 1,045", "node 284 · chromium 38". Empty run: counts are 0.
- Footer: hairline, left "Not counted: {declared summary}" 13.5 `--ink-3`; right HealthMarker. No declared suites: left side is empty and the marker stays right-aligned.
- Declared summary (phrases: runs_in_ci_not_reported "run in CI, not yet reported"; authored_not_executed "authored, not yet executed"; unit "flows" for e2e, else "tests"; counts per unit joined with " and "):
  - one suite: "Not counted: {name} ({count} {unit}), {phrase}" → "Not counted: Maestro E2E · iOS (13 flows), authored, not yet executed"
  - several, one status: "Not counted: {sum} {unit} in {k} suites, {phrase}" → "Not counted: 12 flows in 2 suites, run in CI, not yet reported"
  - several, mixed: one clause per status (run in CI first), joined "; " → "Not counted: 7 flows run in CI, not yet reported; 5 flows authored, not yet executed"
States:
- passed · failed · private · private + failed (same as failed, SHA unlinked) · empty (total "0" `--attn`, sub "tests executed · {n} reports received", no LayerBar, no coverage rows and no "No coverage reported", note in `--attn-tint`: "Every report in this run arrived with no test results. An empty run is treated as a problem, not a pass, and isn’t counted in any total.", report counts in `--attn`, HealthMarker empty) · stale (meta time in `--attn`, HealthMarker stale; no banner in the card) · below floor (CoverageBar below state, HealthMarker below_floor) · no coverage rows ("No coverage reported" 14 `--ink-3` in place of the rows) · not reporting yet (StatusBadge not_reporting, no meta, no total; body "Registered. Results appear here after its CI posts the first report." 15 `--ink-2`; no layers, coverage or reports; HealthMarker not_reporting) · loading (the card frame stays still; one `--raised` skeleton block per part inside it shimmers, as StatTile does; `aria-label="Loading project"`).
Kiosk variant (all six states drawn): width from the kiosk grid. Border 3px: `--fail` failed, `--attn` stale or empty, `--line` otherwise (including not reporting). `--radius-kiosk` (24), padding 30×34 0.
- Row 1: StatusBadge kiosk + meta "{relative} · {sha7}" 24 (SHA mono 22). Stale: the whole meta line is `--attn`.
- Name 64 (heading, `headingLevel`; Kiosk page passes 2) + PrivateTag kiosk variant in the heading, gap 8×18, 400 24px sans `--ink-3`.
- Total 104 + "tests" 26 `--ink-2`; next line the rest of the sub-line 26.
- Failed: block `--fail-tint`, `--radius-kiosk-inset` (14), padding 16×20: name "{short suite} › {name}" mono 22, one line, ellipsis; platform key 22 `--ink-2` ("ios-sim") + "+{n} more". No link.
- LayerBar kiosk (see LayerBar), hidden when failed or empty.
- Empty: total "0" `--attn`, "tests executed", "{n} reports received", the web empty note at 22px/1.45 in `--attn-tint` (radius 14, padding 16×20, icon 24); no layers, no coverage.
- Not reporting: StatusBadge kiosk not_reporting, no meta, body "Registered. Results appear here after its CI posts the first report." 26 `--ink-2`; nothing else but the footer.
- Coverage: legend row "Line coverage | floor" 22 `--ink-3`, then CoverageBar kiosk rows. No coverage rows: the whole block and its legend are omitted.
- Footer: hairline, HealthMarker kiosk, right-aligned. No tagline, no per-report block, no declared summary.

## LayerBar
Props: `layers: {label, count, tone}[]` (as built). 8px tall, segments `flex: count`, min 3px, **3px gap between every segment**, radius pill on the ends. Labels below: "{label} {count}", 13px `--ink-2`, gap 6×20.
Layer → tone (fixed, spec §8 order):
| layer | tone |
|---|---|
| unit | `--layer-1` |
| component | `--layer-2` |
| integration | `--layer-3` |
| api | `--layer-4` |
| visual | `--layer-2` |
| e2e | `--layer-3` |
Variant `kiosk`: 14px tall, 3px gap (still mandatory), min segment 5px, labels 24 `--ink-2` with the count in `--ink`, gap 6×24, 12px below the bar.
component and visual share `--layer-2`; integration and e2e share `--layer-3`. In §8 order no two sharing layers are adjacent. `--layer-3` and `--layer-4` are close (1.3–1.45:1), so the 3px gap is mandatory.

## Pyramid
Props: `layers: {label, count, tone}[]`, `declared: DeclaredSuite[]`, `total`, `note?`, `loading?`.
- Header: total `--text-count` + "tests executed in the latest run" 15 `--ink-2`; right: `note` 13.5 `--ink-3` (e.g. which platform is counted), omitted when absent.
- Rows in spec §8 order, top to bottom: e2e, visual, api, integration, component, unit (only layers present). Widths do not have to narrow upward; order follows §8, not size.
- Row grid `110px minmax(0,1fr) 120px`, gap 16, 14px. Label right-aligned `--ink-2`. Bar centred, height 30, radius 4 (`--radius-xs`), width = count ÷ largest count, min 6px, tone per LayerBar. Count 14/600 + "{pct}%" 13 `--ink-3` of the executed total, rounded to the nearest whole percent; a share under 1% reads "<1%".
- Declared suites: summed per layer into one text row per layer (Ostomate2 e2e: 7 + 5 = "12 flows"), all declared rows above all bars, in §8 order: label `--ink-3`, middle "{count} {unit} declared · not counted" 13 `--ink-3`, count column empty. Units never mix with bars.
- States: single layer (one bar at full width); no layers ("No tests executed yet." 15 `--ink-2` in place of rows; declared rows are hidden too, the DeclaredSuiteNote lists them); loading (header skeleton 96×44 + 45%×14, then 4 rows in the row grid: label 64×12, bar 30 tall at 25%, 45%, 70%, 100% of the bar column, count 56×12; `aria-label="Loading test layers"`); narrow (grid `80px minmax(0,1fr) 88px`, same bar height) when the pyramid’s own container is under 480px (container query or ResizeObserver, not the viewport).

## DeclaredSuiteNote
Props: `suites: {name, layer, count, status: 'authored_not_executed' | 'runs_in_ci_not_reported', note?}[]` from `projects.declared_suites`.
- Surface, `--radius-lg`. Header padding 16×20: title serif 20 + "These tests exist but don’t report here yet. They aren’t counted in any total." 13.5 `--ink-3`. No border under the header; each row has a top hairline (so there is one line between header and first row).
- Row: flex-wrap, gap 6×12, padding 14×20, 14px: name 600 (`flex 1 1 220px`), layer 110 `--ink-3`, count 90 "{count} {unit}", status (`flex 0 1 260px`) StatusBadge-like inline in `--neutral`: authored_not_executed "Authored, not yet executed" (dotted ring, dash 1 3.2); runs_in_ci_not_reported "Runs in CI, not yet reported" (dashed ring, dash 3.5 3).
- unit: "flows" when layer is e2e, otherwise "tests".
- At phone width the row wraps: name on its own line, then layer · count · status.

## StackTagGroup
Props: `variant: 'built' | 'tested'`, `groups: {category, items: {name, declaredStatus?: 'authored_not_executed' | 'runs_in_ci_not_reported'}[]}[]`, `headingLevel` (default 3).
- Title is part of the component, text fixed by variant: "Built with" / "Tested with". Heading element, mono 12/600, uppercase (CSS), letter-spacing .08em, `--ink-3`, 14 below.
- Grid `96px minmax(0,1fr)`, gap 12×16, 13.5px. Category `--ink-3`.
- Tag: padding 4×10, `--radius-tag` (6). built: bg `--inset`, 1px `--line`. tested: no bg, 1px `--line-strong`.
- declaredStatus (from `declared_suites`, matched by tool name): dashed border, `--ink-2`, text "{name} · not yet executed" / "{name} · not yet reported".

## CoverageBar
Props: `module` (stored module key, verbatim), `pct`, `floor`. Row grid `128px minmax(40px,1fr) auto`, gap 14, 14px.
- Module key mono 13 `--ink-2`, one line: nowrap + ellipsis, full key in `title`.
- Track 6px `--raised`, pill; fill `--ink` to pct; floor marker 2×14 `--attn` at floor%, top −4. Scale always 0–100 (a bar’s length encodes value, so it starts at zero).
- Above / at floor: "{pct}%" 600 `--ink` + " floor {floor}%" `--ink-3`.
- Below floor: fill stays `--ink`; 13px arrow-down icon `--attn` + "{pct}%" 600 `--attn` + " below floor {floor}%" `--attn`.
- Lines only (spec §11). The branch-coverage rows on the project page are removed.
- Variant `kiosk`: grid `220px minmax(40px,1fr) 130px`, gap 18; key mono 22 (nowrap, ellipsis); track 10; floor marker 3×22, top −6; value 24/600 right-aligned. Below floor: 22px arrow-down + value in `--attn` (the legend row explains the marker; HealthMarker says "Coverage below floor").

## RunFeedRow
Props: `run`, `showProject` (default true), `isNew?`, `variant: 'web' | 'kiosk'`.
- Link row, flex-wrap, gap 6×16, padding 14×16, min-height 44, `--radius-md`. Hover and focus: bg `--raised`.
- Status: inline StatusBadge, fixed width 104.
- Content (`flex 1 1 220px`, min-width 0): title 15/500 ellipsis; meta 13 `--ink-3` "{project} · {branch} · {sha7}" (project omitted when `showProject` is false). The branch slot is always `runs.branch`, for every event.
- Title from stored data only (`runs.event`, `runs.branch`): push "Push to {branch}"; pull_request "Pull request from {branch}"; schedule "Scheduled run"; workflow_dispatch "Manual run"; any other event "Run on {branch}". Commit messages and PR numbers are not stored. Private: lock + "Private repository" in place of the title.
- Count (nowrap): passed "{total} tests" `--ink` + " · {duration}" `--ink-3`; failed "{n} failed" `--fail` 600 + " · {passed} of {total}" `--ink-3`; empty "0 tests" `--attn` 600 + " · {n} reports" `--ink-3`. Singular at 1 ("1 test", "1 report"). Same on every page.
- Time: 13 `--ink-3`, real relative time, `margin-left: auto`.
- New: "New" chip before the title (11px/600 sans, pill, bg `--ink`, text `--on-ink`, padding 2×7); row bg `--raised` fading to transparent over `--motion-arrive`. A new failed row is the same with the failed status and count; no fail tint. Only new rows get a background.
- Phone (feed narrower than ~480): content wraps to two lines — line 1 status + title/meta, line 2 count left and time right.
Variant `kiosk` (tile, drawn): padding 18×24, `--radius-lg` (16), 1px `--line`, bg `--surface` for every status (no fail tint; the badge and count carry the status). Line 1: StatusBadge inline-kiosk left, time 22 `--ink-3` right. Line 2 (nowrap): project 24/600; private projects add a 22px lock `--ink-3` labelled "Private repository" after the name; branch 24 `--ink-3` (ellipsis); count right 24: passed "{total} tests" `--ink-2` 400, failed "{n} failed" `--fail` 600, empty "0 tests" `--attn` 600. Not a link (the kiosk is not interactive).

## RunFeed
Props: `runs[]`, `connected`, `state: 'ready' | 'loading' | 'empty' | 'error'`, `variant: 'web' | 'kiosk'`, `filter?` (project page only).
- Card: `--surface`, 1px `--line`, `--radius-xl`, padding 8, `--shadow-card` (every page).
- Header: h2 serif 24/500 "Recent runs" (project page: "Runs"). Live note (not the header LiveIndicator): 8px `--pass` dot (pulsing, `--motion-pulse`) + "Updates as reports arrive" 13.5 `--ink-3`, no "Live" word. Disconnected: 8px 1.5px `--ink-3` ring + "Offline. Showing runs as of {HH:MM}; reconnecting" in `--ink-2`.
- Landing: live note on the right of the header row.
- Project page: header row holds "Runs" left and the branch filter right; the live note (both states) sits on its own line under it, padding 0 16 10, left-aligned.
- `role="log" aria-live="polite"`. Without JS: server-rendered list.
- Landing: default-branch runs only (spec §18 Q4), 3 rows, no "All runs" link.
- Project page run list: segmented filter (radio group, 44px) "Default branch" (default) | "All branches"; 10 rows, then secondary Button "Load 20 more".
- loading: 3 skeleton rows (104×14, two text bars, count bar), `aria-label="Loading runs"`. empty: "No runs yet" serif 20 + body 14 `--ink-2`: Landing "Runs appear here as each project’s CI reports."; project page "Runs appear here when {project}’s CI reports." error: ErrorState `inline`.
Variant `kiosk`: 32px serif heading "Recent runs" + note 22 `--ink-3` ("Updates as reports arrive"; offline: 14px ring + "Offline. As of {HH:MM}" `--ink-2`). Tiles as RunFeedRow kiosk; every status can appear (passed, failed, empty, private). loading: 3 skeleton tiles; empty: one tile "No runs yet" serif 28 + "Runs appear here as each project’s CI reports." 22 `--ink-3`; error: one tile with the error icon 24 `--fail` + "Runs couldn’t be loaded" serif 28 + "Retrying every minute." 22 `--ink-3`, no button, no stale rows.

## ResultsTable
Props: `results[]`, `visibility`, `pruned?`, `loading?`. Owns the status filter, layer filter, sort, count line and pagination.
- Markup: a real `<table>`. Failed and error rows: the toggle is a `<button aria-expanded>` in the test-name cell, stretched over the whole row (::after, inset 0), so the row stays a 44px target; the detail is a following row with one full-width cell. Every other row: a link to the test’s history stretched over the row the same way (hover and focus bg `--raised`). Nothing visible differs from the drawing. Narrow layout keeps the same markup and lays cells out with CSS grid (explicit table roles kept).
- Header labels are typed in sentence case ("Status") and uppercased with CSS.
- Filters: status radio group (All · Passed · Failed · Error · Skipped, with counts), buttons 44px, `--radius-tag` inside a 3px-padded `--surface` group; Failed and Error labels in `--fail` while their count is above 0, otherwise as the other tabs. Layer native `<select>` 44px. No search (spec §13 filters by status and layer only).
- Sort: failed and error first, then by suite, then name. Header note "Failures first, then by suite".
- Wide layout (container ≥ 720): grid `36px 130px minmax(0,1fr) 110px 130px 80px` (chevron, status, test, layer, platform, time), padding 12×16, header row mono 12. Status icon 15, platform text 13.
- Narrow layout (< 720, e.g. 390): no header; each row stacks — line 1 chevron + status + time right; line 2 test name + suite; line 3 "{layer} · {platforms}" 13 `--ink-3`. Same data, no horizontal scroll.
- Row states: passed, failed (row bg `--fail-tint`, expandable, open by default), error (same as failed with Error badge), skipped, flaky (Flaky pill after the name), platform mismatch (platform list shows failing platforms first: "ios-sim ✕" `--fail`, then "jvm ✓" / "jvm –" `--ink-3`).
- Platform mismatch: whenever a test’s statuses differ across platforms in one run (including failed on one, skipped on another). Line: "Platform mismatch" 600 `--fail` + sentence `--ink-3`, same in wide and narrow: "Failed on {a}, passed on {b} in the same run." Groups in order failed (error reads "errored on"), passed, skipped; platforms inside a group in data order, joined ", ". Example: "Failed on ios-sim, skipped on jvm in the same run."
- Expanded (public): mismatch line if any, message mono 13.5/600, stack trace `<pre>` inset, horizontal scroll inside the pre; link "Test history" (44px). Padding `4px 16px 18px 64px` wide; `4px 16px 16px 16px` narrow.
- Expanded (private): mismatch line still shown (statuses only), then the private-details notice: lock, "Details hidden: private repository", "This repository is private, so failure messages and stack traces are hidden. Test names and counts are real.", then the "Test history" link after the notice (not inside it).
- Footer: "Showing {n} of {m}", m = rows matching the current filters (the total when no filter is set) + secondary Button "Load 50 more" (44px).
- Empty filter: replaces the table box: a standalone card (`--surface`, 1px `--line`, radius 16, padding 28×20) "No tests match" serif 20 + "Nothing in this run matches the current filters." 14 + secondary Button "Clear filters". Loading: header + 6 skeleton rows, `aria-label="Loading results"`.
- Pruned: replaces the table: clock icon, serif 22 "Per-test results retained for 180 days", body (no max width) "This run is older than that, so its individual results were removed to keep the database small. Summary totals are permanent: {total} tests, {passed} passed, {failed} failed."

## StatusTimeline
Props: `kind: 'results' | 'runs'`, `testName` (results), `runs: {title, branch, sha, when, href, results?: {platform, status, duration?}[], status?}[]` oldest → latest (results kind: one entry per platform in `results`; runs kind: run `status`), `interactive` (results default true; runs always false). Strips are derived: one per platform when the test ran on more than one, otherwise one strip with no label column.
- Label column: 76px + 12px gap (end labels indented 88px), mono 13 `--ink-2`.
- Cell heights (bottom-aligned, 48px strip, gap 3, radius 2): passed 14 `--pass`; failed 44 `--fail` with ✕ in `--on-ink`; error 44 `--fail` with ! in `--on-ink`; flaky 24 `--attn`; skipped 14, 1.5px `--ink-3` outline, no fill; not run 4 `--line-strong`. For `kind: 'runs'`: passed / failed / empty (24 `--attn-tint`, 1.5px dashed `--attn`).
- Sizing: cells `flex: 0 1 16px`, min 6px; latest on the right; fewer runs than fit → cells stay 16px, right-aligned, oldest label "{n} runs ago". Capacity = floor((width + 3) / 9); cap 40. More runs than fit → show the latest that fit (≈40 at desktop, ≈27 at 390) and label "Last {n} runs". One cell shown: no oldest label, only "Latest". End labels 12.5 `--ink-3`, 8 below.
- Before measurement (and without JS): up to 40 cells render right-aligned, the oldest clipped by overflow, and the oldest label is empty until measured. No separate pre-measure state.
- Spacing: strips gap 14; legend margin-top 14, padding-top 12, hairline, gap 8×18; card padding 22×24.
- Legend: always, 13 `--ink-3`: each cell type present with its word; swatch 10 wide, height = min(cell height, 20) (Failed, Error, Flaky and Empty all 20).
- Interaction (results kind): selection is a run, shared by every strip. Each strip is one Tab stop: `role="listbox"` `aria-orientation="horizontal"` with `aria-activedescendant` on the selected cell (`role="option"`, `aria-selected`); focus stays on the strip. Keys: ← → one run, Home / End oldest / latest, ↑ ↓ move focus to the other strip (same run). Pointer and touch: the whole 48px strip is the target; press, mouse hover, or drag across it selects the cell nearest the pointer’s x (`touch-action: pan-y` so vertical scrolling still works). Default selection: the latest run (Test History opens on the latest failing run when there is one).
- Selected: the run’s cell in every strip gets a 2px `--ink` outline, offset 2. Strip focus-visible: 2px `--ink` outline, offset 4, radius 4 around the strip.
- Panel (always shown for the results kind, below the legend): `--inset`, 1px `--line`, `--radius-md`, padding 14×16, margin-top 14, flex-wrap, gap 12×28, 14px, `aria-live="polite"`. Fields (label 12.5 `--ink-3` above value): "Run" = "{title} · {sha7}" (title per RunFeedRow); "When" = relative time; then per platform: label = platform key (two or more platforms) or "Result" (one platform), value = status icon 14 + word 600 in status ink + " · {duration}" `--ink-3` (duration omitted for skipped and not run); "Open run →" link 44px, right.
  - one platform: Run · When · Result "Passed · 0.41 s" · Open run →
  - two platforms: Run · When · jvm "Passed · 0.41 s" · ios-sim "Failed · 0.63 s" · Open run →
- Accessible names: results strip "{testName} on {platform}, last {n} runs" (one strip: "{testName}, last {n} runs"); cell "{Status word}, {when}, {title}, {sha7}", e.g. "Failed, yesterday, Pull request from fix-today-count, a41f9c2". Runs kind: one `role="img"` for the strip, name "Last {n} runs on {default branch}: {p} passed, {f} failed, {e} empty." (zero counts omitted); cells have no names.
- Project page "Last 40 runs" is this component with `kind: 'runs'` (run status per default-branch run).
- Flaky meaning (spec §11): a test with both a passing and a failing result on the same commit and platform within 30 days.

## TrendChart
Built with Recharts; the Design System page draws it with `tp-charts.js`, which lays out in real pixels at the measured width (fixed text sizes), as Recharts does.
Props: `kind: 'line' | 'bar'`, `series: {name, values, dashed?}[]`, `labels[]`, `floor?`, `marks?: {index, status: 'fail' | 'empty'}[]`, `format: 'pct' | 'int' | 'sec' | 'dur'`, `zero?`, `unit: 'run' | 'day'`, `loading?`.
- Height 250 (200 below 560 wide). Margins L 56 R 60 T 22 B 30 (phone L 44 R 44).
- Text: axis 12 `--ink-3`; first/last value labels 13/600 `--ink`. Fixed at every width.
- Line: primary stroke 2.5 `--ink`; second series 2 `--ink-3` dashed 6 4 with a legend above. Endpoint dots r 4.5 at first and last points. Hollow intermediate dots (r 3) only when ≤ 12 points and width ≥ 560. End label = value.
- Marks: 8px square at non-pass runs (`--fail` failed, `--attn` empty), 2px `--surface` stroke.
- Bar (runs per UTC day): width 62% of slot, min 2, radius 2, `--layer-2`; hovered bar `--ink`. Starts at zero.
- Y axis: bars and counts-that-must-read-as-amounts start at 0; lines are fitted to data ∪ floor with 12% padding, snapped to nice steps (2–3 steps), percentages clamped to 0–100. The CoverageBar (a bar) always runs 0–100.
- X axis: one point per run (pass rate, test count, coverage per module, duration), one bar per UTC day (runs per day). Desktop labels at 0, ⅓, ⅔, last; phone first and last only.
- Floor: dashed 1.5 `--attn` line + "floor {n}%" 12/600.
- Tooltip on hover and keyboard focus (chart is focusable; ← → move; Esc closes): vertical `--line-strong` rule, hollow dot, panel `--raised` 180 wide: label, each series value, "Run failed"/"Run empty" if marked.
- "Show table" secondary Button (44px) under every chart with ≥ 2 points; table has sticky header, newest first, max-height 320 with scroll.
- one point: dashed frame, value, dot, "One run so far. The trend appears after the next run." — no axes. Same everywhere.
- empty: dashed frame, "No runs yet". loading: `--raised` block.
- Phone: same chart, fewer x labels, no intermediate dots, 2-step y ticks.
Caption templates (figcaption; generated from data; omitted when fewer than 2 points — the in-chart one-point text covers it):
- Pass rate: "{latest}% on the latest run. {n_failed} of the last {n} runs failed." / all passed: "All {n} runs passed."
- Test count: "Grew from {first} to {last} over the last {n} runs." / "Fell from…" / "Held at {last} for the last {n} runs."
- Coverage: "{Rose|Fell} from {first}% to {last}% over {n} runs; {above|below} its {floor}% floor."
- Duration: "Between {min} and {max} over the last {n} runs." + " Median {med}."
- Runs per day: "{total} runs in the last {days} days, {max} on the busiest day."
Scope line under each chart title: pass rate, test count, coverage — "Default branch · CI and imported history"; duration — "Default branch · CI runs only (imported history has no durations)"; runs per day — "Default branch · CI and imported history".

## ErrorState
Two variants of one component. Props: `variant: 'page' | 'inline'`, `title`, `message`, `onRetry`.
- page: StatusBadge pill `error`, headline serif clamp(34–48), body serif 19 `--ink-2`, actions 20 below (gap 12): primary Button "Try again" (padding 0 16) + link 44px tall, padding 0 8. Used for whole-page failures (landing, project, run).
- inline: inside a section or card: error icon 18 `--fail`, title serif 20, body 14 `--ink-2`, secondary Button "Try again". Used by RunFeed, charts, tables.

## Notice
Page-level banner. Props: `tone: 'attn' | 'fail' | 'neutral'`, `icon: 'clock' | 'x-circle' | 'lock'`, `title?` (optional on every tone), `body`. Padding 14×16, `--radius-md`, bg tone tint, 1px tone border (neutral: `--line-strong`), gap 12, icon 18 in the tone ink (neutral: `--ink-2`).
- Title 14.5/600 in the tone ink. Body 14/1.5 `--ink-2` (2 below a title).
- Uses: stale project (project page) attn + clock + title; failed-run summary (run page) fail + x-circle + title; private repository note neutral + lock, no title.
- ARIA: a Notice rendered with the page has no live-region role. One inserted after load (a project going stale while the page is open) gets `role="status"`.
- Not used inside ProjectCard.

## NotFound (page)
Props: `kind: 'project' | 'run' | 'test'`, `path` (the requested path), `project?` (run and test kinds). Served with HTTP 404; document title "Not found · testpulse". Drawn on the Design System page at 1280 and 390 for each kind; theme follows the site theme.
- SiteHeader and SiteFooter as every page. Breadcrumbs only for run and test: "Overview / {project} / Not found".
- Main: max-width 640, padding 40 0 80. Eyebrow "404 · Not found" mono 12/600 uppercase `--ink-3`. Headline serif clamp(34–48)/1.1, 14 below. Path chip 16 below: mono 13.5 `--ink-2` on `--inset`, 1px `--line`, `--radius-tag`, padding 6×10, wraps anywhere. Body serif 19/1.5 `--ink-2`, 16 below. Actions 20 below, gap 12: primary Button (as a link) + link 44px, padding 0 8.
- project: "No project at this address" / "The link may be mistyped, or the project may have been renamed. These are the projects testpulse reports on." Then a project list (`--surface` card, 1px `--line`, `--radius-md`, padding 6, max 440; items as ProjectSwitcher links: name 15/600 + inline StatusBadge of the latest run) and primary "Go to overview".
- run: "This run isn’t in {project}" / "Run summaries are kept permanently, so this run was never recorded for this project. The ID may be mistyped, or the run may belong to another project." Primary "{project} runs", link "Overview".
- test: "This test isn’t in {project}" / "Test history follows each test’s key, so a renamed or moved test starts a new history under its new name. Nothing has reported under this key." Primary "Latest {project} results" (the latest run page), link "Overview".
- Unknown project in a run or test URL → the project kind. No Error badge, no retry (nothing failed).

`--raised` blocks in the shape of the content, `tpShimmer` 1.6 s opacity (off under reduced motion), `aria-busy="true"` and a hidden `aria-label` ("Loading runs", "Loading results", …) on the container. The container’s frame (border, radius) does not shimmer.

## SampleTag
Mono 10px, `--attn` border, `--radius-xs`. Design-only; not built.
