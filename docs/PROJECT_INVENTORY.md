# Project Inventory: first testpulse reporters

routeserve is a private project, so its section below is intentionally a short summary: it holds only what testpulse needs and what the site already shows.

Surveyed 2026-09-21 (read-only). Ostomate2 sources: repo contents, `git`, `gh` (read-only), and one local unit-test run. Anything marked **inferred** is a judgment from the evidence, not a stated fact. "unknown" means it could not be determined without network, credentials, or a device.

## Ostomate2 summary

| | Ostomate2 |
|---|---|
| Purpose | Local-first ostomy supply tracker (Android + iOS), KMP rewrite of Ostomate v1 |
| Remote | `git@github.com:bhelco1/Ostomate2.git` |
| Visibility | PUBLIC |
| Branch | `main`, even with origin |
| Last commit | `0e2d0b4` 2026-09-21 13:11 "docs: BUG-10 verified on device" |
| Working tree | Dirty: 5 modified tracked files + 2 untracked (another session is actively working BUG-11) |
| Open PRs | 0 |
| Version | Android 1.0 (1); iOS 1.0 (1); no tags |
| Primary language | Kotlin (Swift for thin iOS shell + widget) |
| Framework | Kotlin Multiplatform 2.3.21, Compose Multiplatform 1.11.0, Room KMP 2.8.4, Koin 4.2.1 |
| Database | Room KMP over SQLite, on-device only |
| Hosting/deploy | GitHub Pages (docs), Fastlane lanes for Play/TestFlight (not wired to CI), Raspberry Pi QA kiosk |
| Test runners | kotlin.test / JUnit4 under Robolectric, kotest-property, Roborazzi screenshots, Maestro E2E |
| Test files | 33 Kotlin (25 with `@Test`) + 11 Maestro flows; 0 XCTest |
| Test cases | 171 `@Test`; 142 execute per JVM CI run (82 shared + 60 composeApp); 82 + 50 on iOS sim |
| Coverage tool | JaCoCo 0.8.13, floors 0.91 (shared) / 0.93 (composeApp) enforced in CI |
| Coverage numbers | shared 92.0% line, composeApp 94.3% line (local JaCoCo XML) |
| CI | GitHub Actions, 1 workflow (`ci.yml`, 6 jobs) |
| Machine-readable results in CI | Yes: JUnit XML uploaded as artifact `junit-results-jvm`; JaCoCo XML uploaded |
| Local unit run | 142/142 pass, 0 skip (JVM host tests, offline Gradle, ~36 s wall total) |
| Skipped/disabled tests | 0 |

---

## Ostomate2

### 1. Overview

**Purpose.** "Track ostomy supply changes, predict reorders, and manage inventory — private and local" (`fastlane/metadata/android/en-US/short_description.txt`, README, CLAUDE.md). Logs bag/flange changes (tap or `ostomate://log?item=…` QR deep link), predicts days-of-supply, reorder notifications, calendar/stats, QR label printing, backup/restore, home-screen widgets, optional biometric lock, opt-in Sentry crash reporting (off by default). No analytics.

**Current status.**

| Item | Value |
|---|---|
| HEAD | `0e2d0b4` 2026-09-21 13:11:29 -0600 "docs: BUG-10 verified on device" (landed during the survey; prior HEAD `964c110` 12:12 was the BUG-10 fix) |
| Branch | `main`, 0 ahead / 0 behind `origin/main` (no fetch performed) |
| Commits | 114 since `487190b` 2026-06-12 |
| Activity | Gap 2026-07-14 → 2026-09-21; only 2 commits since 07-15, both today |
| Uncommitted (at 13:16) | Modified: `.maestro/02_log_and_undo.yaml`, `composeApp/.../ui/calendar/CalendarScreen.kt`, `.../history/HistoryScreen.kt`, `.../home/HomeScreen.kt`, `planning/bug-backlog.md`. Untracked: `e2e-diagnostics/` (created 13:14–13:16 by an Android E2E run), `iosApp/iosApp/Secrets.swift`. These belong to a concurrent session working BUG-11 (snackbar duration); this survey wrote nothing. |
| Local branches | 21, all merged into main (phase-2.5.x, feat/2.5.6–2.5.8, worktree-agent-*, etc.). Remote also has `test-dashboard` (CI-generated), `chore/docs-accuracy`, `feat/2.5.8-orphan-flows` |
| Stashes / tags / CHANGELOG | none / none / none (only `fastlane/.../changelogs/default.txt`: "First release — Ostomate 2.0.") |
| Open PRs | 0 (`gh pr list`) |
| Latest CI | run 35642780279 `in_progress` (push to main 2026-09-21T19:07Z); prior runs 2026-07-14 all success |
| Versions | Android `versionCode 1`, `versionName "1.0"` (`androidApp/build.gradle.kts`); iOS `CFBundleShortVersionString 1.0` / `CFBundleVersion 1` literal in `iosApp/iosApp/Info.plist`. About screen shows git SHA via generated `BuildInfo.kt` |
| Phase | Phase 2.5 "test hardening": CLAUDE.md (2026-07-13) says 2.5.1–2.5.8 done, 2.5.9 open. Phases 3–5 (signing, store listings, Play internal, TestFlight, production) all open except 3.3 app icon and 3.5 GitHub Pages |

