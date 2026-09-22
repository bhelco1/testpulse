# Fixtures

Real result files captured from the reporting projects. Parser tests run against these files and nothing in this directory is hand-written. Files here are never edited after capture, except for the single documented scrub below; if a fixture needs to change, capture a new one and record its provenance here.

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

## Known gaps

- No file here contains a failing test. The nearest failed Ostomate2 CI run (35643254905) failed in `xcodebuild` and Maestro, not in JUnit; routeserve has never produced Jest JSON in CI. A failing-run fixture is still needed before the Phase 1 parser tests for failure and error branches.
- Ostomate2 `shared` iOS-simulator results were not captured: the local copy was stale (July, 79 tests) and did not match HEAD.
