# testpulse: design brief

For use in Claude Design. Upload this file together with `docs/spec.md` and `docs/PROJECT_INVENTORY.md`. The spec defines what each page contains; this brief defines who it is for, how it should feel, and what to produce.

## Opening prompt

Paste this to start the session, with the three files attached:

> Design a web app called testpulse using the attached brief, spec, and inventory. Start by proposing three distinct visual directions for the landing dashboard only, desktop width, dark theme, using the real data in the brief. Don't build other pages yet. After I pick a direction, we'll build the design system, then the remaining screens one at a time.

Working order after that: pick a direction → design system (tokens and components) → landing → project page → run detail → test history → how-its-tested → admin → phone widths → light theme → unhappy states → export the handoff bundle for Claude Code.

---

## 1. What this is

testpulse is a public dashboard showing live automated-test results for one person's software projects. Each project's CI pipeline reports in after every run. It is a working QA tool and, at the same time, a portfolio piece for a quality engineering leader with 30+ years of experience who is applying for Manager and Director of Quality Engineering roles.

## 2. Audience

**Primary: a hiring manager or engineering director.** Arrives from a link in a résumé or message. Busy, skeptical, technically literate, has seen many portfolios. Likely on a laptop, sometimes a phone. Will give it 10 to 60 seconds before deciding whether to look deeper.

What they need to conclude, in order:
1. In 5 seconds: this is real, live, and professionally made.
2. In 30 seconds: this person tests seriously. Real suites, real numbers, a proper pyramid, enforced coverage.
3. In 3 minutes of clicking: this person has judgment. Honest reporting, flakiness tracking, alerts for silent CI failure, a tested dashboard.

**Secondary: the owner**, using it daily as a cross-project QA dashboard, also shown full-screen on a Raspberry Pi kiosk display.

## 3. Feel

Calm, precise, confident. The quality bar of a well-funded developer-tools product, not a personal homepage and not a corporate BI report.

| Aim for | Avoid |
|---|---|
| Data as the hero; generous whitespace around it | Decoration competing with numbers |
| A restrained palette with one accent; color reserved mostly for status | Rainbow charts, gradients everywhere, glassmorphism |
| Strong typographic hierarchy; tabular numerals for all figures | Tiny gray text, centered paragraphs of copy |
| Dense where it helps (tables), airy where it orients (landing) | Uniform card grids where everything has equal weight |
| Quiet, purposeful motion | Count-up animations, bouncing, parallax |
| Plain, specific language ("1,048 tests, 0 skipped") | Marketing language ("Blazing-fast quality at scale") |

Dark theme is the primary presentation (kiosk use, developer-tool convention). Light theme must be equally finished, not an afterthought.

The three directions to explore should differ meaningfully, for example: (a) editorial and typographic, large numerals, minimal chrome; (b) instrument panel, denser, monospace accents, engineering feel; (c) product-polished, soft surfaces, closest to a modern SaaS dashboard. All three must meet the requirements in section 7.

## 4. Pages

Content for each page is defined in spec section 13; stats in section 11. Summary of the design job for each:

**Landing `/`** The most important screen. Above the fold on a laptop: site name with a one-line statement of what it is, headline stat tiles, and at least the top of the project cards. Below: live feed of recent runs, short about blurb with the owner's name and a link to the how-its-tested page. A subtle "live" indicator shows the realtime connection.