**Obviously broken or half-finished.**
- `planning/05-dev-plan.md` is internally inconsistent about 2.5.7/2.5.8 status; commit `d2bfcdf` and `ci.yml` show 2.5.8 is done. CLAUDE.md acknowledges docs drift ("Trust `test-results/*/TEST-*.xml`").
- CLAUDE.md says "57 composeApp tests"; the XML today shows 60.
- `fastlane/Appfile` has `app_identifier("com.ostimate.app")` (typo; real id is `com.ostomate.app`).
- Untracked `iosApp/iosApp/Secrets.swift` exists locally while `.gitignore` comments say there is deliberately no such file. Not gitignored.
- kotlinx-datetime deprecation warnings in `CalendarScreen.kt` / `SettingsViewModel.kt`; Gradle warns about features incompatible with Gradle 10.
- Backlog (`planning/bug-backlog.md`): BUG-07 (iOS HP print) landed but unverified on hardware; BUG-11 in progress in the working tree.
- TODO/FIXME in main sources: 1 (`shared/src/androidMain/.../BiometricAuthenticator.android.kt:13`).

**Remote / visibility.** `origin` = `git@github.com:bhelco1/Ostomate2.git`. PUBLIC (`gh repo view --json isPrivate` → false).

### 2. Dev stack

**Build toolchain.** Gradle 9.3.1 (wrapper, sha-pinned), configuration cache + build cache on, JDK 21 (CI zulu 21; local Temurin 21.0.11), JVM target 11. Convention plugins in `build-logic/` (`ostomate.kmp-library`, `ostomate.android-app`). Modules `:shared`, `:composeApp`, `:androidApp`. Version catalog `gradle/libs.versions.toml`.

| Component | Version |
|---|---|
| Kotlin / KSP | 2.3.21 / 2.3.9 |
| Compose Multiplatform / material3 / material-icons | 1.11.0 / 1.11.0-alpha07 / 1.7.3 |
| AGP | 9.0.1 |
| compileSdk / minSdk / targetSdk | 36 / 26 / 36 |
| Room KMP / androidx.sqlite | 2.8.4 / 2.6.2 |
| Koin | 4.2.1 |
| kotlinx coroutines / datetime / serialization | 1.10.2 / 0.7.1 / 1.8.1 |
| navigation-compose / lifecycle-runtime-compose | 2.9.2 / 2.10.0 |
| DataStore preferences-core | 1.1.7 |
| okio / qrose / zxing | 3.9.1 / 1.0.1 / 3.5.3 |
| sentry-android / sentry-cocoa (SPM) | 7.19.0 / 9.17.1 |
| glance-appwidget / biometric / work-runtime / activity-compose | 1.1.1 / 1.1.0 / 2.11.2 / 1.13.0 |
| detekt / ktlint-gradle | 1.23.8 / 12.1.2 |
| JaCoCo / Kover (in catalog, unused) | 0.8.13 / 0.8.3 |
| kotest-property / robolectric / roborazzi / androidx-test-core | 5.9.1 / 4.14.1 / 1.68.0 / 1.6.1 |
| Maestro (CI-pinned) | 2.6.1; 2.11.0 since Ostomate2 PR #37 (2026-10-02) |

**Kotlin/Native targets.** `iosArm64`, `iosSimulatorArm64` (iosX64 removed 2026-07-13). `composeApp` exports static framework `Shared`.

**iOS.** `iosApp/iosApp.xcodeproj` (Swift 5.0, deployment target 15.3), SwiftUI entry + WidgetKit target `iosApp/OstomateWidget/`. SPM only (sentry-cocoa 9.17.1); no CocoaPods. Bundle id from `iosApp/Configuration/Config.xcconfig` (`BUNDLE_ID=com.ostomate.app`, `TEAM_ID` empty). SwiftLint config present.

