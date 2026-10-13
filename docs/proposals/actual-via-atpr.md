# Proposal: showing Actual Budget as measured by ATPR

Status: **proposal, not approved.** Written 2026-10-13 from a handoff by ATPR's session. Nothing here is built, and nothing in `docs/spec.md` or `docs/reporting-standard.md` changes until Bobby decides the questions at the end. Spec section 18 lists this as open question 6.

## 1. The problem

ATPR (`bhelco1/atpr`, private) measures other codebases' test suites from outside. Its first target is Actual Budget (`actualbudget/actual`, public, MIT), pinned at tag `v26.10.0`, commit `2bebdbaae0b701120a8cad9d56aafd64fa04c577`. Bobby wants Actual visible on testpulse before ATPR's Week 4 summary panel.

What ATPR measures today (Measure 0, run `20261013T211242Z`, ADR-003 in ATPR):

| What | Result | Who measured it |
|---|---|---|
| `loot-core` unit (Vitest, configs `node` and `web`) | 1,205 tests in 88 files: 1,203 passed, 2 skipped; 0 inconsistent over 3 runs; median 84 s | ATPR |
| `loot-core` coverage | 60.8% lines, 55.8% branches (V8, written as istanbul) | ATPR. Actual configures no coverage tool; ATPR adds `@vitest/coverage-v8` in a throwaway worktree |
| E2E (Playwright, Chromium) | 145 tests in 22 files: 145 passed, 0 flaky; 162.5 s on 5 workers | ATPR, following Actual's `e2e-test.yml` |
| Actual's own Test (`check.yml`) and E2E (`e2e-test.yml`) workflows | **Did not run** on the release commit, which sits on Actual's `release` branch | Read from Actual's workflow runs with `gh` |

Every testpulse project today reports its own CI. Actual would be the first project whose results come from someone else's pipeline, about a commit that project's CI never tested. The question is how to show that without implying otherwise.

## 2. Where this meets the standard (v1)

The handoff's four friction points hold, and there are four more.

| Standard | Rule | Conflict | Confirmed |
|---|---|---|---|
| §2.7 | All reporting MUST come from the project's main CI workflow | Results come from ATPR's workflow, in another repository | Yes |
| §2.8 | The main CI workflow MUST have a weekly `schedule:` | Actual's workflows are not ours to change; ATPR's cadence is its own | Yes |
| §4 | Run identity from the GitHub Actions environment (`GITHUB_SHA`, `GITHUB_REF_NAME`) | In ATPR's workflow these are ATPR's commit and branch. The API itself accepts any hex `commit_sha` and any `branch` (`lib/ingest/meta.ts`), but the shared action has no input to override them | Yes, with that correction: it is the reporter, not the endpoint, that pins identity |
| §9 visibility | `run_url` shown for public projects | Actual is public; a `run_url` would point at ATPR's private run and 404 for every visitor | Yes. `run_url` is optional, so ATPR leaves it out |
| §1 scope | "every CI workflow in it that runs tests" must report | Actual's own `check.yml` and `e2e-test.yml` would be in scope, and cannot report | Added |
| §8 | The key MUST be stored only as the secret `TESTPULSE_TOKEN` in the project's repo | Actual's key would live in ATPR's repo, beside ATPR's own `TESTPULSE_TOKEN` | Added |
| §11 | Conformance statement in the project's `CLAUDE.md` | Cannot be written into Actual's repo | Added |
| §2.5 | No silent suites | ATPR v1 measures `loot-core` only. At `v26.10.0` Actual has 118 more `*.test.ts(x)` files outside `loot-core` and its E2E suite (86 of them in `desktop-client`) that ATPR does not run, so "Actual: 1,205 unit tests" would read as the whole project | Added |