**Project `/p/[slug]`** Reads top to bottom as a story: what the project is → what it's built with → how it's tested → the numbers → the history. Dev stack and test stack are displayed as grouped tags. The test pyramid is the signature visual of this page. Coverage is shown against its enforced floor, per module. Declared suites (tests that exist but don't report yet) appear with an honest status label. Then trends, flaky tests, recent runs, and a reporting-health marker.

**Run detail `/p/[slug]/runs/[id]`** A run is made of several reports (different CI jobs, modules, platforms). Show the run summary, then the per-report breakdown, then a filterable results table (status, layer, search). Failure detail expands inline. This is the densest page; optimize for scanning.

**Test history `/p/[slug]/tests/[testKey]`** One test over time: a status timeline strip and a duration trend. Small page, should feel satisfying to land on.

**How it's tested `/how-its-tested`** testpulse's own test strategy and live results. Same components as a project page, plus explanatory copy. This is where a curious hiring manager ends up, so it should read well.

**Admin `/admin`** Private, owner only. Tracked links table (company, role, sent date, visits, last seen, pages viewed), a create-link form, open alerts, project sync status. Function over form, same design system.

**Privacy `/privacy`** Plain text page in the site's typography.

**Global** Header with site name, project switcher, theme toggle. Breadcrumbs on all drill-down pages. Footer with privacy link, repo link, and "last report received" timestamp. Any project is one click from the landing page; any run is two.

## 5. Real data to design with

Use these figures. Do not invent numbers or use placeholder text.

**Headline tiles (landing)**

| Tile | Value |
|---|---|
| Automated tests | 1,190 |
| Pass rate | 100% |
| Projects reporting | 2 (3 once testpulse reports on itself) |
| Skipped or disabled tests | 0 |
| Median time to green | design with "2h 14m" as a sample; real value comes later |
| Green streak | design with "41 runs" as a sample |

**Project: Ostomate2** (public repo)
- Tagline: Local-first ostomy supply tracker for Android and iOS. Kotlin Multiplatform.
- Dev stack: Kotlin 2.3, Kotlin Multiplatform, Compose Multiplatform 1.11, Room KMP (SQLite), Koin, Swift (iOS shell and widget), Gradle 9, GitHub Actions, Fastlane
- Test stack: kotlin.test, JUnit4, Robolectric, kotest-property, Roborazzi (screenshot), Maestro (E2E), JaCoCo, detekt, ktlint, SwiftLint
- Latest run: 142 tests, 142 passed, 0 failed, 0 skipped, about 27 s
- Pyramid: unit 103 · integration 29 · visual 10
- Platforms: the same suites run on JVM (142) and iOS simulator (132)
- Coverage vs enforced floor: shared 92.0% (floor 91%) · composeApp 94.3% (floor 93%)
- Coverage history: 52.6% on 2026-07-02 → 92.0% today. This climb is a good story for the trend chart
- Declared suites: Maestro E2E Android, 7 flows, "runs in CI, not yet reported" · Maestro E2E iOS, 5 flows, same status
- Reports per run: android/shared/jvm, android/composeApp/jvm, ios/shared/ios-sim, ios/composeApp/ios-sim

**Project: RouteServe** (private repo: no repo links, failure details hidden, short unlinked commit SHAs)
- Tagline: Field-service CRM, scheduling, and route planning. Mobile app plus multi-tenant API.
- Dev stack: TypeScript 6, Expo SDK 57, React Native 0.86, React 19, Express 5, Prisma 7, PostgreSQL 18 + PostGIS, WatermelonDB, Zod, Supabase Auth, Twilio, Railway, EAS Build
- Test stack: Jest 30, jest-expo, Supertest, nock, msw, React Native Testing Library, Maestro
- Latest run: 1,048 tests, all passed, 0 skipped, about 29 s
- Pyramid (approximate, for mocks): unit 608 · component 165 · API 269 · integration 3
- Coverage, lines / branches: backend 96.1% / 84.4% · mobile 96.1% / 87.8% · shared 100% / 100%. Floor 80% on each
- Declared suites: Maestro E2E iOS, 13 flows, "authored, not yet executed"
- Reports per run: test/apps/backend/node, test/apps/mobile/node, test/packages/shared/node

**Sample run feed rows**
- Ostomate2 · main · `0e2d0b4` · "docs: BUG-10 verified on device" · passed · 142 tests · 27 s · 4 minutes ago
- RouteServe · main · `c238574` · passed · 1,048 tests · 29 s · 2 hours ago
- Ostomate2 · PR #52 · `a41f9c2` · failed · 141 of 142 · 31 s · yesterday

**Sample tracked links (admin)**
- Acme Health · Director of Quality Engineering · sent Sep 18 · 3 sessions, 2 distinct visitors · last seen 2 hours ago · viewed Ostomate2, how-its-tested
- Northwind Software · Sr. Engineering Manager, QA · sent Sep 15 · 1 session · last seen Sep 16 · viewed landing only
- Globex · QA Manager · sent Sep 12 · not yet opened

## 6. States to design

Every one of these needs a designed appearance. The happy path alone is not enough; a QA audience trusts a dashboard by how it shows problems.

| State | Where it appears |
|---|---|
| Passed | Tiles, cards, feed rows, run header |
| Failed (1 of 142) | Project card, feed row, run detail with expanded failure message and stack trace |
| Failed on a private project | Run detail where failure text is replaced by a clear "details hidden: private repository" treatment, not a blank gap |
| Empty run (0 tests executed) | Treated as a problem, visually distinct from both pass and fail |
| Skipped tests present | Results table and totals |
| Flaky test | Badge in results table; flaky list on project page |
| Stale project | Reporting-health marker: "no report in 12 days" |
| Coverage below floor | Coverage bar crossing under its floor line |
| Declared suite, not executed | Project page; honest and neutral, not alarming, and clearly excluded from totals |
| Platform mismatch | Same test passing on JVM, failing on iOS simulator |
| New project with one run | Trend charts with a single data point; no broken-looking empty axes |
| No data / loading / error | Skeletons and a plain error message |
| Live update | A new run arriving at the top of the feed |
| Realtime disconnected | "Live" indicator in its off state |

## 7. Requirements

**Accessibility**
- WCAG AA contrast for every text and status color pair, in both themes. Check the tokens before building screens.
- Status is never color alone: each status has an icon and a text label. Must remain readable for red-green color blindness.
- Visible keyboard focus on every interactive element. Logical tab order. Skip-to-content link.
- Minimum 44 px touch targets on phone widths.
- Motion respects `prefers-reduced-motion`.

**Responsive**
- Design at 1440, 1024, and 390 px. Landing and project pages must work well on a phone, since links get opened from email on mobile.
- Wide tables scroll inside their own container; the page never scrolls sideways.
- Kiosk: the landing page at 1920×1080, dark, readable from across a room with no interaction.

**Charts**
- Must be buildable in Recharts: line, area, bar, stacked bar, and simple composed charts. The pyramid can be built from stacked horizontal bars or plain HTML and CSS.
- Direct labels preferred over legends. Axis labels in plain words. Tabular numerals.
- Charts need a text alternative: a caption stating the takeaway, or a data table toggle.

**Implementation constraints**
- Built in Next.js with CSS variables for tokens. Deliver tokens as named variables: color (light and dark), type scale, spacing scale, radii, shadows, status colors.
- Prefer system or Google Fonts with a full fallback stack. No more than two families, plus one monospace for SHAs and test names.
- Icons from a single open-source set (Lucide or similar).
- No stock photos or illustrations. No logo is required; a wordmark in the site typeface is enough. A simple favicon mark is welcome.

**Components the design system must include**
Stat tile · project card · status badge (all statuses) · stack tag group · pyramid · coverage bar with floor marker · trend chart frame · run feed row · results table with filters and expandable row · status timeline strip · reporting-health marker · declared-suite row · alert banner · breadcrumbs · header with project switcher and theme toggle · footer · form inputs and buttons (admin) · skeleton loaders · empty and error states.

## 8. Copy

Short and factual. Sentence case. No exclamation marks.

- Site statement under the wordmark: "Live test results for every project I build."
- About blurb: "I'm Bobby Helco, a quality engineering leader. Every project here reports its test results after each CI run. Nothing on this page is mocked or hand-entered. The dashboard is tested the same way, and reports on itself."
- Private project note: "This repository is private, so failure messages, stack traces and source links are hidden. Test names, counts and trends are real."
- Declared suite note: "These tests exist but don't report here yet. They aren't counted in any total."

## 9. Deliverables

1. Three landing-page directions (dark, desktop) for selection.
2. Design system in the chosen direction: tokens for both themes and every component in section 7, each shown in all of its states.
3. Screens: landing, project (one public, one private), run detail (passed, failed, failed-private), test history, how-its-tested, admin, privacy. Desktop and phone, dark and light.
4. The unhappy states in section 6, shown in context.
5. Kiosk view of the landing page at 1920×1080.
6. Handoff bundle exported for Claude Code, to be committed under `design/` in the testpulse repo.

## 10. Review checklist before export

- [ ] Squint test: on the landing page, the first thing the eye lands on is a real number, and the second is a project.
- [ ] Every figure on every screen traces back to section 5 or is marked as a sample.
- [ ] Every status appears with icon and label, and passes a color-blindness simulation.
- [ ] All token contrast pairs pass AA in both themes.
- [ ] The failed, empty, stale, and private states look intentional.
- [ ] Phone landing page shows the site statement and at least two stat tiles without scrolling.
- [ ] Nothing in the charts requires more than Recharts can do.
- [ ] Shown to one person outside the project for a 10-second first impression, and their words match section 2's first goal.
