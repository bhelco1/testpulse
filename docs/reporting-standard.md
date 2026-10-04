# testpulse reporting standard, v1

Version 1, 2026-09-30. Owner: testpulse (this file). Implementation truth: [`docs/spec.md`](spec.md).

This is the rulebook for a project that reports test results to testpulse. It is written for whoever changes that project's CI, test frameworks or result output, human or Claude session, working in the project's own repository. It states what the project must do; the spec states how testpulse implements it, and each rule cites the spec section it comes from.

**MUST** marks a requirement: a project that does not meet it does not conform to v1. **SHOULD** marks a practice to follow unless there is a stated reason not to. Everything else is explanation.

## 1. Purpose, scope and versioning

testpulse shows a project's test results only as well as the project reports them. A suite that runs but does not report is invisible, and a job that goes red without reporting leaves the run looking green. That happened: Ostomate2's Maestro E2E jobs produced no machine-readable results and had no report step, so a red E2E run left testpulse showing the run as passed. This standard exists so that no project has to find the rules by breaking them.

**Scope.** Every repository registered as a testpulse project (a `projects/<slug>.yaml` in this repo), and every CI workflow in it that runs tests.

**Single source.** The standard lives only in this file. A project never copies it; it links here and states the version it conforms to (section 11). Facts about one project (its layers, floors, declared suites, name affixes) live in that project's `projects/<slug>.yaml` in this repo, not in the standard and not in the project's repo.

**Versions.**

- A change that adds, removes or tightens a MUST or SHOULD creates the next version (v2, v3, …). It is made in a testpulse PR that updates this file, adds a row to the changelog at the end, and adds a row to the spec's decision log ([spec §19](spec.md#19-decision-log)).
- A change that only clarifies wording, fixes a link or updates an example keeps the version number.
- A project conforms to the version its conformance statement names. Moving to a new version is a change in that project's repo: meet the new rules, then update the version in its statement.

## 2. What must report

