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
One marker per project. When several apply, precedence is stale, then empty, then below_floor (not_reporting only when there is no run). The detail text is the chosen marker's own ("Expected every {n} days" for stale) and does not list the others: an empty run already shows as the amber "0" total and a below-floor module as its amber CoverageBar row, so nothing is lost.
Props: `health: 'healthy' | 'stale' | 'empty' | 'below_floor' | 'not_reporting'`, `days?`, `size: 'web' | 'kiosk'` (default web). web: 14px/600, icon 13, stroke 2.8. kiosk: 24px/600, icon 24, stroke 2.8, gap 10.
- healthy: check, `--pass`, "Reporting healthy"
- stale: clock, `--attn`, "No report in {days} days" ("1 day" at 1)
- empty: empty icon, `--attn`, "Last run empty"
- below_floor: arrow-down, `--attn`, "Coverage below floor"
- not_reporting: dashed circle, `--neutral`, "Not reporting yet"
- Page detail (project page) is not part of the marker: the page puts a separate 14px `--ink-3` span after it, gap 8: "Last report {relative}" when healthy, "Expected every {n} days" when stale.

## Button
Props: `variant: 'primary' | 'secondary' | 'ghost' | 'danger'`, `busy?`, `disabled?`, `href?`. With `href` it renders as `<a href>` (for actions that navigate, e.g. NotFound "Go to overview") with identical styling and states; only the element changes. Height 44, padding 0 16, `--radius-sm`, 15px/600, cursor pointer.
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
- Breadcrumbs: 14.5px `--ink-3`, current page `--ink`, links underlined, 44px tall flex items, gap 8, separator "/". Footer: the current page’s link (e.g. "Privacy" on /privacy) is `--ink` and underlined.
- Header below 560 px: row 1 wordmark + tools (Live where the page is live, then the theme toggle), row 2 the nav. "Live" only on pages that subscribe (Landing, Project page); Run, Test history, How it’s tested, Privacy and NotFound have just the toggle. The page mocks place the tools absolutely at the top right; a zero-height spacer of the tools’ width ends the nav, so on one row the nav stops short of the tools, and once the nav wraps under the wordmark the spacer drops to its own line and row 2 gets the full width.
- Landing lede: one step smaller on phone (clamp(20px, 2.2vw, 24px) gives 20 at 390).
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
- Landing set beside the hero total (portfolio-wide numbers only; time to green and green streak are per project and never combined across projects): Pass rate (sub "Latest runs · N skipped, excluded"), Projects reporting, Runs in last 30 days (sub per project), Projects passing. Grid `repeat(auto-fit, minmax(min(100%, 200px), 1fr))`, gap 12: 4 across at 1440 and 1024, 2 + 2 at ~600, 1 per row at 390.
- `fail?` (sub-line variant): like attention but 13/600 `--fail` with a 12px x-circle. Used only by Projects passing while a project is red.
- Projects reporting: value "{r} of {n}", n = registered projects (including ones that have never reported), r = those whose latest report is within their expected cadence. Sub: all reporting "All within their expected cadence"; one silent "{Project} silent {d} days"; several "Silent: {A} {d} days · {B} {d} days" (longest first); never reported "{Project} not reporting yet" (listed after the silent ones). Attention styling whenever r < n.
- Pass rate: value = passed ÷ (passed + failed, errors included) over the latest default-branch runs with tests, rounded down. Sub "Latest runs · {s} skipped, excluded"; with a failure "{passed} of {passed + failed} · {s} skipped, excluded" (confirmed: skipped are not in the "of" figure, so 1,183 of 1,185 with 1 skipped); when some latest runs are empty, the lead changes to "{counted projects} only" ("RouteServe only · 0 skipped, excluded"), also when another project is failing. No rate (no latest run passed or failed anything): value "—", sub "No tests passed or failed on the latest runs".
- Projects passing, several latest runs empty and none red: plain sub, each "{project} last run empty" joined " · ". Drawn: all passed, one red, several red, one empty, several empty, no runs yet.
- Kiosk Projects passing: latest run empty, none red: label "{project} last run empty" (plain `--ink-3`; several: "{k} last runs empty"), value "{p} of {n}". Several red: label "{k} projects red", `--fail` 600, 22px x-circle. No runs yet: label "No runs yet", value "0". No sub-line on any kiosk tile.
- Projects passing: label "Projects passing"; value "{p} of {n}" (n = projects with at least one default-branch run; p = those whose latest default-branch run passed).
  - all passed: sub "Latest default-branch runs" (plain).
  - one red: `fail` sub "{project} red for {duration}" → "Ostomate2 red for 4m".
  - several red: `fail` sub "Red: {project} {duration} · {project} {duration}", longest red first → "Red: RouteServe 2d 3h · Ostomate2 4m".
  - not passed but not red (latest run empty): plain sub "{project} last run empty"; if a project is also red, the `fail` sub wins and lists only red projects.
  - no project has a run yet: value "0", sub "No runs yet".
  - duration: calendar time since the first failed default-branch run of the current red episode (nights, weekends, parked work count): under 1 h "{m}m"; under 24 h "{h}h {m}m" (minutes two digits); 24 h and over "{d}d {h}h". Every unit rounds down (59m 59s → "59m", 226m 4s → "3h 46m", 47h 59m → "1d 23h"); under 1 minute reads "0m". Same rule for RecoveryStats.
  - loading: as every StatTile.
- Variant `kiosk`: stacked, in the kiosk hero band: label 24 `--ink-3` above, value 48 serif below, gap 6, padding 16×24, min width 240, `--radius-lg`. Three sit in a row beside the total. No sub-line, ever (the kiosk has 18 px spare in its tallest card); anything a web sub-line says goes into the label. Loading: label bar 45%×22, value bar 120×48. Attention: label text replaced by the attention text in `--attn` 600 with a 22px icon (stroke 2.6; same glyph as HealthMarker: clock for stale, dashed ring + dash for empty, arrow-down for below_floor); value stays `--ink`. Kiosk set: Pass rate, Projects reporting, Projects passing. Projects passing while red: label replaced by "{project} red for {duration}" (several: "{k} projects red") in `--fail` 600 with a 22px x-circle; value "{p} of {n}" stays `--ink`. Loading: label bar 45%×22 and value bar 120×48, `--raised`, shimmer.