**Database.** Room KMP; `sqlite-bundled` driver on iOS, `AndroidSQLiteDriver` on Android/Robolectric. Schema JSON exported to `shared/schemas/…/{2,3}.json`. Settings in DataStore. Backup JSON via kotlinx-serialization.

**Backend services / third-party APIs.** None. Grep for Ktor/OkHttp/HttpClient/URLSession/Firebase/analytics across source and Gradle: zero hits. Only outbound integration is Sentry, opt-in, disabled by default; manifest disables Sentry auto-init.

**Secrets pattern (names only).** Android `SENTRY_DSN` from gitignored `local.properties` or `-PSENTRY_DSN` → `BuildConfig`; local `local.properties` currently holds only `sdk.dir`. iOS DSN via gitignored `iosApp/Configuration/Secrets.xcconfig`. CI references `CODECOV_TOKEN` and `github.token` only. No signing config anywhere in the repo (keystores gitignored).

**Hosting / build / deploy.**
- GitHub Pages serves `docs/` (privacy policy, store listing) at https://bhelco1.github.io/Ostomate2/.
- QA dashboard: CI force-pushes `index.html`, `data.json`, `history.json` to branch `test-dashboard`; `scripts/pi/update-dashboard.sh` pulls it on a Raspberry Pi every 15 min.
- Fastlane (`fastlane/Fastfile`): android `screenshots`, `build_release`, `internal`, `production`; ios `beta` (TestFlight), `release`. Not invoked by CI. `Appfile` has `apple_id bhelco@gmail.com`, empty team ids.
- `scripts/`: `run_android_e2e.sh` (7 Maestro flows, captures diagnostics to `e2e-diagnostics/`), `pick_ios_simulator.py`, `generate_test_dashboard.py` (parses JUnit XML + JaCoCo XML + jobs JSON; history capped at 200 entries).

### 3. Test stack

**Frameworks (deps and imports confirmed).** `kotlin.test` (17 files), JUnit4 `org.junit.Test` (7 files, all Robolectric), `kotlinx-coroutines-test` (28 imports), `io.kotest.property` (10 imports), Robolectric 4.14.1 + androidx.test.core, Roborazzi screenshot capture, Koin test wiring, Maestro YAML. Not present: MockK, Mokkery, Turbine, Kotest runner, Compose UI test (`ui-test-junit4`), Espresso, XCTest/XCUITest, `androidInstrumentedTest`.

**Inventory by layer** (`@Test` grep per source set).

| Source set / dir | Layer | Test files | Cases |
|---|---|---:|---:|
| `shared/src/commonTest` | Unit: pure domain (CalendarAggregator 7, DeepLinkParser 15, NotificationScheduler 5, PredictionEngine 13) + data-layer without SQLite (ChangeSource 4, DiagnosticLog 6, SettingsRepository 3; the last uses a real DataStore temp file, arguably integration). 3 `*Scenarios.kt`/`TestSupport.kt` helpers hold 0 `@Test` | 11 (8 with tests) | 53 |
| `shared/src/androidHostTest` | Integration: real in-memory Room DB via Robolectric (ChangeEventDao 14, Repository 14 incl. backup round-trip, Migration 1) | 4 (3) | 29 |
| `shared/src/iosTest` | Integration: same scenarios on iOS simulator with native SQLite | 4 (3) | 29 |
| `composeApp/src/commonTest` | Unit: ViewModel/UiState with fake DAOs (Calendar 6, History 5, Home 9, Onboarding 7, ManageSupplies 10, Settings 6, Stats 7) | 9 (7) | 50 |
| `composeApp/src/androidHostTest` | UI screenshot: Roborazzi/Robolectric native graphics (Calendar 2, Home 3, Onboarding 3, QrLabels 2); 10 PNG baselines in `composeApp/screenshots/` | 5 (4) | 10 |
| `.maestro/*.yaml` | E2E Android (emulator API 29) | 7 flows | n/a |
| `.maestro/ios/*.yaml` + reused `08_biometric_gate.yaml` | E2E iOS (fresh simulator) | 4 (+1) flows | n/a |
| `androidApp` tests, `iosApp` XCTest | none | 0 | 0 |
| **Total** | | **33 Kotlin + 11 YAML** | **171** |

