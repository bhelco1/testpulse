# Components (v3, canonical)

`pages/Design System.dc.html` is the canonical drawing of everything here; this file lists the same props, states and variants. Every state below is drawn there. Token names refer to `tokens.css`. Where a literal size appears (px), it is stated once here and on the Design System page.

Shared rules
- Targets: every interactive element ≥ 44×44 px, including breadcrumbs, tabs, table toggles and "Show table". Exempt: links inside running prose (WCAG 2.5.8 inline exception) — none of the listed controls are inline.
- Status is always icon + word. Status icons are 24-unit stroke SVGs, round caps.
- Layer tones are fixed per spec §8 layer (see LayerBar), same in every project and chart.
- Theme change: `background-color, border-color, color, fill, stroke` transition over `--motion-base` (200 ms, ease), only while `<html data-theme-switching>` is set (for 200 ms after the toggle), so hover and other transitions are unaffected. Nothing else animates on theme change. Reduced motion: no transition (the rule sits inside `@media (prefers-reduced-motion: no-preference)`).
- Awkward states drawn wherever they apply: loading, empty, private, failed, one item.

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
- inline: 14px/600, gap 6, icon 15, no fill. Used in rows and tables.
- "running" is removed: runs are only reported when finished (spec non-goal: no streaming).

## PrivateTag
Lock icon 12 + "Private repository". 13px/500 `--ink-2` on `--neutral-tint`, padding 5×10, pill. Kiosk variant: lock 30 `--ink-3` + "Private" 24px `--ink-3`, no fill.

## HealthMarker
Props: `health: 'healthy' | 'stale' | 'empty' | 'below_floor' | 'not_reporting'`, `days?`. 14px/600 (13.5 inside card footers is not used; 14 everywhere), icon 13, stroke 2.8.
- healthy: check, `--pass`, "Reporting healthy"
- stale: clock, `--attn`, "No report in {days} days"
- empty: empty icon, `--attn`, "Last run empty"
- below_floor: arrow-down, `--attn`, "Coverage below floor"
- not_reporting: dashed circle, `--neutral`, "Not reporting yet"

## Button
Props: `variant: 'primary' | 'secondary' | 'ghost' | 'danger'`, `busy?`, `disabled?`. Height 44, padding 0 16, `--radius-sm`, 15px/600.
| variant | default | hover | pressed |
|---|---|---|---|
| primary | bg `--ink`, text `--on-ink` | bg `--ink-2` | bg `--ink-3` |
| secondary | bg `--surface`, 1px `--line-strong`, text `--ink` | bg `--raised` | bg `--raised`, border `--ink-3` |
| ghost | no bg or border, text `--ink` | bg `--raised` | bg `--raised` |
| danger | no bg, 1px `--fail`, text `--fail` | bg `--fail-tint` | bg `--fail-tint`, border 2px |
- focus: 2px `--ink` outline, offset 2.
- disabled: bg `--raised`, text `--ink-3`, no border, `aria-disabled`.
- busy: keeps its variant colours, label changes (e.g. "Saving…"), 14px ring before the label (1.5px `--ink-3`, quarter arc `currentColor`, rotating 0.9 s; static under reduced motion), `aria-busy="true"`, not clickable. Replaces the old standalone "Saving" pill.
- "Rotate API key" is Button `danger`.

## SiteHeader, SiteFooter, Breadcrumbs, LiveIndicator
- SiteHeader: wordmark, ProjectSwitcher, "How it's tested", LiveIndicator, theme toggle (44×44).
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
- Variant `kiosk`: one horizontal row, label 24 `--ink-3` left, value 52 serif right, padding 20×26, `--radius-lg`. Attention: label text replaced by the attention text in `--attn` 600 with a 22px icon; value stays `--ink`.

