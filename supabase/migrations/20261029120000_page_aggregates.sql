-- Page aggregates (decision 2026-10-29, section 19): the public pages ask Postgres for the
-- section 11 answers they show instead of paging every result row through PostgREST. In
-- production the project page of testpulse read about 125,000 results for its 30-day flakiness,
-- 1,000 rows a request, and took over 70 seconds.
--
-- Every function here only reads, and runs as its caller (security invoker), so anon reads
-- exactly what section 9 already opens to it: projects_public and runs_public, which redact a
-- private project's repository link, run links and commit SHAs, and the reports, results and
-- tests tables. None of them reads result_failures or returns failure text. A private project's
-- SHAs arrive cut to 7 characters, as the TypeScript stats read them through runs_public, so
-- flaky commits group the same way in both. search_path is empty and every name is qualified.
--
-- The definitions are section 11's, unchanged; lib/stats holds the TypeScript form of each, and
-- integration tests prove the two agree on the seed and on generated history
-- (tests/int/aggregates.ts).
--
-- The flaky functions leave out a run whose results_pruned_at is set, as the loaders did before:
-- the daily job prunes a run's results over several batches, and a run part way through has no
-- complete results to count. run_test_tallies counts the runs it is given, and the loaders never
-- give it a pruned one.
--
-- No new index: every join here starts from an indexed key. A run's reports come through the
-- unique (run_id, job, module, platform) index, a report's results through
-- results_report_id_idx, a test's results through results_test_id_idx and a project's runs
-- through runs_project_id_started_at_idx.

-- ---------------------------------------------------------------------------------------------
-- run_test_tallies
--
-- For each given run, its distinct tests counted by layer and combined status. A test's status
-- in a run combines its results across platforms and repeats: the first of failed, error,
-- passed, skipped that it has (combinedStatus in lib/results/run-results.ts). Skipped tests are
-- counted: a skipped test was still seen in the run. A run with no results has no rows.
-- ---------------------------------------------------------------------------------------------