## ProjectCard
Props: `project {name, tagline, visibility, href}`, `latestRun: {status, when, branch, sha, href, total, failed, skipped, duration} | null`, `layers: {label, count, tone}[]`, `coverage: {module, pct, floor}[]`, `reports: {key, total}[]`, `declared: DeclaredSuite[]`, `health: {health, days}`, `failing?: {suite, name, platform}[]`, `loading?`, `variant: 'web' | 'kiosk'`, `headingLevel` (default 3; the page sets it).
Web variant (canonical, one layout for every state):
- Surface, 1px `--line`, `--radius-xl`, padding `24px var(--pad-card-x) 0`.
- Row 1: StatusBadge pill + meta "{relative} · {branch} · {sha7}". SHA is a link to the run page on public projects (inline-flex, min-height 44, so row 1 is 44 tall); plain mono text on private projects (no run URL exists). Branch is `runs.branch`.
- Name `--text-title` as a link to `project.href` (inline-flex, min-height 44) + PrivateTag when private. Tagline 15.5px `--ink-2`.
- Total `--text-count` + sub-line "tests · {failed} failed · {skipped} skipped · {duration}" ("test" at 1). When failed > 0, "{n} failed" is `--fail` 600; the total stays `--ink`.
- Failed: inset block `--fail-tint`, `--radius-md`, padding 12×14, min-height 44: first failing test "{short suite} › {name}" mono 13 `--ink` (full name in `title`), platform 13 `--ink-3`, "+{n} more" when more than one; links to the run page (testpulse’s own page, so also on private projects; spec §9: test names are public). The failure message is never on the card.
- Short suite: a bare file name (no "/", ending in a source extension: .ts .tsx .js .jsx .mjs .cjs .kt .kts .swift .py .rb .go, including .spec.ts / .test.ts) is kept whole ("zz-deliberate-failure.spec.ts"); path-style suites keep the last path segment ("apps/backend/src/routes/jobs.test.ts" → "jobs.test.ts"); dotted class names keep the last segment ("com.ostomate.app.ui.home.HomeViewModelTest" → "HomeViewModelTest"). The block wraps; it never truncates.
- LayerBar, then CoverageBar rows sorted by module key (code-point order, e.g. composeApp before shared; the database doesn't keep YAML order) (grid `128px minmax(40px,1fr) auto`, gap 14), then the per-report block (inset, mono 13: header "{n} reports in this run" + platform split; body `repeat(auto-fill, minmax(200px,1fr))` key/count pairs).
- Platform split: platform = last segment of the report key "job/module/platform"; totals summed per platform, in first-seen order, always with counts: "jvm 149 · android-emulator 8 · ios-sim 142" (Ostomate2: six reports, 160 distinct tests), "node 1,045", "node 284 · chromium 38". Empty run: counts are 0.
- Stale card: the meta line shows the date of the latest run ("12 Sep"), not a relative time, beside the "No report in {d} days" marker.
- No time to green or green streak on the card: they are per-project history and live on the project page (RecoveryStats). A red project is already the failed card state.
- Footer: hairline, left "Not counted: {declared summary}" 13.5 `--ink-3`; right HealthMarker. No declared suites: left side is empty and the marker stays right-aligned.
- Declared summary (a declared suite always has count ≥ 1: `projects:sync` rejects a YAML entry with count < 1; defensively, a missing count drops the brackets: "Not counted: {name}, {phrase}"; phrases: runs_in_ci_not_reported "run in CI, not yet reported"; authored_not_executed "authored, not yet executed"; unit "flows" for e2e, else "tests"; counts per unit joined with " and "):
  - one suite: "Not counted: {name} ({count} {unit}), {phrase}" → "Not counted: Maestro E2E (iOS) (13 flows), authored, not yet executed" (RouteServe)
  - several, one status: "Not counted: {sum} {unit} in {k} suites, {phrase}" → "Not counted: 20 flows in 2 suites, authored, not yet executed" (illustrative)
  - several, mixed: one clause per status (run in CI first), joined "; " → "Not counted: 7 flows run in CI, not yet reported; 5 flows authored, not yet executed"
States:
- passed · failed · private · private + failed (same as failed, SHA unlinked) · empty (total "0" `--attn`, sub "tests executed · {n} reports received", no LayerBar, no coverage rows and no "No coverage reported", note in `--attn-tint`: "Every report in this run arrived with no test results. An empty run is treated as a problem, not a pass, and isn’t counted in any total.", report counts in `--attn`, HealthMarker empty) · stale (meta time in `--attn`, HealthMarker stale; no banner in the card) · below floor (CoverageBar below state, HealthMarker below_floor) · no coverage rows ("No coverage reported" 14 `--ink-3` in place of the rows) · not reporting yet (StatusBadge not_reporting, no meta, no total; body "Registered. Results appear here after its CI posts the first report." 15 `--ink-2`; no layers, coverage or reports; HealthMarker not_reporting) · loading (the card frame stays still; one `--raised` skeleton block per part inside it shimmers, as StatTile does; `aria-label="Loading project"`).
Kiosk variant (all states drawn, plus testpulse): width from the kiosk grid, three cards across 1,792 px with gap 28, so 578 px each (512 inside). Border 3px: `--fail` failed, `--attn` stale or empty, `--line` otherwise (including not reporting). `--radius-kiosk` (24), padding 26×30 0.
- Row 1: StatusBadge kiosk + meta "{relative} · {sha7}" 24 (SHA mono 22). Stale: the whole meta line is `--attn`.
- Name 52, 18 below row 1 (heading, `headingLevel`; Kiosk page passes 2) + PrivateTag kiosk variant in the heading, gap 8×18, wraps under the name if it doesn’t fit, 400 24px sans `--ink-3`.
- Total 88, 18 below the name, + "tests" 26 `--ink-2`; next line (8 below, wraps) the rest of the sub-line 26.
- Failed: block `--fail-tint`, `--radius-kiosk-inset` (14), padding 16×20: name "{short suite} › {name}" mono 22, one line, ellipsis; platform key 22 `--ink-2` ("ios-sim") + "+{n} more". No link.
- LayerBar kiosk (see LayerBar), 22 below; labels wrap to two lines with four layers. Hidden when failed or empty. Failed block 18 below the sub-line.
- Empty: total "0" `--attn`, "tests executed", "{n} reports received", the web empty note at 22px/1.45 in `--attn-tint` (radius 14, padding 16×20, icon 24); no layers, no coverage.
- Not reporting: StatusBadge kiosk not_reporting, no meta, body "Registered. Results appear here after its CI posts the first report." 26 `--ink-2`; nothing else but the footer.
- Coverage: 20 below, gap 10: legend row "Line coverage | floor" 22 `--ink-3`, then CoverageBar kiosk rows. No coverage rows: the whole block and its legend are omitted.
- Footer: hairline, padding 14 0 16, HealthMarker kiosk, right-aligned. Counts use thousands separators ("Unit 1,528"). No tagline, no per-report block, no declared summary.

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
component and visual share `--layer-2`; integration and e2e share `--layer-3`, and they can sit side by side (testpulse: Integration then E2E). The tone only groups; the labels carry the meaning, and the mandatory 3px gap separates any two segments. `--layer-3` and `--layer-4` are close (1.3–1.45:1), so the 3px gap is mandatory.

## Pyramid
Props: `layers: {label, count, tone}[]`, `declared: DeclaredSuite[]`, `total`, `note?`, `loading?`.
- Header: total `--text-count` + "tests executed in the latest run" 15 `--ink-2`; right: `note` 13.5 `--ink-3` (e.g. which platform is counted), omitted when absent.
- Rows in spec §8 order, top to bottom: e2e, visual, api, integration, component, unit (only layers present). Widths do not have to narrow upward; order follows §8, not size.
- Row grid `110px minmax(0,1fr) 120px`, gap 16, 14px. Label right-aligned `--ink-2`. Bar centred, height 30, radius 4 (`--radius-xs`), width = count ÷ largest count, min 6px, tone per LayerBar. Count 14/600 + "{pct}%" 13 `--ink-3` of the executed total, rounded to the nearest whole percent; a share under 1% reads "<1%".
- Declared suites: summed per layer into one text row per layer (RouteServe e2e: "13 flows"), all declared rows above all bars, in §8 order: label `--ink-3`, middle "{count} {unit} declared · not counted" 13 `--ink-3`, count column empty. Units never mix with bars.
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
- declaredStatus (from `declared_suites`): dashed border, `--ink-2`, text "{name} · not yet executed" / "{name} · not yet reported".
- Match rule: first drop a trailing version from the item's name (a final space-separated token that starts with a digit or "v" + digit, e.g. "Maestro 2.6.1" → "Maestro", "Jest 30" → "Jest"); the tag still shows the full name with its version. Then trim and case-fold both sides: the item matches a declared suite when the suite's `name` equals it or starts with it followed by a space ("Maestro" matches "Maestro E2E (iOS)"; "Jest" does not match "jest-expo"; no other partial matches). Several suites matching one item: "not yet reported" if any is `runs_in_ci_not_reported`, else "not yet executed". Tool with no matching suite: normal solid tag. Declared suite with no matching tag: listed in Declared suites and the pyramid footer as usual, no tag added.

## Landing hero
- The lede "Live test results for every project I build." is the page’s `h1` (same styling as before). The total and the note are one `<p>`: the big figure then the note, which starts lower-case, so a screen reader reads "3,802 automated tests across three projects. …" (Ostomate2 160 + RouteServe 1,044 + testpulse 2,598) with no separate label.
- Note, sentence 1: "automated tests across {n} projects." n = projects whose latest default-branch run has tests (words one–nine, digits from 10; "one project"). Total = distinct tests in those runs.
- Sentence 2 (the first that applies): failing on one project "{f} failing on {Project}’s latest run, {s} skipped."; on several "{f} failing across {k} projects’ latest runs, {s} skipped." (f = distinct failed or errored tests); otherwise "{rate}% passing on the latest runs, {s} skipped." (rate rounded down). Omitted when n = 0.
- Then, in order, one sentence each when they apply: empty "{Project}’s latest run had no tests, so it isn’t counted." (several: "Latest runs of {A} and {B} had no tests, so they aren’t counted."); stale "{Project} hasn’t reported since {date}." (several: "{A} and {B} haven’t reported recently."; a stale project’s last run still counts); never reported "{Project} hasn’t reported yet." (not in n).
- One counted project: "automated tests on one project." and sentence 2 uses "its latest run" ("100% passing on its latest run, 0 skipped."). All skipped (no pass or fail): "None passed or failed on its latest run, {s} skipped." (several: "on the latest runs"). k is spelled out to nine ("two projects’ latest runs"). Several never reported: "{names} haven’t reported yet." No default-branch run yet anywhere: total "0", note "automated tests so far.". The stale date is the project’s last report on any branch.
- No projects registered: the "No projects yet" card replaces the hero, tiles, Projects, feed and the About section; the Projects menu opens to a single non-link line "No projects yet" (14 `--ink-3`, 44 tall).
- Every latest run empty (projects exist, none counted): the total reads "0" and the note is "automated tests on the latest runs. The latest runs of {A}, {B} and {C} had no tests, so nothing is counted." (one project: "…{A}’s latest run had no tests, so nothing is counted."). No pass-rate sentence.
- Name lists: names alone always join with "and": 1 "A"; 2 "A and B"; 3+ "A, B and C". " · " is used only when each name carries its own figure ("Red: RouteServe 2d 3h · Ostomate2 4m", "Silent: A 12 days · B 9 days", "{project} last run empty" items). Lists of plain names never use " · " (serial list with no Oxford comma, in module-key/latest-first order as each rule says). Long lists aren't truncated; the site has few projects.
- "disabled" is dropped: nothing stores disabled tests.
- No projects registered: hero, tiles, Projects and feed are replaced by one card, h2 "No projects yet" serif 24, "Projects appear here once they’re registered and send their first report." 15 `--ink-2`, link "How testpulse is tested"; the h1 stays. Drawn (Landing scenario "no projects").
- Loading: none. The page is rendered on the server with its data, so there is no skeleton page (the Landing "loading" scenario is removed; skeletons remain only for client-side parts: feed reconnect and "Load more"). Error: the server returns the ErrorState page (HTTP 200: a Next.js 16 render can’t set 503) when the database doesn’t answer, copy "Results couldn’t be loaded" + "The database isn’t answering, so nothing is shown rather than numbers that might be out of date. Try again in a minute."; "Try again" is a link to the same URL, so it works without JavaScript.
- Recent runs feed: always 3 rows; a new run pushes the oldest out.
- Header below 560 px: two rows, drawn on the Design System (section 04, PHONE HEADER): wordmark left + Live and theme toggle right, then the nav full width.

## RecoveryStats (project page)
Two cells in the project page's latest-run stat row (after "Pass rate, 30 days"), from spec §11, default branch only, per project, never combined across projects. Cell: label 13 `--ink-3`, value serif 30/1.15 (4 below), sub 13 `--ink-3` (2 below).
- Layout: the stat row is flex-wrap, gap 16×12; Pass rate and Green streak `flex: 1 1 120px`, Time to green `flex: 1 1 240px`, all min-width 0. Three across when the card content is ≥ 504px (120 + 120 + 240 + 2 × 12); narrower (phone 390) Pass rate | Green streak on one line and Time to green full width below. Drawn on the Design System (section 05, PHONE · 390).
- Green streak: value current consecutive passed default-branch runs + unit 18 `--ink-3` ("run" at 1); sub "Longest {n} runs". While red the value is "0". A failed pull-request run doesn't count (not default branch).
- Time to green (calendar time from a default-branch run that turned failed after a passed run to the next passed run; 90 days): value median; sub "Median of {k}, 90 days · worst {w}". Durations as Projects passing ("2h 14m", "9h 02m", "3d 4h").
- Red now (latest default-branch run failed): add a line 13/600 `--fail`, 12px x-circle, "Red now for {duration}", 4 below the sub. The open episode is not in the median or worst until it recovers.
- No recoveries in 90 days: value "None", sub "No recoveries in 90 days" (never "0"). Red with no recovery yet: same, plus the Red now line.
- Drawn on the Design System (section 05): green · red now · no recoveries · red now with no recoveries.

## Run duration
One format for every run duration (ProjectCard, RunFeedRow, Run page header and reports table, How it’s tested results card, kiosk): whole seconds, rounded down. Under 60 s "{s} s" ("27 s"); under 60 min "{m}m {ss}s" ("1m 48s", "11m 34s"; seconds two digits); 60 min and over "{h}h {mm}m" ("1h 05m"). Never "6 min" or "694 s". Helper `TPKit.runDur(ms)`. Run duration = the sum of the run’s reports’ durations (spec §5), so the Run page header always equals the reports table’s sum. Run duration chart (project page): y-axis ticks stay in whole seconds ("660 s"); tooltip, table and end label use this format; the caption too ("Between 10m 58s and 12m 22s…"). Drawn: Design System section 02. Test durations keep their own format (TrendChart `sec`: "0.41 s", "4 ms").

## Relative time
Every "when" (run rows, card meta, timeline panel, "Last report received", New pill) is computed on the server in UTC; the viewer's time zone is never used, so pages work without JavaScript. "Days" are UTC calendar days. Checked in this order, first match wins (t = event time, now = render time):
1. now − t < 1 min → "just now"
2. now − t < 60 min → "{m} min ago" (whole minutes, rounded down)
3. now − t < 24 h → "{h} h ago" (whole hours, rounded down), even across UTC midnight: 2 h ago across midnight reads "2 h ago"
4. From here on, 24 h or more have passed; count UTC calendar days between t and now (D). D = 1 → "yesterday"
5. D = 2–6 → "{D} days ago" (25 h ago across one midnight is D = 1, "yesterday"; 30 h ago across two midnights is D = 2, "2 days ago")
6. D = 7–27 → "1 week ago" / "{w} weeks ago" (w = floor(D / 7))
7. D ≥ 28 → the date: "12 Aug" in the current UTC year, "12 Aug 2025" otherwise. This is the only date format, everywhere (stale notices, stale cards, chart labels, "Pruned on", "since"). No leading zero, no comma, English month abbreviations.
- Lower case always ("just now", never "Just now"), even at the start of a line.
- Every relative or short date sits in `<time datetime="{ISO 8601}">` with `title` "22 Sep 2026, 04:37 UTC" (day, month, year, comma, 24-hour HH:MM, "UTC").
- Absolute clock times also say UTC: run header "Started 24 Sep, 14:02 UTC"; feed offline note "Showing runs as of 10:42 UTC". The kiosk clock and its "As of {HH:MM}" are unchanged.
- Durations (health marker "No report in 13 days", "silent 12 days", red and recovery durations) are elapsed time in 24-hour periods, not calendar days, and may differ from a relative time; they never sit side by side because a stale card shows the date of its last run (see ProjectCard).

## CoverageBar
Props: `module` (stored module key, verbatim), `pct`, `floor`. Row grid `128px minmax(40px,1fr) auto`, gap 14, 14px.
- Module key mono 13 `--ink-2`, one line: nowrap + ellipsis, full key in `title`.
- Track 6px `--raised`, pill; fill `--ink` to pct; floor marker 2×14 `--attn` at floor%, top −4. Scale always 0–100 (a bar’s length encodes value, so it starts at zero).
- Above / at floor: "{pct}%" 600 `--ink` + " floor {floor}%" `--ink-3`.
- Below floor: fill stays `--ink`; 13px arrow-down icon `--attn` + "{pct}%" 600 `--attn` + " below floor {floor}%" `--attn`.
- Lines only (spec §11). The branch-coverage rows on the project page are removed.
- Variant `kiosk`: grid `200px minmax(40px,1fr) 110px`, gap 16 (fits the 512 px card; "packages/shared" fits 200 at mono 22); key mono 22 (nowrap, ellipsis); track 10; floor marker 3×22, top −6; value 24/600 right-aligned. Below floor: 22px arrow-down + value in `--attn` (the legend row explains the marker; HealthMarker says "Coverage below floor").
- No floor (module missing from `coverage_floors`): no marker, value "{pct}%" 600 `--ink` with no floor text, never amber. Project page chart for that module: no floor line, caption without the floor clause ("Rose from 88.2% to 92.0% over 10 runs."). Drawn (iosApp · SAMPLE).
- Rounding: every percentage (coverage, pass rate, chart values and captions) rounds down to one decimal: 99.96 → "99.9%", 79.96 → "79.9%" (drawn beside its 80% floor: below). "100%" only when exactly 100. Floor comparison uses the unrounded value.

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
- Pruned (per-test results removed after 180 days): the count reads "Results pruned · {duration}" in `--ink-3`; failed "Failed" `--fail` 600 + " · Results pruned · {duration}"; empty runs keep "0 tests · {n} reports". Drawn (section 09). Project page run list only: a project’s 5 most recent runs are never pruned (spec 5.12), so the landing feed never shows one.

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
Variant `kiosk`: 32px serif heading "Recent runs" + note 22 `--ink-3` ("Updates as reports arrive"; offline: 14px ring + "Offline. As of {HH:MM}" `--ink-2`). Tiles as RunFeedRow kiosk; every status can appear (passed, failed, empty, private). loading: 3 skeleton tiles; empty: one tile "No runs yet" serif 28 + "Runs appear here as each project’s CI reports." 22 `--ink-3`; error: one tile with the error icon 24 `--fail` + "Runs couldn’t be loaded" serif 28 + "Retrying every minute." 22 `--ink-3`, no button, no stale rows, `role="status"`. Empty and error tiles span all three run columns of the kiosk grid (`grid-column: 2 / -1`). The heading shows in every state; the note shows the connection (live or offline) in every state, independent of the feed state.

## ResultsTable
Props: `results[]`, `visibility`, `pruned?`, `loading?`. Owns the status filter, layer filter, sort, count line and pagination.
- Markup: a real `<table>`. Failed and error rows: the toggle is a `<button aria-expanded>` in the test-name cell, stretched over the whole row (::after, inset 0), so the row stays a 44px target; the detail is a following row with one full-width cell. Every other row: a link to the test’s history stretched over the row the same way (hover and focus bg `--raised`). Nothing visible differs from the drawing. Narrow layout keeps the same markup and lays cells out with CSS grid (explicit table roles kept).
- Header labels are typed in sentence case ("Status") and uppercased with CSS.
- Filters: status radio group (All · Passed · Failed · Error · Skipped, with counts), buttons 44px, `--radius-tag` inside a 3px-padded `--surface` group; Failed and Error labels in `--fail` while their count is above 0, otherwise as the other tabs. Layer native `<select>` 44px. No search (spec §13 filters by status and layer only).
- One row per test. Row status = the worst of its platforms: failed if any platform failed, else error if any errored, else passed if any passed (flaky included), else skipped. The status filter counts tests (rows), so Passed + Failed + Error + Skipped = All; each test appears under exactly one group, its row status.
- Time column: per platform, sum the durations of that platform’s results (retries included); then show the slowest platform’s sum ("—" when no platform has one). Per-platform times appear in the expanded failure heads and on Test history.
- Platform list: one line per platform, "{platform}" + glyph: ✓ passed, ✕ failed (`--fail` 600), "! Error" errored (`--fail` 600, glyph and word), – skipped; single-platform tests show the platform only.
- Sort: failed and error first, then by suite, then name. Header note "Failures first, then by suite".
- Wide layout (container ≥ 720): grid `36px 130px minmax(0,1fr) 110px 130px 80px` (chevron, status, test, layer, platform, time), padding 12×16, header row mono 12. Status icon 15, platform text 13.
- Narrow layout (< 720, e.g. 390): no header; each row stacks — line 1 chevron + status + time right; line 2 test name + suite; line 3 "{layer} · {platforms}" 13 `--ink-3`. Same data, no horizontal scroll.
- Row states: passed, failed (row bg `--fail-tint`, expandable, open by default), error (same as failed with Error badge), skipped, flaky (Flaky pill after the name), platform mismatch (platform list shows failing platforms first: "ios-sim ✕" `--fail`, then "jvm ✓" / "jvm –" `--ink-3`).
- Platform mismatch: whenever a test’s statuses differ across platforms in one run (any two different statuses). Line: "Platform mismatch" 600 `--fail` + sentence `--ink-3`, same in wide and narrow: "Failed on {a}, passed on {b} in the same run." Groups in order failed, errored, passed, skipped (verbs "failed on", "errored on", "passed on", "skipped on"; first letter capitalised); platforms inside a group in data order, joined ", ". Examples: "Failed on ios-sim, skipped on jvm in the same run." · "Failed on ios-sim, errored on jvm in the same run." · "Passed on jvm, skipped on ios-sim in the same run." The line appears in the expanded detail, so only failed and error rows show it; a passed/skipped mismatch shows in the platform list only.
- Several failures (failed or errored on more than one platform): one block per such platform, in platform data order, gap 14. Each block starts with a head 13/600 `--fail`: 14px status icon + "{platform} · {Failed|Error} · {time}", then its message and stack trace as below. With one failure the head is omitted. Private project: the heads are still shown (platform, status and time aren’t failure text), then the private-details notice once below the last head. `ResultRow.failures: {platform, status, duration, message, detail}[]` replaces `failure`.
- Expanded (public): mismatch line if any, message mono 13.5/600, stack trace `<pre>` inset, horizontal scroll inside the pre; link "Test history" (44px). Padding `4px 16px 18px 64px` wide; `4px 16px 16px 16px` narrow.
- Expanded (private): mismatch line still shown (statuses only), then the private-details notice: lock, "Details hidden: private repository", "This repository is private, so failure messages and stack traces are hidden. Test names and counts are real.", then the "Test history" link after the notice (not inside it).
- Footer: "Showing {n} of {m}", m = rows matching the current filters (the total when no filter is set) + secondary Button "Load 50 more" (44px).
- Empty filter: replaces the table box: a standalone card (`--surface`, 1px `--line`, radius 16, padding 28×20) "No tests match" serif 20 + "Nothing in this run matches the current filters." 14 + secondary Button "Clear filters". Loading: header + 6 skeleton rows, `aria-label="Loading results"`.
- Pruned: replaces the table: clock icon, serif 22 "Per-test results retained for 180 days", body (no max width) "This run is older than that, so its individual results were removed to keep the database small. Summary totals are permanent: {total} tests, {passed} passed, {failed} failed."

## StatusTimeline
Props: `kind: 'results' | 'runs'`, `testName` (results), `runs: {title, branch, sha, when, href, results?: {platform, status, duration?}[], status?}[]` oldest → latest (results kind: one entry per platform in `results`; runs kind: run `status`), `initialRun?` (results kind: index of the run selected on load; default the latest). No `interactive` prop: results strips are always interactive, the runs strip never is. Strips are derived: one per platform when the test ran on more than one, otherwise one strip with no label column.
- Label column: 76px + 12px gap (end labels indented 88px), mono 13 `--ink-2`.
- Cell heights (bottom-aligned, 48px strip, gap 3, radius 2): passed 14 `--pass`; failed 44 `--fail` with ✕ in `--on-ink`; error 44 `--fail` with ! in `--on-ink`; flaky 24 `--attn`; skipped 14, 1.5px `--ink-3` outline, no fill; not run 4 `--line-strong`. For `kind: 'runs'`: passed / failed / empty (24 `--attn-tint`, 1.5px dashed `--attn`).
- Sizing: cells `flex: 0 1 16px`, min 6px; latest on the right; fewer runs than fit → cells stay 16px, right-aligned, oldest label "{n−1} runs ago" ("1 run ago" at 2; same counting rule as TrendChart: latest = "Latest", 40 cells → "39 runs ago"). Capacity = floor((width + 3) / 9); cap 40. More runs than fit → show the latest that fit (≈40 at desktop, ≈27 at 390) and label "Last {n} runs". One cell shown: no oldest label, only "Latest". End labels 12.5 `--ink-3`, 8 below.
- Before measurement (and without JS): up to 40 cells render right-aligned, the oldest clipped by overflow, and the oldest label is empty until measured. No separate pre-measure state.
- Spacing: strips gap 14; legend margin-top 14, padding-top 12, hairline, gap 8×18; card padding 22×24.
- Legend: always, 13 `--ink-3`: each cell type present with its word; swatch 10 wide, height = min(cell height, 20) (Failed, Error, Flaky and Empty all 20).
- Interaction (results kind): selection is a run, shared by every strip. Each strip is one Tab stop: `role="listbox"` `aria-orientation="horizontal"` with `aria-activedescendant` on the selected cell (`role="option"`, `aria-selected`); focus stays on the strip. Keys: ← → one run, Home / End oldest / latest, ↑ ↓ move focus to the other strip (same run). Pointer and touch: the whole 48px strip is the target; press, mouse hover, or drag across it selects the cell nearest the pointer’s x (`touch-action: pan-y` so vertical scrolling still works). Default selection: `initialRun`, else the latest run. Test History passes the latest failing run when there is one, else the latest run. "Failing" = a run where this test's result is failed or error on any platform; flaky, skipped and not run don't count.
- Selected: the run’s cell in every strip gets a 2px `--ink` outline, offset 2. Strip focus-visible: 2px `--ink` outline, offset 4, radius 4 around the strip.
- Panel (always shown for the results kind, below the legend): `--inset`, 1px `--line`, `--radius-md`, padding 14×16, margin-top 14, flex-wrap, gap 12×28, 14px, `aria-live="polite"`. Fields (label 12.5 `--ink-3` above value): "Run" = "{title} · {sha7}" (title per RunFeedRow); "When" = relative time; then per platform: label = platform key (two or more platforms) or "Result" (one platform), value = status icon 14 + word 600 in status ink + " · {duration}" `--ink-3` (duration omitted for skipped and not run); "Open run →" link 44px, right.
  - one platform: Run · When · Result "Passed · 0.41 s" · Open run →
  - two platforms: Run · When · jvm "Passed · 0.41 s" · ios-sim "Failed · 0.63 s" · Open run →
- Accessible names: results strip "{testName} on {platform}, last {n} runs" (one strip: "{testName}, last {n} runs"); cell "{Status word}, {when}, {title}, {sha7}", e.g. "Failed, yesterday, Pull request from fix-today-count, a41f9c2". Runs kind: one `role="img"` for the strip, name "Last {n} runs on {default branch}: {p} passed, {f} failed, {e} empty." (zero counts omitted; {default branch} = `projects.default_branch`, the branch the strip shows); cells have no names.
- Project page "Last 40 runs" is this component with `kind: 'runs'` (run status per default-branch run; CI runs only, imported history excluded, same as the run list). Prop `defaultBranch` (runs kind, required): the project's `projects.default_branch`; the accessible name uses it, never the branch of the runs passed in.
- Runs strip note (right of the title, 13 `--ink-3`): "All {n} passed." or "{p} passed, {f} failed, {e} empty." (zero counts omitted); one run: "1 run, passed." / "1 run, failed." / "1 run, empty.". Counts cover every run in the strip’s window, counted on the server, whatever fits on screen; drawn "No CI runs yet" state in section 11. No CI runs yet: the strip becomes a dashed frame, height 48, "No CI runs yet" 14 `--ink-3`, and the note is hidden.
- Flaky list rate: n > 0 "Failed {n} of last {m} runs"; n = 0 (its flips fall outside those runs or within one run’s retries) "Flipped on {c} commits in 30 days" ("1 commit"), c = commits with a flip (a pass and a fail on one commit and platform, in default-branch CI runs of the last 30 days, including inside one run). The row stays: it is flaky by that definition.
- Flaky list rate "Failed {n} of last {m} runs": m = the last 40 default-branch CI runs in which the test has a result (m < 40 when there are fewer; "1 run" at 1); n = runs drawn Failed: final result failed or error on any platform, and not part of a flip. A flip (spec §11) is a pass and a fail on one commit and platform, in default-branch CI runs of the last 30 days, including inside one run; either side of a flip is Flaky, never Failed. A pass and a fail on a pull-request branch, or older than 30 days, isn’t a flip, so its failing side counts as Failed.
- Flaky meaning (spec §11): a test with both a passing and a failing result on the same commit and platform within 30 days.

## TrendChart
Built with Recharts; the Design System page draws it with `tp-charts.js`, which lays out in real pixels at the measured width (fixed text sizes), as Recharts does.
Props: `kind: 'line' | 'bar'`, `series: {name, values, dashed?}[]`, `labels[]`, `floor?`, `marks?: {index, status: 'fail' | 'empty'}[]`, `format: 'pct' | 'int' | 'sec' | 'dur'`, `zero?`, `unit: 'run' | 'day'`, `loading?`, `error?`, `onRetry?`, `whens?: string[]` (ISO finish time per point), `hrefs?: (string | null)[]` (run page per point; null for imported history), `nowYear?` (current UTC year, from the server).
- Card (every page, including Test History): `--surface`, 1px `--line`, `--radius-xl`, padding 22×24, `--shadow-card`; title serif 20; scope line 13 `--ink-3` 2 below; caption (figcaption) 14/1.5 `--ink-2` 6 below the scope; chart 14 below.
- Height 250 (200 below 560 wide). Margins L 56, T 22, B 30 (phone L 44). Right margin fits the end labels: max(60, 8 + widest end-value label + 6), phone max(44, …); label width measured at 13/600 (Recharts: measure the formatted last values before render and set `margin.right`). Bar kind is exempt (no end labels): right margin stays 60, phone 44.
- Text: axis 12 `--ink-3`; first/last value labels 13/600 `--ink`. Fixed at every width.
- Line: primary stroke 2.5 `--ink`; second series 2 `--ink-3` dashed 6 4 with a legend above. Endpoint dots r 4.5 at first and last points. Hollow intermediate dots (r 3) only when ≤ 12 points and width ≥ 560. End label = value.
- Marks: 8px square at non-pass runs (`--fail` failed, `--attn` empty), 2px `--surface` stroke.
- Bar (runs per UTC day): width 62% of slot, min 2, radius 2, `--layer-2`; hovered bar `--ink`. Starts at zero.
- Y axis: bars and counts-that-must-read-as-amounts start at 0; lines are fitted to data ∪ floor with 12% padding, snapped to nice steps (2–3 steps), percentages clamped to 0–100. The CoverageBar (a bar) always runs 0–100.
- X axis: one point per run (pass rate, test count, coverage per module, duration), one bar per UTC day (runs per day). Desktop labels at 0, ⅓, ⅔, last; phone first and last only. Duplicate positions are dropped (2–3 points never repeat a label).
- Per-series `gapLabels?: (string | null)[]` names a missing value in tooltip and table; default "Not run". Test history passes "Skipped" where the platform’s result was skipped and leaves "Not run" where it has no result.
- The start label and dot of series 0 are drawn only when its first value exists (same rule as the end label), so a line never labels a point it doesn’t draw.
- Marks: failed `--fail` square "Run failed"; empty `--attn` square "Run empty"; flaky `--attn` diamond (the square turned 45°) "Flaky run" in tooltip and accessible name.
- `sec` format: 10 ms and above "0.41 s"; under 10 ms whole milliseconds "4 ms". Durations are stored in whole ms, so 0 ms (anything under 1 ms) reads "<1 ms", in the chart and every caption alike; axis ticks at 0 read "0 ms" / "0 s". When every value is under 10 ms the axis switches to whole-ms steps ("0 ms, 2 ms, 4 ms").
- Left margin: max(56, ceil(8 + widest y tick label at 12 px)), phone max(44, …), mirroring the right margin ("92.5%" never clips at 390).
- `sec` axis: the step is a whole number of hundredths, never below 0.01 s, so tick labels never repeat.
- Label collisions: the start value label sits 18 below its point; if that would hit the x axis or the floor label it goes 10 above; if both positions collide it is dropped (the caption states the first value). Start, end and floor labels carry a 3 px `--surface` halo (paint-order stroke), so a line passing under a label never cuts its digits.
- Small durations, everywhere (charts, captions, tiles, run panel, tables): under 10 ms in whole ms ("1 ms", "4 ms"; 0 → "<1 ms"); 10 ms and above "0.41 s".
- Coverage charts: x labels count runs back ("29 runs ago … Latest") like every per-run chart (dates are in the table’s When column); no floor → no floor line and the caption ends after the movement; failed and empty runs carry marks; "The latest run had no tests." only when the latest run was empty.
- Without JavaScript: title, scope and caption, then the data table open in place of the plot (inside `<noscript>`); no empty plot and no "Show table" button (the button is rendered by the client only).
- Project page coverage: one chart per module, in module-key order, each "Line coverage, {module}" with its own floor.
- Captions with gaps: n counts only runs with a value; first/last are the first and last runs with a value. If the latest run has none, append "The latest run had no tests." / pass rate, latest run all skipped (tests but no pass or fail): "The latest run’s tests were all skipped."
- Table (Show table): columns Run · When · one per series. Run: the x-axis label ("Latest", "3 runs ago", or the date label), left, nowrap, auto width. When (label "When", left, auto width, `--ink-2`): the run’s finish time "22 Sep, 04:37 UTC" ("12 Dec 2025, 04:37 UTC" in another UTC year) in `<time datetime>` with the standard title; date and time are two nowrap pieces, so on a narrow table it wraps between them ("22 Sep," / "04:37 UTC") and never inside. Values: right, 600, nowrap. Rows 44 high; header sticky. The frame is 320 max-height and scrolls vertically. Below 560 px wide the table is compact: 13 px text, cell padding 0 6 (header 10 6), When always on two lines ("22 Sep," / "04:37 UTC"), so Run (~84) + When (~76) + two series (~50 each) ≈ 264 px fit the ~273 px a 390 screen leaves inside a chart card after the frame’s vertical scrollbar. With three or more series, or wider values, it scrolls horizontally. Bars (runs per day) have no When column (the Day column is the date).
- Row links: only the Run cell is the link (a table row can’t be one link without JavaScript, and screen readers read the cell as the link name): `<a href="/p/{slug}/runs/{id}">` filling the cell, min-height 44, padding 0 14, `--ink` 500, no underline until hover. Hover on a linked row: row background `--raised` and underline on the Run text. Focus: 2px `--ink` ring inset (offset −2, radius 6) so the scroll frame doesn’t clip it. Imported-history rows: plain text in `--ink-2`, no hover. Private projects link the same way. Drawn (section 12, desktop and 390).
- Without JavaScript the same table (When and links included) is server-rendered open in place of the plot.
- Marks: at most one per run. Priority failed/error (square `--fail`) over flaky (diamond `--attn`) over empty (square `--attn`). With several series the mark sits on the series of the platform that produced it (the first such in data order); if that series has no value there, on the first series that has one; with no value on any series, no mark (the tooltip and table still say "Not run"). Prop: `marks[].series?` (index, default 0).
- Missing values (`null`, e.g. a platform that didn't run): the line breaks at the gap (no interpolation); a lone point between gaps draws as a 3px filled dot; no end label for a series whose latest value is missing. Tooltip and table show "Not run" in `--ink-3` 400 for that series. Excluded from the y domain and from caption min/max/median. Recharts: `connectNulls={false}`. Drawn ("LINE · gaps where ios-sim didn’t run").
- Counting rule (axis, tooltip, table alike): the latest point is "Latest"; point i of n is "{n−1−i} runs ago" ("1 run ago" at 1; "days" for bars, "1 day ago"). The oldest of 30 points is "29 runs ago". Date labels, when given, replace it.
- Y steps: `int` and `dur` step by whole numbers only (1, 2, 5, 10 × 10ⁿ, never below 1). All-zero data on a from-zero chart (bars, `zero`): domain 0…1, never −1…1.
- Floor: dashed 1.5 `--attn` line + "floor {n}%" 12/600.
- Tooltip on hover and keyboard focus (chart is focusable; ← → move; Esc closes): vertical `--line-strong` rule, hollow dot, panel `--raised` 180 wide: label, each series value, "Run failed"/"Run empty" if marked.
- "Show table" secondary Button (44px) under every chart with ≥ 2 points; table has sticky header, newest first, max-height 320 with scroll.
- one point: dashed frame, value, dot, "One run so far. The trend appears after the next run." — no axes. Same everywhere.
- empty: dashed frame, "No runs yet". loading: `--raised` block.
- error: the plot area (same height) becomes an inset panel inside the chart card, not a card of its own: `--inset`, 1px `--line`, `--radius-md`, centred: error icon 18 `--fail` (6 below), "Chart couldn’t be loaded" serif 20, "The rest of the page is still current." 14 `--ink-2` (4 below the title), secondary Button "Try again" 12 below the message; `role="alert"`. Title and scope line stay; caption and "Show table" are hidden.
- Phone: same chart, fewer x labels, no intermediate dots, 2-step y ticks.
Caption templates (figcaption; generated from data; omitted when fewer than 2 points — the in-chart one-point text covers it):
- Pass rate: "{latest}% on the latest run. {n_failed} of the last {n} runs failed." / all passed: "All {n} runs passed."
- Test count: "Grew from {first} to {last} over the last {n} runs." / "Fell from…" / "Held at {last} for the last {n} runs."
- Coverage: "{Rose|Fell} from {first}% to {last}% over {n} runs; {above|below} its {floor}% floor." / last = first: "Held at {last}% over {n} runs; {above|below} its {floor}% floor." (compared at one decimal, as displayed)
- Duration: "Between {min} and {max} over the last {n} runs." + " Median {med}." / min = max at display precision: "Held at {v} over the last {n} runs." (median only with one series; with several, min and max are across all series). Test History uses this template.
- Runs per day: "{total} runs in the last {days} days, {max} on the busiest day." / total 0: "No runs in the last {days} days."
Scope line under each chart title, with the window: project page per-run charts cover the last 30 default-branch runs (fewer when there are fewer; the caption states n). Pass rate, coverage — "Default branch · last 30 runs · CI and imported history"; test count — "Default branch · last 30 CI runs"; duration — "Default branch · last 30 CI runs (imported history has no durations)". Test history duration: "Default branch · CI runs only (imported history has no durations)"; runs per day: "Default branch · CI and imported history" (unchanged). Test count is CI only because imported history is JVM-only; mixing it would jump when iOS results arrive.

## ErrorState
Two variants of one component. Props: `variant: 'page' | 'inline'`, `title`, `message`, `onRetry` (inline only), `retryHref` (page only, default the current URL).
- page: rendered by the server with HTTP 200 (Next.js 16 can’t set 503 from a render). "Try again" is the primary Button in its `href` (link) form pointing at the same URL, so it works without JavaScript; no `onRetry`. Drawn in section 13 and the Landing "error" scenario.
- inline: client-side only (feed, tables); "Try again" is a secondary `<button>` calling `onRetry`.
- page: StatusBadge pill `error`, headline serif clamp(34–48), body serif 19 `--ink-2`, actions 20 below (gap 12): primary Button "Try again" (padding 0 16) + link 44px tall, padding 0 8. Used for whole-page failures (landing, project, run).
- inline: inside a section or card: error icon 18 `--fail`, title serif 20, body 14 `--ink-2`, secondary Button "Try again". Used by RunFeed and tables. Charts use the TrendChart error state (inside the chart card) instead.

## Notice
Page-level banner. Props: `tone: 'attn' | 'fail' | 'neutral'`, `icon: 'clock' | 'x-circle' | 'lock'`, `title?` (optional on every tone), `body`. Padding 14×16, `--radius-md`, bg tone tint, 1px tone border (neutral: `--line-strong`), gap 12, icon 18 in the tone ink (neutral: `--ink-2`).
- Title 14.5/600 in the tone ink (neutral: `--ink-2`). Body 14/1.5 `--ink-2` (2 below a title).
- Uses: stale project (project page) attn + clock + title; failed-run summary (run page) fail + x-circle + title; private repository note neutral + lock + title "Details hidden: private repository" (14.5/600 `--ink-2`, the neutral title colour) + body 13.5/1.5 `--ink-2`, 4 below, two sentences. One drawing everywhere (Design System sections 10, Run Detail).
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

## Skeleton
`--raised` blocks in the shape of the content, `tpShimmer` 1.6 s opacity (off under reduced motion), `aria-busy="true"` and a hidden `aria-label` ("Loading runs", "Loading results", …) on the container. The container’s frame (border, radius) does not shimmer.

## SampleTag
Mono 10px, `--attn` border, `--radius-xs`. Design-only; not built.

## Run page
- Header meta: Branch · Commit · Event · Started "24 Sep, 14:02 UTC" · Reports "{n}" (no "of {m}": nothing records expected reports) · Attempt "{k}" only when `runs.run_attempt` > 1 · CI link (public). The h1 is the same for every attempt; the Attempt item tells them apart. Drawn (Run Detail tweak "Ostomate2 · passed, attempt 2").
- No live updates: the page shows the run as of load, no Live indicator in the header. Later reports appear on reload.
- Failed-run banner: templates drawn on the Design System (section 10). Heads "1 test failed: {short suite} › {name}" / "{f} tests failed" / "{e} tests errored" / "{f} failed, {e} errored"; sub from module, layer, platforms and the mismatch sentence; private sentence; button "Show failure" / "Show failures" (sets the status filter, scrolls to Results, focuses the first failing row).
- Reports table: no note above it and no footer. Bar passed, failed, skipped (`--neutral`); line "{f} failed · {p} passed · {s} skipped" (zero parts omitted). A report with no test cases: Empty status, dashed `--attn` track, "No tests in this report", tests "0", time "—".
- Empty run: Results shows one card, "No test results in this run" + "{n} reports arrived, but none held any test cases." (one sentence).
- Private failure heads: exactly the public head (ResultsTable "Several failures": 13/600 `--fail`, 14px status icon, "{platform} · {Failed|Error} · {time}" with the bare platform key "jvm"), with no message or trace, then the private-details notice once (ResultsTable "Expanded (private)": lock, title, two sentences).
- Report line leaves out zero parts, including "0 passed" ("1 failed · 5 skipped").
- "Failures first, then by suite" (13 `--ink-3`) sits after the status and layer filters, at the end of the filter row.
- Started value may wrap at 390 ("24 Sep," / "14:02 UTC").
- Pruned run rows keep their when slot; only the count slot changes.
- Pruned: body as drawn, then "Pruned on {date}" 13 `--ink-3` (date format from Relative time, "23 Mar 2027"); the SAMPLE tag marks only the illustrative date.

## Test history page
- Header tags: module (mono 13, from the report’s module, e.g. "composeApp") · layer · Flaky pill · mismatch headline · New pill. No prose paragraph under "Status by run", and no "Recent results" section (the strip and its panel already give each run’s per-platform result and time).
- Tiles (over the strip’s runs: the last 40 CI runs with a result for this test; platform keys verbatim, e.g. "jvm", "ios-sim"):
  - Runs: value n; sub "since {date of the oldest}".
  - Failed: value = runs drawn Failed in the strip (final result failed or error on any platform, not part of a flip: a pass and a fail on one commit and platform, in default-branch CI runs of the last 30 days, including inside one run); either side of a flip is Flaky, never Failed; pull-request or older pairs aren’t flips, so their failing side is Failed, so the tile, the flaky list’s "Failed {n} of last {m} runs" and the strip agree; sub "{k} run(s) · {platforms}" or "on any platform" at 0.
  - Flaky: value = commits with a flip (a pass and a fail on one commit and platform, in default-branch CI runs of the last 30 days, including inside one run); sub "commit(s) in 30 days · {platforms}" or "none in 30 days".
  - Median time: value = median of the first platform (data order) over the last 30 default-branch CI runs; sub "{p1} · {p2} {median}" with several platforms, "last 30 CI runs" with one.
- Mismatch headline (`--fail` 600, x-circle): shown when any run in the strip has a platform mismatch (the run page’s rule; a private run is named as runTitle names it, "Private repository"): "Platform mismatch in {k} run(s)" + " · {latest mismatch run title}, {when}" `--ink-3`.
- New pill: from `tests.first_seen_at` (kept through pruning), shown when it is within the last 7 UTC calendar days: "New · first seen {relative time}". Module tag drawn in section 11.
- Header tags row: 14 px, gap 8 × 14 (drawn so in section 11).
- Strip note: 13 `--ink-3`, "Oldest on the left" (the count is left to the label under the strip, which already reads "39 runs ago" or, when fewer fit, "Last {k} runs"); one run "One run so far". At 390 (27 of 40 fit) the note stays true.
- Duration chart: scope "Default branch · last 30 CI runs (imported history has no durations)"; flaky runs marked with the flaky diamond.
- No results (all pruned): the strip, panel and chart are replaced by the Pruned notice ("Per-test results retained for 180 days"). A test only exists once a CI run reported it, so there is no "never ran" state. NotFound for a test in a project with no runs: primary Button "Go to {project}".
- Timeline card: the canonical card, padding 22×24, `--shadow-card`.

## Privacy page
Two versions of one page, switched by phase (Privacy tweak `phase`). "Updated {date}" under the h1 (`<time>`, standard title) changes whenever the copy does.
- Summary-card titles are `h2` (serif 20, as drawn). Live updates sentence: "It only receives new test results; this site sends nothing about you over it." Body 16.5/1.7 `--ink-2`.
- today (now): lede "Nothing. There are no accounts, no cookies and no analytics, and this site keeps no record of who visits." Summary cards "What your browser does here" (loads the pages; one live connection to Supabase Realtime; theme in localStorage, only after the toggle) and "What this site doesn’t do" (cookies, page-view logging, tracked links, analytics or ad scripts). Sections: Live updates (Supabase sees your IP, under Supabase’s policy; no connection without JavaScript), Your theme choice, Hosting (Vercel and Supabase keep their own logs, not described here), If this changes.
- after Phase 6: the lede, the summary cards and three sections (How a visit is recorded, The cookie, If someone sent you a link) switch to the tracking copy, which says the site stores a salted hash and never the address, instead of "no raw IP addresses". Live updates, Your theme choice and Hosting stay; "If this changes" goes. The page ships in the same PR as tracked links.

## How it’s tested page
- Every claim is true as of the date shown (Phases 0–5 done). Strategy table rows (layer · tool · what): Unit · Vitest · 90% line floor; Contract · Vitest · in the unit job, counted as Unit; Component · Vitest, Testing Library · "Each component built from the design, rendered in jsdom: its words, states and links, and its stylesheet against the design’s values."; Integration · Vitest, local Supabase · anon-client RLS; E2E · Playwright · seeded pages and a no-JS pass; Accessibility · axe, Playwright, contrast script · "axe on every public page, counted with E2E. A script in the unit job checks the contrast of the design’s token pairs in both themes."; Visual · Playwright · pinned image; Leak sweep · Playwright. Pyramid note: "The axe, visual and leak-sweep checks run inside the Playwright suite and count as E2E; the Action’s contract tests run in the unit job and count as Unit."
- Build progress reads a phase data file, dated by that file ("As of {file date}"); no footnote: Done (check, `--pass`), In progress (clock, `--ink-2`), Planned (dashed ring, `--ink-3`); header "As of {file date}".
- Default state is reporting (testpulse self-reports since 7 Oct through the shared GitHub Action `bhelco1/testpulse/.github/actions/report@v1`, the same one Ostomate2 and RouteServe use). Lede: "testpulse is built test-first. Its own CI runs every suite on every pull request and reports the results here, alongside everything else." Section 04 intro: "Since 7 Oct, testpulse’s CI posts its results to this site as the project testpulse, through the same shared GitHub Action Ostomate2 and RouteServe use."
- Section 04, in order, each full width, gap 16: results card (status; total = distinct tests; sub-line "tests · {f} failed · {s} skipped · {duration}"; pyramid of distinct tests per layer with separate Unit and Component rows (spec §11), each test in the layer testpulse’s layer rules (`projects/testpulse.yaml`) give it as it’s received, whichever report it came in; note with no literal figures; "Full project page →"); "Coverage against the floor" (canonical chart-card frame 22×24, `--shadow-card`; h3 serif 20; scope "Lines, latest default-branch run"; canonical CoverageBar rows exactly as section 08; then one line per module "{module}: {covered} of {total} lines covered." 13.5 `--ink-3`). testpulse today has one module, `unit`, floor 90: "99.4% floor 90%", "unit: 3,125 of 3,141 lines covered."; then Build progress (its visible label is the card’s one h3).
- Not reporting (tweak, for a reset or outage): "No results received yet." + the Actions link; no figures.
- Strategy table: Unit "…stat calculations, API key hashing. 90% line floor." (design-token checks are the contrast script; tracked-link tokens arrive with Phase 6 and are added then); Contract "The shared GitHub Action every project reports through, run against a local server."; Component tools "Vitest, Testing Library".
- Principle 02: fixtures captured from Ostomate2, RouteServe and testpulse itself (adds Vitest and Playwright output).
- Phase list mirrors `docs/build-progress.json`, numbered phases 0–7 only: 0–5 Done; 6 "Alerts, tracked links, admin" In progress (`in_progress`); 7 "Launch" Planned. "As of {asOf}". Self-reporting is not a phase and has no row.
- As phases land: Phase 6 → the strategy table adds alert rules, bot classification, the prune job, the tracked-link flow, tracked-link tokens and admin sign-in; the incident cards add "A daily check flags it and alerts the owner." and "A sudden drop in a report’s test count raises an alert too." Phase 7 → its row reads Done.
