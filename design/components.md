# Components

Build these first, unit test each state, then compose pages. Every one is shown in all its states in `pages/Design System.dc.html`. Values reference `tokens.css`.

| Component | Props (suggested) | States | Notes |
|---|---|---|---|
| `StatusBadge` | `status: passed \| failed \| empty \| skipped \| flaky \| stale \| declared \| running`, `variant: pill \| inline` | all listed | Icon shape + word, never colour alone. Pill: radius-pill, padding 4×11, 14px/600, `--{status}-tint` bg, `--{status}` ink. Empty uses a dashed circle + dash glyph in `--attn`. Declared uses dashed circle in `--neutral`. |
| `LiveIndicator` | `connected: boolean` | on, off | On: 8px `--pass` dot with `tp-pulse`, label "Live". Off: 1.5px `--ink-3` ring, label "Offline · reconnecting". Feed header then reads "Offline. Showing runs as of HH:MM; reconnecting". |
| `SiteHeader` | `current`, `theme` | default, menu open | Wordmark (amber 10px dot + "testpulse" serif 24/600), Projects menu button, How it's tested, LiveIndicator, theme toggle. All targets 44px. |
| `ProjectSwitcher` | `projects[]` | closed, open | Menu: `--raised`, `--line-strong` border, radius-md, `--shadow-menu`, 320px wide, 44px items with status inline. |
| `SiteFooter` | `lastReportAt` | — | Privacy · Source on GitHub · "Last report received {relative}". |
| `Breadcrumbs` | `items[]` | — | All drill-down pages. |
| `StatTile` | `label`, `value`, `sub`, `tone?` | default, loading, attention | surface, radius-lg, padding 18×20; value `--text-stat`. Landing set (spec §11): Pass rate, Projects reporting, Runs in last 30 days, Median time to green, Green streak, beside the hero total. |
| `ProjectCard` | `project`, `latestRun`, `coverage[]`, `reports[]`, `declared[]`, `health` | passed, failed, empty, stale, below floor, private, loading | See Landing. Private shows the lock tag; never renders repo link or failure text. |
| `StackTagGroup` | `groups: {category, items[]}[]` | — | From `dev_stack` / `test_stack`. |
| `LayerBar` | `layers: {name, count}[]` | — | 8px stacked bar, 3px gaps, `--layer-1..4` ordered by layer. Labels below. |
| `Pyramid` | `layers[]` | normal, single layer | Centered horizontal bars, widest at base, width ∝ count. Recharts: horizontal `BarChart` with centred bars via stacked transparent offset. |
| `CoverageBar` | `module`, `pct`, `floor` | above, at, below floor | 6px track `--raised`, fill `--ink`, 2×14px floor marker `--attn` at `floor%`. Below floor: value and "below floor N%" in `--attn` + down-arrow icon. |
| `TrendChart` | `series`, `kind: line \| bar`, `floor?` | many points, one point, empty | Recharts `LineChart`/`BarChart`. One point: single dot + caption "One run so far. The trend appears after the next run." — no empty axes. |
| `RunFeedRow` | `run`, `isNew?` | passed, failed, empty, private, new | Desktop: grid 104 / 1fr / 124 / 108. Phone: two lines. New: "New" chip + `--raised`/`--pass-tint` bg that fades over `--motion-arrive`. |
| `RunFeed` | `runs[]`, `connected` | live, disconnected, loading | Reads `runs_public`. `role="log" aria-live="polite"`. Degrades to server-rendered list without JS. |
| `ResultsTable` | `results[]`, filters | default, filtered, expanded row, skipped, flaky, platform mismatch, pruned | Filter by status and layer. Expand shows failure `message` + `detail` (mono). |
| `PrivateDetailsNotice` | — | — | Replaces failure text on private projects: lock icon + "Details hidden: private repository". Never a blank gap. |
| `StatusTimeline` | `results[]` | — | Test history: per-run cells, fail cells taller with ✕. Tooltip on focus/hover. |
| `DeclaredSuiteNote` | `suites[]` | — | Neutral. Copy: "These tests exist but don't report here yet. They aren't counted in any total." |
| `HealthMarker` | `health: healthy \| stale(days) \| empty \| below_floor` | all | "Reporting healthy" (pass) / "No report in 12 days" (attn). |
| `SampleTag` | — | — | Mono 10px, `--attn` border. Design-only: marks figures not yet backed by data. Remove from production. |
| `Skeleton` | shape | — | `--raised` blocks, 1.6s opacity shimmer (off under reduced motion). |
| `ErrorState` | `message`, `onRetry` | — | Fail pill "Error", serif headline, plain explanation, "Try again" primary button. |
| `Button` | `variant: primary \| secondary \| ghost` | default, hover, focus, disabled | Primary: `--ink` bg, `--on-ink` text, radius-sm, 44px. |