API layer: not applicable (no network API). Per Gradle task: `:shared:testAndroidHostTest` = 82, `:composeApp:testAndroidHostTest` = 60, `:shared:iosSimulatorArm64Test` = 82, `:composeApp:iosSimulatorArm64Test` = 50.

**Coverage.** JaCoCo on the JVM host task only. `shared/build.gradle.kts`: scope `domain/**`, `data/**` excluding Room generated `*_Impl*`, `OstomateDatabaseConstructor*`, `DatabaseBuilder_*`; floor 0.91. `composeApp/build.gradle.kts`: scope `ui/**/*ViewModel*`, `ui/**/*UiState*`; floor 0.93. Tasks `jacocoHostTestReport` (XML + HTML) and `jacocoCoverageVerification` run in CI. Local reports: shared LINE 357/388 = 92.0%; composeApp LINE 497/527 = 94.3%. `planning/05-dev-plan.md` records baseline 52.6% (2026-07-02) → 92.0%.

**Mocks / fixtures / test data.** No mocking library. Hand-written fakes in `composeApp/src/commonTest/.../ui/TestDoubles.kt` (`FakeSupplyTypeDao`, `FakeChangeEventDao`, `FakeBackupDao`, `RecordingNotifier`, `FakeBiometricAuth`, `RecordingCrashReporter`, `InMemoryDataStore`) sit at the DAO/platform boundary so real repositories and ViewModels are exercised. Shared cross-platform scenario objects (`ChangeEventDaoScenarios`, `MigrationScenarios`, `RepositoryScenarios`) are invoked from per-platform test classes; `expect fun testTempDir()` with android/ios actuals. Screenshot tests pin `FixedClock` 2026-03-15T12:00Z, UTC, `sdk=34`, `w411dp-h891dp-xhdpi`, 0.2% change threshold. No JSON fixture dirs; migration tests use Room schema JSON.

**Local unit-test run (performed).** Preconditions met: `~/.gradle/caches` populated (9.3 GB), ran with `--offline`. `git status --porcelain` before showed only the untracked `Secrets.swift`.

```
./gradlew --offline :shared:testAndroidHostTest :composeApp:testAndroidHostTest --console=plain
  BUILD SUCCESSFUL in 28s; :shared task UP-TO-DATE (cached from a 12:56 run today);
  :composeApp:testAndroidHostTest: 60 tests, 0 failures, 0 errors, 0 skipped, 21.2 s suite time
./gradlew --offline :shared:testAndroidHostTest --rerun --console=plain
  BUILD SUCCESSFUL in 6s; 82 tests, 0 failures, 0 errors, 0 skipped, 5.4 s suite time
```

Result: 142 pass / 0 fail / 0 skip. JUnit XML written to `shared/build/test-results/testAndroidHostTest/TEST-*.xml` (10 files) and `composeApp/build/test-results/testAndroidHostTest/TEST-*.xml` (11 files). JaCoCo tasks were not run. Only gitignored `build/` changed. Caveat: a concurrent session modified `HomeScreen.kt` while the composeApp task was running; the result was still green, but the compiled snapshot may have been mid-edit.

### 4. CI/CD

Single pipeline: `.github/workflows/ci.yml` ("CI"). Triggers: `push` to `main`; `pull_request` (all branches); `workflow_dispatch`. No other CI system. Fastlane is not invoked by CI.

| Job | Runner | Condition | Test commands | Artifacts | Secrets |
|---|---|---|---|---|---|
| `detect-changes` | ubuntu | always | path filter → output `ios` (true on non-PR; on PR only if iOS-relevant paths changed) | none | none |
| `android` | ubuntu | always | ktlint, detekt, `assembleDebug`, then `./gradlew :shared:testAndroidHostTest :shared:jacocoHostTestReport :shared:jacocoCoverageVerification :composeApp:testAndroidHostTest :composeApp:jacocoHostTestReport :composeApp:jacocoCoverageVerification --stacktrace`; coverage table to step summary; Codecov upload (conditional, `continue-on-error`) | `screenshot-diffs` (on failure), `coverage-report` (JaCoCo HTML+XML, always), `junit-results-jvm` (JVM JUnit XML, always), `androidApp-debug` APK | `CODECOV_TOKEN` |
| `android-e2e` | ubuntu | not PR; needs `android` | Maestro 2.6.1 (2.11.0 since 2026-10-02) on emulator API 29 via `scripts/run_android_e2e.sh` (7 flows) | `e2e-diagnostics` (on failure) | none |
| `ios` | macos-latest | `ios == true` | SwiftLint `--strict`; `./gradlew :shared:iosSimulatorArm64Test :composeApp:iosSimulatorArm64Test`; unsigned `xcodebuild` simulator build | none | none |
| `ios-e2e` | macos-latest | not PR | 5 Maestro flows on a fresh simulator (`MAESTRO_DRIVER_STARTUP_TIMEOUT=300000`) | `maestro-ios-debug` (on failure) | none |
| `dashboard` | ubuntu | `always()` and not PR; needs all four | downloads `junit-results-jvm` + `coverage-report`, fetches jobs JSON via `gh api`, runs `scripts/generate_test_dashboard.py`, force-pushes `site/` to branch `test-dashboard` | published to branch | `github.token` |

