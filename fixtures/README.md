# Fixtures

Real result files captured from the reporting projects. Parser tests run against these files and nothing in this directory is hand-written. Files here are never edited after capture, except for the documented path scrubs below; if a fixture needs to change, capture a new one and record its provenance here.

## Ostomate2

Public repo `bhelco1/Ostomate2`. JUnit and JaCoCo XML come from CI run 35644117162 (commit `2ec580f377e52f0a1ae584661ff09b07821ea1e2`, job "Android build + JVM tests", artifacts `junit-results-jvm` and `coverage-report`), captured 2026-09-21 with:

```
gh run download -R bhelco1/Ostomate2 35644117162 -n junit-results-jvm -D <dir>
gh run download -R bhelco1/Ostomate2 35644117162 -n coverage-report -D <dir>
```

The `coverage-report` artifact also ships a JaCoCo HTML report; only the XML was kept. CI files carry `hostname="runnervmlun5p"`.

| Path | Source | Counts |
|---|---|---|
| `ostomate2/junit/jvm/shared/TEST-*.xml` (10 files) | `junit-results-jvm` artifact, `shared/build/test-results/testAndroidHostTest/` | 10 suites, 82 tests, 0 failures, 0 errors, 0 skipped |
| `ostomate2/junit/jvm/composeApp/TEST-*.xml` (11 files) | `junit-results-jvm` artifact, `composeApp/build/test-results/testAndroidHostTest/` | 11 suites, 60 tests, 0 failures, 0 errors, 0 skipped |
| `ostomate2/junit/ios-sim/composeApp/TEST-*.xml` (7 files) | Local run, `composeApp/build/test-results/iosSimulatorArm64Test/`, mtime 2026-09-21 12:57 -0600 (see below) | 7 suites, 50 tests, 0 failures, 0 errors, 0 skipped |
| `ostomate2/jacoco/shared.xml` | `coverage-report` artifact, `shared/build/reports/jacoco/jacocoHostTestReport/jacocoHostTestReport.xml` | LINE 457 covered / 33 missed; BRANCH 105 / 35 |
| `ostomate2/jacoco/composeApp.xml` | `coverage-report` artifact, `composeApp/build/reports/jacoco/jacocoHostTestReport/jacocoHostTestReport.xml` | LINE 497 covered / 30 missed; BRANCH 116 / 48 |

The `shared` JVM results and `shared.xml` in this run were restored from Gradle's build cache rather than re-executed: they are byte-identical to the previous run's (35643254905), with the same XML timestamps and the same JaCoCo session id (`runnervmlun5p-a230f272`). Ingestion must therefore not assume that an uploaded file is a fresh execution.

The iOS-simulator composeApp files did not come from CI, which does not upload them. They were copied from a local `:composeApp:iosSimulatorArm64Test` run on a developer machine (hence `hostname="Bobbys-MacBook-Pro.local"`) with mtimes preserved. The local checkout was at `14feb88` at copy time, but the run happened earlier that day, so the files may predate the repo's HEAD at capture time.

### Dashboard history

The QA dashboard's history file, the backfill source described in spec section 17, Phase 4. Captured 2026-09-24 from the `test-dashboard` branch at commit `ec92502` (committed 2026-09-22) and committed byte for byte (2-space indented, no trailing newline):

```
git show origin/test-dashboard:history.json > <scratch>/Ostomate2-history.json
```

| Path | Source | Counts |
|---|---|---|
| `ostomate2/history/history.json` | `test-dashboard` branch, `history.json`, written by `scripts/generate_test_dashboard.py` | 30 entries, 13 on `main` and 17 on feature branches, 29 distinct run IDs; every `unit`, `integration`, and `ui` status `pass` |

No scrub was needed: the repo is public and the file holds only commit SHAs, branch names, Actions run URLs, timestamps, counts, statuses, and coverage percentages. routeserve's `qa-dashboard` history was not captured because it is not a backfill source.

### Maestro E2E

Maestro `--format junit` output from CI run 36662953449 (a `workflow_dispatch` of branch `ci/e2e-junit-artifacts-continue` at commit `8f3be43b4769d431df63aae97f95b05f9bc731f7`, jobs "Android E2E (Maestro)" and "iOS E2E (Maestro)", artifacts `e2e-junit-android` and `e2e-junit-ios`), captured 2026-09-29 (the run started 2026-09-30 03:07 UTC) with:

```
gh run download -R bhelco1/Ostomate2 36662953449 -n e2e-junit-android -D <dir>
gh run download -R bhelco1/Ostomate2 36662953449 -n e2e-junit-ios -D <dir>
```