| # | Rule | Source |
|---|---|---|
| 2.1 | Every CI job that runs tests MUST report its results to testpulse, E2E jobs included. A job that runs tests for several modules or platforms sends one report for each (section 4). | [spec §5.3](spec.md#53-reports); 2026-09-21 decision "One POST per (job, module, platform)" |
| 2.2 | The report step MUST run whether or not the tests passed: `if: always()` on GitHub Actions, or the equivalent elsewhere. A red run is the data testpulse exists to show. | [Appendix A](spec.md#appendix-a-reporter-script-and-ci-steps) |
| 2.3 | The result files MUST exist after a failing run. A report step that runs after a failure but finds no file sends nothing the endpoint accepts (section 7). | Follows from 2.2 |
| 2.4 | On a failing run, every test task MUST still run and write its results. A failure in one module, file, flow or platform does not stop the others; see the table below. | Decision 2026-09-30 |
| 2.5 | No silent suites. A suite that runs in CI but cannot yet produce a result file testpulse accepts MUST be listed in the project's `declared_suites` with `status: runs_in_ci_not_reported`. A suite that is written but not executed in CI MUST be listed with `status: authored_not_executed`. Each entry has a `layer` and a `count` of 1 or more. | [spec §5.8](spec.md#58-declared-suites) |
| 2.6 | Declared suites are shown on the project page with their status and are never added to totals or pyramids. When a declared suite starts reporting, its `declared_suites` entry MUST be removed in the same change window (section 9), or the suite is shown both as reported and as not reported. | [spec §5.8](spec.md#58-declared-suites) |
| 2.7 | All of a project's reporting MUST come from its main CI workflow, the one with the weekly schedule (rule 2.8). A suite that runs only in another workflow is a declared suite (rule 2.5), and that workflow sends no reports: routeserve's manual `e2e.yml` and its `dashboard.yml` send none. Each workflow run is its own testpulse run (section 4), so a second reporting workflow would replace the latest run with its part of the suite. Combining runs across workflows is planned (section 10). | Decision 2026-09-30; [spec §17 Phase 3](spec.md#phase-3-routeserve-reporting-live): "Nothing posts from `dashboard.yml`" |
| 2.8 | The project's main CI workflow MUST have a weekly `schedule:` trigger, so a quiet repository can be told apart from one that stopped reporting. The project's `expected_cadence_days` (default 8) matches it. | [spec §12](spec.md#12-integrity-alerts); 2026-09-21 decision "Weekly scheduled CI in each project" |

Results are read from result files, never from the job's exit code or its log. A job can be red with every test green (routeserve's coverage gate), and a log line is not a result (section 3).

### Running every test after a failure (rule 2.4)

| Tool | Do | Because |
|---|---|---|
| Gradle | Pass `--continue` when one invocation runs several test tasks. | Gradle stops at the first failed task by default, so later test tasks never run; with `--continue` every task that does not depend on the failed one still runs. A failing test task still writes its `TEST-*.xml`. |
| Jest | Do not pass `--bail`. | Jest runs every test file by default; `--bail` stops after the first failing test file (or the first n). |
| Vitest | Do not pass `--bail`. | As Jest: every file runs by default, and `--bail` stops after n failures. |
| Playwright | Do not set `maxFailures` (`--max-failures`, `-x`). | Its default, 0, runs every test; any other value stops the run after that many failures. |
| Maestro | Run every flow. A loop that runs flows one at a time MUST carry on after a failing flow and record the failure, as Ostomate2's `scripts/run_android_e2e.sh` does. | Each flow's JUnit file is written by its own `maestro test`, so a loop that exits early leaves the later flows with no result. |
| GitHub Actions | A matrix of test jobs MUST set `strategy.fail-fast: false`. A test job that `needs:` another job, or a test step after one that can fail, SHOULD run after a failure, using a status function in its `if:` (`always()` or `!cancelled()`); a project MAY skip an expensive job on purpose (Ostomate2 skips E2E when its unit job fails), and that run then has no report for it. | `fail-fast` defaults to `true` and cancels the other legs when one fails, which costs nothing to avoid; an `if:` with no status function is implicitly `success()`, so the job or step is skipped. Decision 2026-09-30: running a dependent job is a SHOULD because forcing slow suites to run after an earlier failure has a real cost; the planned expected-reports work shows a deliberately skipped report for what it is. |

## 3. Accepted formats

A report carries exactly one results format and at most one coverage file ([spec §6.2](spec.md#62-parts)). Parsing rules are in [spec §7](spec.md#7-parsers).

| Part | Format | Files per report |
|---|---|---|
| `junit` | JUnit XML | one or more, merged |
| `jest` | Jest `--json` output | exactly one |
| `jacoco` | JaCoCo XML report | at most one, optional |
| `istanbul` | istanbul `coverage-summary.json` | at most one, optional |

A report with coverage and no results is refused. Console output, logs and HTML reports are not accepted in any form.

### Producing them

| Tool | How | Status |
|---|---|---|
| Gradle (JVM, Kotlin Multiplatform) | `build/test-results/<task>/TEST-*.xml`, written by every Gradle test task | In use (Ostomate2); fixtures in `fixtures/ostomate2/junit/` |
| Playwright | `--reporter=junit` with `PLAYWRIGHT_JUNIT_OUTPUT_FILE=<file>` | Fixture in `fixtures/testpulse/junit/`; testpulse itself reports from Phase 7 |
| Maestro | `maestro test --format junit --output <file> <flow>`. When flows run one at a time, give each its own `--output`, or each run overwrites the last | In use (Ostomate2 E2E, Maestro 2.6.1); fixtures in `fixtures/ostomate2/junit/{android-emulator,ios-sim}/e2e/` |
| Vitest | `--reporter=junit --outputFile=<file>` | Not used by any project yet; no fixture |
| Jest | `jest --json --outputFile=<file>` | In use (routeserve `test:ci`); fixtures in `fixtures/routeserve/jest/` |
| JaCoCo | the XML output of the Gradle JaCoCo report task | In use (Ostomate2); fixtures in `fixtures/ostomate2/jacoco/` |
| istanbul (Jest coverage) | `--coverageReporters=json-summary`, giving `coverage/coverage-summary.json` | In use (routeserve); fixtures in `fixtures/routeserve/istanbul/` |

A tool with no fixture in `fixtures/` is unproven, today Vitest. The first project to use it MUST get a real, scrubbed result file captured into testpulse's `fixtures/`, with parser tests, before its reports are relied on (section 9).

### What the parsers require

- **JUnit XML:** a `testsuite` root or a `testsuites` wrapper; every `testcase` has `classname` (the suite) and `name`; no `testsuite` nested inside another; `time` a plain decimal in seconds; no DTD or external entity.
- **Jest JSON:** the file `--json` writes. A test file that fails to load becomes one `error` result named `<suite load failure>`, so it cannot ingest as green. Suites are file paths made repo-relative by `path_prefix`, which the reporter sets to the runner's workspace.
- **JaCoCo XML:** a `report` root with report-level `LINE` counters (and `BRANCH` when present). JaCoCo's own public DOCTYPE is the only DOCTYPE allowed.
- **istanbul:** `total.lines` and `total.branches`, covered and total.

### Limits

| Limit | Value | On breach | Source |
|---|---|---|---|
| Request body | 4 MB | 413 | [spec §6.5](spec.md#65-size) |
| Compressed body | not accepted | 415 | [spec §6.3](spec.md#63-responses) |
| Rate | 60 requests per minute per key | 429 | [spec §6.3](spec.md#63-responses) |
| `suite`, `name` | 1 to 1,000 characters, not blank | report refused, 400 | [spec §7](spec.md#7-parsers) |
| Failure message, detail | 2,000 and 10,000 characters | truncated | [spec §5.6](spec.md#56-result_failures) |
| One test's duration | 2,147,483,647 ms | report refused, 400 | [spec §7](spec.md#7-parsers) |
| One report's duration | one year | report refused, 400 | [spec §7](spec.md#7-parsers) |
| Zero test cases | allowed | stored; 422; the run is `empty` if every report is | [spec §6.3](spec.md#63-responses) |

The 4 MB limit is why reports are per module. A module whose files approach it is split by module or platform; gzip is not supported yet.

## 4. Run identity and naming

**One CI workflow run is one testpulse run.** Every report a workflow run sends carries the same `ci_run_id` (`GITHUB_RUN_ID`) and `run_attempt` (`GITHUB_RUN_ATTEMPT`), and testpulse groups reports into one run by those two values ([spec §5.2](spec.md#52-runs)). The run is `failed` if any report has a failed or errored test, `empty` if no test executed in any report, else `passed`. A job that sends no report is not part of the run at all.

- A re-run of a workflow is a new attempt and so a new testpulse run. Results across attempts on one commit are what flakiness is measured from ([spec §11](spec.md#11-stats-definitions)).
- A separate workflow has its own `GITHUB_RUN_ID`, so its reports would form a separate testpulse run. Rule 2.7 keeps reporting in the main CI workflow for that reason.

### What the latest run shows

The landing page and the project page read Total tests, the pyramid and the latest pass rate from the latest default-branch CI run ([spec §11](spec.md#11-stats-definitions)). That run shows what it executed, nothing more. Coverage is the exception: a module missing from the latest run keeps the value from the last run that reported it (section 6).

- **Partial re-runs.** "Re-run all jobs" gives an attempt in which every job reports. "Re-run failed jobs" gives an attempt holding only the re-run jobs' reports, and as the newest run it becomes the latest run, with only those jobs' tests, until the next full run. On the default branch a project SHOULD use "Re-run all jobs" until testpulse carries missing reports forward from the previous attempt (planned, section 10).
- **Reports that vary by trigger.** A run triggered by an event that skips a suite lowers the latest-run totals until the next run that includes it. Ostomate2's weekly `schedule` run skips its E2E jobs, so after it the latest run has no E2E tests until the next push. Expected reports per trigger are planned (section 10).

The reporter fills run identity from the GitHub Actions environment ([Appendix A](spec.md#appendix-a-reporter-script-and-ci-steps)); a project does not set these by hand. Limits are those of `lib/ingest/meta.ts`.

| Field | From | Rule |
|---|---|---|
| `ci_run_id` | `GITHUB_RUN_ID` | 1 to 100 characters |
| `run_attempt` | `GITHUB_RUN_ATTEMPT` | positive integer; the reporter falls back to 1 |
| `commit_sha` | `GITHUB_SHA` | 7 to 40 hex characters |
| `branch` | `GITHUB_HEAD_REF` on pull requests, else `GITHUB_REF_NAME` | 1 to 255 characters |
| `event` | `GITHUB_EVENT_NAME` | one of `push`, `pull_request`, `schedule`, `workflow_dispatch` |
| `run_url` | server URL, repository and run ID | optional; `https`, at most 2,000 characters; hidden for private projects |

A report from any other event (for example `merge_group` or `pull_request_target`) is refused with 400. Reporting from another event needs a change to the API contract in testpulse first.

### Job, module and platform

The project chooses these three values; they are the reporter's first three arguments. Together they identify a report within a run, and re-posting the same `(job, module, platform)` in the same run replaces the earlier report ([spec §5.3](spec.md#53-reports)).

| Value | Meaning | In use |
|---|---|---|
| `job` | the CI job that ran the tests; SHOULD be the workflow's job id | `android`, `ios`, `android-e2e`, `ios-e2e`, `test` |
| `module` | the Gradle module, workspace or suite group | `shared`, `composeApp`, `e2e`, `apps/backend` |
| `platform` | where the tests ran | `jvm`, `ios-sim`, `android-emulator`, `node` |

- Each is 1 to 100 characters with no control characters, line breaks included.
- Every report in one workflow run MUST have a distinct `(job, module, platform)`. Two steps, or two legs of a matrix job, that send the same three values overwrite each other.
- The values MUST stay stable, because they carry identity and history:

| Renaming | Breaks |
|---|---|
| `module` | Test identity: a test's key is `module`, `suite` and `name` ([spec §5.4](spec.md#54-tests)). Every test in the module starts a new history and the old ones stop reporting. `coverage_floors` is keyed by module too (section 6). |
| `platform` | Flakiness and cross-platform comparison, which compare results on the same platform ([spec §11](spec.md#11-stats-definitions)); layer rules that match on platform. |
| `job` | Layer rules that match on job; the `empty_run` alert and the Phase 6 `count_drop` alert, both keyed by `(job, module, platform)` ([spec §12](spec.md#12-integrity-alerts)). |
| a test class, test file or test name | That test's identity, as for `module`. Moving a Jest test file changes its suite. |
| a Maestro flow's title | That flow's identity (below). |

A rename is sometimes right. It is then a reporting change and follows the Change checklist (section 9).

### Maestro flow titles

Maestro writes the flow's title (the `name:` in its flow file) as both suite and name, so the title alone identifies the test within its module.

- A flow meant to be the same test on two platforms MUST have one title on both, so it is one test on two platforms. In Ostomate2 today three do: "Journey 1: Cold-start QR log" and "Journey 2: Log + undo", whose iOS titles Ostomate2 PR #34 aligned with Android's on 2026-09-30, and "Journey 8: Biometric gate on Settings". Its other flows are titled per platform and count as separate tests. Whether Ostomate2 aligns more of its iOS titles is Ostomate2's decision.
- A title MUST stay stable once the flow reports. Renaming it starts a new history.

## 5. Test types (layers)

Result files do not say whether a test is unit, integration or E2E. testpulse resolves each test's layer from the project's ordered `layer_rules`, first match wins, ending in one `default` ([spec §8](spec.md#8-layer-mapping)). Allowed layers: `unit`, `component`, `integration`, `api`, `visual`, `e2e`.

- Every reported test MUST resolve to its correct layer through the project's `layer_rules`. A test no rule matches falls to the default, which is how an E2E suite ends up counted as unit tests.
- Adding a kind of suite, or a job, module or platform that carries a different layer, MUST update `projects/<slug>.yaml` in testpulse in the same change window (section 9). Rules match `job`, `module` and `platform` exactly and `suite` by glob.
- testpulse re-resolves a test's layer from the current rules on every report ([spec §6.4](spec.md#64-behavior)), so a test reported before its rule landed is corrected by its next report, not retroactively.
- If the toolchain stamps the platform into suite or test names (Kotlin Multiplatform's `iosSimulatorArm64Test.` prefix and `[iosSimulatorArm64]` suffix), the project MUST list those literal affixes in `name_normalization` ([spec §7.1](spec.md#71-name-normalization)). Otherwise one test becomes two, and the prefixed suite matches no layer rule. At most 10 affixes per list, 200 characters each, matched literally.

## 6. Coverage

- Coverage is optional per report and belongs to the report's `module` ([spec §5.7](spec.md#57-coverage)). A report carries at most one coverage file, so a module's coverage travels in that module's report.
- A floor is declared in `coverage_floors` as `{module: line_pct}`, keyed by the exact `module` string the reports send. It MUST mirror the floor the project's own CI enforces ([spec §5.1](spec.md#51-projects)). testpulse displays and flags against it; it does not enforce it.
- A report may omit coverage: Ostomate2's iOS simulator reports do, since JaCoCo runs on the JVM. A module's shown coverage is its latest default-branch coverage from any report that carried it (2026-09-28 decision on latest coverage per module).
- Line coverage is covered over total lines from the file's counts. The public page marks a module below its floor ([spec §11](spec.md#11-stats-definitions)); the `coverage_below_floor` alert arrives in Phase 6.

## 7. Failure handling

- **Reporting MUST NOT turn a red job green.** The report step never changes the outcome of the test step. `if: always()` runs it after a failure without masking the failure. Do not add `continue-on-error` to a test step or `|| true` to a test command to make room for the report.
- **Reporting does not fail the build.** The reporter always exits 0, whatever happens to the upload ([Appendix A](spec.md#appendix-a-reporter-script-and-ci-steps): "It must never fail the build"; [spec §17 Phase 2](spec.md#phase-2-ostomate2-reporting-live): with testpulse unreachable, CI still passes and logs a warning).

What `scripts/testpulse-report.sh` does today, as proven by `scripts/testpulse-report.test.ts`:

| Case | Behaviour | Signal |
|---|---|---|
| `TESTPULSE_TOKEN` or `TESTPULSE_URL` unset (fork PR, missing secret) | skips | `::notice::` |
| A GitHub variable that identifies the run is missing | skips | `::warning::` naming it |
| Fewer than five arguments | skips | `::warning::` with usage |
| No file matches the results glob | posts meta only; the endpoint answers 400, "one of junit or jest is required" | `::warning::` with status and body |
| Coverage file missing | posts results without coverage | none |
| Timeout, or HTTP 408, 429, 500, 502, 503, 504 | retried up to twice by curl, 30 s per attempt | `::warning::` if still failing |
| Connection refused or DNS failure | not retried | `::warning::` with `HTTP 000` |
| 400, 401, 413, 415 | not retried | `::warning::` with status and the first 500 bytes of the body |
| 422, zero tests | stored | `::warning::` with the body |
| 200 or 201 | done | none |

Every case exits 0. Today a warning annotation is the only signal of a refused or failed upload, a missing secret is only a notice even on the default branch, a missing coverage file has no signal at all, and testpulse keeps no record of a request it refused.

Planned (section 10), with the build still never failed by reporting:

- The reporter writes a line to the GitHub job summary when a report is refused or not sent.
- The reporter warns, with a job-summary line, when a job whose tests passed has no coverage file. It stays silent on a failing job, where a missing coverage file is expected.
- testpulse alerts on missing reports, on refused reports it received, and on a module whose coverage has not been reported for N runs while its tests keep reporting (Phase 6).

## 8. Keys and secrets

- Each project has its own API key, `tp_` followed by 43 base64url characters. testpulse stores only its SHA-256 hash ([spec §10](spec.md#10-adding-a-project), [§6.4](spec.md#64-behavior)).
- The key MUST be stored only as the CI secret `TESTPULSE_TOKEN`. The endpoint is the CI variable `TESTPULSE_URL`, a variable rather than a secret.
- The key MUST NOT be printed, echoed, committed, or written to a file that is uploaded as an artifact. The reporter sends it only in the `Authorization` header.
- Workflows triggered from forks get no secrets; the reporter then skips with a notice, as intended.
- `npm run project:add <slug>` and `npm run project:rotate-key <slug>`, run in testpulse, print a key once. Rotation invalidates the previous key immediately, so the project's secret is updated straight after. Rotate whenever a key may have been exposed.

## 9. Checklists

### Onboarding a new project

In testpulse ([spec §10](spec.md#10-adding-a-project)):

1. Write `projects/<slug>.yaml`: metadata, `visibility`, stacks, `layer_rules`, `name_normalization` if needed, `declared_suites` for anything that will not report yet, `coverage_floors` matching CI. [Appendix B](spec.md#appendix-b-example-project-file) is an example.
2. Capture a real result file for each format and tool the project will send into `fixtures/<slug>/`, scrubbed of private paths and source text, with its provenance and capture command in `fixtures/README.md`. Test the layer rules against it in `lib/ingest/layer-rules.test.ts`, asserting each layer's count.
3. Run `npm run project:add <slug>` and keep the printed key only until step 4.

In the project's repo:

4. Add `TESTPULSE_TOKEN` as a secret and `TESTPULSE_URL` as a variable.
5. Copy `scripts/testpulse-report.sh` from testpulse byte for byte. Never edit the copy. The copy stays until the shared action replaces it (section 10).
6. In the main CI workflow (rule 2.7), add a report step with `if: always()` to every job that runs tests, one reporter call per `(job, module, platform)`, and make sure every test task runs after a failure (rule 2.4).
7. Add the weekly `schedule:` trigger (rule 2.8).
8. Add the conformance statement (section 11) to the project's `CLAUDE.md`.
9. Verify end to end: run the workflow manually (`workflow_dispatch`) on the branch. The run MUST appear on the project page under **All branches** with every expected report, correct totals, the right layers in the pyramid and coverage per module, and the job logs MUST show no testpulse warning.
10. Verify a red run once: a deliberately failing test on the branch, reverted before merge, is recorded as `failed`, as routeserve's drill was ([spec §17 Phase 3](spec.md#phase-3-routeserve-reporting-live)).

### Changing how a project tests or reports

Any change to CI test jobs, test frameworks or result output is a reporting change.

| Change | Also do |
|---|---|
| Adding a test framework or tool | Produce an accepted format (section 3). If testpulse has no fixture for the tool, capture one and add parser tests. Add layer rules and, if needed, `name_normalization`. |
| Adding a CI job that runs tests | In the main CI workflow: a report step with `if: always()`; a new, stable `(job, module, platform)`; layer rules if the job carries a different layer; runs after a failure (rule 2.4). In another workflow: a declared suite (rule 2.7). |
| A declared suite starts reporting | Produce result files; add the report step; add a layer rule (for example `match: { module: e2e }` to `e2e`); remove the `declared_suites` entry; capture a fixture. |
| Renaming a job, module or platform | Check section 4 for what breaks; update every layer rule, `coverage_floors` key and `name_normalization` entry that names it. |
| Adding or changing a coverage floor | Change CI's enforced floor and `coverage_floors` together. |
| A suite stops running in CI | Declare it `authored_not_executed`, or delete the suite and any declaration of it. |
| Renaming a Maestro flow, or aligning its title across platforms | A new title starts a new history (section 4). |
| testpulse changes `scripts/testpulse-report.sh` | Replace the project's copy with the new file byte for byte. No other edit. |

For every change:

1. Make the testpulse side (`projects/<slug>.yaml`, fixture, tests) in a testpulse PR, and land it no later than the project change. Until it lands, new results resolve to the default layer (section 5).
2. Make the project side in the project's repo, under that repo's rules.
3. Verify with a manual run on the branch, as in onboarding step 9.

## 10. Planned, not in force

None of these is a v1 requirement. A planned item that adds or tightens a rule becomes one only in a later version of this standard.

| Item | Status | Effect on projects |
|---|---|---|
| Expected reports: `projects/<slug>.yaml` lists the reports each project is expected to send, per trigger, and testpulse alerts on a missing one. The design says how a run that skips a suite reads | Planned, Phase 6 | The project's expected reports are declared in its project file. |
| Alerts on refused reports testpulse received, and on a module whose coverage has not been reported for N runs while its tests keep reporting | Planned, Phase 6 | None; the alerts are on the testpulse side. |
| Carrying missing reports forward from the previous attempt, so a partial re-run shows the whole suite (section 4) | Planned soon, designed with expected reports | The SHOULD on "Re-run all jobs" is lifted. |
| Combining runs across workflows, so a suite in another workflow can report (motivating case: routeserve's manual `e2e.yml`) | Planned | Rule 2.7 is relaxed. |
| The reporter writes a job-summary line when a report is refused or not sent, and warns when a passing job has no coverage file (section 7) | Planned; ships with the shared action, and until then in `scripts/testpulse-report.sh` | Update the copied script when it changes (section 9). |
| A shared GitHub Action, `bhelco1/testpulse/.github/actions/report@v1`, replacing the copied reporter script | Planned, after testpulse is public: a public repository cannot use a private repository's action | A `uses:` step replaces `scripts/testpulse-report.sh`. |
| The reporter also sends the CI workflow's overall result, so a failure before any results exist (a build break, an emulator that never booted) shows | Under consideration; to be decided with the Phase 6 expected-reports design | None until decided. |

## 11. Conformance statement

Each reporting project puts this in its `CLAUDE.md`, with its own slug:

```markdown
## testpulse reporting

This project reports test results to testpulse and conforms to the
[testpulse reporting standard, v1](https://github.com/bhelco1/testpulse/blob/main/docs/reporting-standard.md)
(in a local checkout: `../testpulse/docs/reporting-standard.md`).
Any change to CI test jobs, test frameworks or result output is a reporting change:
follow the standard's Change checklist and update `projects/<slug>.yaml` in testpulse.
```

The GitHub link opens once testpulse is public, before Phase 7. Until then a session with both checkouts side by side reads the local path.

## 12. Open questions

None open. A question this standard raises is recorded here, decided in testpulse and recorded in the spec's decision log ([spec §19](spec.md#19-decision-log)) before it becomes a rule.

## Changelog

| Version | Date | Change |
|---|---|---|
| v1 | 2026-09-30 | First version. Incorporates the decisions of 2026-09-30 on the draft's open questions (failed uploads, missing coverage, several workflows, partial re-runs, reports varying by trigger, running every test after a failure, the conformance link, the shared action, tools with no fixture), on Maestro flow titles, on the versioning process and on CI workflow status. Not yet published to projects. |