The run time (about 10 minutes on Bobby's Mac; likely 20 to 30 on a 2-vCPU GitHub runner, unmeasured) and the need for Actual's dependencies, Chromium and `gh` are ATPR's cost, not testpulse's. One cost check: ATPR is private, so its Actions minutes come from the free private allowance (2,000 a month on GitHub Free at the time of writing; verify). A weekly 30-minute run is about 130 minutes a month, inside it.

Two site behaviours would mislead if Actual were added as an ordinary project:

- **Run titles.** `lib/runs/title.ts` titles a run from its event: ATPR's weekly run would read "Scheduled run" on Actual's page, as if Actual had scheduled it.
- **Landing headline.** Total tests, pass rate and Projects passing add every project up. Actual's 1,350 tests are not Bobby's tests; counting them in his portfolio total overstates his work to the very audience the site is for.

## 3. Options

### A. Actual as a testpulse project, posted by ATPR, marked as audited

Actual gets `projects/actual.yaml` and its own key. ATPR's workflow, after an inventory run, posts Actual's result files through the normal endpoint with that key. testpulse learns one new idea, an **audited project**: one whose runs are measured by a named auditor at a pinned ref, not by its own CI.

**What ATPR sends, per run.** Three reports, each a normal multipart POST:

| Report | `job` | `module` | `platform` | Results | Coverage |
|---|---|---|---|---|---|
| Unit, node config | `inventory` | `packages/loot-core` | `node` | Vitest JUnit from the first timed run | istanbul `coverage-summary.json`, the merged node and web coverage (one coverage file per module, standard §6) |
| Unit, web config | `inventory` | `packages/loot-core` | `web` | Vitest JUnit from the first timed run | none |
| E2E | `inventory` | `packages/desktop-client` | `chromium` | Playwright JUnit | none |

Using the first timed run matches ADR-003, which reads skip and todo from it. Sending all three timed runs as three attempts would let testpulse's flakiness stat see them, but attempts are GitHub's re-runs and inventing them would misstate the run; ATPR's own inconsistency list carries that instead.

`meta`, field by field:

| Field | Value | Change |
|---|---|---|
| `ci_run_id` | ATPR's `GITHUB_RUN_ID` | none. It names the measurement, and it is only an identifier: no link is built from it |
| `run_attempt` | ATPR's `GITHUB_RUN_ATTEMPT` | none |
| `commit_sha` | Actual's commit, `2bebdbaae0b701120a8cad9d56aafd64fa04c577` | none to the endpoint; the reporter needs an override input |
| `branch` | `release`, the branch the tag's commit is on (ADR-003) | none to the endpoint; reporter override. See decision 5 |
| `event` | ATPR's event (`schedule` or `workflow_dispatch`) | none; the run's title changes on the site instead (below) |
| `run_url` | omitted | none |
| `ref` | `v26.10.0` | **new**, optional in the contract, required for an audited project |
| `auditor_commit` | ATPR's `GITHUB_SHA` | **new**, same rule. Makes the result reproducible: target tag plus auditor commit, as ATPR's spec requires |
| `target_ci` | `not_run`, `passed`, `failed` or `unknown`: whether the target's own test workflows ran on this commit, from `inventory.json` `ci.test_workflows` (`not_run` when none ran, `failed` when any failed) | **new**, same rule |

**Changes.**

- **API contract.** Three optional `meta` fields; still `/api/v1`, since every existing request stays valid. The endpoint refuses them (400) from a project that is not audited, and requires them from one that is, so an own-CI project cannot claim an auditor and an audited one cannot drop its provenance. Whether a project is audited is set in testpulse's project file, never by the payload.
- **Schema.** `runs.source` gains `audit` (the check constraint is `ci` or `backfill` today); ingestion sets it from the project, not the request. `runs` gains `ref`, `auditor_commit` and `target_ci_status`, all null for other sources. `projects` gains `audit` (jsonb, null for own-CI projects): the auditor's project slug (`atpr`) and a scope sentence ("`loot-core` unit tests and the desktop E2E suite only"). The public runs view truncates `auditor_commit` to 7 characters, because the auditor's repository is private (section 9's rule for a private commit).
- **Project file.** `projects/actual.yaml`: `visibility: public`, `repo_url` Actual's upstream, `audit: {auditor: atpr, scope: …}`, layer rules (`module: packages/desktop-client` to `e2e`, default `unit`), no `coverage_floors` (Actual enforces none, and standard §6 says floors mirror the project's CI), `expected_cadence_days` matched to ATPR's cadence (decision 4). Fixtures: real Vitest and Playwright JUnit and the istanbul summary captured from an ATPR run, with layer-rule tests. Actual is public and MIT, so scrubbing is runner paths only.
- **Reporter.** The shared action gains optional inputs `commit`, `branch`, `ref`, `auditor-commit` and `target-ci`, used only when set. The script's contract test covers both forms. The action's `v1` tag moves; every existing caller is unaffected.
- **Standard.** A new section, "Audited projects", is a v2 (it adds MUSTs). For an audited project: rules 2.7 and 2.8 apply to the auditor's workflow, not the target's; §1's scope covers only the suites the auditor runs; §4's identity is the target's commit and the auditor fills `ref`, `auditor_commit` and `target_ci`; §8's key is held in the auditor's repository as `TESTPULSE_TOKEN_<SLUG>`; §11's conformance statement lives in the auditor's repository, naming each target; suites of the target outside the audit's scope are not declared one by one but stated in the project's scope sentence. Nothing changes for own-CI projects; their move from v1 to v2 is a one-line edit of their statement.
- **Site.** Needs design first (v17); nothing below has a drawing yet:
  - Project card and project page: an "Audited by ATPR at v26.10.0" marker with the scope sentence, linking to ATPR's project page (`/p/atpr`, whose repository link is already hidden).
  - Run title: "ATPR audit of v26.10.0" in place of "Scheduled run"; event still shown as stored.
  - The run page's header: Ref, Auditor (ATPR, commit to 7 characters, unlinked), and **"Actual's own CI: did not run on this commit"** (or passed / failed), from `target_ci_status`.
  - Coverage: "Measured by ATPR (V8). Actual configures no coverage tool." beside the module.
  - Landing page: audited projects are left out of the headline tiles and shown in their own group below Bobby's projects.
  - Stats: time to green, green streak and red now are hidden for an audited project (a change between tags is a release, not a repair). Pass rate, test count, coverage and duration trend per audit.

**Cost to testpulse.** One migration, a meta and ingestion change with tests, the reporter inputs, a standard v2, a project file with fixtures, and a design round. Works today from the Measure 0 run ATPR already does.

### B. A new ingestion path for ATPR's `report.json`

ATPR's spec plan: ATPR posts its whole `report.json`, and testpulse renders an "ATPR summary" panel (grade, four numbers, survivor count, calibration sparkline).

**What ATPR sends.** One JSON body to a new endpoint, say `POST /api/v1/audits`, with the target project's key. `report.json` does not exist yet (ATPR Week 4) and its schema is unwritten, so testpulse would define the subset it accepts and ATPR would conform:

| Field | Meaning |
|---|---|
| `schema_version` | the accepted version, `"1"` |
| `target`, `ref`, `commit` | `actual`, `v26.10.0`, the full commit |
| `auditor_commit`, `generated_at` | ATPR's commit; when the report was made |
| `target_ci` | as in option A |
| `packages[]` | per package: `name`, `grade` (`High`, `Medium`, `Low`), `honesty_ratio`, `mutation_mechanical`, `mutation_semantic` (each 0 to 1), `survivors_critical` (count) |
| `spot_checks` | honesty and mutation agreement rates, with sample sizes |
| `calibration` | points per past tag for the sparkline, and the Brier score; absent until Measure 3 runs |
| `method` | prompt hashes, model id |

**Changes.**

- **API contract.** A new endpoint with its own Zod schema, size cap, rate limit and 400 rules; JSON, not multipart.
- **Schema.** A new `audits` table (project, ref, commit, auditor commit, schema version, grade and metrics, received at), one row per (project, ref, auditor commit), a re-post replacing it. Public read through a view, as for runs.
- **Standard.** A new section for audit reports, so v2 again.
- **Site.** The ATPR summary panel on the target's project page, designed first. The handoff's "four numbers" are not named in ATPR's spec: the scoring section has three ratios and `survivors_critical`, so the panel's fourth number is ATPR's to settle.

B alone shows Actual's ATPR grade but none of its test results: no pyramid, no tests, no run page. And it cannot start before ATPR Week 4.

### C. A now, B later (recommended)

A ships on the Measure 0 data that exists today; B adds the summary panel to the same Actual project page when `report.json` exists. They share everything that matters: the audited-project idea, the `projects.audit` column, the target's key, `ref`, `auditor_commit` and `target_ci`. B then adds only its endpoint, table and panel, and the standard's v2 can be written once with both in it if B's schema is settled by then, or v2 for A and v3 for B.

### Considered and set aside

- **Import, like backfill.** A command Bobby runs (`npm run import-audit actual inventory.json`) writes summary-only `source = audit` runs, as `npm run backfill` does. No API change and no key in ATPR. But summary runs have no `tests` rows, and Total tests and the pyramid count distinct tests in the latest run (spec 11), so Actual's page would show zero tests. It is also manual, where ATPR's spec asks for a pipeline.
- **CI in Bobby's public fork of Actual.** A workflow in `bhelco1/actual` gets free public minutes and a public `run_url`. But it runs on a fork commit, not the tag's, and ATPR's spec forbids writing to the fork beyond checking out tags. It would also be Bobby's CI, not an outside audit.
- **Option A with no contract change.** ATPR posts with the reporter overridden to Actual's commit and branch, and the provenance goes in the project's description. The data would be right, but every run would read as Actual's own "Scheduled run", nothing would say Actual's CI never tested the commit, and Actual's tests would count in Bobby's headline. That is the dishonesty the site exists to avoid.

## 4. Showing provenance honestly

The rule: **wherever an audited result appears, the reader can tell who measured it, at what ref, and whether the project's own CI tested that commit, without opening anything.**

- **Provenance is decided by testpulse, not the payload.** `source = audit` comes from the project file. A payload cannot make an own-CI project look audited, or an audited one look like its own CI.
- **Pinned ref, not a branch tip.** The run's title and header carry the tag (`v26.10.0`) and Actual's full commit, linked to `actualbudget/actual`; the auditor's commit is shown to 7 characters, unlinked, because ATPR is private.
- **The project's own CI is a first-class fact.** `target_ci_status` is stored per run and shown on the run page and the project page: "Actual's own CI did not run its tests on this commit." It is never inferred from a nearby commit, matching ADR-003 decision 4.
- **What the auditor added is labelled.** Coverage "measured by ATPR (V8); Actual configures no coverage tool". No floor is drawn, since Actual enforces none.
- **Scope is stated.** "`loot-core` unit tests and the desktop E2E suite only", on the card and the page, so 1,350 tests is not read as all of Actual.
- **Not counted as Bobby's.** Audited projects stay out of the landing headline and sit in their own group.
- **Recovery stats are not shown.** Time to green and streaks describe a team fixing its own build; between pinned tags they would mean nothing.

## 5. Recommendation

Take option C. Build A now as an "audited project": ATPR posts Actual's JUnit and coverage with Actual's key, identity is Actual's tagged commit plus `ref`, `auditor_commit` and `target_ci`, and the site marks every audited result as measured by ATPR at the pin, with Actual's own CI status shown. Add B's ATPR summary panel to the same project page once ATPR's `report.json` schema exists in Week 4.

Order of work once approved, each its own PR: standard v2 and spec (decision rows, 5.1, 5.2, 6.2, 9, 11, 13); design request (v17) for the audited marker, run header, coverage note and landing group; migration and ingestion with tests; reporter inputs; `projects/actual.yaml` with captured fixtures; site. ATPR's side (its workflow step and the target key) is ATPR's own change, made in its repository.

## 6. Decisions for Bobby

1. **Option**: C, A now and B in Week 4 (recommended); A only; or B only, with nothing on testpulse until Week 4.
2. **Audited projects in the headline**: leave them out and show them in their own landing group (recommended), or count them in the portfolio totals.
3. **Standard version**: one v2 with an "Audited projects" section now, B's audit-report rules added as v3 when `report.json` exists (recommended); or wait and do one v2 with both.
4. **Cadence**: ATPR re-audits the pinned tag weekly, keeping §2.8's staleness meaning and ~130 Actions minutes a month (recommended); or only when the pin moves to a new release, with `expected_cadence_days` around 35.
5. **Branch for audited runs**: report `release`, the branch the tag's commit is on, and set Actual's `default_branch: release` so the trends read audited runs (recommended); or teach the stats that an audited project's "default branch" is every audited run, whatever its branch.
6. **Slug and name**: `actual`, "Actual Budget" (recommended), or something naming the scope, like `actual-loot-core`.
7. **The design round**: approve sending the audited marker, run header, coverage note and landing group to Claude Design as v17 items before any site work.
8. **Fourth number** (only for B): which four numbers the ATPR summary panel shows; ATPR's spec names three ratios plus `survivors_critical`. ATPR's session can propose it with the `report.json` schema.