create function public.run_test_tallies(p_run_ids uuid[])
returns table (run_id uuid, layer text, status text, tests integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select per_test.run_id, per_test.layer, per_test.status, count(*)::integer
  from (
    select
      rp.run_id,
      t.layer,
      case
        when bool_or(x.status = 'failed') then 'failed'
        when bool_or(x.status = 'error') then 'error'
        when bool_or(x.status = 'passed') then 'passed'
        else 'skipped'
      end as status
    from public.reports rp
    join public.results x on x.report_id = rp.id
    join public.tests t on t.id = x.test_id
    where rp.run_id = any (p_run_ids)
    group by rp.run_id, x.test_id, t.layer
  ) per_test
  group by per_test.run_id, per_test.layer, per_test.status
  order by per_test.run_id, per_test.layer, per_test.status;
$$;

-- ---------------------------------------------------------------------------------------------
-- run_report_counts
--
-- How many reports each given run has, for the run list's "0 tests · 3 reports". A run with no
-- reports has no row.
-- ---------------------------------------------------------------------------------------------

create function public.run_report_counts(p_run_ids uuid[])
returns table (run_id uuid, reports integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select rp.run_id, count(*)::integer
  from public.reports rp
  where rp.run_id = any (p_run_ids)
  group by rp.run_id
  order by rp.run_id;
$$;

-- ---------------------------------------------------------------------------------------------
-- flaky_tests
--
-- Section 11's flaky tests of one project: a test with a passed and a failed or error result on
-- the same commit and platform, in default-branch CI runs that finished from p_since to p_until.
-- The caller passes the 30-day window (windowStart in lib/stats/rules.ts). For each, the
-- platforms it flipped on, in code-unit order, and the commits it flipped on (flakyPlatforms in
-- lib/stats/flaky.ts), ordered by test ID.
-- ---------------------------------------------------------------------------------------------

create function public.flaky_tests(p_project_id uuid, p_since timestamptz, p_until timestamptz)
returns table (test_id uuid, platforms text[], commits integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with flips as (
    select x.test_id, r.commit_sha, rp.platform
    from public.runs_public r
    join public.projects_public p on p.id = r.project_id
    join public.reports rp on rp.run_id = r.id
    join public.results x on x.report_id = rp.id
    where r.project_id = p_project_id
      and r.branch = p.default_branch
      and r.source = 'ci'
      and r.finished_at >= p_since
      and r.finished_at <= p_until
      and r.results_pruned_at is null
      and x.status <> 'skipped'
    group by x.test_id, r.commit_sha, rp.platform
    having bool_or(x.status = 'passed') and bool_or(x.status in ('failed', 'error'))
  )
  select
    flips.test_id,
    array_agg(distinct flips.platform collate "C" order by flips.platform collate "C"),
    count(distinct flips.commit_sha)::integer
  from flips
  group by flips.test_id
  order by flips.test_id;
$$;

-- ---------------------------------------------------------------------------------------------
-- flaky_failures
--
-- The flaky list's "Failed {n} of last {m} runs" for the given tests (flakyFailures in
-- lib/stats/flaky.ts): m is the test's last 40 default-branch CI runs finished by p_until in
-- which it has a result of any status, however old, newest first in section 11's run order; n
-- is those in which some platform has a failed or error result and none of that platform's
-- results is one side of a flip of the window p_since to p_until. One row per given test, with
-- 0 of 0 for a test with no such run, ordered by test ID.
-- ---------------------------------------------------------------------------------------------

create function public.flaky_failures(
  p_project_id uuid,
  p_since timestamptz,
  p_until timestamptz,
  p_test_ids uuid[]
)
returns table (test_id uuid, failed integer, runs integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with ci_runs as (
    select
      r.id,
      r.commit_sha,
      r.finished_at,
      r.started_at,
      r.ci_run_id,
      r.run_attempt,
      r.finished_at >= p_since as in_window
    from public.runs_public r
    join public.projects_public p on p.id = r.project_id
    where r.project_id = p_project_id
      and r.branch = p.default_branch
      and r.source = 'ci'
      and r.finished_at <= p_until
      and r.results_pruned_at is null
  ),
  test_results as (
    select x.test_id, c.id as run_id, rp.platform, c.commit_sha, c.in_window, x.status
    from ci_runs c
    join public.reports rp on rp.run_id = c.id
    join public.results x on x.report_id = rp.id
    where x.test_id = any (p_test_ids)
  ),
  flips as (
    select test_results.test_id, test_results.commit_sha, test_results.platform
    from test_results
    where test_results.in_window and test_results.status <> 'skipped'
    group by test_results.test_id, test_results.commit_sha, test_results.platform
    having bool_or(test_results.status = 'passed')
      and bool_or(test_results.status in ('failed', 'error'))
  ),
  cells as (
    select
      test_results.test_id,
      test_results.run_id,
      test_results.platform,
      bool_or(test_results.status in ('failed', 'error')) as failing,
      bool_or(
        flips.test_id is not null
        and test_results.in_window
        and test_results.status <> 'skipped'
      ) as flaky
    from test_results
    left join flips
      on flips.test_id = test_results.test_id
      and flips.commit_sha = test_results.commit_sha
      and flips.platform = test_results.platform
    group by test_results.test_id, test_results.run_id, test_results.platform
  ),
  test_runs as (
    select cells.test_id, cells.run_id, bool_or(cells.failing and not cells.flaky) as failed
    from cells
    group by cells.test_id, cells.run_id
  ),
  latest as (
    select
      test_runs.test_id,
      test_runs.failed,
      row_number() over (
        partition by test_runs.test_id
        order by
          c.finished_at desc,
          c.started_at desc,
          c.ci_run_id collate "C" desc,
          c.run_attempt desc
      ) as recency
    from test_runs
    join ci_runs c on c.id = test_runs.run_id
  )
  select
    wanted.id,
    (count(*) filter (where latest.failed))::integer,
    count(latest.test_id)::integer
  from (select distinct unnest(p_test_ids) as id) wanted
  left join latest on latest.test_id = wanted.id and latest.recency <= 40
  group by wanted.id
  order by wanted.id;
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants
--
-- Supabase's default privileges let PUBLIC execute new functions; take that back and grant the
-- three API roles only. Each function runs as its caller, so execute gives a role nothing its
-- own table grants and policies do not.
-- ---------------------------------------------------------------------------------------------

revoke execute on function
  public.run_test_tallies(uuid[]),
  public.run_report_counts(uuid[]),
  public.flaky_tests(uuid, timestamptz, timestamptz),
  public.flaky_failures(uuid, timestamptz, timestamptz, uuid[])
  from public, anon, authenticated;

grant execute on function
  public.run_test_tallies(uuid[]),
  public.run_report_counts(uuid[]),
  public.flaky_tests(uuid, timestamptz, timestamptz),
  public.flaky_failures(uuid, timestamptz, timestamptz, uuid[])
  to anon, authenticated, service_role;
