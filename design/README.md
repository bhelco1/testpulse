# testpulse handoff v3

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

**Landing `/`** Lede (serif 24) → hero total (`--text-hero`) with a one-line note to its right → 5 stat tiles (Pass rate with skipped count in its sub-line, Projects reporting, Runs in last 30 days, Median time to green, Green streak) → "Projects" h2 + two project cards → row of Recent runs (feed) and About this site. Squint test: the first thing seen is the hero number, the second a project name.

*Project card*: see components.md › ProjectCard (canonical, v3).

**Project, Run detail, Test history, How it's tested, Admin, Privacy** — see the pages; each is annotated with its tweaks. Private projects: no repo link, no `run_url`, and failure text replaced by the private-details notice.

**Kiosk** Fixed 1920×1080 artboard scaled with `transform: scale(min(vw/1920, vh/1080))`, letterboxed on `#0b0a09`. Minimum text 22px. Header: wordmark, overall status pill (All projects passing / N failing / N silent), Live, last report, clock (HH:MM). Main grid 480px / 1fr / 1fr: hero column (total 200px, note, 3 tiles) and one card per project (name 64, total 104, layer bar, coverage, health). Card border becomes 3px `--fail` or `--attn` when that project needs attention. Bottom strip: 3 most recent runs. No interactive controls; dark only.

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
62. Each chart states its scope under the title: pass rate, test count, coverage — "Default branch · CI and imported history"; duration — "Default branch · CI runs only (imported history has no durations)"; runs per day — "Default branch · CI and imported history" (corrected, see 72).

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
