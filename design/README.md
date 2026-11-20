# testpulse handoff v24

## Overview
Testament (the public name since v20; "testpulse" is the internal name of the repository, code and files) is a public dashboard of live automated-test results for Bobby Helco's projects (spec §1). This bundle is the design for every page in spec §13 plus the Raspberry Pi kiosk view, in dark and light themes, at desktop and phone widths, including the unhappy states from the design brief §6.

## About the design files
The files in `pages/` are **design references built in HTML**. They show the intended look and behaviour; they are not production code. Recreate them in the testpulse Next.js app (spec §4) using its patterns: server components for static content, a client component for the realtime feed, Recharts for charts, CSS variables from `tokens.css`.

To view a page, open it in a browser from inside `pages/` (it needs `support.js`, `tp-kit.js` and `tp-charts.js` beside it). `tp-kit.js` holds the shared view-model for status, health, layer tones, CoverageBar, ProjectCard and RunFeedRow so every page renders them identically; `tp-charts.js` draws TrendChart in real pixels at the measured width, as Recharts does. Each page has a Tweaks panel (props) to switch scenario, theme and variants.

## Fidelity
**High fidelity.** Colours, type, spacing, radii and copy are final. Match them exactly. Figures tagged **SAMPLE** are illustrative and must come from data (or be hidden) in production. All figures in the mocks, tagged or not, are placeholders for live values; only the brief §5 counts are real.

## Files
| File | What it is |
|---|---|
| `tokens.css` | All design tokens as CSS variables, dark default + `[data-theme="light"]` |
| `components.md` | Component list with props and required states |
| `data-map.md` | Every UI element mapped to its table/column or stat |
| `contrast.md` | Every required contrast pair with its ratio, both themes (must match the CI check) |
| `pages/Design System.dc.html` | **Canonical spec.** Tokens, contrast checks, every component in every state and variant, phone widths for charts, timeline, pyramid, table and feed |
| `pages/Landing.dc.html` | `/` — tweak `scenario`: healthy, failed run, private project failed, run in progress, run in progress, failure arrived, incomplete run (v23), scheduled run, E2E still red (v24), empty run, stale project, coverage below floor, live update, realtime disconnected, no projects, error |
| `pages/Project Page.dc.html` | `/p/[slug]` — tweaks: project (public/private), scenario (v23 adds latest run in progress, latest run incomplete; v24 adds E2E still red after a scheduled run, no coverage reported), theme |
| `pages/Run Detail.dc.html` | `/p/[slug]/runs/[id]` — tweaks: run (passed, failed, failed no message, and four private states: passed, failed, errored, several failures; v23: in progress, in progress with a failure arrived, incomplete; v24: scheduled run (no E2E), failed with an infrastructure fault; in progress now draws Running now), pruned, js (v24: Running now without JavaScript) |
| `pages/Test History.dc.html` | `/p/[slug]/tests/[testKey]` — tweak `variant` (v23 adds suite is its own name (Maestro flow); v24 adds intermittent E2E flow (with an infrastructure fault)) |
| `pages/How Its Tested.dc.html` | `/how-its-tested` — tweak: selfReporting |
| `pages/Admin.dc.html` | `/admin` — tweaks: view, detail, states, alerts, sync, job, links, theme |
| `pages/Privacy.dc.html` | `/privacy` |
| `pages/Kiosk.dc.html` | Kiosk, fixed 1920×1080, scaled to fit screen — tweak: scenario |
| `pages/ServerError.dc.html` | Server-error page (v21) for a project, run or test page whose data read failed — tweaks: kind (project, run, test), menu, theme |
| `pages/Share Image.dc.html` | Link-preview image (v21), fixed 1200 × 630, dark: export as the `og:image` PNG |
| `pages/Site Icons.dc.html` | Site icon (v21): 180 touch icon, 32 and 16 favicons, at size and enlarged |
| `pages/Phone Views.dc.html` | All pages at 390 px, a dark row and a light row (v21: plus the server-error page, D8 and L8; v23: the new run states, VD1–VD8 and VL1–VL8) |
| `pages/Review.dc.html` | Index: every page at 1440 × 900, dark and light side by side, plus kiosk |
| `pages/Landing Directions.dc.html` | Record of the direction exploration only (2a chosen, 2b its phone layout). Not a spec: its sizes, tiles and 34–38 px controls predate v2/v3 and must not be built from |
| `pages/tp-kit.js`, `pages/tp-charts.js` | Shared helpers the pages load (see above) |

## Global layout
- Page container: `max-width: 1280px`, gutter `clamp(20px, 4vw, 56px)`, centred.
- Header: 18px vertical padding, wordmark left, nav right, wraps on narrow screens. Footer: top hairline, 18px/32px padding.
- Skip link "Skip to content" first in tab order, targets `#main`.
- Grids use `repeat(auto-fit, minmax(min(100%, N), 1fr))` so they reflow with no breakpoints: tiles N=200px, project cards N=460px, feed/about N=420px.
- Every interactive target ≥ 44×44px. Focus ring: 2px `--ink`, offset 2px.
- Numbers use `font-variant-numeric: tabular-nums`.

## Screens
The HTML is the source of truth for exact measurements; below is the structure.

**Landing `/`** Tagline "A testament to every test." then the lede (serif 24), then the byline "Bobby Helco, quality engineering leader" (v21) → hero total (`--text-hero`) with a one-line note to its right → 4 stat tiles (Pass rate, Projects reporting, Runs in last 30 days, Projects passing; 2 × 2 on a phone) → "Projects" h2 + two project cards → row of Recent runs (feed) and About this site. Squint test: the first thing seen is the hero number, the second a project name.

*Project card*: see components.md › ProjectCard (canonical, v3).

**Project, Run detail, Test history, How it's tested, Admin, Privacy** — see the pages; each is annotated with its tweaks. Private projects (v22): counts only. No repo link, no `run_url`, no failure text, and no test name, suite, module tag or file path anywhere; no test pages (components.md › Private projects: counts only).

**Kiosk** Fixed 1920×1080 artboard scaled with `transform: scale(min(vw/1920, vh/1080))`, letterboxed on `#0b0a09`. Minimum text 22px. Header: wordmark, overall status pill (All projects passing / N failing / N silent), Live, last report, clock (HH:MM). Below the header, a hero band: total 116px, then "Tests on the latest runs" + the note, then 3 stacked tiles in a row (Pass rate, Projects reporting, Projects passing). Below it, three equal card columns (578 px), one card per project: Ostomate2, RouteServe, Testament (name 52, total 88, layer bar, coverage, health). Card border becomes 3px `--fail` or `--attn` when that project needs attention. Bottom strip: 3 most recent runs. No interactive controls; dark only.

## Interactions and behaviour
- Theme toggle: dark default; stores choice in localStorage; `prefers-color-scheme` used when none stored. Only `background-color, border-color, color, fill, stroke` transition, over `--motion-base`, while `html[data-theme-switching]` is set.
- Realtime: new run inserts at top of feed with a "New" pill (`--ink` / `--on-ink`) and a `--raised` background fading over 2s (no fail tint, even for a failed run); card and tiles update in place. No count-up animations. No "running" status (spec non-goal). v23: a run whose expected reports haven’t all arrived reads "In progress" (reports arriving, not tests running); it updates in place as reports arrive and when it completes.
- Disconnected: LiveIndicator off state; inline feed note with absolute time: "Offline. Showing runs as of 10:42 UTC; reconnecting". No banner.
- Loading: skeletons in the shape of the content. Error: `ErrorState` (`page` or `inline` variant), no stale numbers shown.
- Results table: status radio group (All · Passed · Failed · Error · Skipped) and native layer `<select>`, both 44 px; no search. Failures first, then by suite; "Load 50 more". Row expands (200ms) to failure detail. Stacks below 720 px container width.
- Project run list: "Default branch" / "All branches" filter, 10 rows, "Load 20 more". Landing feed is default branch only; no "All runs" link.
- Charts: tooltip on hover and keyboard focus (← → move, Esc closes); "Show table" under every chart with ≥ 2 points.
- StatusTimeline: selecting a cell opens an inline panel below the strip; no floating tooltip.
- ProjectSwitcher: disclosure list of links; closes on select, Escape (focus returns), outside click, focus leaving.
- Reduced motion: all animation off, live dot static.
- Without JS: all static content renders; feed is a server-rendered list.

## State
Theme; realtime connection status; feed list; project run-list branch filter and page count; results table filters, expanded row and page count; chart tooltip index and "Show table" open; selected timeline cell; project switcher open. Everything else is server data (see `data-map.md`).

## Design tokens
All in `tokens.css`. Summary: warm dark neutrals; status colours pass/fail/attn/neutral each with a tint; amber (`--attn`) is used only for things needing attention and for floor markers. Type: Source Serif 4 (figures, headings), Public Sans (UI), JetBrains Mono (SHAs, test names, report keys, eyebrow labels). Space scale 4–80. Radii 4 (xs) / 6 (tag) / 10 / 12 / 16 / 20 / pill. Cards separate by tone and hairline, not shadow.

## Assets
No images. Icons are simple inline stroke SVGs (24 viewBox, stroke 2.4–2.8, round caps): check-circle (passed), x-circle (failed), circle with "!" (error only), dashed ring + dash (empty), lock, clock, arrow-down (below floor), chevron, external arrow. No triangle icon. Replace with the app's icon set (e.g. Lucide) keeping the same shapes. Fonts from Google Fonts: Source Serif 4 (400/500/600, opsz), Public Sans (400–700), JetBrains Mono (400–600).

## Before building pages (spec §17 design track)
Implement `tokens.css` as the global stylesheet, build and unit test the components in `components.md`, then build pages. Record Playwright visual snapshots per page at desktop and phone, light and dark.

## Changes in v2
- Landing tiles match spec §11: "Skipped or disabled" replaced by "Runs in last 30 days"; skipped count moved to the Pass rate sub-line (also still in the hero note).
- SAMPLE tag removed from Median time to green and Green streak everywhere.
- Light `--pass` #1b7a3d → #197339 so every required pair reaches 4.5:1 (see `contrast.md`).
- data-map: coverage source, `runs_public` for public reads, live-update transport left to Phase 5, time-to-green note.
- Admin tracked links shown and copied as `<site origin>/v/<token>`.

## Changes in v3
Ground rules: A — Design System page is canonical; pages were changed to match it, and the kiosk card, kiosk StatTile and kiosk RunFeedRow are named variants. B — components.md lists exactly the props, states and variants drawn there. C — every control is 44 px tall, including breadcrumbs (links are 44 px flex items; only links inside running prose are exempt, and none of the listed controls are). D — added `--radius-tag: 6px` and `--pad-card-x`; fluid type sizes are now clamp() tokens. E — charts, timeline, pyramid, table and feed are drawn at desktop and at 390 px with fixed pixel text (see each below). F — loading, empty, private, failed and one-item states are drawn where they apply. G — this list.

**Foundation**
1. Empty: dashed ring (dash 3.5 3) + horizontal dash, word "Empty". The HealthMarker for an empty run reads "Last run empty" with the same icon. The "!" icon is now Error only.
2. Status pill text 14 px / 600, icon 14.
3. CoverageBar below floor: ink fill (unchanged), amber floor marker, amber down-arrow + "{pct}%" + "below floor {n}%" in `--attn`. Striped fills and "↓" glyph removed. Project page per-metric (lines + branches) layout removed; lines only, same rows as the card.
4. ErrorState is one component with two variants: `page` (fail pill "Error", serif headline, primary "Try again") and `inline` (error icon, serif 20 title, secondary "Try again"; used by feed, charts, tables). The triangle icon is gone; both use the Error status icon.
5. HealthMarker: 600, icon 13, stroke 2.8, everywhere.
6. DeclaredSuiteNote: columns name (flex 1 1 220) · layer 110 · count 90 · status (flex 0 1 260), padding 14×20; header has no bottom border, so there is one hairline. Rows wrap at phone width. Unit: "flows" for e2e, "tests" for every other layer.
7. StatTile attention: the sub-line turns `--attn` 600 with an icon; the value stays ink. Kiosk variant: the label is replaced by the attention text in amber with an icon.
8. Button hover/pressed/focus/disabled/busy drawn for primary, secondary, ghost and danger (static grid plus live buttons).
9. "running" removed from StatusBadge (no streaming, spec non-goal).
10. ProjectSwitcher: shaded row + "Current" = the current project (`aria-current="page"`); hover/focus use the same fill, and "Current" is what distinguishes it. Closes on select, Escape (focus returns to the button), click outside and focus leaving. A disclosure list of links (not an ARIA menu) is confirmed.
11. Theme change transitions only `background-color, border-color, color, fill, stroke` (200 ms, ease), only while `html[data-theme-switching]` is set; rule in tokens.css (never for reduced motion, see 73).
12. "Below floor" pill → HealthMarker `below_floor` and CoverageBar below state. "Private repository" → PrivateTag. "Saving" → Button `busy`. "Rotate API key" → Button `danger`.

**ProjectCard**
13. Failed: the total leads in ink; "{n} failed" is fail-coloured in the sub-line. The first failing test name is shown in a fail-tint block (links to the run; "+N more" when several), on public and private cards alike.
14. Empty and stale use the full card. Empty note: "Every report in this run arrived with no test results. An empty run is treated as a problem, not a pass, and isn't counted in any total."
15. Stale on the web: meta time in `--attn` + HealthMarker "No report in {n} days". No banner in the card (the project page keeps its page-level Notice). Kiosk: 3 px amber border.
16. PrivateTag pill on the web; kiosk variant is lock 30 + "Private". Private SHA is plain text (fixed on Landing).
17. Padding `24px var(--pad-card-x) 0` (clamp 20–30). Name `--text-title` clamp(32–42). Total `--text-count` clamp(44–56). Coverage grid `128px minmax(40px,1fr) auto` (wider label column for stored module keys). Per-report block: Landing's inset block (header + auto-fill 200 px pairs). Branch is `runs.branch` (fixed on Landing).
18. Drawn: private + failed (failing test name, no message, SHA unlinked); not reporting yet; no coverage rows ("No coverage reported"); no declared suites (footer left blank, marker stays right); loading skeleton with the card's inner shape (also used on Landing's loading scenario).
19. Kiosk card is a named variant (no tagline, no per-report block, coverage legend, 3 px status border).

**RunFeedRow / RunFeed**
20. Canonical row is the flex-wrap row: status 104, content flex 1 1 220, count, time. Project page uses the same row with `showProject: false`. Phone two-line layout drawn at 390.
21. "New" sans pill (`--ink` / `--on-ink`); background `--raised` fading over 2 s. A new failed row is the same with failed status and count, no fail tint. The healthy-scenario tint was not intended and is removed; only new rows get a background.
22. Empty row: fallback title ("Push to {branch}" etc.), real time, count "0 tests · {n} reports" in amber.
23. PR rows show "PR #52" in the branch slot. They appear only on the project run list under "All branches".
24. Failed count "1 failed · 141 of 142" everywhere, only "1 failed" fail-coloured; the project page now uses the same count.
25. Row hover `--raised` everywhere.
26. Disconnected: inline note with absolute time, "Offline. Showing runs as of 10:42; reconnecting". The dashed banner is removed.
27. Feed empty ("No runs yet") and feed error (ErrorState `inline`) added to components.md and drawn.
28. Feed loading skeleton added to Landing's loading scenario, matching the Design System.
29. "All runs →" removed from Landing (no route). The project page run list is the paginated history: "Default branch" (default) / "All branches" radio filter per spec §18 Q4, 10 rows, "Load 20 more". Landing's feed is default branch only, so the PR #52 row no longer appears there.
30. Feed heading: h2 serif 24/500 on Landing and project page; 32 px in the kiosk variant.