Each job runs `maestro test --format junit --output e2e-results/<flow>.xml` once per flow and posts `e2e-results/*.xml` in one request as module `e2e` (jobs `android-e2e` and `ios-e2e`, platforms `android-emulator` and `ios-sim`), which is why the files sit under `junit/<platform>/e2e/`. Every file is a `testsuites` wrapper around one `testsuite name="Test Suite"` with one `testcase`, and no `timestamp`. The testcase carries the flow title as both `name` and `classname`, plus Maestro's own `id`, `file` and `status` attributes.

| Path | Source | Counts |
|---|---|---|
| `ostomate2/junit/android-emulator/e2e/*.xml` (7 files) | `e2e-junit-android` artifact, `e2e-results/` | 7 flows, 7 passed |
| `ostomate2/junit/ios-sim/e2e/*.xml` (5 files) | `e2e-junit-ios` artifact, `e2e-results/` | 5 flows, 4 passed, 1 failed |

The failed iOS flow, `01_ios_deep_link_log.xml`, has `status="ERROR"` on the testcase and a `<failure>` child (no `message` attribute) whose text is Maestro's crash notice. No scrub was needed: the repo is public, and the only machine detail is the iOS testsuite's `device` attribute, the name, OS version and UDID of a simulator created on the CI runner (`maestro-ios - iOS 26.5 - 1D2D408B-…`), which identifies nothing outside that run. The Android files carry `device="test"`. The files were re-downloaded and compared byte for byte before commit.

## routeserve

Private repo, captured from its `main` as of 2026-07-18. Its commit SHAs are left out here because the project is private. CI does not upload Jest JSON, so all three workspaces were run locally on 2026-09-21 with `--ci`. The backend ran with the `corridor.postgis` suite excluded (it needs a live PostGIS database) and `DATABASE_URL` pointed at a closed port; `SENTRY_DSN` was unset. Coverage was written outside the repo with `--coverageReporters=json-summary`, so no lcov or HTML was produced. No `.env*` file was read.

Jest JSON:

```
cd packages/shared && CI=1 npx jest --ci --json --outputFile=<scratch>/shared-results.json
cd apps/backend && env -u SENTRY_DSN CI=1 NODE_ENV=test DATABASE_URL='postgresql://nobody@127.0.0.1:1/unreachable_no_db' npx jest --ci --testPathIgnorePatterns 'corridor\.postgis' --json --outputFile=<scratch>/backend-results.json
cd apps/mobile && CI=1 npx jest --ci --json --outputFile=<scratch>/mobile-results.json
```

istanbul `coverage-summary.json`:

```
cd packages/shared && CI=1 npx jest --ci --coverage --coverageDirectory=<scratch>/shared --coverageReporters=json-summary
cd apps/backend && env -u SENTRY_DSN CI=1 NODE_ENV=test DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:1/unused' npx jest --ci --coverage --coverageDirectory=<scratch>/backend --coverageReporters=json-summary --testPathIgnorePatterns 'corridor\.postgis'
cd apps/mobile && CI=1 npx jest --ci --coverage --coverageDirectory=<scratch>/mobile --coverageReporters=json-summary
```

| Path | Source | Counts |
|---|---|---|
| `routeserve/jest/shared.json` | `packages/shared`, Jest `--json` output | 14 suites, 119 tests, 119 passed, 0 failed, 0 pending, `success: true` |
| `routeserve/jest/backend.json` | `apps/backend`, Jest `--json` output (3 PostGIS cases excluded) | 33 suites, 498 tests, 498 passed, 0 failed, 0 pending, `success: true` |
| `routeserve/jest/mobile.json` | `apps/mobile`, Jest `--json` output | 39 suites, 428 tests, 428 passed, 0 failed, 0 pending, `success: true` |
| `routeserve/istanbul/shared.json` | `packages/shared`, `coverage-summary.json` | 16 files + `total`: lines 102/102, branches 5/5 |
| `routeserve/istanbul/backend.json` | `apps/backend`, `coverage-summary.json` | 36 files + `total`: lines 1862/1968, branches 941/1157 |
| `routeserve/istanbul/mobile.json` | `apps/mobile`, `coverage-summary.json` | 85 files + `total`: lines 1496/1551, branches 1139/1300 |

### Scrub