## ProjectCard
Props: `project {name, tagline, visibility}`, `latestRun | null`, `layers: {label, count, tone}[]`, `coverage: {module, pct, floor}[]`, `reports: {key, total}[]`, `declared: DeclaredSuite[]`, `health`, `failing?: {suite, name, platform}[]`, `loading?`, `variant: 'web' | 'kiosk'`.
Web variant (canonical, one layout for every state):
- Surface, 1px `--line`, `--radius-xl`, padding `24px var(--pad-card-x) 0`.
- Row 1: StatusBadge pill + meta "{relative} · {branch} · {sha7}". SHA is a link to the run page on public projects; plain mono text on private projects (no run URL exists). Branch is `runs.branch`.
- Name `--text-title` + PrivateTag when private. Tagline 15.5px `--ink-2`.
- Total `--text-count` + sub-line "tests · {failed} failed · {skipped} skipped · {duration}". When failed > 0, "{n} failed" is `--fail` 600; the total stays `--ink`.
- Failed: inset block `--fail-tint`, `--radius-md`, padding 12×14: first failing test "Suite › name" mono 13 `--ink`, platform 13 `--ink-3`, "+{n} more" when more than one; links to the run page. Shown on private projects too (spec §9: test names are public); the failure message is never on the card.
- LayerBar, then CoverageBar rows (grid `128px minmax(40px,1fr) auto`, gap 14), then the per-report block (inset, mono 13: header "{n} reports in this run" + platform split; body `repeat(auto-fill, minmax(200px,1fr))` key/count pairs).
- Footer: hairline, left "Not counted: {declared summary}" 13.5 `--ink-3`; right HealthMarker. No declared suites: left side is empty and the marker stays right-aligned.
States:
- passed · failed · private · private + failed (same as failed, SHA unlinked) · empty (total "0" `--attn`, sub "tests executed · {n} reports received", no LayerBar, note in `--attn-tint`: "Every report in this run arrived with no test results. An empty run is treated as a problem, not a pass, and isn't counted in any total.", report counts in `--attn`, HealthMarker empty) · stale (meta time in `--attn`, HealthMarker stale; no banner in the card) · below floor (CoverageBar below state, HealthMarker below_floor) · no coverage rows ("No coverage reported" 14 `--ink-3` in place of the rows) · not reporting yet (StatusBadge not_reporting, no meta, no total; body "Registered. Results appear here after its CI posts the first report." 15 `--ink-2`; no layers, coverage or reports; HealthMarker not_reporting) · loading (skeleton with the card's inner shape).
Kiosk variant: no tagline, no per-report block, no failing-test link (shows the name only). Border 3px: `--line` normally, `--fail` when failed, `--attn` when stale or empty. Name 64, total 104, sub 26, LayerBar 14px tall with 24px labels, coverage legend row "Line coverage | floor" 22px, coverage rows `220px minmax(40px,1fr) 100px` 24px, HealthMarker 24px, PrivateTag kiosk variant.

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
component and visual share `--layer-2`; integration and e2e share `--layer-3`. In §8 order no two sharing layers are adjacent. `--layer-3` and `--layer-4` are close (1.3–1.45:1), so the 3px gap is mandatory.

## Pyramid
Props: `layers: {label, count, tone}[]`, `declared: DeclaredSuite[]`, `total`, `loading?`.
- Header: total `--text-count` + "tests executed in the latest run" 15 `--ink-2`; right: note 13.5 `--ink-3` (e.g. which platform is counted).
- Rows in spec §8 order, top to bottom: e2e, visual, api, integration, component, unit (only layers present). Widths do not have to narrow upward; order follows §8, not size.
- Row grid `110px minmax(0,1fr) 120px`, gap 16, 14px. Label right-aligned `--ink-2`. Bar centred, height 30, radius 4 (`--radius-xs`), width = count ÷ largest count, min 6px, tone per LayerBar. Count 14/600 + "{pct}%" 13 `--ink-3` of the executed total.
- Declared suites: a text row, no bar: label `--ink-3`, middle "{count} {unit} declared · not counted" 13 `--ink-3`, count column empty. Units never mix with bars.
- States: single layer (one bar at full width), no layers ("No tests executed yet." 15 `--ink-2` in place of rows), loading (4 `--raised` rows), phone (grid `80px minmax(0,1fr) 88px`, same bar height).

## DeclaredSuiteNote
Props: `suites: {name, layer, count, status: 'authored_not_executed' | 'runs_in_ci_not_reported', note?}[]` from `projects.declared_suites`.
- Surface, `--radius-lg`. Header padding 16×20: title serif 20 + "These tests exist but don't report here yet. They aren't counted in any total." 13.5 `--ink-3`. No border under the header; each row has a top hairline (so there is one line between header and first row).
- Row: flex-wrap, gap 6×12, padding 14×20, 14px: name 600 (`flex 1 1 220px`), layer 110 `--ink-3`, count 90 "{count} {unit}", status (`flex 0 1 260px`) StatusBadge-like inline in `--neutral`: authored_not_executed "Authored, not yet executed" (dotted ring, dash 1 3.2); runs_in_ci_not_reported "Runs in CI, not yet reported" (dashed ring, dash 3.5 3).
- unit: "flows" when layer is e2e, otherwise "tests".
- At phone width the row wraps: name on its own line, then layer · count · status.

## StackTagGroup
Props: `variant: 'built' | 'tested'`, `groups: {category, items: {name, declaredStatus?: 'authored_not_executed' | 'runs_in_ci_not_reported'}[]}[]`.
- Grid `96px minmax(0,1fr)`, gap 12×16, 13.5px. Category `--ink-3`.
- Tag: padding 4×10, `--radius-tag` (6). built: bg `--inset`, 1px `--line`. tested: no bg, 1px `--line-strong`.
- declaredStatus (from `declared_suites`, matched by tool name): dashed border, `--ink-2`, text "{name} · not yet executed" / "{name} · not yet reported".

## CoverageBar
Props: `module` (stored module key, verbatim), `pct`, `floor`. Row grid `128px minmax(40px,1fr) auto`, gap 14, 14px.
- Module key mono 13 `--ink-2`.
- Track 6px `--raised`, pill; fill `--ink` to pct; floor marker 2×14 `--attn` at floor%, top −4. Scale always 0–100 (a bar's length encodes value, so it starts at zero).
- Above / at floor: "{pct}%" 600 `--ink` + " floor {floor}%" `--ink-3`.
- Below floor: fill stays `--ink`; 13px arrow-down icon `--attn` + "{pct}%" 600 `--attn` + " below floor {floor}%" `--attn`.
- Lines only (spec §11). The branch-coverage rows on the project page are removed.

## RunFeedRow
Props: `run`, `showProject` (default true), `isNew?`.
- Link row, flex-wrap, gap 6×16, padding 14×16, min-height 44, `--radius-md`. Hover and focus: bg `--raised`.
- Status: inline StatusBadge, fixed width 104.
- Content (`flex 1 1 220px`, min-width 0): title 15/500 ellipsis; meta 13 `--ink-3` "{project} · {branch} · {sha7}" (project omitted when `showProject` is false). Pull request runs: branch slot reads "PR #{n}".
- Title from `runs.event`: "Push to {branch}", "Pull request #{n}", "Scheduled run" (commit messages are not stored). Private: lock + "Private repository" in place of the title.
- Count (nowrap): passed "{total} tests" `--ink` + " · {duration}" `--ink-3`; failed "{n} failed" `--fail` 600 + " · {passed} of {total}" `--ink-3`; empty "0 tests" `--attn` 600 + " · {n} reports" `--ink-3`. Same on every page.
- Time: 13 `--ink-3`, real relative time, `margin-left: auto`.
- New: "New" chip before the title (11px/600 sans, pill, bg `--ink`, text `--on-ink`, padding 2×7); row bg `--raised` fading to transparent over `--motion-arrive`. A new failed row is the same with the failed status and count; no fail tint. Only new rows get a background.
- Phone (feed narrower than ~480): content wraps to two lines — line 1 status + title/meta, line 2 count left and time right.
Variant `kiosk`: tile per run, status 24, project 24/600, branch 24 `--ink-3`, count right, time 22.

## RunFeed
Props: `runs[]`, `connected`, `state: 'ready' | 'loading' | 'empty' | 'error'`, `variant: 'web' | 'kiosk'`, `filter?` (project page only).
- Header: h2 serif 24/500 "Recent runs" (project page: "Runs"), right: LiveIndicator + "Updates as reports arrive". Disconnected: "Offline. Showing runs as of {HH:MM}; reconnecting" in `--ink-2`, LiveIndicator off. Kiosk variant: 32px serif heading.
- `role="log" aria-live="polite"`. Without JS: server-rendered list.
- Landing: default-branch runs only (spec §18 Q4), 3 rows, no "All runs" link.
- Project page run list: segmented filter (radio group, 44px) "Default branch" (default) | "All branches"; 10 rows, then secondary Button "Load 20 more".
- loading: 3 skeleton rows (104×14, two text bars, count bar). empty: "No runs yet" serif 20 + "Runs appear here as each project's CI reports." 14 `--ink-2`. error: ErrorState `inline`.

## ResultsTable
Props: `results[]`, `visibility`, `pruned?`, `loading?`. Owns the status filter, layer filter, sort, count line and pagination.
- Filters: status radio group (All · Passed · Failed · Error · Skipped, with counts), buttons 44px, `--radius-tag` inside a 3px-padded `--surface` group; layer native `<select>` 44px. No search (spec §13 filters by status and layer only).
- Sort: failed and error first, then by suite, then name. Header note "Failures first, then by suite".
- Wide layout (container ≥ 720): grid `36px 130px minmax(0,1fr) 110px 130px 80px` (chevron, status, test, layer, platform, time), padding 12×16, header row mono 12.
- Narrow layout (< 720, e.g. 390): no header; each row stacks — line 1 chevron + status + time right; line 2 test name + suite; line 3 "{layer} · {platforms}" 13 `--ink-3`. Same data, no horizontal scroll.
- Row states: passed, failed (row bg `--fail-tint`, expandable, open by default), error (same as failed with Error badge), skipped, flaky (Flaky pill after the name), platform mismatch (platform list shows "ios-sim ✕" `--fail`, "jvm ✓" `--ink-3`).
- Expanded (public): mismatch line if any, message mono 13.5/600, stack trace `<pre>` inset, horizontal scroll inside the pre; link "Test history" (44px). Padding `4px 16px 18px 64px` wide; `4px 16px 16px 16px` narrow.
- Expanded (private): mismatch line still shown (statuses only), then the private-details notice: lock, "Details hidden: private repository", "This repository is private, so failure messages and stack traces are hidden. Test names and counts are real.", "Test history" link.
- Footer: "Showing {n} of {total}" + secondary Button "Load 50 more" (44px).
- Empty filter: "No tests match" + "Clear filters" (secondary). Loading: header + 6 skeleton rows.
- Pruned: replaces the table: clock icon, serif 22 "Per-test results retained for 180 days", body "This run is older than that, so its individual results were removed to keep the database small. Summary totals are permanent: {total} tests, {passed} passed, {failed} failed."

## StatusTimeline
Props: `cells: {status, label, sha, when, branch}[]` per strip, `strips: {platform?, cells}[]`, `interactive` (default true), `kind: 'results' | 'runs'`.
- One strip per platform when the test ran on more than one platform (label column 88px, mono 13 `--ink-2`); otherwise one strip, no label column.
- Cell heights (bottom-aligned, 48px strip, gap 3, radius 2): passed 14 `--pass`; failed 44 `--fail` with ✕ in `--on-ink`; error 44 `--fail` with ! in `--on-ink`; flaky 24 `--attn`; skipped 14, 1.5px `--ink-3` outline, no fill; not run 4 `--line-strong`. For `kind: 'runs'`: passed / failed / empty (24 `--attn`, dashed outline).
- Sizing: cells `flex: 0 1 16px`, min 6px; latest on the right; fewer runs than fit → cells stay 16px, right-aligned, first-cell label reads "{n} runs ago". Capacity = floor((width + 3) / 9); cap 40. More runs than fit → show the latest that fit (≈40 at desktop, ≈27 at 390) and label "Last {n} runs".
- Legend: always, 13 `--ink-3`: each cell type present with its word.
- Selection (interactive): hover, focus or click selects a cell (2px `--ink` outline, offset 2). Details show in an inline panel below the strip (`--inset`, `--radius-md`): run "{branch} · {sha}", when, each platform's status + duration, "Open run →" (44px). No floating tooltip.
- Project page "Last 40 runs" is this component with `kind: 'runs'`, `interactive: false` (run status per default-branch run).
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
- page: StatusBadge pill `error`, headline serif clamp(34–48), body serif 19 `--ink-2`, primary Button "Try again" + ghost link. Used for whole-page failures (landing, project, run).
- inline: inside a section or card: error icon 18 `--fail`, title serif 20, body 14 `--ink-2`, secondary Button "Try again". Used by RunFeed, charts, tables.

## Notice
Page-level banner. Props: `tone: 'attn' | 'fail' | 'neutral'`, `title`, `body`. Padding 14×16, `--radius-md`, bg tone tint, 1px tone border (neutral: `--line-strong`). Used for stale project (project page), private repository note, failed-run summary (run page). Not used inside ProjectCard.

## Skeleton
`--raised` blocks in the shape of the content, `tpShimmer` 1.6 s opacity (off under reduced motion), `aria-busy="true"` on the container.

## SampleTag
Mono 10px, `--attn` border, `--radius-xs`. Design-only; not built.