**Machine-readable results.**
- JVM unit/integration/screenshot: yes. Gradle writes JUnit XML by default; uploaded as artifact `junit-results-jvm` with `if: always()`.
- Coverage: JaCoCo XML + HTML uploaded as `coverage-report`. Codecov step is inert unless `CODECOV_TOKEN` is set (secret existence unknown).
- iOS simulator tests: Kotlin/Native writes XML to `{shared,composeApp}/build/test-results/iosSimulatorArm64Test/` (confirmed locally) but the `ios` job does not upload it.
- Maestro E2E: console PASS/FAIL lines and exit code only. Maestro documents `--format junit --output <file>`; not used, and not verified against pinned 2.6.1.
- xcodebuild: build only, no XCTest, no `.xcresult`.

**Where a "post results to testpulse" step would go.**
1. PR and main: job `android`, immediately after "Upload JUnit results", `if: always()`. Files: `shared/build/test-results/testAndroidHostTest/TEST-*.xml`, `composeApp/build/test-results/testAndroidHostTest/TEST-*.xml`, `shared/build/reports/jacoco/jacocoHostTestReport/jacocoHostTestReport.xml`, `composeApp/build/reports/jacoco/jacocoHostTestReport/jacocoHostTestReport.xml`.
2. iOS simulator: job `ios`, after "Shared + ViewModel tests on iOS simulator (arm64)", `if: always()`. Files: `{shared,composeApp}/build/test-results/iosSimulatorArm64Test/TEST-*.xml`.
3. Post-merge aggregate: job `dashboard`, after "Generate dashboard". `site/data.json` already holds the four-category summary, coverage, and per-job conclusions; `site/history.json` holds up to 200 prior runs (a back-fill source).
4. E2E: jobs `android-e2e` / `ios-e2e` produce no result files today.

### 5. Gaps

**Little or no test coverage.**
- `androidApp/src/main` (`MainActivity`, `OstomateApp`, Glance `OstomateWidget`): 0 tests; only E2E.
- `iosApp` Swift (entry, `ContentView`, widget): 0 XCTest; SwiftLint only.
- Platform actuals in `shared/src/androidMain` and `iosMain` (`Notifier`, `BiometricAuthenticator`, `FileSharer`, `QrCodeEncoder`, `CrashReporter`/`SentryBridge`, `FeedbackHelper`, `DatabaseBuilder`, `DiagnosticLogStore`, `LastCrashStore`, `DeepLink.ios.kt`): no direct tests; excluded from JaCoCo scope.
- Koin modules (`shared/.../di/Koin.kt`, `composeApp/.../di/AppKoin.kt`): no DI graph verification.
- Composables: screenshot coverage only for Home, Calendar, Onboarding, QrLabels. Nothing for History, Stats, Settings, ManageSupplies, PrivacyPolicy, ReorderWarnings, Gallery screens, shared components (`LogButton`, `Pill`, `SupplyCard`, `WarningBanner`), `App.kt` navigation, `QrPrinter`, `FileImportLauncher`, theme.
- `DeepLinkBus`, `Time`, `ApplianceType`/`SupplyKind` enums: no dedicated tests (**inferred** trivial).

**Missing test layers.** No Compose semantics/UI tests (`androidInstrumentedTest` absent), no XCTest/XCUITest, no iOS screenshot tests, no mutation testing, no automated accessibility checks, no flaky-test quarantine (all listed as open in 2.5.9). iOS E2E mirrors only 4 of 7 Android flows. E2E and the iOS build run only post-merge or on dispatch, so a PR can merge with broken E2E.