The six routeserve files contain absolute source paths. One plain string substitution was applied: the absolute path of the local checkout (under the developer's home directory) was replaced with the GitHub Actions workspace path `/home/runner/work/routeserve/routeserve/` (223 replacements across the six files). Nothing else changed; every file was re-parsed as JSON afterwards and the counts above are the same as in the raw output. Every `failureMessages` array and every `testResults[].message` in the files is empty. Raw, unscrubbed captures are never committed.

### Failing run

Captured 2026-09-21 from a detached git worktree of a later commit of `main` (the repo had moved on since the passing captures), so the main checkout stayed untouched. One existing expectation in the `packages/shared` asset schema tests was inverted (a `toBe(true)` on a case the schema accepts became `toBe(false)`) so that exactly one test fails. The JSON was written, the edit was reverted with `git checkout -- .`, the worktree was removed and pruned, and `git status --short` on the main checkout was empty afterwards.

```
cd packages/shared && CI=1 npx jest --ci --json --outputFile=<scratch>/shared-one-failure.json
```

| Path | Source | Counts |
|---|---|---|
| `routeserve/jest/shared-one-failure.json` | `packages/shared`, Jest `--json` output | 14 suites (13 passed, 1 failed), 119 tests, 118 passed, 1 failed, 0 pending, `success: false` |

Scrub 1: the same single substitution, the worktree's absolute path (under the session scratch directory) replaced with `/home/runner/work/routeserve/routeserve/` (28 replacements). The file was re-parsed as JSON afterwards and the counts above are the same as in the raw output; a grep for `bobbyhelco`, `/Users/`, `/private/tmp` and `@gmail` finds nothing.

Scrub 2 (2026-09-22): the first scrub left private source in the file. The failed suite's `testResults[].message` held Jest's console report for the failure, which ends in a code frame: six lines of `asset.test.ts` with ANSI colour codes, including the `describe`/`it` titles, the schema call and a literal test value. `message` was set to `""` on all 14 `testResults` entries and `failureDetails` to `[]` on all 119 `assertionResults` entries (only the failed one was non-empty; it held the matcher's `matcherResult`, not source, and was cleared so nothing outside `failureMessages` describes the failure). The file was rewritten as `JSON.stringify` output plus the trailing newline, exactly as Jest wrote it, so nothing else changed; the counts above are unchanged. The failed test's `failureMessages[0]` is what the parser reads: the matcher line, the `Expected`/`Received` pair, and 16 stack lines under the scrubbed path or Node internals, with no code frame. A grep for `\u001b` finds nothing.

## testpulse

JUnit XML from this repo's own Playwright suite, captured 2026-09-21 on a developer machine (Chromium project, so `hostname="chromium"`). A temporary spec `tests/e2e/zz-deliberate-failure.spec.ts` held one test that fails on `expect(1).toBe(2)` and one `test.skip`; it was deleted after the capture and is not committed. The config's `webServer` built and started the site before the run.

```
PLAYWRIGHT_JUNIT_OUTPUT_FILE=<scratch>/playwright.xml npx playwright test --reporter=junit
```

| Path | Source | Counts |
|---|---|---|
| `testpulse/junit/playwright-one-failure.xml` | `tests/e2e`, Playwright `junit` reporter (`testsuites` wrapper, one `testsuite` per spec file) | 2 suites, 3 tests, 1 passed, 1 failed, 1 skipped, 0 errors |

The failing testcase carries `failure@message`, the full Playwright error in CDATA, and a `system-out` CDATA block listing the trace attachments; the skipped testcase has no `time` attribute and a `properties` child.

### Scrub

The failure stack and the attachment paths contain the absolute path of the local checkout. One plain string substitution was applied: that path prefix was replaced with `/home/runner/work/testpulse/testpulse/` (3 replacements: 1 in the failure stack, 2 in `system-out` attachment paths, where the relative `../../../../../../` that Playwright emits in front of the absolute path was left as is). Nothing else changed; a grep for `bobbyhelco`, `/Users/`, `/private/tmp` and `@gmail` finds nothing.

## Known gaps

- No fixture contains a JUnit `<error>` element or a Jest `pending`/`todo`/`skipped` result. The parser tests for those branches rewrite one of the captured files in the test itself and say so in a comment; no hand-written result sample exists.
- Ostomate2's Gradle JUnit has never failed in CI: the nearest failed run (35643254905) failed in `xcodebuild` and Maestro, not in JUnit. The failing JUnit fixtures are Playwright's and the one crashed iOS Maestro flow, which uses `<failure>` despite its `status="ERROR"` attribute, so it adds no `<error>` element.
- Ostomate2 `shared` iOS-simulator results were not captured: the local copy was stale (July, 79 tests) and did not match HEAD.
