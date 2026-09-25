# testpulse handoff v2

## Overview
testpulse is a public dashboard of live automated-test results for Bobby Helco's projects (spec §1). This bundle is the design for every page in spec §13 plus the Raspberry Pi kiosk view, in dark and light themes, at desktop and phone widths, including the unhappy states from the design brief §6.

## About the design files
The files in `pages/` are **design references built in HTML**. They show the intended look and behaviour; they are not production code. Recreate them in the testpulse Next.js app (spec §4) using its patterns: server components for static content, a client component for the realtime feed, Recharts for charts, CSS variables from `tokens.css`.

To view a page, open it in a browser from inside `pages/` (it needs `support.js` beside it). Each page has a Tweaks panel (props) to switch scenario, theme and variants.

## Fidelity
**High fidelity.** Colours, type, spacing, radii and copy are final. Match them exactly. Figures tagged **SAMPLE** are illustrative and must come from data (or be hidden) in production. All figures in the mocks, tagged or not, are placeholders for live values; only the brief §5 counts are real.

## Files
| File | What it is |
|---|---|
| `tokens.css` | All design tokens as CSS variables, dark default + `[data-theme="light"]` |
| `components.md` | Component list with props and required states |
| `data-map.md` | Every UI element mapped to its table/column or stat |
| `contrast.md` | Every required contrast pair with its ratio, both themes (must match the CI check) |
| `pages/Design System.dc.html` | Tokens, contrast checks, every component in every state |
| `pages/Landing.dc.html` | `/` — tweak `scenario`: healthy, failed run, empty run, stale project, coverage below floor, live update, realtime disconnected, loading, error |
| `pages/Project Page.dc.html` | `/p/[slug]` — tweaks: project (public/private), scenario |
| `pages/Run Detail.dc.html` | `/p/[slug]/runs/[id]` — tweaks: run (passed, failed, failed-private), pruned |
| `pages/Test History.dc.html` | `/p/[slug]/tests/[testKey]` |
| `pages/How Its Tested.dc.html` | `/how-its-tested` — tweak: selfReporting |
| `pages/Admin.dc.html` | `/admin` — tweak: alerts |
| `pages/Privacy.dc.html` | `/privacy` |
| `pages/Kiosk.dc.html` | Kiosk, fixed 1920×1080, scaled to fit screen — tweak: scenario |
| `pages/Phone Views.dc.html` | All pages at 390 px, a dark row and a light row |
| `pages/Review.dc.html` | Index: every page at 1440 × 900, dark and light side by side, plus kiosk |
| `pages/Landing Directions.dc.html` | Record of the direction exploration only; 2a was chosen, 2b its phone layout. Superseded by the pages above (its tiles predate v2) |

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

*Project card* (surface, radius-xl, padding 24×30, no bottom padding): status pill + meta line · name (serif 42) + private tag · tagline · total (serif 56) + "tests · N failed · N skipped · Ns" · layer bar + labels · coverage rows (grid 96px / 1fr / auto) · per-report inset block (mono 13) · footer hairline with "Not counted: …" left and health marker right.

**Project, Run detail, Test history, How it's tested, Admin, Privacy** — see the pages; each is annotated with its tweaks. Private projects: no repo link, no `run_url`, no commit subject, and failure text replaced by the private-details notice.

**Kiosk** Fixed 1920×1080 artboard scaled with `transform: scale(min(vw/1920, vh/1080))`, letterboxed on `#0b0a09`. Minimum text 22px. Header: wordmark, overall status pill (All projects passing / N failing / N silent), Live, last report, clock (HH:MM). Main grid 480px / 1fr / 1fr: hero column (total 200px, note, 3 tiles) and one card per project (name 64, total 104, layer bar, coverage, health). Card border becomes 3px `--fail` or `--attn` when that project needs attention. Bottom strip: 3 most recent runs. No interactive controls; dark only.

## Interactions and behaviour
- Theme toggle: dark default; stores choice in localStorage; `prefers-color-scheme` used when none stored. Transition `--motion-base`.
- Realtime: new run inserts at top of feed with "New" chip and tinted bg fading over 2s; card and tiles update in place. No count-up animations.
- Disconnected: LiveIndicator off state; feed note gives the time of the last received data.
- Loading: skeletons in the shape of the content. Error: `ErrorState`, no stale numbers shown.
- Results table: filters by status and layer; row expands (200ms) to failure detail.
- Reduced motion: all animation off, live dot static.
- Without JS: all static content renders; feed is a server-rendered list.

## State
Theme; realtime connection status; feed list; results table filters and expanded row; project switcher open. Everything else is server data (see `data-map.md`).

## Design tokens
All in `tokens.css`. Summary: warm dark neutrals; status colours pass/fail/attn/neutral each with a tint; amber (`--attn`) is used only for things needing attention and for floor markers. Type: Source Serif 4 (figures, headings), Public Sans (UI), JetBrains Mono (SHAs, test names, report keys, eyebrow labels). Space scale 4–80. Radii 4/10/12/16/20/pill. Cards separate by tone and hairline, not shadow.

## Assets
No images. Icons are simple inline stroke SVGs (24 viewBox, stroke 2.4–2.8, round caps): check-circle, x-circle, dashed-circle, lock, clock, arrow-down, chevron, external arrow. Replace with the app's icon set (e.g. Lucide) keeping the same shapes. Fonts from Google Fonts: Source Serif 4 (400/500/600, opsz), Public Sans (400–700), JetBrains Mono (400–600).

## Before building pages (spec §17 design track)
Implement `tokens.css` as the global stylesheet, build and unit test the components in `components.md`, then build pages. Record Playwright visual snapshots per page at desktop and phone, light and dark.

## Changes in v2
- Landing tiles match spec §11: "Skipped or disabled" replaced by "Runs in last 30 days"; skipped count moved to the Pass rate sub-line (also still in the hero note).
- SAMPLE tag removed from Median time to green and Green streak everywhere.
- Light `--pass` #1b7a3d → #197339 so every required pair reaches 4.5:1 (see `contrast.md`).
- data-map: coverage source, `runs_public` for public reads, live-update transport left to Phase 5, time-to-green note.
- Admin tracked links shown and copied as `<site origin>/v/<token>`.
