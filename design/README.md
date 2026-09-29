# testpulse handoff v7

## Overview
testpulse is a public dashboard of live automated-test results for Bobby Helco's projects (spec §1). This bundle is the design for every page in spec §13 plus the Raspberry Pi kiosk view, in dark and light themes, at desktop and phone widths, including the unhappy states from the design brief §6.

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
| `pages/Landing.dc.html` | `/` — tweak `scenario`: healthy, failed run, empty run, stale project, coverage below floor, live update, realtime disconnected, loading, error |
| `pages/Project Page.dc.html` | `/p/[slug]` — tweaks: project (public/private), scenario, theme |
| `pages/Run Detail.dc.html` | `/p/[slug]/runs/[id]` — tweaks: run (passed, failed, failed-private), pruned |
| `pages/Test History.dc.html` | `/p/[slug]/tests/[testKey]` |
| `pages/How Its Tested.dc.html` | `/how-its-tested` — tweak: selfReporting |
| `pages/Admin.dc.html` | `/admin` — tweak: alerts |
| `pages/Privacy.dc.html` | `/privacy` |
| `pages/Kiosk.dc.html` | Kiosk, fixed 1920×1080, scaled to fit screen — tweak: scenario |
| `pages/Phone Views.dc.html` | All pages at 390 px, a dark row and a light row |
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

**Landing `/`** Lede (serif 24) → hero total (`--text-hero`) with a one-line note to its right → 4 stat tiles (Pass rate with skipped count in its sub-line, Projects reporting, Runs in last 30 days, Projects passing) → "Projects" h2 + two project cards → row of Recent runs (feed) and About this site. Squint test: the first thing seen is the hero number, the second a project name.

*Project card*: see components.md › ProjectCard (canonical, v3).

**Project, Run detail, Test history, How it's tested, Admin, Privacy** — see the pages; each is annotated with its tweaks. Private projects: no repo link, no `run_url`, and failure text replaced by the private-details notice.

**Kiosk** Fixed 1920×1080 artboard scaled with `transform: scale(min(vw/1920, vh/1080))`, letterboxed on `#0b0a09`. Minimum text 22px. Header: wordmark, overall status pill (All projects passing / N failing / N silent), Live, last report, clock (HH:MM). Main grid 480px / 1fr / 1fr: hero column (total 200px, note, 3 tiles: Pass rate, Projects reporting, Projects passing) and one card per project (name 64, total 104, layer bar, coverage, health). Card border becomes 3px `--fail` or `--attn` when that project needs attention. Bottom strip: 3 most recent runs. No interactive controls; dark only.

## Interactions and behaviour
- Theme toggle: dark default; stores choice in localStorage; `prefers-color-scheme` used when none stored. Only `background-color, border-color, color, fill, stroke` transition, over `--motion-base`, while `html[data-theme-switching]` is set.
- Realtime: new run inserts at top of feed with a "New" pill (`--ink` / `--on-ink`) and a `--raised` background fading over 2s (no fail tint, even for a failed run); card and tiles update in place. No count-up animations. No "running" status (spec non-goal).
- Disconnected: LiveIndicator off state; inline feed note with absolute time: "Offline. Showing runs as of 10:42; reconnecting". No banner.
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