**ResultsTable**
31. Columns `36px 130px minmax(0,1fr) 110px 130px 80px` (Run Detail's), now on the Design System too.
32. Status filter is a radio group of 44 px buttons (All · Passed · Failed · Error · Skipped).
33. Layer filter is a native `<select>`, 44 px.
34. Search removed, per spec §13 (status and layer only).
35. Error rows and the Error tab added (error icon + "Error", expandable like a failure).
36. Pruned uses the Run Detail copy and 22 px title.
37. Private: the notice includes the "Test history" link; the "Platform mismatch" line still shows (statuses only).
38. Loading: header + 6 skeleton rows.
39. "Failures first, then by suite" sort, "Showing N of M" and "Load 50 more" are part of the component (components.md).
40. "View source at {sha}" removed.
41. Narrow layout below 720 px container width: rows stack (status + time; name; suite; layer · platforms), expanded detail padding 16 on all sides, stack trace scrolls inside its own box. Drawn at 390 and implemented on Run Detail.

**StatusTimeline**
42. Inline panel below the strip (touch- and keyboard-friendly); no floating tooltip.
43. One strip per platform when the test ran on more than one; legend always, listing the cell types present.
44. Cells drawn: skipped (outlined 14), error (44 with !), not run (4 px `--line-strong`), alongside passed, failed, flaky.
45. Cells `flex: 0 1 16px`, min 6 px, latest on the right. Few runs: cells stay 16 px, right-aligned (3-run example drawn). More runs than fit: show the latest that fit, cap 40 (≈40 at desktop, 27 at 390, drawn), label "Last {n} runs".
46. The project page "Last 40 runs" strip is StatusTimeline `kind: 'runs'`, `interactive: false` (passed / failed / empty cells).
47. Flaky copy everywhere: "passed and failed on the same commit and platform within the last 30 days".

**StackTagGroup**
48. Confirmed: `variant: 'built'` (inset fill, `--line`) and `'tested'` (no fill, `--line-strong`).
49. Confirmed: dashed items come from `declared_suites` status (`authored_not_executed` → "not yet executed", `runs_in_ci_not_reported` → "not yet reported"); `declaredStatus` prop added. Note the spec key is `runs_in_ci_not_reported`.
50. Label column 96; tags `--radius-tag` 6.

**TrendChart**
51. One point: dashed frame, value, one dot, "One run so far. The trend appears after the next run." No axes. Same component on every page, including Test History.
52. Empty: dashed frame, "No runs yet". Loading: `--raised` block.
53. Bar kind drawn (runs per UTC day, from zero).
54. Pass-rate chart added to the project page (with the other three).
55. Primary stroke 2.5; endpoint dots r 4.5; hollow intermediate dots only with ≤ 12 points on desktop; end label = value.
56. Yes: `series[{name, values, dashed}]` (second series dashed `--ink-3`, legend above) and `marks[{index, status}]` (8 px squares on failed/empty runs).
57. Bars and counts start at zero. Lines fit data ∪ floor with padding, snapped to nice steps; percentages clamp to 0–100. The CoverageBar (a bar) always runs 0–100. X: per run for pass rate, test count, coverage (per module) and duration; per UTC day for runs per day.
58. "Show table" (44 px) under every chart with ≥ 2 points; 30-point table drawn open (newest first, sticky header, scrolls at 320 px).
59. Tooltip on hover and keyboard focus (← → to move, Esc to close); drawn open.
60. Every chart kind drawn at 390: height 200, first/last x labels only, no intermediate dots, text sizes unchanged.
61. Caption templates per chart type are in components.md; with fewer than 2 points the caption is omitted and the in-chart one-point text is shown.
62. Each chart states its scope under the title: pass rate, coverage — "Default branch · CI and imported history"; test count — "Default branch · CI runs only" (changed in v5, item 7); duration — "Default branch · CI runs only (imported history has no durations)"; runs per day — "Default branch · CI and imported history" (corrected, see 72).

**Pyramid**
63. Bar height 30, radius 4 (`--radius-xs`), grid `110px minmax(0,1fr) 120px` (phone `80px minmax(0,1fr) 88px`), 14 px, count + "% of total", min bar 6 px, header = big total + "tests executed in the latest run".
64. Declared e2e is a text row with no bar: "{n} flows declared · not counted".
65. Drawn: single layer, no layers ("No tests executed yet."), loading, phone.
66. components.md now says rows follow spec §8 order (unit at the base), not width.

**Layer tones**
67. unit `--layer-1`; component and visual `--layer-2`; integration and e2e `--layer-3`; api `--layer-4`. Same in every project and chart (Ostomate2 integration is now `--layer-3`, visual `--layer-2`). 3 px gap between segments is mandatory.
68. How it's tested pyramid uses §8 layers only: Unit 214, Integration 70 (includes the 6 reporter contract tests), E2E 38 (includes the axe checks). The strategy table keeps Contract and Accessibility rows as tooling notes with no layer swatch.

**Contrast**
69. Added `--ink-3` on `--pass-tint` and `--fail-tint`, and `--on-ink` on `--fail`, to contrast.md and the Design System table (all pass). Lowest text pair: dark `--ink-3` on `--pass-tint` 5.90:1; light `--pass` on `--raised` 4.84:1.

**Data map**
70. Prop names reconciled in data-map.md and components.md: LayerBar `{label, count, tone}`, Pyramid `declared`, ProjectCard `declared[]` from `projects.declared_suites`, StatusTimeline takes results for a test or runs for the project strip.
71. Stored module keys are used verbatim everywhere ("apps/backend", "apps/mobile", "packages/shared"), in mono; no display shortening.

**Follow-up fixes**
72. Runs per day counts default-branch runs including imported history, like the other trends (spec §11). Scope line is "Default branch · CI and imported history" on the Design System and in components.md; data-map.md matches.
73. tokens.css: the `html[data-theme-switching] *` rule outranked the reduced-motion rule (higher specificity, both `!important`). It is now wrapped in `@media (prefers-reduced-motion: no-preference)`, so reduced-motion users get no theme fade.
74. Commit messages are not stored. Run titles everywhere use the fallback titles from `runs.event`: "Push to {branch}", "Pull request #{n}", "Scheduled run" (Landing, Project page, Run detail, Design System, components.md, data-map.md). The open question is closed.

## Changes in v4
Same rules as v3: the Design System page is canonical, components.md matches it, every target is 44 px (links in running prose excepted), tokens or a literal stated once. Where an answer changes a v3 item, v4 wins (notably v3 items 23 and 74 on PR titles, 37 on the private "Test history" link).

**Notice**
1. Changed. `title` is optional on every tone, including neutral. Body is 14/1.5 `--ink-2` on every tone (attn and fail were 13.5). ARIA: no live-region role on a Notice rendered with the page; `role="status"` only when one is inserted after load (project turns stale while open). Design System, Project page and Run detail updated.
2. Changed. New `icon` prop: `clock` (stale project, attn), `x-circle` (failed-run summary, fail), `lock` (private repository note, neutral). The icon is chosen per use, not per tone.

**Pyramid**
3. Answered. Loading: header skeleton (96×44 + 45%×14), then 4 rows in the row grid: label 64×12, bar 30 tall at 25%, 45%, 70%, 100% of the bar column, count 56×12. Drawn.
4. Confirmed. `note?` added to the Props line; omitted when absent.
5. Confirmed. Declared suites are summed per layer (12 = 7 + 5), all declared rows above all bars, §8 order.
6. Changed. Rounded to the nearest whole percent; a share under 1% reads "<1%" (RouteServe integration 3 of 1,045 → "<1%"). Design System and Project page updated.
7. Confirmed. No bars → "No tests executed yet." and declared rows hidden (the DeclaredSuiteNote lists them).
8. Answered. Container width: the narrow grid applies when the pyramid's own container is under 480 px (container query or ResizeObserver).

**StatusTimeline**
9. Answered. Selection is a run shared by all strips. Each strip is one Tab stop (`role="listbox"`, horizontal, `aria-activedescendant`; cells `role="option"`); ← → move a run, Home/End oldest/latest, ↑ ↓ move focus to the other strip. Focus stays on the strip. Touch and mouse: the whole 48 px strip is the target; press, hover or drag selects the nearest cell by x (`touch-action: pan-y`). Selected: 2 px `--ink` outline, offset 2, on that run's cell in every strip; strip focus-visible ring 2 px `--ink`, offset 4. Drawn on the Design System page; Test History rebuilt this way (cells are no longer buttons).
10. Answered. One layout: the Design System wrapping flex row (gap 12×28, padding 14×16). Shows Run "{title} · {sha7}", When, then per platform icon + status word + " · {duration}" (omitted for skipped / not run). Single platform: one field labelled "Result". Two platforms: one field per platform key. Props now carry per-run results with durations. Test History matches.
11. Confirmed. 76 + 12 gap; components.md corrected.
12. Answered. Results strip: "{test} on {platform}, last {n} runs" (one strip: "{test}, last {n} runs"). Cell: "{Status word}, {when}, {title}, {sha7}". Runs kind: one `role="img"` named "Last {n} runs on {branch}: {p} passed, {f} failed, {e} empty." (zeros omitted); cells unnamed. The cell `label` prop is removed. Project page updated.
13. Confirmed. Strip gap 14, legend gap 8×18, margin 14, padding 12. Test History now matches.
14. Changed. Legend swatch height = min(cell height, 20): Empty (and Flaky) 20. Project page already 20; Design System updated.
15. Answered. Neither: when one cell is shown there is no oldest label, only "Latest". Test History's "1 run ago" removed.
16. Accepted, with one change: before measurement the oldest label is empty (not "{n} runs ago"); cells clip from the left. No separate pre-measure state.

**ProjectCard**
17. Answered. Template in components.md and `TPKit.declaredSummary`: one suite "Not counted: Maestro E2E · iOS (13 flows), authored, not yet executed"; several with one status "Not counted: 12 flows in 2 suites, run in CI, not yet reported"; mixed "Not counted: 7 flows run in CI, not yet reported; 5 flows authored, not yet executed". Drawn (including a mixed sample).
18. Answered. Counts always shown. Platform = last segment of the report key; totals summed per platform in first-seen order ("node 284 · chromium 38"). Intended. `TPKit.platformSplit`.
19. Confirmed. `project.href`, `latestRun {status, when, branch, sha, href, total, failed, skipped, duration}`, `health {health, days}` written into components.md (plus `headingLevel`).
20. Answered. Shorten: path-style → last path segment ("jobs.test.ts"); dotted → last segment ("HomeViewModelTest"). Full "suite › name" in `title`. The block wraps, no ellipsis.
21. Confirmed. SHA unlinked on private cards; failing block links to testpulse's run page.
22. Changed. SHA link and project-name link are inline-flex with min-height 44 (row 1 becomes 44 tall). Failing block min-height 44 confirmed. Not exempt.
23. Answered. Curly (’) everywhere. Converted in every page, components.md and data-map.md.
24. Confirmed. Empty card shows neither coverage rows nor "No coverage reported".

**ProjectCard kiosk**
25a. Confirmed as named variants: StatusBadge `kiosk` (26/600, icon 26) and `inline-kiosk` (24/600, icon 22); HealthMarker `size: 'kiosk'` (24, icon 24); LayerBar `kiosk`; CoverageBar `kiosk`.
25b. Confirmed with one correction: 3 px gap (Kiosk page's 4 fixed), 14 tall, min 5, labels 24 gap 6×24, hidden when failed (and empty).
25c. Drawn: PrivateTag kiosk in the heading, gap 18, 400 24 sans.
25d. Confirmed: whole meta line `--attn` when stale.
25e. The page sets the level (`headingLevel`, default 3). The Design System draws h3; the Kiosk page keeps h2 (no heading above its cards).
25f. Right. Kiosk page fixed.
25g. Design System: platform key only ("ios-sim"), name one line with ellipsis. Kiosk page fixed.
25h. Drawn: 22 px arrow-down + value in `--attn`; value column 130 px.
25i. Drawn: empty (3 px `--attn` border, "0" in `--attn`, "tests executed", "4 reports received", empty note 22 px) and not reporting (`--line` border, not-reporting badge, "Registered…" 26 px, footer only).
25j. Confirmed.
25k. Tokens added: `--radius-kiosk` 24, `--radius-kiosk-inset` 14.
25l. Confirmed. The Design System now draws kiosk cards in a grid; width comes from the kiosk grid.

**Loading and titles**
26. Confirmed as built: the card frame stays still, one skeleton block per part shimmers. Design System corrected.
27. Part of the component: title text fixed by variant ("Built with" / "Tested with"), rendered as a heading (`headingLevel`, default 3). Project page uses h3.

**Earlier builds**
28. Answered. push "Push to {branch}"; pull_request "Pull request from {branch}"; schedule "Scheduled run"; workflow_dispatch "Manual run"; other "Run on {branch}". Branch slot is `runs.branch` for every event (no "PR #n"). `TPKit.runTitle`. All mocks updated (sample PR branch "fix-today-count").
29. 14/600, icon 15 (inline StatusBadge). Design System switcher corrected.
30. Separate text: a 14 px `--ink-3` span after the marker, gap 8 ("Last report 4 minutes ago" / "Expected every 8 days"). No new prop. Drawn; Project page updated.
31. Confirmed: button padding 16, actions 20 below, link padding 0 8. Landing fixed.
32. Busy ring: stroke 3 in a 24 viewBox (1.75 px at 14). Danger pressed: padding 0 15 so the label doesn't move. Cursors: busy `progress`, disabled `not-allowed`. Hover/pressed transition: background-color and border-color over `--motion-fast` (120 ms, ease); none under reduced motion. Drawn in the live row.
33. Drawn: sub (20 px `--ink-3` under the label), loading (45%×22 + 120×52), attention icons 22 px stroke 2.6 for stale, empty, below floor.
34. Truncate: nowrap + ellipsis, full key in `title`. Long-key sample added.

**RunFeed**
35. Confirmed. The feed header uses a live note (8 px dot + "Updates as reports arrive" 13.5, no "Live" word), not the LiveIndicator. components.md updated.
36. Answered. Project page: the live note sits on its own line under the header row (padding 0 16 10), same online and offline copy. Drawn; Project page updated.
37. Confirmed with project copy: "No runs yet" + "Runs appear here when {project}’s CI reports." Drawn.
38. Confirmed. Landing now has `--shadow-card`.

**RunFeedRow kiosk**
39. Drawn. Radius tokenised as `--radius-lg` (16) rather than a new token; Kiosk page run tiles and stat tiles changed from 18 to 16. `inline-kiosk` StatusBadge confirmed.
40. `--surface` for all tiles (no fail tint). Kiosk page fixed.
41. Drawn: empty tile, private tile (22 px lock after the name), feed loading (3 skeleton tiles), empty ("No runs yet"), error ("Runs couldn’t be loaded" + "Retrying every minute.", no button) and offline note ("Offline. As of 10:42").

**ResultsTable**
42. Confirmed. Real table; failed/error rows use a stretched toggle button, other rows a stretched link (see 48). Nothing visible changes.
43. Confirmed: Failed and Error in `--fail` while their count is above 0. Run detail fixed.
44. Confirmed: M = rows matching the current filters (the total when unfiltered). Run detail fixed.
45. Changed. Failing platforms first, both layouts: "Failed on ios-sim, passed on jvm in the same run." Groups failed, passed, skipped; data order inside a group; joined ", ".
46. Yes, a mismatch: any difference across platforms. "Failed on ios-sim, skipped on jvm in the same run." Drawn.
47. Confirmed. Run detail: platform 13, icon 15, no pruned max width, "No tests match" is a standalone card replacing the table box.
48. Every row links to its test history. Failed/error rows: "Test history" in the expanded detail (after the private notice, as drawn). Other rows: the whole row is a stretched link to the test history (hover `--raised`).
49. Confirmed. Labels typed "Status" etc., uppercased by CSS. Design System and Run detail updated.

**Copy**
50. Singular at 1 for every count noun: "1 test", "1 report", "1 flow", "1 run", "1 suite", "1 day", "1 report in this run", "1 report received". "1 failed", "1 skipped", "1 passed" stay. `TPKit.qty` applies it.
51. Confirmed, plus the other loading names: "Loading runs", "Loading results", "Loading project", "Loading chart", "Loading test layers", "Loading stats".

**Not found**
52. Designed: one NotFound page (`NotFound.dc.html`, tweaks kind and theme) for an unknown project, run or test, served with HTTP 404. Header, footer, "404 · Not found" eyebrow, headline, the requested path in a mono chip, a one-sentence reason, and a way forward: the project list + "Go to overview" (project), or breadcrumbs + "{project} runs" / "Latest {project} results" + "Overview" (run, test). Drawn on the Design System page (section 14) at 1280 and 390 for each kind; light and dark follow the page theme. Also in Review (R7b) as dark and light, desktop and phone. Spec in components.md "NotFound (page)".

**Files changed in v4**
- Design System.dc.html, tp-kit.js
- NotFound.dc.html (new), Review.dc.html
- Landing.dc.html, Kiosk.dc.html, Project Page.dc.html, Run Detail.dc.html, Test History.dc.html
- How Its Tested.dc.html, Admin.dc.html, Privacy.dc.html, Phone Views.dc.html (apostrophes only, item 23)
- design/components.md, design/data-map.md, design/tokens.css, design/README.md
- design/pages/ (re-copied)

## Changes in v5
Same rules: the Design System page is canonical, components.md matches it, every target is 44 px. Nothing outside items 1–16 was changed.

**TrendChart**
1. Held wording added: "Held at {last}% over {n} runs; {above|below} its {floor}% floor." Used when last = first at one decimal (as displayed). Drawn ("LINE · coverage held").
2. One rule for axis, tooltip and table: the latest point is "Latest"; point i of n is "{n−1−i} runs ago". The oldest of 30 is "29 runs ago" everywhere. Date labels replace it when given. tp-charts.js corrected (shared `ago()` helper).
3. Drawn ("ERROR · inside the chart card"): the plot area becomes an inset panel in the same card (`--inset`, 1px `--line`, `--radius-md`, same height): icon 18 `--fail`, "Chart couldn’t be loaded" serif 20, "The rest of the page is still current." 14 `--ink-2`, secondary "Try again", `role="alert"`. Title and scope stay; caption and "Show table" hidden. New props `error`, `onRetry`. ErrorState inline is no longer used by charts.
4. Test History now uses the standard card: 20 px title, scope then caption, 22×24 padding, `--shadow-card`. Caption is the Duration template: "Between {min} and {max} over the last {n} runs." + " Median {med}." (median only with one series; with several, min/max across all). The free prose is gone; with one run the caption is omitted.
5. All four confirmed and tp-charts.js corrected: whole-number steps for `int`/`dur` (1, 2, 5, 10 × 10ⁿ, min 1); all-zero from-zero chart opens 0…1 (drawn); duplicate x positions dropped (drawn with 3 points); "1 run ago" / "1 day ago". Also drawn: runs-per-day caption at zero, "No runs in the last {days} days."
6. Rule: right margin = max(60, 8 + widest end-value label + 6), phone max(44, …), label measured at 13/600. In Recharts, measure the formatted last values and set `margin.right`. The Design System no longer clips "100.0%" or "92.0%".
7. Test count scope is "Default branch · CI runs only" (distinct tests, CI runs only) in components.md, data-map.md (Trends row), README item 62, the Design System and the Project page.

**Components**
8. Both confirmed: "Failed on ios-sim, errored on jvm in the same run." and "Passed on jvm, skipped on ios-sim in the same run." Group order failed, errored, passed, skipped. The line lives in the expanded detail, so a passed/skipped mismatch shows only in the platform list. Run Detail's script now flags any status difference and builds the sentence from data.
9. `interactive` removed: results strips are always interactive, the runs strip never is. `initialRun` accepted (default latest). Test History opens on the latest failing run, else the latest run; its script is updated. Runs-kind `{branch}` is the project’s default branch (`projects.default_branch`).
10. Confirmed: neutral Notice title is `--ink-2`. Written into components.md and the Design System.
11. Empty and error tiles span all three run columns (`grid-column: 2 / -1`). Error tile `role="status"`. Heading in every state; the note shows the connection (live or offline) in every state. Drawn in the kiosk runs grid.
12. A declared suite always has count ≥ 1 (`projects:sync` rejects < 1). tp-kit.js also drops the brackets if a count is missing: "Not counted: {name}, {phrase}".
13. Confirmed: Button takes `href` and renders `<a href>` with identical styling and states. NotFound already uses the link form.

**Bundle fixes**
14. "## Skeleton" heading restored in components.md.
15. Test History sample now reads "Pull request from fix-today-count, yesterday".
16. data-map.md: "Projects reporting" counts projects with a latest run that is not stale (days since last report ≤ expected cadence). Health marker is also worked out from public data (stale by cadence, empty = latest total 0, below floor from latest coverage). `alerts` is now read only by Admin.

**Follow-up**
17. StatusTimeline's oldest label now uses the TrendChart counting rule (item 2): "{n−1} runs ago", "1 run ago" at 2, so 40 cells read "39 runs ago" (Design System, Project page, Test History, components.md). "Last {n} runs" when more runs than fit is unchanged.

Files changed in v5: Design System.dc.html, Test History.dc.html, Run Detail.dc.html, Project Page.dc.html, tp-charts.js, tp-kit.js, design/README.md, design/components.md, design/data-map.md.

## Changes in v6
Same rules: the Design System page is canonical, components.md matches it, every target is 44 px. Decision applied: the landing and kiosk show only portfolio-wide numbers; time to green and green streak are per project, never combined, and use calendar time. Nothing outside items 1–13 was changed.

**Landing headline and recovery**
1. "Median time to green" and "Green streak" tiles removed from Landing (desktop and the 390 embed in Phone Views), the Design System tile samples and components.md. One portfolio tile added, **Projects passing**, so the row is four tiles (4 across at 1440 and 1024, 1 per row at 390). "Currently red" is folded into its sub-line rather than a fifth tile. Copy:
   - value "{p} of {n}" (n = projects with a default-branch run; p = latest default-branch run passed)
   - all passed: sub "Latest default-branch runs"
   - one red: sub in `--fail` 600 with x-circle, "Ostomate2 red for 4m"; several: "Red: RouteServe 2d 3h · Ostomate2 4m" (longest first)
   - latest run empty, none red: plain sub "Ostomate2 last run empty"
   - no runs yet: value "0", sub "No runs yet"; loading as every StatTile
   - duration: calendar time since the first failed run of the episode; "{m}m" under 1 h, "{h}h {mm}m" under 24 h, "{d}d {h}h" after
   data-map row "Tile · Projects passing" added (runs_public only). Overall pass rate unchanged: passed ÷ (passed + failed), where failed includes error, as built.
2. Kiosk: Green streak replaced by Projects passing ("2 of 2"; while red, the label becomes "Ostomate2 red for 4m" in `--fail` 600 with a 22 px x-circle, value "1 of 2"). Kiosk.dc.html, data-map.md Kiosk section, components.md StatTile kiosk and the Design System kiosk tiles updated.
3. The ProjectCard does not show them (per-project history belongs on the project page; a red project is already the failed card state). The project page's two cells are now **RecoveryStats** (components.md) and carry every field and state, drawn on the Design System (section 05) and live on the Project page (new scenario "no recoveries in 90 days"):
   - Green streak: current + "Longest {n} runs"; "0" while red. A failed pull-request run doesn't break it.
   - Time to green: median + "Median of {k}, 90 days · worst {w}".
   - Red now: extra `--fail` line "Red now for {duration}"; the open episode isn't counted until it recovers.
   - No recoveries in 90 days: value "None", sub "No recoveries in 90 days", never 0; with Red now when still red.
   Project page previously kept a 41 streak in its failed RouteServe state; it now shows 0 and Red now. Longest, worst and red-now durations are tagged SAMPLE.
4. data-map.md: "Tile · Median time to green" and "Tile · Green streak" removed; added "Tile · Projects passing", and project-page rows "Green streak" and "Time to green". All from `runs_public`; no `alerts`.

**Small inconsistencies**
5. data-map.md mismatch row now matches components.md: any differing status; groups failed, errored, passed, skipped.
6. 12 px. tp-charts.js button margin is now 8 + the 4 gap = 12; components.md states the other gaps too.
7. Failing = failed or error on any platform. Flaky, skipped and not run don't count. Test History's script and components.md updated.
8. Confirmed: one marker, stale, then empty, then below floor. The detail text is only the chosen marker's own; the others are already visible on the card (amber "0" total, amber coverage row), so no list.
9. Confirmed: sorted by module key, code-point order (composeApp before shared). Applied in tp-kit.js (every ProjectCard), the Project page and the Kiosk mock.
10. data-map.md card rows now use distinct tests in the latest default-branch CI run, with passed/failed/skipped per distinct test from the same run (Ostomate2 142, not 192).

**Bundle fixes**
11. Phrase removed.
12. Removed the unused `chart()` method from Test History.dc.html.
13. components.md: bar kind is exempt from the right-margin rule (stays 60, phone 44).

Files changed in v6: Landing.dc.html, Kiosk.dc.html, Project Page.dc.html, Test History.dc.html, Design System.dc.html, tp-charts.js, tp-kit.js, design/README.md, design/components.md, design/data-map.md. Phone Views changes through its Landing embed; the file itself is unchanged.

## Changes in v7
Same rules: the Design System page is canonical, components.md matches it, every target is 44 px. Nothing outside items 1–17 was changed except where noted.

**Run detail: one row per test**
1. Count tests. Each test has one row status, the worst of its platforms: Failed if any platform failed, else Error if any errored, else Passed if any passed (flaky included), else Skipped. It appears under that one filter group, so Passed + Failed + Error + Skipped = All. data-map.md "Status filter" rewritten. The Design System filter bar now reads the real run (All 142 · Passed 141 · Failed 1 · Error 0 · Skipped 0); rows marked SAMPLE are illustrative.
2. The slowest platform (max `duration_ms`). Per-platform times are in the expanded failure heads and on Test history. data-map row "Row time" added.
3. Drawn (Design System section 10, "syncsOnReconnect · SAMPLE"): one block per failed or errored platform, in platform data order, gap 14. Each block has a head, 13/600 `--fail` with a 14 px status icon, "ios-sim · Failed · 0.88 s", then its message and stack trace. With one failure the head is omitted. `ResultRow.failures[]` replaces `failure`.
4. Drawn ("migratesSchema · SAMPLE"): the platform list reads "jvm ! Error" in `--fail` 600, glyph and word. The mismatch line reads "Errored on jvm, passed on ios-sim in the same run."

**Project page gaps**
5. Every per-run chart covers the last 30 default-branch runs (fewer when there are fewer; the caption already states n). Scope lines: pass rate and coverage "Default branch · last 30 runs · CI and imported history"; tests per run "Default branch · last 30 CI runs"; duration "Default branch · last 30 CI runs (imported history has no durations)". Applied on the Project page, the Design System, components.md and data-map.md.
6. Confirmed with one change: the last 40 default-branch CI runs in which the test has a result, counting failed or error on any platform. With fewer: "Failed {n} of last {m} runs" (m = runs available, "1 run" at 1).
7. Confirmed: CI runs only, imported history excluded. data-map.md now says so.
8. Rule: trim and case-fold both sides. An item matches a suite when the suite's name equals it or starts with it followed by a space ("Maestro" matches "Maestro E2E (iOS)"; "Jest" does not match "jest-expo"). No other partial matches. Several suites matching one item: "not yet reported" if any runs in CI, else "not yet executed". A tool with no suite gets a normal solid tag. A suite with no tag is listed as usual with no tag added, and `projects:sync` logs a warning.

**Test history**
9. Drawn ("LINE · gaps where ios-sim didn’t run", tooltip open on a gap): the line breaks at a missing value, and a lone point between gaps is a 3 px dot. Tooltip and table show "Not run" in `--ink-3`. A series whose latest value is missing has no end label. Missing values are excluded from the axis range and from the caption's min, max and median. tp-charts.js now accepts `null`; in Recharts, use `connectNulls={false}`.
10. Confirmed: it names the project's default branch. The `defaultBranch` prop (runs kind, required, `projects.default_branch`) is added to components.md.

**v6 leftovers**
11. Confirmed: each "{project} last run empty" joined with " · ". Drawn.
12. The label stays "Projects passing", the value is "1 of 2", and a plain 20 px `--ink-3` sub reads "Ostomate2 last run empty" (several joined with " · "). Drawn in the kiosk tiles.
13. Drawn: web "0" / "No runs yet"; kiosk "0" / "No runs yet"; kiosk "2 projects red" (value "0 of 2", `--fail` 600, x-circle). Also drawn: web "0 of 2" with two empty runs.
14. Confirmed: every unit rounds down (59m 59s → "59m", 226m 4s → "3h 46m", 47h 59m → "1d 23h"); under a minute reads "0m". The same rule applies to RecoveryStats.

**Bundle fix**
15. The README Screens section now lists the four v6 tiles, and the kiosk hero column names its three tiles.

**Project page, as built**
16. New components.md section, "Relative time": "just now" under 1 min; "{m} min ago"; "{h} h ago" (rounded down); "yesterday" (previous calendar day, viewer's local time); "{d} days ago" for 2–6 days; "1 week ago" / "{w} weeks ago" for 7–27 days. From 28 days the date replaces it: "12 Aug", or "12 Aug 2025" in another year. The full timestamp is always in `<time datetime>` and `title`.
17. Drawn (Design System section 05, "PHONE · 390"): the stat row is flex-wrap, gap 16×12. Pass rate and Green streak are `flex: 1 1 120px`, and Time to green is `flex: 1 1 240px`. Below 516 px of card content, Time to green drops to its own full-width line, with no media query. The Project page uses it, so the desktop layout gives Time to green a slightly wider cell.

Files changed in v7: Design System.dc.html, Project Page.dc.html, tp-charts.js, design/README.md, design/components.md, design/data-map.md.

## Changes in v8
Same rules: the Design System page is canonical, components.md matches it, every target is 44 px. Nothing else was changed.

**Decided by the owner**
1. components.md "Relative time" rewritten: UTC only, seven cases checked in order, first match wins. Under 1 min "just now"; under 60 min "{m} min ago"; same UTC day "{h} h ago"; previous UTC day "yesterday"; 2–6 days "{d} days ago"; 7–27 days "{w} weeks ago"; from 28 days the date. 3 h ago across UTC midnight is "yesterday"; 40 min across midnight is "40 min ago". No overlap remains.
2. Applied to every mock (Landing, Kiosk, Project Page, Run Detail, Test History, Privacy, NotFound, Admin, How It's Tested, Design System): "4 min ago", "2 h ago", "12 min ago", lower-case "just now". One date format everywhere: "12 Sep", "23 Mar 2027", chart labels "7 Aug". Clock times say UTC ("24 Sep, 14:02 UTC"). The stale notice and stale cards read "12 Sep".
3. One chart per module, in module-key order, each "Line coverage, {module}" with its own floor. On the Project page Ostomate2 now draws composeApp and then shared; the composeApp series is SAMPLE (marked in its caption).
4. The rule now drops a trailing version first ("Maestro 2.6.1" → "Maestro", which then matches "Maestro E2E (iOS)"); the tag keeps its version. Written in components.md and data-map.md. The `projects:sync` warning is removed from the bundle.
5. Percentages round down to the tenth: `down1()` in tp-charts.js (`pct`) and tp-kit.js (`cov`, exported as `TPKit.down1`). 99.96 reads 99.9%, 79.96 reads 79.9% (drawn beside an 80% floor, below). The rule is in components.md CoverageBar; floor comparisons use the unrounded value.

**Landing**
6. components.md "Landing hero" gives the note for any number of projects: sentence 1, "automated tests across {n} projects"; sentence 2, failing on one or several projects, or the pass rate, plus skipped; then one sentence each for empty, stale ("RouteServe hasn’t reported since 12 Sep.") and never-reported projects. "disabled" is dropped because nothing stores it. The Landing mock now uses these templates in every scenario.
7. The lede is the h1. The total and note are one `<p>`, so a screen reader reads "1,190 automated tests across two projects. …" and no separate label is needed. Applied in Landing.
8. Projects reporting: value "{r} of {n}". Registered projects that have never reported count in n. Sub-lines: "All within their expected cadence"; "RouteServe silent 12 days"; "Silent: A 12 days · B 9 days"; "testpulse not reporting yet". The Landing mock now reads "2 of 2" / "All within their expected cadence".
9. Pass rate with no rate: "—" / "No tests passed or failed on the latest runs". An empty run beside counted ones, or beside a failing one: "{counted projects} only · {s} skipped, excluded". Confirmed: the "of" figure is passed + failed (1,183 of 1,185).
10. Drawn as the Landing scenario "no projects": the h1, then a "No projects yet" card with a link to How it's tested.
11. No loading page: the page is server-rendered with its data, so the Landing "loading" scenario is removed. The error page is needed (HTTP 503), and its "Try again" is a link to the same URL.
12. A bare file name with a source extension is kept whole ("zz-deliberate-failure.spec.ts"). tp-kit.js `shortSuite` is updated.
13. 15 px, as the Button spec says. The Landing mock is corrected.
14. A stale card shows the date of its last run ("12 Sep"), not "1 week ago". Applied in Landing, Kiosk and the Design System.
15. With no floor there's no marker and no floor text, never amber. The project page chart has no floor line and no floor clause in its caption. Drawn (CoverageBar, "iosApp · SAMPLE"). tp-kit.js `cov()` accepts a null floor.

**Carried from v7**
16. Drawn (Design System section 09): the count reads "Results pruned · {duration}"; for a failed run, "Failed · Results pruned · {duration}". This is the same row on the project page run list and the landing feed.
17. "Skipped". TrendChart takes per-series `gapLabels`; Test history passes "Skipped" where the result was skipped and "Not run" where there's no result.
18. Yes: the platform · status · time heads are shown, then the private-details notice once.
19. Confirmed: sum per platform (retries included), then the slowest platform. data-map.md "Row time" updated.
20. Shown, with "Flipped on {c} commits in 30 days" in place of "Failed 0 of last 40 runs".
21. Corrected to 504 px (120 + 120 + 240 + 2 × 12) in components.md and the Design System.
22. Intended: series 0's start label and dot are drawn only when its first value exists. Documented in TrendChart.

**Run page**
23. Drawn (section 10, four banners). Heads: "1 test failed: {suite} › {name}" / "{f} tests failed" / "{e} tests errored" / "{f} failed, {e} errored". Sub-line from module, layer, platforms and the mismatch sentence; a private project adds its sentence. Button: "Show failure" / "Show failures". The interpretive prose is gone; Run Detail's sub-lines follow the template.
24. Removed: the meta reads "Reports {n}".
25. Both removed from Run Detail and the docs.
26. Drawn: the bar runs passed, failed, skipped (`--neutral`); line "1 failed · 44 passed · 5 skipped". Run Detail's bar and line now include skipped.
27. Drawn: Empty status, dashed `--attn` track, "No tests in this report", tests "0", time "—".
28. Drawn: a "No test results in this run" card, with "{n} reports arrived, but none held any test cases."
29. The heading is unchanged; the meta line adds "Attempt {k}" when above 1. See the Run Detail tweak "Ostomate2 · passed, attempt 2".
30. Confirmed as built: no live indicator, no updates. The header's "Live" is removed from Run Detail.
31. Copy is "Pruned on {date}" ("Pruned on 23 Mar 2027"). The tag now reads SAMPLE DATE, because only the date is illustrative.

**Project page and charts**
32. Without JavaScript: title, scope and caption, then the table open in place of the plot. There's no empty plot and no "Show table" button, because the button is client-rendered.
33. The note reads "All {n} passed." or "{p} passed, {f} failed, {e} empty." (zero parts omitted). With no CI runs yet, a dashed "No CI runs yet" frame shows and the note is hidden.
34. n counts runs with a value, and first/last are the first and last runs with a value. If the latest run has none, the caption adds "The latest run had no tests."
35. Always 3. The live-update scenario now slices to 3 rows.

**Live feed**
36. The note reads "10:42 UTC", with the full timestamp in `title`. Landing is updated.
37. Drawn (section 04, PHONE HEADER · 390): row 1 is the wordmark, Live and the theme toggle; row 2 the nav. Page mocks can't express the breakpoint with inline styles, so the drawing is canonical.

**Time**
38. Confirmed: "22 Sep 2026, 04:37 UTC".
39. They may differ: marker and silent counts are elapsed 24-hour periods, while relative times are calendar points. They no longer meet, because a stale card shows a date (item 14).

**Test history**
40. components.md "Test history page" gives each tile's value, window and sub-line from data. Platform keys are shown verbatim ("jvm", "ios-sim"), since there's no display-name data. Test History's tiles now use the templates.
41. Headline "Platform mismatch in {k} run(s) · {run}, {when}", shown when any run in the strip has a mismatch. "New · first seen {relative time}" shows within 7 days of the first result.
42. The strip note is "Last {n} runs, oldest on the left" ("One run so far" for one). The prose paragraph is removed.
43. Removed. The strip and its panel carry the same data.
44. A mono module tag before the layer tag ("composeApp", "shared").
45. "Default branch · last 30 CI runs (imported history has no durations)".
46. Amber diamond, "Flaky run" in tooltip and accessible name (tp-charts.js `marks` status `flaky`). Test History passes it.
47. A test only exists once a CI run reported it. When all its results are pruned, the Pruned notice replaces strip and chart. NotFound's primary for a test in a project with no run is "Go to {project}".
48. Under 10 ms reads in whole ms ("4 ms", "<1 ms"). When every value is under 10 ms, the axis uses whole-ms steps. When min = max: "Held at {v} over the last {n} runs." Applied in tp-charts.js and Test History.
49. 22 × 24, canonical, with `--shadow-card`. Test History corrected.

Files changed in v8: Design System.dc.html, Landing.dc.html, Kiosk.dc.html, Project Page.dc.html, Run Detail.dc.html, Test History.dc.html, Privacy.dc.html, NotFound.dc.html, Admin.dc.html, How Its Tested.dc.html, tp-charts.js, tp-kit.js, design/README.md, design/components.md, design/data-map.md.

## Changes in v9
Same rules: the Design System page is canonical, components.md matches it, every target is 44 px. Nothing else was changed.

**Dates in chart tables**
1. TrendChart tables now have a **When** column between Run and the values, in `<time datetime>` with the standard title: "22 Sep, 04:37 UTC", or "12 Dec 2025, 04:37 UTC" in another year.
   - Column: label "When", left-aligned, auto width, `--ink-2`.
   - Wrapping: date and time are separate nowrap pieces, so a narrow table wraps between them ("22 Sep," / "04:37 UTC"). Value columns never wrap.
   - 390 px: the card leaves a ~292 px frame. Below 560 px the table is compact (13 px, cell padding 0 6, When always two lines): ≈ 264 px, which fits the ~273 px left after a classic vertical scrollbar. With three or more series it scrolls sideways. The frame is 320 px tall.
   - Rows are 44 px tall.
   - No-JS: the same table, with When and links, is rendered open in place of the plot.
   - Bars have no When column; their Day column is already the date.
   - New props: `whens`, `hrefs`, `nowYear`.
   - Drawn: Design System section 12 ("TABLE OPEN", desktop and 390).
   - Wired: every Project page chart, including each coverage module, and Test History's duration chart.
2. Only the Run cell is the link. A row can't be one link without JavaScript, and the cell text is the link's name.
   - Link: `<a>` filling the cell, 44 px, `--ink` 500.
   - Hover: the row turns `--raised` and the Run text is underlined.
   - Focus: 2 px `--ink` ring inset by 2 px, so the scroll frame doesn't clip it.
   - Imported rows: plain `--ink-2` text with no hover (drawn: the three oldest rows).
   - Private projects link the same way.

**True-today copy**
3. Privacy.dc.html now has a `phase` tweak.
   - **today** (default): nothing is recorded, no cookies, no analytics. It covers:
     - one Supabase Realtime WebSocket. Supabase sees the IP address under its own policy, and no connection is opened without JavaScript.
     - the theme stored in localStorage only after the toggle.
     - Vercel's and Supabase's own logs, which aren't described.
     - "If this changes".
   - **after Phase 6**: the lede, the summary cards and three tracking sections switch in. They say "stores a salted hash, never the address" instead of "no raw IP addresses".
   - Live updates, Theme and Hosting stay in both versions.
   - "Updated {date}" sits under the h1 and changes with the copy. The Phase 6 copy ships in the same PR as tracked links.
   - Rules are in components.md "Privacy page".
4. How It's Tested rewritten so every claim is true now:
   - Hero no longer says it reports itself.
   - Strategy table: Unit (90% line floor), Contract (runs in the unit job, counted as Unit), Integration (local Supabase, anon-client RLS), E2E (seeded pages, no-JS pass), Accessibility (axe + contrast check), Visual (pinned image) and Leak sweep. The last three count as E2E.
   - Alert rules, bot classification, the prune job, tracked links and admin sign-in are removed.
   - The incident cards no longer mention a daily check or alerts.
   - The self-results footnote now counts contract tests as Unit.
   - Build progress: eight phases, with icon and word per status. It reads spec §17 at build time and is labelled "As of 30 Sep": Phases 0–4 done, 5 in progress, 6–7 planned.
   - What changes with Phases 5, 6 and 7 is in components.md "How it's tested page".

**v8 leftovers**
5. Converted:
   - Test History: runs use relative time, dated from 28 days ("2 Sep").
   - Test History Runs tile: "since {date}".
   - Design System timeline: "1 week ago", "4 weeks ago", then "22 Aug".
   - Admin: "1 week ago".
   - Landing and Kiosk feed rows: "1 week ago".
   - The stale card keeps its date (v8 item 14).
   - Helper: `TPKit.relDays` / `shortDate`.
6. Every latest run empty: "0" + "automated tests on the latest runs. The latest runs of A, B and C had no tests, so nothing is counted." Name lists everywhere: "A", "A and B", "A, B and C" (no Oxford comma).
7. They now agree:
   - Page variant: server-rendered HTTP 503; "Try again" is a link to the same URL (`retryHref`) and there is no `onRetry`.
   - Inline variant (client-side only): keeps its `onRetry` button.
   - Fixed in the Landing error mock, Design System section 13 and components.md.
8. "<1 ms". A stored 0 means under 1 ms; tp-charts now matches the caption. Axis ticks at 0 still read "0 ms" / "0 s".
9. "Oldest on the left". The label under the strip already gives the count ("39 runs ago", or "Last 27 runs" when fewer fit), so the note is true at every width.
10. `tests.first_seen_at` (survives pruning).
11. "The latest run's tests were all skipped."
12. Drawn:
   - Section 11: "No CI runs yet" strip; flaky list with both rate texts ("Failed 3 of last 40 runs", "Flipped on 2 commits in 30 days").
   - Section 10: private failure heads (two platforms, no message, one notice).
   - Section 14: NotFound "test, project has no runs" with primary "Go to Ostomate2", also a new NotFound `kind`.
13. Fixed. At most one mark per run, priority failed/error > flaky > empty.
   - Placement: the mark sits on the series of the platform that produced it (`marks[].series`). If that series has no value there, it goes on the first series that has one.
   - A failure on platform 2 where platform 1 didn't run is now marked on platform 2.
   - No mark only when no series has a value.
   - Test History passes `series` and the priority.
14. Corrected: pruned rows appear only on the project page run list. Each project's 5 newest runs are never pruned, so the landing feed never shows one.
15. "1 run, passed." / "1 run, failed." / "1 run, empty."
16. Added to the Design System (section 11, "TEST HISTORY HEADER TAGS"): module tag mono 13, padding 3×10, radius 6, 1 px `--line-strong`, beside the layer, Flaky and New pills.

**Owner decisions**
17. Relative time rewritten hours-first: under 1 min, under 1 h, under 24 h (always "{h} h ago", even across midnight), then UTC calendar days ("yesterday" only once 24 h have passed; 2–6 days; weeks), then the date from 28 days.
18. Test History's duration chart now takes the project's last 30 default-branch CI runs. A run where a platform has no result is a gap in place, and older runs never fill it.
   - Scope: "Default branch · last 30 CI runs (imported history has no durations)" on Test History, the Design System (both duration charts) and in components.md.
   - Skipped gaps read "Skipped", missing ones "Not run".

Files changed in v9: Design System.dc.html, Privacy.dc.html, How Its Tested.dc.html, Test History.dc.html, Project Page.dc.html, Landing.dc.html, Kiosk.dc.html, Admin.dc.html, NotFound.dc.html, tp-charts.js, tp-kit.js, design/README.md, design/components.md, design/data-map.md.

## Changes in v10
Same rules: the Design System page is canonical, components.md matches it, every target is 44 px. Nothing else was changed.

**A. Owner decisions**
1. Every page mock now draws the two-row phone header: row 1 has the wordmark with the tools at the right, row 2 the nav. Updated: Landing, Project Page, Privacy, How It's Tested, Test History, NotFound.
   - The tools sit absolutely at the top right. A zero-height spacer of the tools' width ends the nav, so the nav wraps to row 2 by itself and then gets the full width there (Projects and How it's tested on one line).
   - Desktop is unchanged.
   - Rule in components.md (SiteHeader).
2. "Live" removed from Test History, How It's Tested and Privacy; it stays on Landing and Project Page. NotFound never had it.
3. Ostomate2 now counts its Maestro flows: 12 E2E (7 Android, 5 iOS). This adds two reports, android/e2e/emulator and ios/e2e/ios-sim.
   - Total 154: 142 + 12, derived from your figures.
   - Project Page: pyramid E2E bar; Declared suites card hidden when empty; caption "…The 12 Maestro flows (7 Android, 5 iOS) count as E2E."; run and run-list figures 154 / 153 of 154; tests chart ends at 154.
   - Landing: Ostomate2 card has no "Not counted" footer; hero 1,202; pass rate "1,201 of 1,202".
   - RouteServe keeps the declared-suite example, now named "Maestro E2E (iOS) · 13 flows · Authored, not yet executed".
4. Ostomate2 "Tested with" now has a "Static analysis" group (detekt, ktlint, SwiftLint) and the E2E tag "Maestro 2.11.0".
5. No change: hours-first, UTC, 24-hour, "UTC".
6. How It's Tested copy as built:
   - Accessibility row: tools "axe, Playwright, contrast script"; text as given.
   - Component row added (Vitest, jsdom).
   - Pyramid note starts "The axe, visual and leak-sweep checks…".
   - Build progress footnote dropped. "As of" is the phase file's date, 4 Oct, with Phase 5 now Done.
   - components.md "How it's tested page" rewritten.
7. Privacy: sentence as given; summary-card titles are `h2` (serif 20).
8. ErrorState page note now says HTTP 200, in components.md (ErrorState and Landing hero) and the Design System section 13 note.
9. Confirmed: `reports.received_at`. Added to data-map.md (v10).
10. Strip notes count every run in the window on the server. Updated in components.md and data-map.md.

**B. Chart rules**
11. Confirmed and in tp-charts.js: left margin = max(56, ceil(8 + widest y label)), phone 44.
12. Confirmed and in tp-charts.js: the `sec` step is whole hundredths, never below 0.01 s.
13. Replaced:
   - The start label goes 18 px below its point.
   - If that hits the axis or the floor label, it goes 10 px above.
   - If both positions collide, it is dropped; the caption already states the first value.
   - Start, end and floor labels carry a 3 px `--surface` halo, so a line crossing a label never cuts its digits ("93.6%" stays whole).
14. Whole ms under 10 ms everywhere ("1 ms", 0 → "<1 ms"); "0.41 s" from 10 ms. Test History's tile and panel formatter is updated.
15. Confirmed all four; the Project Page coverage charts drop their date labels to match. The dates are in the table's When column.

**C. Gaps**
16. Confirmed all. Written into components.md "Landing hero": "its latest run", the all-skipped sentence, k spelled out, "{names} haven't reported yet.", "automated tests so far.", and the stale date from any branch.
17. Confirmed: the No projects card replaces the About section too.
   - Error copy: "Results couldn't be loaded" + "The database isn't answering, so nothing is shown rather than numbers that might be out of date. Try again in a minute." (Landing mock updated).
   - Project switcher with no projects: one non-link line, "No projects yet".
   - Name lists: plain names always join with "and"; " · " only where each name carries its own figure.
18. Replaced the Failed reading: the tile counts runs drawn Failed in the strip (final failed or error). A flaky run counts as Flaky, never Failed, so RouteServe reads 3 on the tile, the strip and the flaky list.
   - New pill: confirmed, 7 UTC calendar days.
   - Mismatch: confirmed, the run page's rule; a private run is named as runTitle names it.
19. Fixed: an extra closing tag after the run panel closed the page container early. The Duration card and footer now sit inside it and inherit Public Sans.
20. Confirmed all six. Changes to match:
   - Design System: the empty-run card has one sentence; the private heads use bare platform keys and the standard dashed private notice.
   - Run Detail: drops "0 passed"; "Failures first, then by suite" moves to the end of the filter row.
   - components.md "Run page" covers Started wrapping and pruned rows keeping their when slot.
21. components.md is right in every case:
   - Strip note: Project Page is now 13 px `--ink-3`.
   - "No CI runs yet": the Design System drawing keeps its scope line.
   - Header tags: already 14 px with 8 × 14 gaps in Test History.
   - Lede: the clamp already gives 20 px on phone (written down).
   - Underlines: breadcrumb links on Project Page, Run Detail and Test History; the footer's current "Privacy".
   - Privacy body: 16.5 / 1.7 (written down).
22. Drawn (How It's Tested, "reporting (sample)"):
   - Results card full width.
   - A full-width "Coverage against the floor" card below it: canonical card frame, h3, scope line, CoverageBar rows in module-key order, values rounded down, below-floor rows amber (one sample row, src/app 89.7%, shows it).
   - Module names and values are SAMPLE.

Files changed in v10: Landing.dc.html, Project Page.dc.html, Privacy.dc.html, How Its Tested.dc.html, Test History.dc.html, NotFound.dc.html, Run Detail.dc.html, Design System.dc.html, tp-charts.js, design/README.md, design/components.md, design/data-map.md.

## Changes in v11
Same rules: the Design System page is canonical, components.md matches it, every target is 44 px. Nothing else was changed.

**A. Self-reporting**
1. How It's Tested now opens in the reporting state (the tweak defaults to "reporting"; "not reporting yet" is kept for an outage). New copy:
   - Lede: "testpulse is built test-first. Its own CI runs every suite on every pull request and reports the results here, alongside everything else."
   - Section 04: "Since 7 Oct, testpulse's CI posts its results … through the same shared GitHub Action Ostomate2 and RouteServe use."
   - Not-reporting copy: "No results received yet." (no phase reference).
   - Phase list (docs/build-progress.json, "As of 7 Oct"): 0–5 Done; "Self-reporting (moved ahead of Phase 6)" Done with no phase number; 6 Alerts, tracked links, admin; 7 Launch. Build progress is now its own card at the end of section 04, shown in both states.
   - Updated in components.md "How it's tested page" and data-map.
2. Coverage card redrawn with exact CoverageBar rows (128 grid, 6 track, 2×14 marker, nowrap with ellipsis, below floor = arrow + amber value, bar stays ink). One real row: unit 99.4%, floor 90% (3,125 of 3,141, rounded down), with "3,125 of 3,141 lines covered in the unit job." data-map v11 has rows for the coverage and results cards.
3. Strategy table:
   - Contract: "The shared GitHub Action every project reports through…".
   - Unit: "API key hashing" replaces "token and key utilities". Design-token checks are the contrast script; tracked-link tokens are added with Phase 6.
   - Component tools: Vitest, Testing Library, as built.
   - The pyramid gains a Component layer.
   - Results card shows real figures only, in executions: total 3,245 "test executions in 10 reports"; pyramid E2E 882 (3,245 − 2,183 − 180, eight Playwright reports), Integration 180, "Unit + Component" 2,183 (one row: they share the unit job's report). It moves to distinct tests once those are published.
   - Note: each Playwright project reports separately.
4. Principle 02 now names testpulse's own Vitest and Playwright output.

**B. Contradictions**
5. components.md flaky-list rate: n counts runs drawn Failed; a flaky run is never Failed, anywhere. Also in data-map v11.
6. Design System section 13 ErrorState uses the new body.
7. Tag row: components.md wins (14 px, 8 × 14); the Design System drawing is updated. Strip note: 13 px; Test History is updated.
8. Picked as built:
   - Heads: line 249's public head, "{platform} · {Failed|Error} · {time}" with a bare key.
   - Notice: line 251's title "Details hidden: private repository" + two sentences.
   - Updated: the Design System sample, the line 331 Notice "uses" and line 356.
9. Run Detail and Admin now draw the two-row header (toggle only, no Live).
10. Ostomate2 is 157 distinct tests in six reports, with keys android-e2e/e2e/android-emulator and ios-e2e/e2e/ios-sim.
   - Project Page: platforms line, "The six together make one run", footer "Counted once per distinct test across reports", pyramid 106/29/10/12, figures 157 / 156 of 157.
   - Landing (hero 1,205), Kiosk and Design System samples follow.
   - components.md (platform split, declared examples now RouteServe, hero example) and data-map (hero, card, per-report rows) updated.
11. data-map now names docs/build-progress.json (dated by its asOf) in both places.

**C. Owner decisions**
12. tp-charts.js now keeps the 1, 2, 2.5, 5 candidates and skips any that isn't a whole number of hundredths (or is under 0.01 s), so 0.025 is skipped for 0.05, not rounded to 0.03.
13. "Static analysis" kept.
14. The Landing "loading" scenario is removed from the tweak and the logic. data-map's footer now reads max(reports.received_at), and runs are dated by received_at.

**Assumptions to check**
- Ostomate2's +3 tests (154 → 157) are placed on Unit, and the shared reports read 85; the brief gives only the total.
- The results card's status and "12 min ago · main · 8d3e1a2" meta stay SAMPLE; every count on it is real.
- Self-reporting appears in the phase list as its own Done row with no phase number.

Files changed in v11: How Its Tested.dc.html, Project Page.dc.html, Landing.dc.html, Kiosk.dc.html, Test History.dc.html, Run Detail.dc.html, Admin.dc.html, Design System.dc.html, tp-charts.js, design/README.md, design/components.md, design/data-map.md.

## Changes in v12
Same rules: the Design System page is canonical, components.md matches it, every target is 44 px. Nothing else was changed.

**A. Owner decisions**
1. The How It's Tested results card now counts distinct tests: Unit 1,528, Component 655, Integration 180 and E2E 235, total 2,598.
   - Unit and Component are separate rows.
   - The sub-line is back: "tests · 0 failed · 0 skipped · 6 min". The duration is SAMPLE, under the card's existing SAMPLE meta.
   - The pyramid note has no literal figures: "Each test counts once, in the layer testpulse's layer rules give it, whichever report it arrived in."
   - Updated in components.md "How it's tested page" and data-map v11.
2. The Self-reporting row is removed. The list mirrors docs/build-progress.json's phases 0–7: Phase 6 "Alerts, tracked links, admin" In progress, Phase 7 "Launch" Planned.

**B. Partly done**
3. components.md now says "Vitest, Testing Library" everywhere, and the pyramid note says "the Action's contract tests".
4. data-map (Flaky list row and v10/v11 notes), components.md flaky rate and Failed tile now agree: Failed = final failed or error on any platform, not part of a flip. Either side of a flip (same commit, a pass and a fail on one platform, within or across runs) is Flaky, never Failed.
5. Live numbers applied, and every layer sum equals its total.
   - Ostomate2: 160 = 110 + 30 + 10 + 10, six reports (61, 88, 8, 51, 86, 5), no declared suites. Platform split "jvm 149 · android-emulator 8 · ios-sim 142". Caption: the 10 Maestro flows count once each.
   - RouteServe: 1,044. Unit is 607 so the layers sum, and the backend report reads 497.
   - testpulse: 2,598.
   - Hero 3,802 "across three projects". Tiles: Projects reporting 3 of 3, Projects passing 3 of 3, runs per project with testpulse. Failed, empty and stale scenarios: 2 of 3, "3,801 of 3,802", and "RouteServe and testpulse only".
   - Landing has a third card, testpulse.
   - Updated: Design System (Ostomate2 card, hero specimen 3,802, count specimen 1,044, a new "TESTPULSE · PASSED" card, a testpulse pyramid; the mixed-declared sample moved to RouteServe), Landing, Kiosk, Project Page, components.md and data-map.
6. Leftovers:
   - Landing: the loading markup and `isLoading` are removed.
   - Review: lists the "no projects" scenario and "reporting (default) / not reporting yet".
   - data-map: the strip row and the time rule name `received_at`. Runs have no `created_at`.
   - How It's Tested: the comments now name docs/build-progress.json and the SAMPLE comment is gone.
   - Kiosk: "0 skipped."

**C. New**
7. Admin: the testpulse row reads "12 min ago", "✓ In sync", key `tp_••••••••••••4hQx`, with "Rotate key" like the others.
8. Build progress has one heading. The visible label is now the card's h3; the hidden one is gone.
9. One private notice everywhere, following Run Detail (13.5 px, margin 4). The title is now `--ink-2` per the Notice spec: Design System sections 10 (both), Run Detail and components.md.
10. Per module: "unit: 3,125 of 3,141 lines covered." No job name, because coverage is stored per module (data-map v11).
11. The data-map "## v11" block has a table header.

**Assumptions to check**
- The eight Playwright report counts on testpulse's card split its 882 executions evenly (one 112, seven 110). That split, the card's "6 min", "12 min ago" and commit are SAMPLE. Landing names them in its SAMPLE line in every scenario, and the Design System card label says so.
- RouteServe's −4 (1,048 → 1,044) is taken from Unit and the backend report; only the total is live.
- Kiosk still draws two project cards (its 1080 layout fits two). Its figures include testpulse. Say if it should show a third card.

Files changed in v12: How Its Tested.dc.html, Landing.dc.html, Kiosk.dc.html, Project Page.dc.html, Design System.dc.html, Run Detail.dc.html, Admin.dc.html, Review.dc.html, design/README.md, design/components.md, design/data-map.md.

## Changes in v13
Same rules: the Design System page is canonical, components.md matches it, every target is 44 px. Nothing else was changed.

**A. Owner decision**
1. The kiosk is rearranged for three cards.
   - Stage gap 22. A hero band runs across the top: total 116 px; "Tests on the latest runs" and the note; three stacked tiles (label 24 above, value 48 below, min width 240).
   - Below it, three equal card columns: 1,792 / 3 with gap 28 = 578 px, 512 inside.
   - Card sizes now fit that width: padding 26×30, name 52 (the Private tag wraps under it if needed), total 88, layer labels 24 (wrapping to two lines with four layers), coverage grid 200 / 1fr / 110 with gap 16 ("packages/shared" fits at mono 22), coverage block 20 below with row gap 10, footer padding 14 0 16. Layer counts use thousands separators.
   - The vertical spacing was tightened (18–22 between blocks) so the tallest card, RouteServe with three coverage rows, fits the 1080 height.
   - testpulse card: Unit 1,528, Component 655, Integration 180, E2E 235, unit 99.4% floor 90%. Its time, commit and duration are SAMPLE, as on Landing.
   - The feed now reads Ostomate2, testpulse, RouteServe by recency.
   - All four scenarios use this layout.
   - The kiosk's coverage formatter rounds down now; it rounded testpulse to 99.5%.
   - Design System: kiosk cards are drawn at 578 px, a testpulse kiosk card is added, kiosk tiles use the stacked form, and the tile figures cover three projects.
   - Updated in components.md (ProjectCard kiosk, StatTile kiosk, CoverageBar kiosk) and the README Kiosk paragraph.

**B. Leftovers**
2. Run Detail, Ostomate2: 160 tests in six reports with the live keys and counts (received times and durations SAMPLE); 159 of 160 in the failed sample.
   - RouteServe: run total 1,044 distinct tests; reports 501 / 428 / 119 = 1,048 executions.
   - The foot strings the brief quotes are data only. The reports-table foot was removed from the page in v8 (item 25), so nothing renders them. They are corrected anyway ("Reports add up to 1,048 executions; the run counts 1,044 distinct tests…").
   - Rule (data-map v13): the reports table shows executions per report, and the header and totals show distinct tests.
   - Landing and the Design System had RouteServe's backend at 497; it is now 501.
3. Fixed:
   - Landing and Design System "reports: 4" → 6.
   - Design System "118 to 142" → "118 to 160", and its series now ends at 160.
   - The Project Page comment.
4. The spec's wording is written into components.md (flaky rate and Failed tile) and data-map. A flip is a pass and a fail on one commit and platform, in default-branch CI runs of the last 30 days, including inside one run. Pull-request or older pairs aren't flips, so their failing side counts as Failed.
5. Rule reworded: tones only group, and the labels carry the meaning. Shared tones may sit side by side (testpulse's Integration and E2E); the 3 px gap separates every segment.

**C. Run duration**
6. One format, whole seconds rounded down:
   - Under 60 s: "27 s".
   - Under 60 min: "{m}m {ss}s" ("1m 48s"; 694 s → "11m 34s"; 1073 s → "17m 53s").
   - 60 min and over: "{h}h {mm}m".
   - Helper `TPKit.runDur(ms)`, in components.md "Run duration" and data-map v13.
   - "6 min" is replaced by "11m 34s" on Landing, the Design System and How It's Tested. Test durations keep the `sec` format.

**Assumptions to check**
- RouteServe's mobile and shared reports (428, 119) are the split the Landing mock already used. Only the backend's 501 and the 1,048 sum are from the brief.
- testpulse's "11m 34s" uses the 694 s you quoted from the build; it's still tagged SAMPLE.
- The kiosk fit is worked out from the sizes; it still needs a look at 1920×1080 in each scenario.

Files changed in v13: Kiosk.dc.html, Design System.dc.html, Landing.dc.html, Run Detail.dc.html, How Its Tested.dc.html, Project Page.dc.html, tp-kit.js, design/README.md, design/components.md, design/data-map.md.

## Changes in v14
Same rules: the Design System page is canonical, components.md matches it, every target is 44 px. Nothing else was changed.

1. By rule, kiosk tiles have no sub-line. Anything a web sub-line says goes into the label.
   - Latest run empty, none red: label "Ostomate2 last run empty".
   - No runs yet: label "No runs yet", value "0".
   - components.md StatTile kiosk and the Kiosk Projects passing line are updated.
   - Design System kiosk tiles: the sub-lines and the "Runs in last 30 days" tile (not a kiosk tile) are removed, and the note is rewritten.
   - The 18 px headroom is unchanged.
2. Failed scenario feed is now by recency: Ostomate2 4 min (failed), testpulse 12 min, RouteServe 2 h.
3. Confirmed your proposal:
   - The y axis keeps whole-second ticks ("660 s").
   - Tooltip, table and end label use the run-duration format, via tp-charts.js `dur`.
   - The caption follows the same format ("Between 10m 58s and 12m 22s over the last 30 runs. Median 11m 34s.").
   - Specimen added: Design System section 02, "RUN DURATION" (27 s, 11m 34s, 17m 53s, 1h 05m).
4. Run duration is the sum of the reports. I set Ostomate2's six sample report durations to add up to its live 694 s: 52 + 41 + 298 (4m 58s) + 47 + 38 + 218 (3m 38s).
   - The Run Detail header reads 11m 34s, so it agrees with the reports and with item 5's card.
   - Your 6m 35s would have contradicted the card for the same run (0e2d0b4).
   - The failed sample run uses the same reports, so it is also 11m 34s.
5. Ostomate2 reads 11m 34s on its card, feed rows, Project Page run, run list and failed run, on Landing, Kiosk and the Design System.
   - Its duration chart is rescaled around 694 s (SAMPLE spread) with the new caption.
   - testpulse reads 17m 53s on Landing, Kiosk, How It's Tested and the Design System.
   - Other sample Ostomate2 runs: 11m 21s, 11m 46s.
6. Leftovers:
   - Spec §11 flip wording is now in components.md (flaky-list n = 0 row and Flaky tile) and data-map (StatusTimeline flaky cells).
   - Design System empty-run card: "6 reports arrived".
   - Loading value bar: 120×48 in components.md.
   - RouteServe's reports foot now reads only "Reports add up to 1,048 executions of 1,044 distinct tests." (data-map v13 says the same).

Files changed in v14: Kiosk.dc.html, Run Detail.dc.html, Landing.dc.html, How Its Tested.dc.html, Project Page.dc.html, Design System.dc.html, tp-charts.js, design/README.md, design/components.md, design/data-map.md.

## Changes in v15
Same rules: the Design System page is canonical, components.md matches it, every target is 44 px. Nothing else was changed.

1. The Project Page uses the one notice; there is no separate component.
   - Lock, title "Details hidden: private repository" (14.5/600 --ink-2), then one body (13.5/1.5 --ink-2, 4 below), in a dashed --line-strong box on --inset.
   - The body is now one copy that is true on both pages: "This repository is private, so failure messages, stack traces and source links are hidden. Test names, counts and trends are real."
   - Updated on the Project Page (max width 620), Run Detail, Design System sections 10, 11 and 13 (the NOTICE row now reads "neutral + lock + title"), and components.md (Notice uses, ResultRow private).
2. Confirmed as built: "No projects yet" in the Projects menu.
   - 14 px --ink-3, 44 px tall, with the items' 12 px side padding, text vertically centred.
   - It isn't a link and isn't focusable.
   - Written into components.md.
3. Sample slips:
   - Ostomate2's card reads 11m 34s on Landing, Kiosk and the Design System.
   - components.md "Flaky meaning" now uses spec §11's wording.
   - Design System "Showing 6 of 160". The same drawing's filter note (160 · 159 · 1) and pruned summary (160 tests, 159 passed, 1 failed) also read 142 and are corrected.
   - Run Detail's Ostomate2 foot: "Reports add up to 299 executions of 160 distinct tests."
   - The duplicate kiosk loading-bar statement at components.md:92 is removed.
   - Project Page flaky caption: "Flaky: passed and failed on the same commit and platform, in default-branch CI runs of the last 30 days." Its empty state now says "in default-branch CI runs". The Test History caption now says "within default-branch CI runs of the last 30 days".

Files changed in v15: Project Page.dc.html, Run Detail.dc.html, Design System.dc.html, Landing.dc.html, Kiosk.dc.html, Test History.dc.html, design/README.md, design/components.md.

## Changes in v16
Same rules: the Design System page is canonical, components.md matches it, every target is 44 px, existing tokens only (no new token). Admin is drawn in Admin.dc.html and its parts are specimens in the new Design System section 15. components.md has a new "Admin" section with the full spec. Admin.dc.html tweaks: view, detail, states (live / validation / busy / errors), alerts, sync, job, theme. Below a 760 px content width, every Admin table becomes a card list; check at 390 in both themes.

**A. Sign-in**
1. The form: an Email field and a full-width "Send sign-in link" button (view "sign-in").
   - Busy: "Sending…" (view "sign-in · sending").
   - Invalid address: "Enter an email address, like name@example.com" (view "sign-in · invalid address").
2. One neutral message for every address: "Check your email". "If that address can sign in, a link is on its way. It expires in 1 hour." (view "link sent").
3. Link expired or used: an attn notice above the form, "That sign-in link has expired or was already used", "Each link works once, within 1 hour of being sent. Send a new one below." (view "link expired").
4. Not allowed: refused card "This account can’t open admin" naming the signed-in address, with Sign out; nothing else of Admin loads (view "not allowed").
5. Signed out: a pass notice "You’re signed out" above the form (view "signed out"; Sign out also goes there).

**B. Tracked links**
6. Per-link detail, opened by the company name in the table (tweak detail).
   - Breadcrumb, h1 company, role.
   - Details: contact, lead project (lock if private), sent date, notes.
   - The link with Copy.
   - Tiles: First seen, Last seen, Sessions (distinct session cookies), Visitors (distinct salted IP hashes).
   - Pages viewed with views and time; time per project.
   - Delete link with a danger confirm: "The link stops working. Its visit history is kept, unlinked from this company and role."
   - Not yet opened: tiles at "—"/0 and a dashed notice.
   - Footnote fixed here and under the table: "Sessions are distinct session cookies; visitors are distinct salted IP hashes. Bot and link-preview visits are never counted."
7. Table:
   - SENT comes from `sent_on` ("18 Sep"; a new link shows its own date).
   - Notes show as a one-line excerpt with a note glyph and a hidden "Note:" label, with the full text in the title.
   - On phone the table becomes cards. The detail view stacks on phone.
8. Create form:
   - Notes is wired.
   - New Sent date field (type=date, defaults to today UTC).
   - "Company is required", drawn like the contact error (states "validation").
   - Submitting: "Creating…", fields disabled (states "busy").
   - Server error notice: "Nothing was saved; your entries are still here." (states "errors").
   - The lead select lists every project; a private one reads "RouteServe (private)" and shows a lock with "Private: the visitor sees counts and trends, never failure text." when chosen.
9. Clipboard refused: an attn line "Your browser blocked copying. Select the link and copy it." with a read-only field holding the URL, selected on focus. Live it appears whenever the clipboard rejects; states "errors" forces it on Acme.

**C. Alerts**
10. All four kinds drawn, each with a glyph and a kind word, in the attn tone:
    - stale (clock)
    - count_drop (trend-down), with your example copy; it replaces "last 5 runs averaged 50"
    - empty_run (dashed ring)
    - coverage_below_floor (arrow-down)
    - Each row's meta line says how it closes.
11. Acknowledge appears only on count_drop.
    - Busy: "Acknowledging…".
    - Error: "Couldn’t acknowledge. The alert is still open. Try again."
12. Open alerts only. data-map Alerts row rewritten.

**D. Projects**
13. Masked key column removed. The intro says keys are stored only as a hash.
14. Rotate key: busy "Rotating…" in the confirm. Error notice: "Couldn’t rotate the {name} key. The current key still works." with Try again.
15. "Issue in Phase 7" branch removed. A Not registered row has no row and no key, so it shows "No row, no key" instead of Rotate.
16. The four sync states are drawn (tweak sync "every state"; the two extra rows, demo-shop and routeserve-legacy, are SAMPLE):
    - ✓ In sync
    - ≠ Differs, with a field list
    - + Not registered
    - ? No YAML
    - data-map Sync status rewritten: computed on page load.

**E. Daily job**
17. Tiles read the run summary:
    - Last run
    - Heartbeat
    - Stale check ("1 opened · 0 closed")
    - Prune ("Results 0 · failure text 0 · visits 0 · rate-limit buckets 12")

    Job states (tweak job):
    - Overdue (> 36 h): an attn warning notice plus an attn Last run tile.
    - Never run: a neutral notice, tiles "Never run".
    - Failed partway: a fail notice naming the step and error; "✕ Failed at prune" and a failed Prune tile.

    The intro now states retention: results and failure text 180 days (5 most recent runs kept), visits 365 days, expired rate-limit buckets. data-map Scheduler row is replaced by "Daily job".

**F. Page states and other pages**
18. Admin page states:
    - Loading: headings over skeleton blocks (view "signed in · loading").
    - Error: ErrorState "Admin couldn’t load" with Try again (view "signed in · error").
    - Session gone (401 on an action): an attn alert "Your session has ended" with Sign in again; the form keeps its values (view "session expired").
19. components.md "Admin" covers sign-in, page states, the alert row, the table, the create form, the link detail, the projects table and the job tiles, including all confirms.
20. Landing: the tracked visitor's lead project card moves to the front; nothing else changes and nothing names the company or the tracking (Landing tweak visitor). components.md "Landing: tracked visitor", data-map v16.
    - Question, not drawn: should the project switcher and the run feed also lead with that project? I'd leave both as they are, because order alone is enough and a changed feed would misstate recency.
21. Privacy after Phase 6: "Visit records are kept for 365 days, then deleted." ends "How a visit is recorded". In that state the Updated date carries a SAMPLE tag: "the build fills in the day this copy ships".
22. How It's Tested: new tweak phase "after Phase 6".
    - Unit, Integration, E2E and Leak sweep each gain a second sentence for Phase 6.
    - The two incident cards gain their alert sentences.
    - Phase 6 reads Done.
    - components.md lists the exact copy.

**Assumptions to check**
- The schema names `sent_on`, `acknowledged_at`, a job-run summary table, and `visits.tracked_link_id` set null on delete. Correct data-map v16 if the build uses other names.
- Alert and link figures, contacts and dates are SAMPLE.

Files changed in v16: Admin.dc.html, Design System.dc.html, Landing.dc.html, Privacy.dc.html, How Its Tested.dc.html, design/README.md, design/components.md, design/data-map.md.

## Changes in v17
Same rules: the Design System page is canonical, components.md matches it, every target is 44 px, existing tokens only (no new token). Nothing else was changed. Check Admin and NotFound at 390 in both themes.

**Alerts**
1. count_drop meta now reads "Closes when the count recovers, or acknowledge it." (Admin, Design System section 15, components.md "Alert row").
   - components.md says when: a later default-branch report for that key gets back to 80% or more of the count it dropped from.
   - Acknowledge stays, as before.
2. count_drop body uses the report key, like empty_run: "e2e/app/chromium: 235 → 180 tests (−23%) since the previous default-branch run".
   - The key is SAMPLE (it is the key the Design System's testpulse sample card uses).
   - components.md says why there is no layer, and that {p} is rounded down to a whole number ("−20%" for a 20.4% drop). The title uses the same {p}.
3. data-map Alerts row: only ingestion resolves alerts, and the row says which report resolves each kind. The daily job only opens stale alerts. The Daily job row now says "stale alerts opened (names; the job never closes one)".
4. "No open alerts. Every project is reporting on schedule." The daily-job clause is gone (Admin, components.md).

**Daily job**
5. The Stale check tile reads "1 opened" (sub "Opened: RouteServe"); with no alerts, "0 opened".
   - The Admin intro now says the job "opens stale alerts (a report arriving closes them)".
   - Design System section 15 gains a Stale check tile specimen.
   - Updated in components.md "Daily job tiles" and data-map "Daily job".
6. Failed prune:
   - Tile sub: "Removed 5,000 results before failing".
   - Notice: "…stopped with “…” after removing 5,000 results; rows removed before the failure stay removed."
   - Design System tile updated to match.
   - components.md gives the template and says "Nothing removed" is never shown. When nothing was removed it reads "0 rows". data-map adds the removed counts to the failed-run summary.
7. "around 06:00 UTC" everywhere the schedule appears:
   - The Admin intro, the Last run sub ("next around 06:00 UTC"), the never-run notice and the failed-run notice.
   - The Design System tile and components.md.
   - Recorded run times ("8 Oct, 06:00 UTC") are sample timestamps, not the schedule, and are unchanged.

**Projects**
8. Not registered sub-line: "projects/demo-shop.yaml has no database row. Register it with `npm run project:add demo-shop`." The command is mono 12.5 `--ink`.
   - Changed in Admin (desktop and phone), the Design System YAML sync specimen and components.md "Projects table".
9. The phone card for a Not registered project now shows "No row, no key" (13 `--ink-3`) where Rotate would be, as the desktop row does.

**Tracked links**
10. Role is required: "required" beside the label and the error "Role is required", drawn like "Company is required". Contact is now "optional" and has no error.
    - The "validation" state submits an empty form, so both errors show.
    - The link detail shows "—" (`--ink-3`) for an empty contact.
    - components.md "Create form" and "Link detail" updated.
11. data-map: `sent_on` → `sent_at` (a timestamp, read as a date at UTC midnight), in the link detail and SENT rows. components.md's SENT line names `sent_at` too. Nothing visible changes.
12. A page view whose time was never measured shows "—" in `--ink-3`, never "0 s".
    - Drawn on Acme's "Ostomate2 run" row in the link detail, in Admin and in the new Design System link-detail specimen.
    - Acme's Ostomate2 time per project is now 6m 52s, the measured views only.
    - Written into components.md "Link detail" and data-map.

**How it's tested**
13. The Phase 6 Unit sentence now reads: "The alert detail schemas; the daily job’s step order and failure handling; the cron route’s secret check; bot and link-preview classification of user agents; tracked-link token generation and lookup."
    - The Integration sentence now opens: "The alert rules (stale, count drop, empty report, below floor), which are SQL, against local Supabase with captured fixtures."
    - "closing stale alerts" is removed. The job sentence keeps "opening stale alerts".
    - Updated in How Its Tested.dc.html and components.md.
14. The incident line now reads "A daily check flags it on the admin page." (How Its Tested, components.md).

**Design System and v15 leftovers**
15. Design System section 15 now has specimens for every Admin part, alongside the alert row, YAML sync and job tiles. They are static markup copied from Admin.dc.html, and they follow the page theme toggle.
    - Sign-in: the form invalid and sending, the expired and signed-out notices, "Check your email", and Not allowed.
    - Tracked links table: a new row, an opened row with a note and the copy-refused line, and a not-yet-opened row showing "Copied". Also its 390 phone card.
    - Create form: validation (Company and Role errors), busy, and the server-error notice.
    - Link detail: details, link, visit tiles, pages viewed with a "—" row, time per project, the not-yet-opened notice and the footnote.
    - Delete and rotate confirms: the button, the confirm, busy and error, and the rotate's new key shown once.
    - With these in place, the v16 note (section 15 holds Admin's specimens) and components.md "Admin" (which now lists them) are true.
16. The Design System StatusTimeline note now ends "Flaky: passed and failed on the same commit and platform, in default-branch CI runs of the last 30 days."
17. The failed-run banner's private line now reads "This repository is private, so failure messages, stack traces and source links are hidden." Changed in the Design System banner, its note, and the Run Detail private failed run.
18. The Files table lists Admin's tweaks: view, detail, states, alerts, sync, job, theme.

**Not-found page**
19. NotFound has a new kind "page" for any other address. It is drawn in Design System section 14 at 1280 and 390, in both themes through the page toggle.
    - h1 "Nothing at this address", path chip "/no-such-page", body "There’s no page here. The link may be mistyped, or the page may have moved. Every project’s results start from the overview."
    - Primary "Go to overview", link "How it’s tested". No breadcrumbs.
    - It has the site header and footer, so the Privacy link is there. In the build it is the app's not-found page, replacing Next.js's default.
    - Added to components.md "NotFound (page)".

**Time on page**
20. The footnote now reads "Time on a page runs until the next page, or until the tab is hidden or closed." Changed in Admin, the Design System link-detail specimen and components.md.

Files changed in v17: Admin.dc.html, Design System.dc.html, NotFound.dc.html, How Its Tested.dc.html, Run Detail.dc.html, design/README.md, design/components.md, design/data-map.md.

## Changes in v18
Same rules: the Design System page is canonical, components.md matches it, every target is 44 px, existing tokens only (no new token). Nothing outside the list was changed. New Admin tweak values: view "session expired · acknowledge", "session expired · rotate key"; detail "Northwind Software (other pages, no sent date)", "unknown link (404)"; job "heartbeat failed", "heartbeat not written", "didn’t finish"; new tweak `links` (off = no links). Every new state is drawn in Admin.dc.html (desktop and phone by width, dark and light by the theme tweak) and as a specimen in Design System section 15 (both themes through the page toggle).

**Corrections**
1. "around 04:00 UTC" everywhere the schedule appears: the Admin intro, the Last run sub ("next around 04:00 UTC"), the never-run notice and the failed-run notice. Also in the Design System tile and components.md "Daily job tiles" (including the line on why it reads "around"). data-map had no "06:00" to change.
   - The sample run times moved with the schedule: Last run "8 Oct, 04:00 UTC", overdue "◷ 6 Oct, 04:00 UTC", failed-run sub "8 Oct, 04:00 UTC · 5 h ago", and the stale alert, which the job opens, "Opened 4 Oct, 04:00 UTC". This replaces the v17 note that kept them at 06:00. The relative times are unchanged (5 h ago, 53 hours) because the sample "now" moved too.
2. data-map Alerts row: "Ingestion resolves alerts as reports arrive; acknowledging resolves a count_drop." It is followed by which report resolves each kind, as before.
3. Tracked sessions are pruned with the visits after 365 days:
   - Admin intro: "…visit records and tracked sessions after 365 days…".
   - Prune tile sub: "Results 0 · failure text 0 · visits 0 · tracked sessions 0 · rate-limit buckets 12". Drawn in Admin and as a new Design System tile.
   - components.md lists tracked sessions among the kinds a failed prune reports. data-map lists it in the prune counts and in a v18 row.
   - The on-time sub always lists every kind, zeros included. A failed prune's "Removed {counts} before failing" still lists only the non-zero kinds (v17 rule), so tracked sessions appear there only when some were removed, e.g. "Removed 5,000 results · 40 tracked sessions before failing".
4. Confirmed: a failed prune that removed nothing reads "Removed 0 rows before failing", and the notice says "…after removing 0 rows". Written into components.md and drawn as a Design System tile.

**Admin states**
5. YAML sync Differs with a long or structured field: the field is named without values, "{field} differs". Short fields keep "YAML {a}, database {b}", and all of them are joined with " · ". A field is shown this way when its value is a list or an object, or is over 40 characters.
   - Drawn with sync "every state": RouteServe reads "expected_cadence_days: YAML 7, database 8 · display_name: … · declared_suites differs", and testpulse reads "layer_rules differs". Both appear in the desktop table and the phone card.
   - Added to the Design System YAML specimen, components.md "Projects table" and data-map.
6. Heartbeat states (job "heartbeat failed" and "heartbeat not written"):
   - Failed: fail Notice "The last run failed at the heartbeat step" / "Heartbeat stopped with “fetch failed” before writing its row, so this run didn’t keep the database awake. Stale check and prune didn’t run. The next run tries again around 04:00 UTC." Tiles: Last run "✕ Failed at heartbeat", Heartbeat "✕ Not written" ("Stopped with an error"), and the later steps "Not run" ("The run stopped before this step").
   - Row not written: fail Notice "The last run didn’t write a heartbeat" / "The run finished without an error, but its heartbeat row isn’t in the database…". Heartbeat "✕ Not written" ("No heartbeat row from this run"), other tiles as on time.
   - Added to Design System section 15, components.md "Daily job tiles" and data-map.
7. A run that started and never finished (job "didn’t finish"):
   - fail Notice "The last run didn’t finish" / "It started 8 Oct, 04:00 UTC and never recorded a finish, so it was stopped partway and its step results weren’t saved. Rows a prune removed before it stopped stay removed. The next run tries again around 04:00 UTC; if this repeats, check the cron’s logs in Vercel."
   - Tiles: Last run "✕ Didn’t finish" ("Started 8 Oct, 04:00 UTC · 5 h ago"), the other three "No result" ("Not recorded before the run stopped").
   - Added to Design System section 15, components.md and data-map.
8. The session-expired line names the action:
   - Acknowledge: "The alert wasn’t acknowledged. Sign in again to finish; nothing was changed, and the alert is still open."
   - Rotate key: "The RouteServe key wasn’t rotated. Sign in again to finish; nothing was changed, and the current key still works."
   - The create-form line is unchanged.
   - Drawn as view "session expired · acknowledge" and "session expired · rotate key". All four lines (create, acknowledge, rotate, delete) are in Design System section 15 and components.md "Page states".
9. Pages viewed names: Privacy (`/privacy`), "{project} test history" (`/p/{slug}/tests/…`) and "Other page" for anything else, a not-found address included, with its path under it.
   - Drawn on Northwind Software's detail: Overview, Privacy, "RouteServe test history" and "Other page" `/no-such-page`. Northwind's time per project is now RouteServe 35 s.
   - The full label list is in components.md "Link detail" and data-map.
10. Tracked links with no links (tweak `links` off): a dashed row replaces the table card, "No tracked links yet" / "Use New link to make one for each company and role you send the site to. Its visits show here once it’s opened." The count reads "None". Drawn in Admin and Design System, and written into components.md.
11. Confirmed: no sent date reads "—" in `--ink-3` in the table, the phone card and the detail. Drawn on Northwind (its sent date is now empty) in Admin and Design System, and in components.md and data-map.
12. The LINK column doesn't use the build's "https://…/v/{token}". The new form is "…/v/{token}":
    - "https://…/v/Qm8r2LxT0aZe" is 24 mono characters, about 180 px at 12.5 px, and only about 168 px is left beside "Copied" in the 240 column. The token's end would be clipped.
    - The origin is the same on every row, so it is dropped. The token is never cut.
    - The full URL is in the cell's `title`, in Copy, and in the copy-refused field. The phone card uses the same form. The link detail keeps the full URL, wrapping.
    - Changed in Admin and in the Design System table and phone card specimens, and written into components.md and data-map. The old "fits unclipped" note was removed.
13. Phone header on Admin (content under 760 px): two rows. Row one: wordmark, ADMIN and the theme toggle. Row two: View public site on the left (padding 0, aligned with the wordmark) and Sign out on the right.
    - "Signed in with magic link" isn't shown on a phone, because Sign out already says you are signed in. Signed out, row two holds View public site only.
    - Drawn in Admin by width, and in Design System at 1280 and 390 (signed in and signed out). Written into components.md "Admin".
14. Yes, admin has its own not-found inside the admin frame (detail "unknown link (404)"). It keeps Sign out and doesn't send the owner to the public header.
    - Breadcrumb "Admin / Tracked links / Not found", eyebrow "404 · Not found", "No tracked link at this address", the path chip, "The link may have been deleted, or the address may be mistyped. Every tracked link is listed on the admin page." and primary "Go to tracked links".
    - HTTP 404, title "Not found · testpulse admin". When signed out, the guard shows sign-in first, so nothing reveals whether an id exists.
    - Drawn at 1280 and 390 in Design System, and written into components.md "Page states" and data-map.
15. The sign-in email is written and drawn: subject "Sign in to testpulse admin", preview "The link works once and expires in 1 hour."
    - Wordmark and ADMIN, then "Sign in to admin". Then "Use this button to sign in to testpulse admin. It works once and expires in 1 hour.", the button "Sign in to admin", the paste-the-address fallback with the link, "If you didn’t ask to sign in, ignore this email. Nobody can sign in without the link." and the footer "Sent by testpulse because a sign-in link was asked for with this address."
    - It uses a fixed light palette from the light token values, because email clients ignore the site theme, so there is no dark drawing. It is drawn at 600 and 360 in Design System section 15. components.md "Sign-in" has the HTML and plain-text rules.

**v17 leftover**
16. Confirmed, no change: Design System line 489 (the banner note) and Run Detail line 226 (the private failed run) both read "…failure messages, stack traces and source links are hidden."

Files changed in v18: Admin.dc.html, Design System.dc.html, design/README.md, design/components.md, design/data-map.md.

## Changes in v19
Same rules: the Design System page is canonical, components.md matches it, every target is 44 px, existing tokens only (no new token). Nothing outside the list was changed. Admin tweak changes: job "heartbeat not written" removed; `states` gains "already closed" and "already closed · only alert". Every state is drawn in Admin.dc.html (desktop and phone by width, dark and light by the theme tweak) and as a specimen in Design System section 15 (both themes through the page toggle).

**Daily job: the heartbeat states**
1. Heartbeat failed now shows the only case the page can show: the first write failed and the row was written at the end of the run.
   - Notice (fail, `role=alert`): "The last run failed at the heartbeat step" / "The heartbeat’s first write failed with “fetch failed”; its row was written at the end of the run instead. Stale check and prune finished. The run is recorded as failed and shows as an error (500) in Vercel’s log. The next run tries again around 04:00 UTC."
   - Heartbeat tile: "✕ Failed", sub "First write failed; row written at the end of the run". Last run tile unchanged ("✕ Failed at heartbeat").
   - The three false lines ("…before writing its row…", "✕ Not written" / "Stopped with an error", and data-map's "heartbeat not written") are gone. Changed in Admin (job "heartbeat failed"), Design System section 15 (DAILY JOB · v19), components.md "Daily job tiles" and data-map (Daily job row and the v18 heartbeat row).
   - components.md also says what happens when both writes fail: no row, the previous run stays and turns overdue after 36 hours.
2. In the same state the stale check and prune tiles show their results as usual, and the notice says "Stale check and prune finished." components.md gives the general rule: a later step that also failed is drawn as in Failed partway, is left out of "{steps} finished", and its Failed partway sentence follows; the title names the first failed step. "Not run" was used nowhere else on Admin, so it is removed from Admin, Design System and components.md. (The "Not run" in TrendChart and the status timeline is a test result, not the job, and stays.)
3. Heartbeat not written is removed: from the Admin `job` tweak and its code, the Design System tile and notice, components.md "Daily job tiles" and both data-map rows.
4. Didn’t finish: "15 minutes" is now "5 minutes" in components.md and in both data-map rows, with the reason (the cron function is stopped at 300 s).
5. Didn’t finish names both causes. Notice: "It started 8 Oct, 04:00 UTC and never recorded a finish: either it was stopped partway, or every step ran and only the final save of its results failed. Its step results weren’t saved. Any rows its prune removed stay removed. The next run tries again around 04:00 UTC; if this repeats, check the cron’s logs in Vercel."
   - The tiles' sub "Not recorded before the run stopped" was false in the second case too, so it now reads "Not recorded for this run". The value "No result" is unchanged.
   - Changed in Admin, Design System section 15, components.md and data-map.

**Alerts**
6. A message is right, and it is drawn. When Acknowledge is pressed on a count_drop that already closed by itself, the row is gone after the refresh and a pass Notice takes its place, first in Open alerts under the heading.
   - Wording: "That alert had already closed" / "“testpulse: test count fell 23%” closed by itself when a later report brought the count back, so there was nothing to acknowledge."
   - Tone: the pass Notice already used for "You’re signed out" (check glyph, pass tint, 1px `--pass`). It is `role=status`, not alert, because nothing went wrong.
   - It stays until the page is next loaded. It has no timer, so nobody loses it while reading, and no close button. If it was the only alert, the "No open alerts" row follows it and the count reads "None".
   - Drawn in Admin with `states` "already closed" (other alerts still open) and "already closed · only alert", desktop and phone by width, dark and light by the theme tweak. Design System section 15 has a new ALERT ROW · v19 specimen at desktop and 390. components.md "Alert row" has it beside the "Couldn’t acknowledge…" error, and data-map has a v19 row for its source.

**Admin header and sign-in email**
7. Confirmed: the wordmark goes to `/admin`, and View public site to `/`. Written into components.md "Admin" and the Design System ADMIN HEADER caption. The drawn `href="#"` stays as it is, like every link on the canvas, so clicking in the canvas doesn’t leave the page.
8. The plain-text rule is removed. components.md "Sign-in" now says there is no plain-text part, because Supabase Auth sends the HTML template alone. (The v18 item 15 note above is history and is left as it was.)

**How it’s tested after Phase 6**
9. In the "after Phase 6" tweak, Phase 7 "Launch" reads In progress. Phase 6 reads Done. components.md says so too. The `today` state still shows Phase 6 In progress and Phase 7 Planned. The list still mirrors `docs/build-progress.json`.
10. Unit adds: "…; admin sign-in: the sign-in action’s one neutral answer, the sign-in link’s confirm route, the owner allowlist check, and the guard every admin page and action calls first."
11. Integration now reads "…pruning results at 180 days and visits and tracked sessions at 365. Visit recording, with bots and previews kept out of every count and no raw IP address stored in visits or tracked sessions. Admin sign-in and its actions (create, acknowledge, rotate, delete) against local Supabase Auth with a real session, each refused without one."
12. E2E: "The tracked-link flow: open a link, check its cookie and redirect, see the lead project first, and find the visits stored against the link; nothing the visitor sees names the company, role, contact or token. Admin sign-in with the email opened from a local mail catcher, a spent or made-up link and another address. Admin’s sections with seeded links and visits, each action, and every action refused once the session has gone. The run page’s pruned-results notice, after a real prune."
13. Leak sweep: "Also checks that admin without a session shows only the sign-in form and nothing hidden." The tracked-link claim moved to E2E (item 12).
   - Items 10–13 are changed in How Its Tested.dc.html and components.md "How it’s tested page". The incident sentences are unchanged. The tweak’s default is still `today`, since the build shows the Phase 6 sentences only once v19 is adopted.

Files changed in v19: Admin.dc.html, Design System.dc.html, How Its Tested.dc.html, design/README.md, design/components.md, design/data-map.md.

## Changes in v20
The public name is **Testament** (Bobby, 2026-10-29). Same rules: the Design System page is canonical, components.md matches it, every target is 44 px, existing tokens only (no new token, no new contrast pair). Nothing outside the list was changed. "testpulse" stays wherever it is internal: the repository, code, file names (`tp-kit.js`, `tp-charts.js`), code comments, the GitHub URL and action path, the project slug `testpulse` and its page `/p/testpulse`, the `option value` in Admin, and the Landing `visitor` tweak label "tracked link · lead testpulse" (a canvas control keyed on the slug). The site's future address `testament.helcolabs.com` is noted in components.md; nothing drawn shows an address that changes.

**The wordmark**
1. "testpulse" is now "Testament", with the pun shown by **weight**: "Test" 600, "ament" 400, both `--ink`. No hyphen, divider, space or second colour. Weight was chosen over the accent colour because `--attn` means "needs attention" everywhere else on the site; using it in the name would weaken that signal. Both parts are `--ink` on `--bg` (15.60:1 dark, 15.81:1 light), a pair contrast.md already lists, so contrast.md is unchanged.
   - Screen readers hear "Testament" as one word: the two visual parts sit in one `aria-hidden="true"` span, followed by a visually hidden "Testament" (absolute, 1×1, clipped). In the header the link's name is therefore "Testament". In the sign-in email, where clients strip the hiding CSS, the wordmark is one `<span role="img" aria-label="Testament">` holding the two parts.
   - Drawn in: SiteHeader on Landing, Project Page, Run Detail, Test History, How Its Tested, Privacy and NotFound (desktop and the two-row phone header by width; dark and light by the theme tweak; Phone Views shows all of them at 390 in both themes); Design System section 04 (header specimen, PHONE HEADER, and a new WORDMARK · v20 specimen); the Admin header with ADMIN (Admin.dc.html and the Design System section 15 admin header, phone header and admin not-found specimens); NotFound; the Kiosk header (40 px); the sign-in email specimen (Design System section 15, at 600 and 360).
2. The mark stays. It is a still 10 px `--attn` dot (14 px on the kiosk), not a pulse drawing, so it doesn't depend on the old name and fits "Testament" as it is. (The pulsing dot on the site is the LiveIndicator, which is unrelated and unchanged.)

**The tagline**
3. "A testament to every test." appears in two places:
   - Landing hero: a new line directly above the `h1` lede, in the lede's type (Source Serif 4, clamp(20px, 2.2vw, 24px)/1.3) at weight 500 in `--ink`; the lede below keeps 400 `--ink-2`. It joins the lede; it doesn't replace it, and the lede stays the page's `h1`. Shown in the ready and "no projects" states; not in the error state. Drawn on Landing (desktop and phone by width, dark and light by the theme tweak; Phone Views D1 and L1).
   - Page title: Landing's document title is "Testament · A testament to every test." (written into Landing's `<title>`), and the same string is the social share title (`og:title`, `twitter:title`).
   - Not in the footer: the footer stays Privacy · Source on GitHub · last report, and the tagline already leads the home page.

**Copy that names the site**
4. Every visible "testpulse" naming the site now says "Testament":
   - Page titles: NotFound `<title>` "Not found · Testament"; admin not-found title "Not found · Testament admin" (Design System caption and components.md). The pattern is written down in components.md › Site name, wordmark and page titles: Landing "Testament · A testament to every test.", other pages "{page title} · Testament", admin "{page title} · Testament admin". (The canvas had no general title pattern before; only the two not-found titles were written.)
   - Landing: "How Testament is tested" (no-projects card link and the About this site button). The About text ("The dashboard is tested the same way…") doesn't use the name and is unchanged.
   - How It's Tested: the eyebrow ("How it’s tested") and the heading ("This dashboard is tested the same way as the projects it reports on.") don't contain the name, so they are unchanged. Lede: "A test dashboard that isn’t tested is just a claim. Testament is built test-first. …". Section 04 heading "Testament’s own results"; intro "Since 7 Oct, Testament’s CI posts its results to this site as the project `testpulse`, …" (the mono `testpulse` is the slug, so it stays). Pyramid note: "…in the layer Testament’s layer rules give it…". Principle 02: "…captured from Ostomate2, RouteServe and Testament itself…". The other principles: "Testament does the parsing…", "If Testament is down…", "In Testament’s own pipeline…".
   - Privacy: the wordmark only; its body says "this site" throughout and is unchanged.
   - NotFound: wordmark, title, and "These are the projects Testament reports on."
   - Review: heading "Testament: full review".
   - Admin: wordmark (with ADMIN). Sign-in email: subject "Sign in to Testament admin", body "Use this button to sign in to Testament admin. …", footer "Sent by Testament because a sign-in link was asked for with this address." The preview text ("The link works once and expires in 1 hour.") doesn't contain the name and is unchanged. The sign-in page heading is "Sign in to admin" and is unchanged.
   - Kiosk (the Later candidate): wordmark, the third card and its feed row.
   - Left alone: "Source on GitHub" (its URL `github.com/bhelco1/testpulse`), the tracked-link origin in components.md (a URL), code identifiers, comments and the slug. Landing Directions is a record of the direction exploration, not a spec, so it keeps the name it was drawn with. The Design System page's own eyebrow "testpulse · design system v3 · canonical" names the design system, not the site to a visitor, and is left as it is (say if it should change).
5. The self-reporting project's display name is drawn as "Testament", its tagline unchanged ("This dashboard, reporting on itself."): Landing card and runs tile sub ("Ostomate2 18 · RouteServe 6 · Testament 2"), the empty-run Pass rate sub, the SAMPLE note; Project Page switcher entry; NotFound project list; Kiosk card and feed row; Admin projects table row, lead-project `<option>` text and the count-drop alert title ("Testament: test count fell 23%"); Design System switcher, tile sub, card, kiosk card, pyramid, duration specimen, the two chart titles, the alert row and the "already closed" notice. The project's page stays `/p/testpulse`.
   - No "This site" label is added: the tagline "This dashboard, reporting on itself." already says the card is this site, and a label would repeat it.
   - For the build: `display_name` in `projects/testpulse.yaml` becomes "Testament" (then `projects:sync`); the slug and API key don't change.

**Docs**
6. components.md has a new section "Site name, wordmark and page titles" (the name and what stays internal, the wordmark rule with the screen-reader rule, the dot, the tagline, document titles, the project's display name), referenced from SiteHeader; Landing hero, NotFound, How it’s tested, sign-in email and admin not-found entries are updated. data-map.md has a v20 table (wordmark, tagline, titles, the project's display name and slug) and the Landing hero total row says Testament. This README has the new title, the Overview names Testament, Screens adds the tagline to Landing and Testament to the Kiosk cards.

Files changed in v20: Landing.dc.html, Project Page.dc.html, Run Detail.dc.html, Test History.dc.html, How Its Tested.dc.html, Privacy.dc.html, NotFound.dc.html, Admin.dc.html, Kiosk.dc.html, Review.dc.html, Design System.dc.html, design/README.md, design/components.md, design/data-map.md.

## Changes in v21
Launch review fixes (Bobby’s review of the live site, 2026-10-29, desktop 1440 and phone 390, dark and light). Same rules: the Design System page is canonical, components.md matches it, every target is 44 px, existing tokens only (no new token and no new contrast pair: everything new uses pairs contrast.md already lists). Nothing outside the list was changed. New artboards: ServerError, Share Image, Site Icons. New tweaks: Project Page scenario "12 runs so far" and "loading 20 more runs"; Test History variant "12 runs so far"; Run Detail run "Ostomate2 · failed, no message".

**Errors**
1. Server-error page drawn: ServerError.dc.html (`kind` project, run, test; `menu` opens the Projects menu; dark and light by the theme tweak; desktop by width, phone in Phone Views D8 and L8), and in Design System section 14 (SERVER ERROR · project and test at 1280, project and run at 390). It is ErrorState `page` inside the site frame: Error pill; "This project couldn’t be loaded" / "This run couldn’t be loaded" / "This test’s history couldn’t be loaded"; the requested path in NotFound’s chip; "Its results couldn’t be read just now. Nothing is shown rather than numbers that might be wrong; try again in a minute."; primary "Try again" (a link to the same URL) and "Go to overview". HTTP 500 from the route’s error boundary; title "Couldn’t load · Testament". Header and footer as NotFound minus everything that comes from the database (the read failed): no breadcrumbs (they need the project’s name), no Live, no "Last report received"; the Projects menu holds one line, "Projects couldn’t be loaded". The copy names no cause, because the boundary can’t tell an outage from a bug. Landing’s "Results couldn’t be loaded" **stays as it is** (copy, pill, Try again, How it’s tested link), with only item 2’s header and footer rule added. components.md › Server error (page), ErrorState; Design System section 13 caption.
2. The LiveIndicator is **not shown** while the page’s data failed to load (Landing error state and the server-error page): nothing on the page is subscribed or updating, so "Live" is false, and "Offline · reconnecting" would blame the connection for a failed read. The header has just the theme toggle, as Run and Not found do. Drawn in Landing scenario "error" and ServerError; components.md › SiteHeader … LiveIndicator.

**Link preview and icons**
3. (a) Share Image artboard, 1200 × 630, dark: the v20 wordmark at 136 px (dot 46) over "A testament to every test." at 58 px in `--ink-2`, centred on `--bg`; nothing else, so it reads as a thumbnail. (b) Site Icons artboard: "T." — the wordmark’s "Test" T (600, `--ink`) with its `--attn` dot as the full stop, on a `--bg` tile in both themes (so it reads on light and dark tabs): 180 touch icon (square, no transparency), 32 and 16 favicons (tile radius 7 / 3.5; the 16’s dot is relatively larger), each at size and enlarged, plus a light and a dark tab. Export with the T as outlines. `og:description` (also `twitter:description` and the meta description): "Live results from every CI run of Bobby Helco’s projects, posted automatically: pass rates, test layers, coverage and history. Nothing is entered by hand." Full tag list (`og:image:alt`, sizes, `twitter:card`) in components.md › Site name, wordmark and page titles. Both artboards are also shown in Design System section 04 (LINK PREVIEW AND SITE ICON).

**Landing**
4. A byline directly under the `h1` lede: "Bobby Helco, quality engineering leader" (15/1.5, name 600 `--ink`, the rest `--ink-2`), so the first screen answers who built this and "I" in the lede has a name beside it. Shown with the tagline (ready and "no projects"), not in the error state. The About card **stays, shortened**: its first sentence ("I’m Bobby Helco, a quality engineering leader.") is dropped since the byline says it; the rest and the "How Testament is tested →" button are unchanged. Landing.dc.html; components.md › Landing hero.
5. Phone tiles are 2 × 2 below a 480 px grid width: padding 14×16, value 32 (the `--text-stat` phone size), plain sub-lines hidden (attention and failing sub-lines stay), and the hero note at 15 (the `--text-body-l` phone size). That puts the top of the first project card on the first screen at 390 × 844. Landing at 390 (Phone Views D1, L1) and Design System section 05 (PHONE · 390); components.md › StatTile.

**Layout details**
6. "Last 40 runs" with fewer runs: the strip now always spans its card. Cells share the width (flex 1, min 6 px, ≈ 25 px at 1440), runs fill from the right, the slots not yet filled are one dashed `--line-strong` baseline labelled "No earlier runs", and "{n−1} runs ago" sits under the oldest real cell. Same rule on the Test history strips. Drawn: Project Page scenario "12 runs so far", Test History variant "12 runs so far", Design System section 11 (FEWER RUNS THAN SLOTS · 12, KIND RUNS · 12, ONE RUN). This also widens the cells when there are 40 runs (16 → ≈ 25 px at 1440), so the full strip fills the card too. components.md › StatusTimeline.
7. Run rows are a grid with one shape: status | title | count over meta | time (wide), or status + title, meta, then count left and time right (under 400 px of list width). Title and meta end in an ellipsis; count and time never wrap; rows are 71 / 97 px whatever their text. Landing feed, Project Page run list, Design System section 09 (desktop, 390, pruned rows); components.md › RunFeedRow.
8. Where mono text may break, per place, is a table in components.md › Wrapping mono text: report keys and paths after "/"; suites after "." and "/"; test names also at camelCase humps; `<wbr>`, with break-anywhere only for a piece longer than the line. Truncated (ellipsis + `title`): the results table’s wide layout, CoverageBar keys, run-row meta. Drawn with the breaks on Landing (failing block, report keys), Project Page (hero failing name, reports table, flaky list), Run Detail (narrow results, reports table), Test History (`h1`, suite, breadcrumb), the server-error path and the Design System cards. Helper `TPKit.breakPieces`.
9. Test page header at 390: the mismatch headline left the tag row and is its own line under the suite, one inline sentence that wraps as text (it was a flex row whose second half became a narrow ragged column); the tags (module, layer, Flaky, New) wrap above the name; the tiles are 2 × 2 under 480 px. Test History at 390 (Phone Views D4, L4) and Design System section 11 (TEST HISTORY HEADER · 390); components.md › Test history page.
10. CoverageBar under 400 px of row-list width is two lines: key left and value right, then the bar at full width (≈ 308 px on a 390 card, was ≈ 40). Applies wherever CoverageBar appears (project card, project page coverage card, How it’s tested). Landing, Project Page and How It’s Tested at 390, Design System section 08 (COVERAGEBAR · PHONE); components.md › CoverageBar.
11. Ticks **match the labels’ units**, at whole steps: seconds under 2 minutes ("20 s"), whole minutes from 2 minutes ("10m", "12m"; "16m", "20m", "24m"), half hours from 2 hours ("1h 30m"); 0 reads "0"; never "1500 s". The end label goes in the right margin, 8 px right of the last point, vertically centred on it, never on the line (a custom label in Recharts, not `position="top"`). tp-charts.js draws both; Design System section 12 has a run-duration specimen and section 02’s caption is updated; components.md › Run duration, TrendChart.

**States the design doesn’t cover**
12. Under 1 s prints "<1 s" (the site’s "<1 ms" / "<1%" convention), never "0 s", on cards, run rows, the run page header and reports table, and the chart’s tooltip, table, end label and caption. `TPKit.runDur` and tp-charts updated; Design System section 02 tile "<1 s"; components.md › Run duration.
13. "No failure message" panel in place of the message: neutral inset, dashed `--line-strong`, speech-bubble glyph, "The report marked this test as failed but included no message or stack trace. The CI run’s log may say more." (errored: "…as errored…"; with a trace but no message: "…included no message; its stack trace is below." then the trace). Run Detail run "Ostomate2 · failed, no message" and Design System section 10; components.md › ResultsTable. The parser stores null, never "Unknown error".
14. "Load 20 more" busy: Button busy (ring + "Loading…", aria-busy, cursor progress) in place, the existing rows kept, three skeleton rows in the row shape after them, the list `aria-busy` with a hidden "Loading runs"; focus to the first new row when they arrive. Project Page scenario "loading 20 more runs" (the button in the mock also switches to busy when clicked) and Design System section 09; "Load 50 more" uses the same pattern. components.md › RunFeed.

**Copy**
15. Rewritten, same facts (How Its Tested.dc.html unless noted; components.md › How it’s tested page):
   - "Only spec §8 layers are counted…" → "Every test counts in one of six layers: unit, component, integration, API, visual or E2E. The accessibility, screenshot and leak-sweep checks run inside the Playwright suite, so they count as E2E; the reporting Action’s contract tests run with the unit tests, so they count as Unit. Each test counts once, in the layer Testament’s settings give it, whichever report it arrived in."
   - "What runs" second paragraphs (tweak "after Phase 6"): plain wording for Unit, Integration, E2E and Leak sweep (full text in components.md). "The sign-in action’s one neutral answer" is now "it answers every email address the same way, so it never reveals who can sign in"; the E2E row explains personal links ("a link made for one recipient, so visits can be counted per link") and says "nothing the visitor sees says who the link was made for or shows its code" instead of naming "company, role, contact".
   - "Ostomate2" → "Ostomate 2.0" in the section 02 and 03 intros and principle 02. ATPR is named in the section 04 intro: "…the same shared GitHub Action that Ostomate 2.0, RouteServe and ATPR report through."
   - Median time: "android-emulator · ios-sim 69.37 s" → "android-emulator (ios-sim 69.37 s)": the other platforms’ medians in brackets, each with its own figure. Test History.dc.html; components.md › Test history page.
   - "Latest runs · 0 skipped, excluded" → "Each project’s latest run"; with a failure "3,801 of 3,802 passed"; " · {s} skipped, not counted" only when skipped > 0. Landing, Design System section 05; components.md › StatTile; data-map.
   - "Maestro E2E (iOS) (13 flows)" → "Not counted: 13 flows in Maestro E2E (iOS), authored, not yet executed" (`TPKit.declaredSummary`; components.md › ProjectCard).
   - "first target is Actual Budget": not on the canvas (it is live project text, likely ATPR’s tagline or description in its YAML), so nothing is drawn. Pattern: say what Actual Budget is where it is first named, e.g. "…its first target is Actual Budget, an open-source budgeting app." Bobby to confirm the sentence.
   - "No || true" tile: "No test step is allowed to fail quietly: none uses `|| true` or `continue-on-error`." The flags are inline mono with no padding, background or extra space, nowrap; principle 05 quotes them the same way.
16. Admin titles never repeat "admin": `/admin` is "Testament admin" (signed in, loading, error, not allowed); signed out "Sign in · Testament admin"; link detail "{company} · Testament admin"; unknown link stays "Not found · Testament admin". Admin.dc.html has `<title>Testament admin</title>`; components.md › Site name, wordmark and page titles.

Files changed in v21: Landing.dc.html, Project Page.dc.html, Run Detail.dc.html, Test History.dc.html, How Its Tested.dc.html, Admin.dc.html, Phone Views.dc.html, Design System.dc.html, ServerError.dc.html (new), Share Image.dc.html (new), Site Icons.dc.html (new), tp-kit.js, tp-charts.js, design/README.md, design/components.md, design/data-map.md. (Canvas index: the three new artboards.)

## Changes in v22
Private projects show counts only, and the launch review’s leftovers (request of 2026-11-17). Same rules: the Design System page is canonical, components.md and data-map.md match it, every target is 44 px, existing tokens only (no new token and no new contrast pair: everything new uses pairs contrast.md already lists). Nothing outside the list was changed, except where noted under "Also changed". Every changed state is drawn at desktop and at 390 in Design System sections 16 and 17 (dark and light by the page’s theme toggle) and on the pages named per item. New Design System sections: 16 "Private projects: counts only" and 17 "Runs, wording, long failures, phone tables". New tweaks: Run Detail run "RouteServe · passed (private)", "RouteServe · errored (private)", "RouteServe · several failures (private)"; Landing scenario "private project failed"; NotFound kind "test, private project".

**Private projects show counts only**
1. Run page, private: no per-test rows. Results becomes (a) the private notice, (b) for failed or errored runs "Where it failed", one line per platform and layer with its count ("2 tests failed on node · API", errored with the ! icon), largest first, and (c) "By layer", each layer’s distinct tests with the reports table’s bar and line ("1 failed · 268 passed"), failing layers tinted, then one line: each test counts once under its worst result; no per-test pages. The filters and ResultsTable are gone for private runs; the reports table stays (it carries counts by report). Passed, failed, errored and several-failures are drawn: Run Detail tweaks (RouteServe · passed / failed / errored / several failures (private)) and Design System section 16 (RUN PAGE · PRIVATE · RESULTS, each at desktop and 390). components.md › Run page (Results, private), ResultsTable; data-map › Run detail (Results, private).
2. Failed-run banner, private: the public heads without the name: "1 test failed", "1 test errored", "{f} tests failed", "{e} tests errored", "{f} failed, {e} errored". Sub "On {platform}, {layer} layer." (one group) or "In the {layers} layers. On {platforms}.", then "This repository is private, so test names and failure details aren’t shown." Button "Show breakdown" scrolls to Results. Run Detail private tweaks; Design System sections 10 and 16; components.md › Run page.
3. Test history: **no test pages and no links to them for private projects** (chosen, as you leaned). A page with no name gives a visitor nothing to read, and its stable address would still be a handle on one hidden test. A direct `/p/{private}/tests/{key}` is a 404 with its own NotFound kind, not the generic "This test isn’t in…" (which would claim the key never reported): "RouteServe has no test pages" / "RouteServe’s repository is private, so Testament shows its results as counts only, with no page for each test.", primary "Latest RouteServe results", link "Overview". It is the same for every key, so it reveals nothing about which keys exist. NotFound.dc.html kind "test, private project"; Design System section 16; components.md › Test history page, NotFound; data-map › Test history.
4. ProjectCard private + failed: the failed block keeps its frame and link and shows "{count} failed" (Public Sans 13/600, `TPKit.privFailHead`) over "{platforms} · {layers}" (`TPKit.privFailWhere`), no "+{n} more". LatestRunCard (project page hero card) the same ("1 test failed" · "node · API"). The four states stay consistent: passed · failed (name) · private (passed) · private + failed (counts, SHA unlinked). Kiosk: same rule in components.md, not drawn (the kiosk is a Later candidate). Landing scenario "private project failed"; Project Page project RouteServe, scenario "latest run failed"; Design System sections 06 and 16; components.md › ProjectCard.
5. Project page lists: the flaky list for a private project is one block, "3 flaky tests in 30 days", per-layer counts and platforms ("Integration 2 · Unit 1 · on node"), "Names aren’t shown for a private repository."; zero reads as the public empty state. The other list that named tests, the run page results, is item 1. Project Page (RouteServe, SAMPLE); Design System section 16; components.md › Private projects: counts only.
6. Inventory: components.md › Private projects: counts only, a table of every place a test name, suite, module tag or path appears, each marked "Public only" with its private replacement, or "Shown for both". data-map.md now says at the top that every field is shown for private projects unless marked **Public only**, and marks each such field (card failing test, flaky list, run header `run_url`, results table, mismatch, failure detail, failure groups, status filter, row time, test history), with a v22 table giving "Private?" for each new field. Report keys and coverage module keys are kept as "Shown for both": see "Decisions to confirm".
7. Private notice copy: title "Test names hidden: private repository"; body "This repository is private, so its tests’ names and failure details aren’t shown. The results, counts and trends are real." Same drawing. Project Page, Run Detail, Design System sections 13 and 16; components.md › Notice. Admin’s create form line for a private lead project now reads "…never test names or failure text."

**Private runs**
8. Private run titles: the public rule, from `runs.event` and `runs.branch` ("Push to main", "Scheduled run", "Pull request from {branch}"), followed by a lock (13 in rows, 24 in the h1, `role="img"`, "Private repository"). It replaces "Run 43723459441" as the h1 and "Private repository" as the row title; the breadcrumb and document title keep "Run {id}". The branch was already shown in every private row’s meta. `TPKit.row` now always titles; Landing, Project Page and Design System section 09 rows, Run Detail h1, Design System section 16; components.md › RunFeedRow, Run page.
9. Event: the run titles’ words, "Push", "Pull request", "Scheduled run", "Manual run"; any other event its stored value (`TPKit.eventWord`). Run Detail; Design System section 17; components.md › Run page.

**Wording and meaning**
10. Run duration: two figures, never mixed. **Elapsed** (first start to last report, `finished_at − started_at`) is what cards, run rows, How it’s tested and the kiosk show, always with the word: "160 tests · 11m 34s elapsed". The run page tile is "Elapsed" with a sub-line "16m 15s of job time across 6 reports"; the reports table’s last column is "JOB TIME"; the project page chart is "Elapsed time per run". Nothing is called "Duration" any more. The one format (components.md › Run duration) is unchanged. The Ostomate2 run page sample now has elapsed 11m 34s and job time 16m 15s (SAMPLE report durations and received times). `TPKit.card` and `TPKit.row` add "elapsed"; Run Detail, Project Page, How It’s Tested; Design System section 17; data-map v22.
11. Tests vs executions: "tests" always means distinct tests, and every pass rate (cards, tiles, and now the pass-rate chart) is over distinct tests, so "251 of 252" and the chart’s latest point agree. Where report counts meet a total, one line says why they differ, only when they do: "Reports add up to {e} executions of {d} distinct tests. A test run on several platforms, or retried, counts once in the total." On the ProjectCard per-report block (`repFoot`), the Run page reports table and the Project page "Reports per run" (whose foot now reads "Distinct tests in the run"; RouteServe’s per-report counts are filled in). Design System sections 10 and 17; components.md › Tests and executions, StatTile; data-map v22.
12. Report keys: a part equal to the one before it is dropped and the separator stays "/": "e2e/e2e/desktop-dark" → "e2e/desktop-dark", "integration/integration/node" → "integration/node"; the stored key is the `title`. I kept "/" rather than "e2e · desktop-dark" because every other key in the same list uses "/", and a " · " key would read as a different kind of thing. Everywhere keys appear (card block, reports tables, project page list, admin alert bodies). `TPKit.reportKey`; Design System section 17; components.md › Report keys.

**Long failure pages**
13. Rule: failed and errored results with the same message (whole message, trailing space trimmed; a null message never groups) form one group when 3 or more share it: one row "50 tests failed with the same message" + "{platforms} · {layer counts}"; expanded, the message once, "Stack trace of the first test" as a closed disclosure, then the tests as links to their history, the first 10, then "Show all 50 tests". Groups sort first, largest first. Separately, only the first 5 failure rows or groups open by default; the rest start closed. The 50-failure mirror outage now opens as one group, one message and no traces. Design System section 17 (desktop and 390); components.md › ResultsTable; data-map › Run detail (Failure groups). Not added as a Run Detail tweak.

**Phone**
14. How it’s tested strategy table: keyed to its own width; under 640 px each row stacks (layer, tool chips, scope), with no header row, no min-width and no sideways scroll. How It’s Tested (Phone Views D5, L5); Design System section 17; components.md › How it’s tested page.
15. Reports tables: the run page table loses its 760 px min-width and scroll box; under 640 px of table width each report stacks: status and "{n} tests", the key, the bar and line, "Received {time}" and "{d} job time". Every column is on screen and nothing scrolls. The project page "Reports per run" list is already two columns and fits at 390; the same rule applies to any reports table there. Run Detail (Phone Views D3, L3); Design System sections 10 and 17; components.md › Run page.

**Decisions to confirm**
- Report keys and coverage module keys ("test/apps/backend/node", "apps/backend") stay on private projects. They name workspaces, not tests, and item 1 suggests "counts by report". The request also says "no … module path … anywhere", so if workspace paths count as module paths, private keys need a replacement too (for example "{platform} · report {i}"). That is not drawn.
- Branch names stay on private runs (in titles, as they already were in meta). If a branch name is judged unsafe, titles and meta must change together (for example "Push · 23 Sep").
- spec §9 said test names are public for every project. This bundle follows the 2026-11-17 decision instead, so spec §9 needs the same change.

**Also changed**
- Run Detail’s light theme: the page’s theme wrapper had lost its theme variables (its style had been replaced by a box shadow), so the light tweak and Phone Views L3 showed dark. The wrapper uses the theme variables again, with the same shadow, so the private run page can be drawn in light.
- Admin.dc.html and the Design System admin specimen: the sample "RouteServe test history" visit is now "Ostomate2 test history" (a private project no longer has test pages), and the create-form line for a private lead project says "never test names or failure text".

Files changed in v22: Landing.dc.html, Project Page.dc.html, Run Detail.dc.html, How Its Tested.dc.html, NotFound.dc.html, Admin.dc.html, Design System.dc.html, tp-kit.js, design/README.md, design/components.md, design/data-map.md. Not changed: Test History.dc.html (public projects only, as before), Phone Views.dc.html (it imports the pages), Kiosk.dc.html, tokens.css, contrast.md, tp-charts.js.

## Changes in v23
Runs still arriving, runs missing a report, and two small fixes (request of 2026-11-17; v22 accepted). Same rules: the Design System page is canonical, components.md and data-map.md match it, every target is 44 px, existing tokens only. **No new token.** Two new StatusBadge statuses (In progress, Incomplete), one HealthMarker (Last run incomplete) and one alert kind (missing_report) are drawn with existing tokens: In progress in `--neutral` / `--neutral-tint`, the rest in `--attn` / `--attn-tint`. Every changed state is drawn at desktop and 390 in the new Design System section 18 (dark and light by the page’s theme toggle), on the pages by tweak (desktop by width, dark and light by the theme tweak), and at 390 in Phone Views’ new rows VD1–VD8 (dark) and VL1–VL8 (light). Nothing outside the list was changed.

The model (components.md › Expected reports and run completeness, new): each project lists, per trigger, the report keys a run must send and a time limit counted from the run’s start. **Complete**: all arrived. **In progress**: some still due, within the limit. **Incomplete**: the limit passed, the missing ones are named. None set: today’s rule (complete on the first report). Rank: Failed > Empty > Incomplete > Passed; In progress shows only until a failure arrives, which makes the run Failed at once. New helpers in tp-kit.js: `TPKit.missingName`, `TPKit.triggerWord`, `TPKit.sameSuite`, `TPKit.andList`; `TPKit.card` takes `arriving`, `last`, `missing`, `expected`, `event`, `limit`; `TPKit.row` takes `got`, `of`, `missingN`.

**Runs still arriving**
1. Landing headline and tiles: the total, pass rate and Projects passing use each project’s **latest complete run** while its newest run is in progress, so nothing drops. The note’s last sentence says so: "Testament’s latest run is still arriving (2 of 10 reports), so its last complete run is counted." (several projects: "The latest runs of {A} and {B} are still arriving, so their last complete runs are counted."). Tile subs: Pass rate "Each project’s latest complete run"; Projects passing "Latest complete default-branch runs". A failure that has already arrived counts at once: sentence 2 becomes "1 failing on Testament’s latest run so far, 0 skipped. That run is still arriving (2 of 10 reports), so the total counts its last complete run." and Projects passing goes red ("Testament red for 2m"). Landing scenarios "run in progress" and "run in progress, failure arrived"; Design System section 18 (ITEM 1, desktop and 390); components.md › Landing hero, StatTile.
2. ProjectCard and LatestRunCard in progress: row 1 shows the new run (In progress badge, last report time, branch, SHA); the total, sub-line, layers and coverage **stay the last complete run’s**; a 44 px inset block under the total (a link to the new run) reads "2 of 10 reports received" · "last 2 min ago", one 8 px cell per expected report (received `--ink-2`, still due `--line-strong`), then "Figures are from the last complete run (8d3e1a2, 14 min ago) until the rest arrive." The per-report block lists every expected key, the ones not in yet as "waiting". With a failure already in, the badge is Failed and the usual failed block sits above the arriving block. When the last report arrives the card turns Passed or Failed in place (block removed, new figures, no count-up). The card’s states are now passed · failed · private · private + failed · in progress · incomplete, plus the existing empty, stale, below floor, not reporting and loading; components.md › ProjectCard states line updated to match. Design System sections 06 (two new cards) and 18; Landing scenarios; Project Page scenario "latest run in progress" (LatestRunCard).
3. RunFeedRow and the project page run list: never Passed or Failed until complete, unless a failure has arrived. In progress: "In progress" status, "2 of 10 reports · 2,363 tests so far". A failure already in: "Failed", "1 failed so far · 2 of 10 reports". On completion the row updates in place with the new-row `--raised` fade. Design System section 18; Landing scenarios; Project Page scenario "latest run in progress"; components.md › RunFeedRow.
4. Run page in progress: In progress pill (Failed once a failure is in); meta "Reports 3 of 6" and "Last report 14:06 UTC"; Tests tile sub "so far, from 3 of 6 reports"; Elapsed sub "so far · …"; a neutral Notice "Still arriving: 3 of 6 reports received" that says when the last arrived, that nothing is counted until the rest arrive, when the run will close as incomplete, and to reload (the run page stays load-time only). The reports section becomes "Expected reports · 3 of 6 received · the last at 14:06 UTC": received rows as before, then each still-due report as "Waiting" (dashed ring), "Not received yet", "—". A failed banner on an in-progress run adds "3 of 6 reports are in, so more failures may follow." Run Detail tweaks "Ostomate2 · in progress" and "Ostomate2 · in progress, a failure arrived"; Design System section 18; components.md › Run page.

**Runs missing a report**
5. Incomplete run. Status "Incomplete", `--attn` (a ring with a piece missing), ranked below Failed and Empty and above Passed: a run with a failure and a missing report reads Failed, with the missing report still named. Row: "1 report missing · 152 tests" (failed too: "1 failed · 1 report missing"). Card: the run’s own figures, the badge, an `--attn-tint` note "android-emulator didn’t report. Scheduled runs expect 6 reports; 5 arrived within the 1-hour limit, so this run is incomplete. The overview counts its last complete run.", the key marked "missing" in the per-report block, HealthMarker "Last run incomplete" (precedence stale, empty, incomplete, below floor). Run page: Incomplete pill, attn banner "Incomplete: android-emulator didn’t report" naming the trigger, counts and the time the limit passed, and a "Missing" row ("Didn’t report"). Missing reports are named by the shortest end of the key that no other expected key shares ("android-emulator"; "e2e/ios-sim" when "ios-sim" alone is shared), `TPKit.missingName`. How it counts: **Red now**: an incomplete run without a failure is not red and doesn’t end a red episode; a failed incomplete run is red. **Green streak**: skipped (neither extends nor breaks it). **Time to green**: runs to the next *complete* passed run. **Pass rate** (30 days and chart): complete runs only. The overview counts the project’s last complete run and says so (as item 1). Landing scenario "incomplete run", Project Page scenario "latest run incomplete", Run Detail tweak "Ostomate2 · incomplete", Design System sections 03, 06 and 18; components.md › StatusBadge, HealthMarker, ProjectCard, RunFeedRow, RecoveryStats, Run page.
6. Admin alert "Missing report" (`missing_report`), in the existing four kinds’ style: the Incomplete glyph, tag "MISSING REPORT", title "Ostomate2: a run is missing a report", body "android-e2e/e2e/android-emulator didn’t report in the scheduled run on main (7c1e5a0). Scheduled runs expect 6 reports; 5 arrived within the 1-hour limit.", meta "Opened 24 Sep, 05:12 UTC · Closes by itself when the next scheduled run gets that report, or acknowledge it." One open alert per project and trigger; closes by itself when a later run of that trigger receives every key it named, or with Acknowledge (same busy and error states as count_drop). Admin.dc.html (alerts on), Design System sections 15 (now five kinds) and 18 (desktop and 390); components.md › Alert row.
7. Expected reports are listed on the project page, in "Coverage and reports", as a third card "Expected reports": an intro with the project’s time limit, then one group per set of triggers that expect the same keys ("Push, pull request, scheduled and manual runs · 6 reports"), the keys in mono. None set: "None set. Each run counts as complete when its first report arrives." Shown the same for private projects: report keys have been shown for both since v22, and the card holds no test names or counts. Project Page (Ostomate2 and RouteServe, SAMPLE settings), Design System section 18 (three cases); components.md › Expected reports and run completeness, Private projects table.

**Small fixes**
8. Run Detail’s page wrapper no longer has `boxShadow: '0px 2px 8px 0px #00000033'`; the theme variables (and the light theme) are unchanged. Run-Detail.dc.html, `const tv`.
9. A suite equal to its test’s name: the two-line rows show the name once and **drop** the suite line (not replaced: the layer and platform lines already say the rest). Equal = the stored suite, trimmed, equals the name, or its shortened form does (`TPKit.sameSuite`). Applies to ResultsTable (wide and narrow), the flaky list, failure-group test links and the Test history header, where the breadcrumb also ends in the name alone ("Ostomate2 / iOS Journey: Onboarding walkthrough"). Run Detail (a Maestro row in the results), Test History variant "suite is its own name (Maestro flow)", Design System section 18; components.md › ResultsTable, Test history page.

**Decisions I made (please confirm)**
- Incomplete runs also fall back to the last complete run in the headline (item 1 asked only about runs in progress). Otherwise Ostomate 2.0’s weekly run would drop the total by about 18 every week, the problem item 1 fixes. The note says which run is counted, and the card shows the incomplete run itself.
- A card in progress keeps the last complete run’s figures, with the new run’s badge and an arriving block (item 2’s second option). An incomplete card shows its own figures, because that run is finished.
- Badge words "In progress" and "Incomplete", taken from the request. The README and the spec’s non-goal say "no running status". This is not a running status (it never shows tests running, only reports still due), but spec §13 and the non-goals should say so.
- The time limit is counted from the run’s start (`runs.started_at`), drawn as 1 hour (Ostomate 2.0) and 30 minutes (RouteServe). Both are SAMPLE values for Bobby to set.
- The missing_report alert has an Acknowledge button. A run that never sends a report (for example, a job removed from the workflow) would otherwise keep its alert open until the project’s YAML is changed.
- Item 7’s "Counts only for private projects, as in v22 (report keys are shown for both)": read as "nothing new to hide". The card shows report keys, which v22 already shows for both, so private and public cards are the same.

**Not drawn, rule only**
- Last 40 runs strip: an in-progress run isn’t in it until it completes; an incomplete run’s cell has Empty’s height, in `--attn-tint` with a solid 1.5 px `--attn` outline, and the legend word "Incomplete" (components.md › Expected reports and run completeness). Not drawn because the request doesn’t list the strip.
- Kiosk card in progress or incomplete: the same rule at kiosk size, in components.md. Not drawn (the kiosk is a Later candidate).

**Noticed, not changed**
- contrast.md doesn’t list `--ink` or `--ink-2` on `--attn-tint`, though the empty note (since v3) and the admin alert bodies (since v16) use them, and the new incomplete note and banner do too. Both pass: 12.17 and 8.94:1 dark, 15.34 and 8.95:1 light. The arriving block’s still-due cells (`--line-strong` on `--inset`, about 1.6:1) are `aria-hidden` and repeat the words "2 of 10 reports received", so they aren’t a required graphic. Adding the two text pairs to contrast.md and the CI check is a one-line follow-up if wanted.
- Test History passes `t.durCaption` (always undefined) into the duration chart’s aria-label, which then reads "Duration by run. undefined". This predates v23 and is left as it was.
- The request says "{n} automated tests across four projects"; the mocks still show three projects (ATPR isn’t drawn), so the drawn note says "three".

Files changed in v23: Landing.dc.html, Project Page.dc.html, Run Detail.dc.html, Test History.dc.html, Admin.dc.html, Phone Views.dc.html, Design System.dc.html, tp-kit.js, README.md, components.md, data-map.md. Not changed: tokens.css, contrast.md, tp-charts.js, How Its Tested, Privacy, NotFound, ServerError, Kiosk, Review, Landing Directions, Share Image, Site Icons, and the canvas index.

## Changes in v24
A stable test count, honest runs, and numbers that say what they count (request of 2026-11-19/20; v22 and v23 accepted and kept). Same rules: the Design System page is canonical, components.md and data-map.md match it, every target is 44 px, existing tokens only. **No new token and no new contrast pair**: every new element uses pairs contrast.md already lists (the Not run and Running now blocks are `--ink`/`--ink-2` on `--inset`; Still red and Invariant broken are `--ink`/`--fail` on `--fail-tint`; Intermittent is `--attn` on `--attn-tint`; Attempt and Infrastructure fault are `--neutral` on `--neutral-tint`). Every changed state is drawn at desktop (1280 in a 1440 frame) and 390 in the new Design System section 19 (dark and light by the page's theme toggle), and on the pages by tweak (desktop by width, dark and light by the theme tweak; Phone Views shows the pages at 390 as before, it imports them). The shared model is components.md › Counts and Not run (new) and › Running now (new). Helpers: `TPKit.dur`, `TPKit.relTime`, `TPKit.covPct`, `TPKit.covTrend`; `TPKit.card` takes `run.notRun`, `run.testTime`, `notRunWhy`, `stillRed`; `TPKit.row` takes `notRun`, `scope`, `attempt`, `attempts`. Nothing outside the list was changed, except where noted under "Conflicts with v23 and earlier".

**A stable test count**
1. ProjectCard and LatestRunCard: the big figure is the project's **Total**, the sub-line "tests · {P} passed · {F} failed · {N} not run · {CI time} CI time". P + F + N = Total always, so **"0 not run" is always shown**, plain `--ink-2` like "0 failed". A large Not run (suites this trigger doesn't send, or skips ≥ 5% of the Total) gets its own 44 px link block under the total: Skipped glyph, bold "13 of 160 not run" and the reason in words ("Scheduled runs don't send ios-e2e and android-e2e, by the project's settings. Those tests last ran on the push of a41f9c2, 6 days ago."), and "{n} not run" in the sub-line turns 600 `--ink`, so it is noticed by word, glyph and weight, not colour. A missing report is said in the incomplete note, now with its count ("android-emulator didn't report, so its 8 tests didn't run…"). States drawn: passed, failed, private, private + failed, in progress (last complete run's figures, v23), incomplete (Total 160 · Passed 152 · Not run 8), plus the request's example 3,800 · 311 · 0 · 3,489. `TPKit.card`; Landing (all scenarios), Project Page (LatestRunCard, every scenario), Design System section 19 item 1; components.md › ProjectCard, Counts and Not run.
2. Landing headline: the total is the sum of the Totals. Sentence 1 shows the arithmetic once, in the cards' order: "3,802 automated tests across three projects: 160 + 1,044 + 2,598." **Not run appears only as the last clause of sentence 2**, where "0 skipped" was: "100% of the tests that ran passed on the latest runs, 0 not run." / "…; 8 not run (android-emulator didn't report on Ostomate2's latest push run)." The Pass rate tile states its unit: "3,802 of 3,802 tests that ran" ({passed} of {passed + failed}). Landing (every scenario), Design System section 19 item 2; components.md › Landing hero, StatTile.
3. Run page "Not run" section, directly under the summary: "Not run · {N} of {Total} tests", one row per reason with glyph, words and count, largest first: "android-e2e/e2e/android-emulator didn't report · 8 tests · Counted from its last report, 23 Sep · See report", "Not sent by scheduled runs: ios-e2e, android-e2e · 13 tests", "Skipped · 2 tests · Show skipped", and while in progress "Still to come: {k} reports · {n} tests"; foot "Passed 152 + Failed 0 + Not run 8 = 160 tests." (none: "Every test in the Total ran."). **Reconciled with v23 item 4**: the Reports section keeps one row per *expected* report with its status word (Missing, Waiting) and "—" for tests; the counts per reason are only in Not run, which links to the row. Reports a trigger doesn't send aren't expected, so they appear only in Not run. Private runs: the same (keys and counts only). Run Detail (every run tweak), Design System section 19 item 3; components.md › Run page.
4. Tests added and removed: the run page's Total tile sub reads "+2 tests, −1 removed since the last complete run (0e2d0b4)" (none: "No tests added or removed since {sha}"), with a 44 px "Show which tests" button opening Added (links to history) and Removed ("last seen {date}"); private: counts only. The project page "Tests per run" plots the Total, scope "Default branch · last 30 runs · Total tests", caption "Total tests grew from 118 to 160 over the last 30 runs. It changes only when tests are added or removed." (flat: "160 throughout the last 30 runs: no tests added or removed."). Run Detail, Project Page, Design System section 19 item 4; components.md › Run page, TrendChart.
5. Runs still arriving on charts: an In progress run is never a point (caption ends "A run still arriving joins the charts when it completes."); an Incomplete run plots its Total on Tests per run and leaves its slot empty on Pass rate and CI time, with a hollow 8 px `--attn` ring on the baseline (tooltip "Incomplete · not plotted: android-emulator didn't report"). Last 40 runs: Incomplete cell (v23 rule, now drawn) and an "Arriving" cell (dashed `--line-strong`, no fill), both in the legend. Project Page scenarios "latest run in progress" / "latest run incomplete" (strip, captions), Design System section 19 item 5 (static chart and strip); components.md › TrendChart, StatusTimeline. The tp-charts.js component itself doesn't draw the ring; it is drawn in section 19 only.

**Honest runs**
6. A red stretch ends only when the failing tests have run and passed. Drawn with Ostomate2: ios-e2e failed on push a41f9c2, the weekly scheduled run passed without E2E. RecoveryStats: Green streak 0 ("Ends when the failing tests pass"), "Red now for 6d 4h" + "ios-e2e hasn't run since it failed (a41f9c2). Scheduled runs don't send E2E, so they can't end it."; time to green counts only recoveries that ran the failing tests. The card keeps the run's Passed badge and adds a `--fail-tint` block "Still red: ios-e2e failed 6 days ago (a41f9c2) and hasn't run since."; Projects passing "2 of 3 · Ostomate2 red for 6d · ios-e2e hasn't run since". Scheduled run row: "147 of 160 ran · 11m 05s CI time" with " · E2E not in scheduled runs" in the meta; its run page has a neutral notice "E2E isn't part of scheduled runs" (…"That's this project's setting, not a fault, so the run is Complete.") and the Not run line. Landing scenario "scheduled run, E2E still red", Project Page scenario "E2E still red after a scheduled run", Run Detail run "Ostomate2 · scheduled run (no E2E)", Design System section 19 item 6; components.md › RecoveryStats, ProjectCard, RunFeedRow, Run page.
7. Green streak: "41 runs · 15 commits" under the value, Longest "58 runs · 21 commits". RecoveryStats is the only place a streak appears (the kiosk is a Later candidate). Project Page, Design System section 19 item 7; components.md › RecoveryStats.
8. Intermittent: the panel is "Flaky and intermittent tests". Intermittent = failed in some of the last 30 default-branch runs it ran in, with passes in between, across commits (2 or more failures with a pass between). Row: tag "Intermittent" (`--attn`, dashed-line glyph), "Failed 6 of 28 runs · plus 1 infrastructure fault", E2E, android-emulator, then a neutral "Infrastructure fault" tag "DeviceUnreachableException on 14 Nov, not counted". **Infrastructure faults don't count** toward Intermittent, Flaky, red or time to green; they still count as Failed in the run (Failed tile sub "incl. 1 infrastructure fault"). Test History: an "Intermittent" tile ("6 of 27 · runs failed, with passes between · 1 infrastructure fault not counted"; the sample's own count), the tag, and an infrastructure-fault cell (24 px, `--neutral-tint`, dashed `--neutral`). Run page: the tag on the result row and the first line of its detail, "Classed as an infrastructure fault: DeviceUnreachableException. The device failed, not the test, so it isn't counted as intermittent or flaky." Project Page (Ostomate2 flaky panel, SAMPLE), Test History variant "intermittent E2E flow (with an infrastructure fault)", Run Detail run "Ostomate2 · failed, with an infrastructure fault", Design System section 19 item 8; components.md › StatusTimeline (flaky and intermittent list), ResultsTable, Test history page; data-map v24 (classification by per-project patterns).

**Numbers that say what they count**
9. **CI time** (first report's start → last report's finish) leads everywhere; **Test time** (sum of report times) follows it. ProjectCard: "· 11m 34s CI time" in the sub-line and "16m 15s test time across 6 reports" at the foot of the per-report block. LatestRunCard: CI time in the line, Test time under the platforms. Run page: tile "CI time", sub "Test time 16m 15s across 6 reports", column "TEST TIME", table foot with both definitions. Chart "CI time per run", tooltip "CI time {a} · Test time {b}". Labels' `title`/note text: CI time "From the first report's start to the last report's finish: how long CI took, with jobs running side by side."; Test time "The sum of every report's own time. Jobs run in parallel, so it is usually longer than CI time." Run rows also say "CI time" for consistency. All pages, Design System section 19 item 9; components.md › Run duration.
10. One pass-rate unit on the project page: distinct tests that ran, passed ÷ (passed + failed), Not run left out: the chart (and its table), "Pass rate, 30 days" ("4,797 of 4,800 tests that ran, 30 runs") and run rows ("· 159 of 160"). The note, under the stat row and at the end of the chart caption: "Pass rates count distinct tests that ran: passed ÷ (passed + failed). Tests not run are left out." Project Page, Design System section 19 item 10; components.md › RecoveryStats.
11. Arithmetic beside statuses: Projects passing "Green: Ostomate2, RouteServe, Testament" (red and empty subs kept); Runs in last 30 days keeps "Ostomate2 18 · RouteServe 6 · Testament 2" (it already adds up); RecoveryStats pass rate "{p} of {ran} tests that ran, {k} runs", streak "{n} runs · {c} commits", time to green "Median of 4 recoveries, 90 days · worst 9h 02m". Landing, Project Page, Design System section 19 item 11; components.md › StatTile, RecoveryStats.

**Admin**
12. Alert "Invariant broken" (`invariant`), the sixth kind, in `--fail` (a broken promise is a bug in Testament, unlike the other kinds, which are `--attn`): ring with a not-equal sign, tag "INVARIANT BROKEN", title "Ostomate2: a promise didn't hold", body "“A green run ran every expected suite” is false for the scheduled run on main (7c1e5a0, 7 Oct): it reads Passed, but ios-e2e failed on a41f9c2 and hasn't run since. Found by the daily check against production history.", meta "Opened 8 Oct, 04:00 UTC · Closes by itself when the next daily check finds the promise holding, or acknowledge it." (the admin mock's clock is 8 Oct). The three promises are listed in components.md. Daily job panel: a fifth tile "Invariant check", "3 of 3 held" / "✕ 1 broken" (`--fail`, sub "2 of 3 promises held · 2,140 runs checked at 04:00 UTC · alert opened"); it follows the alerts tweak. Admin.dc.html (alerts on/off), Design System section 19 item 12; components.md › Alert row, Daily job tiles; data-map v24.

**Small fixes**
13. Re-run attempts: rows get a neutral "Attempt 2" tag after the title (attempt 1 tagged "Attempt 1" once a later attempt exists); rows are whole-row links, so attempts are linked on the run page meta "Attempt 2 of 2 · Attempt 1". Project Page (All branches: the fix-today-count pull request, attempts 1 and 2), Run Detail run "Ostomate2 · passed, attempt 2", Design System section 19 item 13; components.md › RunFeedRow, Run page.
14. Relative time counts elapsed time: under 1 min "just now", "{m} min ago", "{h} h ago" under 24 h, **24–48 h "1 day ago"** (chosen over "yesterday", which promises a calendar day), then whole elapsed days. `TPKit.relTime`; sample "yesterday"s now read "1 day ago" (Project Page, Test History, Run Detail); Design System section 19 item 14 (table); components.md › Relative time.
15. Footer: "Last report from any project: 4 min ago". Landing, Project Page, Run Detail, Test History, Design System section 19 item 15; components.md › SiteHeader, SiteFooter.
16. Coverage rounds to the nearest tenth (96.396 → 96.4%), except that it never rounds up onto its floor or onto 100 (79.96 under an 80 floor reads 79.9%), so a below-floor figure never shows the floor value; trends read "Held at {v}% over {n} runs" when the change is under 0.1 points. `TPKit.covPct`, `TPKit.covTrend`; every CoverageBar, the coverage chart captions; Design System section 19 item 16; components.md › CoverageBar, TrendChart (copy). Pass rates keep rounding down.
17. One duration rule for everything (`TPKit.dur`, the same in tp-charts.js, Run Detail and Test History): "<1 ms", "{ms} ms", one decimal under 10 s, whole seconds, "5m 18s", "1h 05m". "318.40 s" → "5m 18s", "0.41 s" → "410 ms", "61.84 s" → "1m 01s". Run Detail, Test History, tp-charts.js (`sec` tooltip/table/end label and `dur`), Design System section 19 item 17; components.md › Run duration.
18. No coverage: the project page keeps the first "Coverage and reports" card, titled "Line coverage", with a dashed panel "No coverage reported" / "ATPR's CI doesn't send a coverage file, so there is nothing to show against a floor. Its test results are below." (same words as the card's "No coverage reported"). Project Page scenario "no coverage reported" (drawn on Ostomate2's data, as ATPR isn't in the mocks), Design System section 19 item 18 (ATPR); components.md › CoverageBar.

**A run in progress**
19. Running now: the run page header while In progress (Run Detail runs "Ostomate2 · in progress" and "… a failure arrived"; tweak `js` off for the no-JS state). Live indicator in the header; "RUNNING NOW" + start, time so far and when it closes as incomplete; four figures: Tests expected in this run (the expected reports' Total), Completed so far, Passed so far, Failed so far (a failure shows at once); a **step strip**, one segment per expected report sized by its test count, filled when that report lands, with "results arrive a report at a time, so this jumps when each one lands" (no smooth bar); the reports list, received (counts, time) and still to come; "Updates when a report arrives", or without JavaScript "As of 14:06 UTC. Reload to see reports that arrived since." At the end the view becomes the ordinary run page in place, with a polite announcement "Run complete: …"; at the limit it becomes the Incomplete page. Entry points: a 44 px "Running now: Testament · 2 of 10 reports · 2,363 of 2,598 tests so far" row under the landing tiles, and the LatestRunCard / ProjectCard arriving block, headed "Running now · 3 of 6 reports received". Run Detail, Landing scenarios "run in progress…", Project Page scenario "latest run in progress", Design System section 19 item 19 (view at desktop and 390, landing row, no-JS line, completed state); components.md › Running now; data-map v24.

**Conflicts with v23 and earlier (resolutions proposed and drawn; please confirm)**
- v23 item 5 drew the incomplete card with the run's own total (152). Item 1's model keeps the Total (160) and makes the missing report's 8 tests Not run. Drawn so.
- v23 item 1 and its decision "incomplete runs fall back to the last complete run in the headline": with a stable Total the headline can't drop, so the fallback is kept **only for the pass rate while a run is in progress**. An incomplete run now counts its own figures, its missing tests in Not run. The note's v23 sentence "…so its last complete run is counted" becomes "…so the pass rate counts its last complete run".
- v23's sample settings expected all 6 Ostomate2 reports from every trigger, including scheduled runs, and its incomplete sample was a scheduled run missing android-emulator. Item 6 says scheduled runs don't run E2E and are Complete. Resolved: Ostomate2 expects 6 reports from push, pull request and manual runs and 4 from scheduled runs (the Expected reports card now shows two groups), and the incomplete samples (Landing, Project Page, Run Detail, Admin missing_report alert, section 19) are push runs. Section 18 (v23) is left as drawn.
- v23 item 4 said the run page is load-time only. Item 19 makes it subscribe (Live) **only while the run is In progress**.
- v23's "Last 40 runs strip (not drawn)": now drawn (item 5).
- Not v23, but superseded: v22 item 10's words "Elapsed" and "job time" become "CI time" and "Test time" (same figures); v21 item 12's "<1 s" gives way to the one duration rule; v8 item 5's round-down now applies to pass rates only, not coverage.

**Decisions I made (please confirm)**
- "1 day ago", not "yesterday" (item 14).
- "0 not run" is always shown, so the four figures always add up on screen (item 1).
- The Not run block threshold: any tests a trigger doesn't send, or skips ≥ 5% of the Total. Small skip counts stay in the sub-line only.
- Infrastructure faults are excluded from Intermittent, Flaky, red and time to green but still count as Failed in the run. Which failures are infrastructure faults comes from a per-project pattern list in `projects/*.yaml` (a schema and reporting-standard change for Bobby to approve).
- The Invariant broken alert is `--fail`, the only alert kind not in `--attn`.
- A Passed run that leaves the stretch red keeps its Passed badge and adds a Still red block; the card frame stays neutral.
- An empty report doesn't replace its key's copy in the Total (otherwise an empty run would read as tests removed).
- Private projects: the counts-only flaky summary now reads "3 flaky or intermittent tests in 30 days"; added and removed tests show counts only.

**Not drawn, rule only**
- The tp-charts.js TrendChart component doesn't draw the incomplete ring (it is drawn statically in section 19); the rule is in components.md › TrendChart.
- In section 19, items 4, 5, 9 (part), 12, 13 and 14–18 show one specimen in both the desktop and 390 columns, reflowing through the container queries, rather than a separate phone layout.
- Kiosk: the four figures and CI time apply by the same rules; not drawn (the kiosk is a Later candidate).
- The end-of-run swap (item 19) is described in a caption and in components.md; no separate "just completed" tweak.

**Noticed, not changed**
- How It's Tested's results card still reads "… elapsed" (one place). Item 9 doesn't list that page, so it is left; it should read "CI time" when the page is next touched.
- The empty-run scenario keeps v3's rule (an empty run's project leaves the headline: "3,642 … across two projects"). Under the Total model an empty run's project could instead keep its Total with every test Not run; that is a decision for Bobby, so it isn't drawn.

Files changed in v24: Landing.dc.html, Project Page.dc.html, Run Detail.dc.html, Test History.dc.html, Admin.dc.html, Design System.dc.html (section 19), tp-kit.js, tp-charts.js, README.md, components.md, data-map.md. Not changed: tokens.css, contrast.md, Phone Views (it imports the pages), How Its Tested, Privacy, NotFound, ServerError, Kiosk, Review, Landing Directions, Share Image, Site Icons, and the canvas index.