**Flaky / skipped / disabled.** 0 `@Ignore`/`@Disabled`/`XCTSkip` in test dirs. CI soft spots: Codecov step and dashboard artifact downloads are `continue-on-error`; `ios-e2e` needed a 300 s driver-startup timeout (PR #21); emulator boot timeout 900 s. CLAUDE.md post-mortems record CI silently dead for 11 days (invalid workflow) and E2E once reported green without ever passing. Screenshot tests tolerate 0.2% pixel change.

**Changes needed to report to testpulse after each CI run.**
- Add step(s) to `ci.yml` (`android` job after "Upload JUnit results"; optionally `ios` and `dashboard` jobs) that POST the JUnit XML and JaCoCo XML, `if: always()`.
- New repo secret(s), e.g. `TESTPULSE_TOKEN` (plus URL if not fixed). Existing pattern: `CODECOV_TOKEN` hoisted to job `env` so it can be used in `if:`.
- Decide scope: `android` runs on every PR; E2E, iOS E2E, and dashboard only on main push / dispatch.
- For E2E, emit JUnit from Maestro (`--format junit --output`) in `scripts/run_android_e2e.sh` and the inline iOS loop, or parse PASS/FAIL lines.
- For iOS-sim results, upload or post `{shared,composeApp}/build/test-results/iosSimulatorArm64Test/TEST-*.xml` from the `ios` job.
- Run metadata available: `GITHUB_SHA`, `GITHUB_REF_NAME`, run URL, jobs JSON (the dashboard job already fetches it).
- `planning/08-test-strategy.md` §6 and `planning/07-business-plan.md` state a preference for self-hosted reporting and require a written cost case for any recurring-cost service.

**Planning docs of QA relevance.** `planning/04-test-plan.md` (pyramid, SQLite tests, E2E journeys, manual device checklist), `planning/08-test-strategy.md` (audit dated 2026-06-22, stale counts; coverage floor policy; reporting policy), `planning/05-dev-plan.md` (phase checklist, inconsistent as noted), `planning/bug-backlog.md` (BUG-01…11, FEAT-00/01), `planning/tasks/*-brief.md`.

---

## routeserve

routeserve is a **private** project, and its internals are deliberately left out of this repo. testpulse shows its totals, trends, test and suite names, and coverage, and hides its repo link, CI run links, failure text and full commit SHAs (spec section 9). This section records only what testpulse needs to ingest its results.

### 1. Overview

The tagline shown on the site, from `projects/routeserve.yaml`: "Field-service CRM, scheduling, and route planning. Mobile app plus multi-tenant API." It is a TypeScript npm-workspaces monorepo, and each of its three workspaces reports as its own module: `apps/backend`, `apps/mobile` and `packages/shared`.

### 2. Test stack

At the level the site's test stack shows:

- Runners: Jest 30 (backend, shared) and Jest 29 with jest-expo (mobile).
- API and service tests: Supertest, nock.
- Component tests: React Native Testing Library, msw.
- E2E: Maestro. 13 flows are authored but have not been run; `projects/routeserve.yaml` declares them as a suite with status `authored_not_executed`.
- Coverage: istanbul `coverage-summary.json` per workspace, with an 80% lines floor for each in `projects/routeserve.yaml`.

### 3. Test counts by layer

Counts as the layer rules in `projects/routeserve.yaml` resolve them against the captured fixtures in `fixtures/routeserve/jest/` (asserted in `lib/ingest/layer-rules.test.ts`).

| Module | Layer | Cases |
|---|---|---:|
| `packages/shared` | unit | 119 |
| `apps/backend` | api | 269 |
| `apps/backend` | unit | 229 |
| `apps/backend` | integration (the PostGIS suite; runs in CI only, excluded from the fixture) | 3 |
| `apps/mobile` | component | 165 |
| `apps/mobile` | unit | 263 |
| **Total Jest** | | **1,048** (1,045 in the fixtures) |
| Maestro E2E | e2e, declared, not reported | 13 flows |

### 4. Reporting

routeserve's CI has reported to testpulse since 2026-09-24 (spec section 17, Phase 3). After its test step, job `test` runs the canonical reporter, `scripts/testpulse-report.sh` (spec Appendix A), once per workspace: platform `node`, format `jest` with the workspace's `test-results.json`, and coverage format `istanbul` with its `coverage/coverage-summary.json`. That is three reports per run. Run status comes from the Jest results, never from the step's exit code. Its history is not a backfill source (spec section 17, Phase 4), so its trend starts at go-live.
