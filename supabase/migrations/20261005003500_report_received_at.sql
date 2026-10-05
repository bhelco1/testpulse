-- When testpulse received each report (spec 5.3, decision log 2026-10-05).
--
-- reports.started_at and finished_at come from the result files. A CI job that replays cached
-- result files (Ostomate2's Gradle cache did until its PR #36) posts them with times hours or days
-- old, so the files cannot say when a report arrived. received_at is testpulse's own clock: the
-- receivedAt the endpoint stamps on the request, which ingest_report already validated and used
-- only to open and resolve empty_run alerts.
--
-- The run's span (runs.started_at, runs.finished_at) is unchanged: it is still rolled up from
-- the reports' file times. How the receipt should bound it is an open question (spec 18).

-- ---------------------------------------------------------------------------------------------
-- The column
-- ---------------------------------------------------------------------------------------------

alter table public.reports add column received_at timestamptz;

-- Existing rows. A CI report's created_at is the best record of its receipt there is: the row is
-- inserted, with created_at's default now(), inside the ingest_report call that received it, and
-- a re-post deletes and re-inserts it, so created_at already holds the latest receipt, the value
-- received_at keeps from now on (below). It is a few milliseconds after the endpoint's own stamp,
-- not hours, and unlike finished_at it does not repeat a replayed file's old time. An imported
-- report (source = backfill) was never posted and its created_at is the import, so it takes its
-- finished_at, the history entry's recorded time, as backfill_run below now writes.
update public.reports rp
set received_at = case when ru.source = 'ci' then rp.created_at else rp.finished_at end
from public.runs ru
where ru.id = rp.run_id;

-- No default: both writers are the functions below and each passes the time explicitly. A
-- default of now() would quietly date a future writer that forgot the column by the database's
-- clock, which in a backfill is the import rather than the run.
alter table public.reports alter column received_at set not null;

-- Grants, RLS and Realtime need nothing here. anon's select on reports is a table grant, so it
-- covers the new column as it covers the others, and the "anon reads reports" policy is per
-- row. reports is in supabase_realtime with no column list, so an INSERT event now also carries
-- received_at, which is public like every other reports column; the live feed never reads the
-- payload (spec 13.4).

-- ---------------------------------------------------------------------------------------------
-- ingest_report writes the receipt
--
-- Unchanged from 20260922104026_ingest_report.sql but for received_at in the report insert. A
-- re-post deletes the report and inserts a new one (spec 5.3, 6.4), so the stored receipt is the
-- latest post's: the row it dates is the one that post wrote. CREATE OR REPLACE keeps the
-- function's grants: service_role only.
-- ---------------------------------------------------------------------------------------------

create or replace function public.ingest_report(payload jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_received_at timestamptz;
  v_run jsonb;
  v_ci_run_id text;
  v_run_attempt int;
  v_commit_sha text;
  v_branch text;
  v_event text;
  v_run_url text;
  v_report jsonb;
  v_job text;
  v_module text;
  v_platform text;
  v_format text;
  v_total int;
  v_passed int;
  v_failed int;
  v_skipped int;
  v_duration_ms bigint;
  v_started_at timestamptz;
  v_finished_at timestamptz;
  v_entry jsonb;
  v_index int;
  v_path text;
  v_counted record;
  v_run_id uuid;
  v_report_id uuid;
  v_replaced boolean := false;
  v_test_id uuid;
  v_result_id uuid;
  v_rollup record;
  v_run_status text;
begin
  -- Validation: nothing below this block touches a table until every field has been checked.
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'ingest_report: payload must be a JSON object';
  end if;
  begin
    v_project_id := public.ingest_text(payload, 'project_id', 'payload')::uuid;
  exception
    when invalid_text_representation then
      raise exception 'ingest_report: payload.project_id must be a UUID';
  end;
  v_received_at := public.ingest_timestamp(payload, 'received_at', 'payload');

  v_run := payload -> 'run';
  if jsonb_typeof(v_run) is distinct from 'object' then
    raise exception 'ingest_report: payload.run must be an object';
  end if;
  v_ci_run_id := public.ingest_text(v_run, 'ci_run_id', 'payload.run', 100);
  v_run_attempt := public.ingest_int(v_run, 'run_attempt', 'payload.run', 1, 2147483647);
  v_commit_sha := public.ingest_text(v_run, 'commit_sha', 'payload.run', 40);
  v_branch := public.ingest_text(v_run, 'branch', 'payload.run', 255);
  v_event := public.ingest_enum(v_run, 'event', 'payload.run',
    array['push', 'pull_request', 'schedule', 'workflow_dispatch']);
  if jsonb_typeof(v_run -> 'run_url') not in ('string', 'null') then
    raise exception 'ingest_report: payload.run.run_url must be a string or null';
  end if;
  v_run_url := v_run ->> 'run_url';
  if char_length(v_run_url) > 2000 then
    raise exception 'ingest_report: payload.run.run_url must be at most 2000 characters, got %',
      char_length(v_run_url);
  end if;

  v_report := payload -> 'report';
  if jsonb_typeof(v_report) is distinct from 'object' then
    raise exception 'ingest_report: payload.report must be an object';
  end if;
  v_job := public.ingest_text(v_report, 'job', 'payload.report', 100);
  v_module := public.ingest_text(v_report, 'module', 'payload.report', 100);
  v_platform := public.ingest_text(v_report, 'platform', 'payload.report', 100);
  v_format := public.ingest_enum(v_report, 'format', 'payload.report', array['junit', 'jest-json']);
  v_total := public.ingest_int(v_report, 'total', 'payload.report', 0, 2147483647);
  v_passed := public.ingest_int(v_report, 'passed', 'payload.report', 0, 2147483647);
  v_failed := public.ingest_int(v_report, 'failed', 'payload.report', 0, 2147483647);
  v_skipped := public.ingest_int(v_report, 'skipped', 'payload.report', 0, 2147483647);
  -- reports.duration_ms and runs.duration_ms are bigint; the parsers cap a report at a year.
  v_duration_ms := public.ingest_int(v_report, 'duration_ms', 'payload.report', 0, 9223372036854775807);
  v_started_at := public.ingest_timestamp(v_report, 'started_at', 'payload.report');
  v_finished_at := public.ingest_timestamp(v_report, 'finished_at', 'payload.report');
  if v_finished_at < v_started_at then
    raise exception 'ingest_report: payload.report.finished_at is before started_at';
  end if;

  if jsonb_typeof(payload -> 'tests') is distinct from 'array' then
    raise exception 'ingest_report: payload.tests must be an array';
  end if;
  for v_entry, v_index in
    select t.entry, t.ordinality - 1
    from jsonb_array_elements(payload -> 'tests') with ordinality as t(entry, ordinality)
  loop
    v_path := format('tests[%s]', v_index);
    if jsonb_typeof(v_entry) <> 'object' then
      raise exception 'ingest_report: % must be an object', v_path;
    end if;
    perform public.ingest_text(v_entry, 'test_key', v_path, 64);
    perform public.ingest_text(v_entry, 'module', v_path, 1000);
    perform public.ingest_text(v_entry, 'suite', v_path, 1000);
    perform public.ingest_text(v_entry, 'name', v_path, 1000);
    perform public.ingest_enum(v_entry, 'layer', v_path,
      array['unit', 'component', 'integration', 'api', 'visual', 'e2e']);
    perform public.ingest_enum(v_entry, 'status', v_path,
      array['passed', 'failed', 'error', 'skipped']);
    perform public.ingest_int(v_entry, 'duration_ms', v_path, 0, 2147483647);
    if jsonb_typeof(v_entry -> 'failure') not in ('object', 'null') then
      raise exception 'ingest_report: %.failure must be an object or null', v_path;
    end if;
    -- A failure's message and detail may be empty (a self-closing <failure/>), so only the type
    -- and the length are checked, the length here rather than by the column constraint so the
    -- refusal names the field and comes before any write.
    if jsonb_typeof(v_entry -> 'failure') = 'object' then
      if jsonb_typeof(v_entry -> 'failure' -> 'message') is distinct from 'string'
        or jsonb_typeof(v_entry -> 'failure' -> 'detail') is distinct from 'string' then
        raise exception 'ingest_report: %.failure needs string message and detail', v_path;
      end if;
      if char_length(v_entry -> 'failure' ->> 'message') > 2000 then
        raise exception 'ingest_report: %.failure.message must be at most 2000 characters, got %',
          v_path, char_length(v_entry -> 'failure' ->> 'message');
      end if;
      if char_length(v_entry -> 'failure' ->> 'detail') > 10000 then
        raise exception 'ingest_report: %.failure.detail must be at most 10000 characters, got %',
          v_path, char_length(v_entry -> 'failure' ->> 'detail');
      end if;
    end if;
  end loop;

  -- The caller's totals must describe the results it sent, or the rollups would lie.
  select
    count(*)::int as total,
    count(*) filter (where t.entry ->> 'status' = 'passed')::int as passed,
    count(*) filter (where t.entry ->> 'status' in ('failed', 'error'))::int as failed,
    count(*) filter (where t.entry ->> 'status' = 'skipped')::int as skipped
  into v_counted
  from jsonb_array_elements(payload -> 'tests') as t(entry);
  if (v_counted.total, v_counted.passed, v_counted.failed, v_counted.skipped)
    is distinct from (v_total, v_passed, v_failed, v_skipped) then
    raise exception 'ingest_report: payload.report totals %/%/%/% do not match its tests %/%/%/%',
      v_total, v_passed, v_failed, v_skipped,
      v_counted.total, v_counted.passed, v_counted.failed, v_counted.skipped;
  end if;

  if jsonb_typeof(payload -> 'coverage') is distinct from 'array' then
    raise exception 'ingest_report: payload.coverage must be an array';
  end if;
  for v_entry, v_index in
    select c.entry, c.ordinality - 1
    from jsonb_array_elements(payload -> 'coverage') with ordinality as c(entry, ordinality)
  loop
    v_path := format('coverage[%s]', v_index);
    if jsonb_typeof(v_entry) <> 'object' then
      raise exception 'ingest_report: % must be an object', v_path;
    end if;
    perform public.ingest_text(v_entry, 'module', v_path, 1000);
    perform public.ingest_enum(v_entry, 'format', v_path, array['jacoco', 'istanbul']);
    if public.ingest_int(v_entry, 'lines_covered', v_path, 0, 2147483647)
      > public.ingest_int(v_entry, 'lines_total', v_path, 0, 2147483647) then
      raise exception 'ingest_report: %.lines_covered exceeds lines_total', v_path;
    end if;
    -- Branch counters come as a pair or not at all; one without the other is a broken payload.
    if (jsonb_typeof(v_entry -> 'branches_covered') = 'null')
      <> (jsonb_typeof(v_entry -> 'branches_total') = 'null') then
      raise exception 'ingest_report: %.branches_covered and branches_total must both be numbers or both null',
        v_path;
    end if;
    if jsonb_typeof(v_entry -> 'branches_covered') is distinct from 'null'
      and public.ingest_int(v_entry, 'branches_covered', v_path, 0, 2147483647)
        > public.ingest_int(v_entry, 'branches_total', v_path, 0, 2147483647) then
      raise exception 'ingest_report: %.branches_covered exceeds branches_total', v_path;
    end if;
  end loop;

  if not exists (select 1 from public.projects where id = v_project_id) then
    raise exception 'ingest_report: project % does not exist', v_project_id;
  end if;

  -- 1. The run. A second report for the same CI run refreshes the metadata, which is the same
  --    for every job of that run; the span and totals are recomputed from all reports below.
  insert into public.runs (
    project_id, ci_run_id, run_attempt, commit_sha, branch, event, run_url,
    started_at, finished_at, status, source
  )
  values (
    v_project_id, v_ci_run_id, v_run_attempt, v_commit_sha, v_branch, v_event, v_run_url,
    v_started_at, v_finished_at, 'empty', 'ci'
  )
  on conflict (project_id, ci_run_id, run_attempt) do update
    set commit_sha = excluded.commit_sha,
        branch = excluded.branch,
        event = excluded.event,
        run_url = coalesce(excluded.run_url, public.runs.run_url)
  returning id into v_run_id;

  -- 2. Idempotent replace (spec 5.3): the cascade removes the old results, failures and coverage.
  delete from public.reports
  where run_id = v_run_id and job = v_job and module = v_module and platform = v_platform;
  v_replaced := found;

  -- 3. The report and its children.
  insert into public.reports (
    run_id, job, module, platform, format, total, passed, failed, skipped, duration_ms,
    started_at, finished_at, received_at
  )
  values (
    v_run_id, v_job, v_module, v_platform, v_format, v_total, v_passed, v_failed, v_skipped,
    v_duration_ms, v_started_at, v_finished_at, v_received_at
  )
  returning id into v_report_id;

  -- One identity row per distinct key: the same test can appear twice in a report (a class
  -- split across files, say), and ON CONFLICT refuses to update a row twice in one statement.
  -- first_seen_at is kept; last_seen_at only moves forward so a late backfill cannot rewind it.
  insert into public.tests (
    project_id, test_key, module, suite, name, layer, first_seen_at, last_seen_at
  )
  select distinct on (t.entry ->> 'test_key')
    v_project_id, t.entry ->> 'test_key', t.entry ->> 'module', t.entry ->> 'suite',
    t.entry ->> 'name', t.entry ->> 'layer', v_started_at, v_started_at
  from jsonb_array_elements(payload -> 'tests') as t(entry)
  order by t.entry ->> 'test_key'
  on conflict (project_id, test_key) do update
    set module = excluded.module,
        suite = excluded.suite,
        name = excluded.name,
        layer = excluded.layer,
        last_seen_at = greatest(public.tests.last_seen_at, excluded.last_seen_at);

  for v_entry in
    select t.entry
    from jsonb_array_elements(payload -> 'tests') with ordinality as t(entry, ordinality)
    order by t.ordinality
  loop
    select id into strict v_test_id
    from public.tests
    where project_id = v_project_id and test_key = v_entry ->> 'test_key';

    insert into public.results (report_id, test_id, status, duration_ms)
    values (v_report_id, v_test_id, v_entry ->> 'status', (v_entry ->> 'duration_ms')::int)
    returning id into v_result_id;

    if jsonb_typeof(v_entry -> 'failure') = 'object' then
      insert into public.result_failures (result_id, message, detail)
      values (v_result_id, v_entry -> 'failure' ->> 'message', v_entry -> 'failure' ->> 'detail');
    end if;
  end loop;

  insert into public.coverage (
    report_id, module, format, lines_covered, lines_total, branches_covered, branches_total
  )
  select
    v_report_id, c.entry ->> 'module', c.entry ->> 'format',
    (c.entry ->> 'lines_covered')::int, (c.entry ->> 'lines_total')::int,
    (c.entry ->> 'branches_covered')::int, (c.entry ->> 'branches_total')::int
  from jsonb_array_elements(payload -> 'coverage') as c(entry);

  -- 4. Rollups (spec 5.2): totals and duration sum the reports, the span covers them, and the
  --    status is failed if any report failed, empty if nothing ran anywhere, else passed.
  select
    coalesce(sum(total), 0)::int as total,
    coalesce(sum(passed), 0)::int as passed,
    coalesce(sum(failed), 0)::int as failed,
    coalesce(sum(skipped), 0)::int as skipped,
    coalesce(sum(duration_ms), 0)::bigint as duration_ms,
    min(started_at) as started_at,
    max(finished_at) as finished_at
  into v_rollup
  from public.reports
  where run_id = v_run_id;
  v_run_status := case
    when v_rollup.failed > 0 then 'failed'
    when v_rollup.total = 0 then 'empty'
    else 'passed'
  end;
  update public.runs
  set total = v_rollup.total,
      passed = v_rollup.passed,
      failed = v_rollup.failed,
      skipped = v_rollup.skipped,
      duration_ms = v_rollup.duration_ms,
      started_at = v_rollup.started_at,
      finished_at = v_rollup.finished_at,
      status = v_run_status
  where id = v_run_id;

  -- 5. empty_run (spec 12): one open alert per (job, module, platform), pointing at the report
  --    that is currently stored for it; the next non-empty report for the key resolves it.
  if v_total = 0 then
    update public.alerts
    set detail = detail || jsonb_build_object('report_id', v_report_id)
    where project_id = v_project_id and kind = 'empty_run' and resolved_at is null
      and detail ->> 'job' = v_job and detail ->> 'module' = v_module
      and detail ->> 'platform' = v_platform;
    if not found then
      insert into public.alerts (project_id, kind, detail, opened_at)
      values (
        v_project_id, 'empty_run',
        jsonb_build_object(
          'job', v_job, 'module', v_module, 'platform', v_platform, 'report_id', v_report_id
        ),
        v_received_at
      );
    end if;
  else
    update public.alerts
    set resolved_at = v_received_at
    where project_id = v_project_id and kind = 'empty_run' and resolved_at is null
      and detail ->> 'job' = v_job and detail ->> 'module' = v_module
      and detail ->> 'platform' = v_platform;
  end if;

  return jsonb_build_object(
    'run_id', v_run_id,
    'report_id', v_report_id,
    'replaced', v_replaced,
    'totals', jsonb_build_object(
      'total', v_total, 'passed', v_passed, 'failed', v_failed, 'skipped', v_skipped
    ),
    'run_status', v_run_status
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- backfill_run writes the recorded time
--
-- Unchanged from 20260924234718_backfill.sql but for received_at in the report insert.
-- ---------------------------------------------------------------------------------------------

create or replace function public.backfill_run(payload jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_ci_run_id text;
  v_run_attempt int;
  v_commit_sha text;
  v_branch text;
  v_event text;
  v_run_url text;
  v_started_at timestamptz;
  v_finished_at timestamptz;
  v_report jsonb;
  v_coverage jsonb;
  v_index int;
  v_path text;
  v_lines_pct numeric;
  v_run_id uuid;
  v_existing record;
  v_report_id uuid;
  v_rollup record;
  v_run_status text;
begin
  -- Validation. The ingest_* helpers name ingest_report in their messages, so their exceptions
  -- are re-raised under this function's name; nothing here writes, so the block's implicit
  -- savepoint discards nothing.
  begin
    if payload is null or jsonb_typeof(payload) <> 'object' then
      raise exception 'payload must be a JSON object';
    end if;
    begin
      v_project_id := public.ingest_text(payload, 'project_id', 'payload')::uuid;
    exception
      when invalid_text_representation then
        raise exception 'payload.project_id must be a UUID';
    end;
    v_ci_run_id := public.ingest_text(payload, 'ci_run_id', 'payload', 100);
    v_run_attempt := public.ingest_int(payload, 'run_attempt', 'payload', 1, 2147483647);
    v_commit_sha := public.ingest_text(payload, 'commit_sha', 'payload', 40);
    if v_commit_sha !~ '^[0-9a-fA-F]{7,40}$' then
      raise exception 'payload.commit_sha must be 7 to 40 hexadecimal characters';
    end if;
    v_branch := public.ingest_text(payload, 'branch', 'payload', 255);
    v_event := public.ingest_enum(payload, 'event', 'payload',
      array['push', 'pull_request', 'schedule', 'workflow_dispatch']);
    if jsonb_typeof(payload -> 'run_url') not in ('string', 'null') then
      raise exception 'payload.run_url must be a string or null';
    end if;
    v_run_url := payload ->> 'run_url';
    if char_length(v_run_url) > 2000 then
      raise exception 'payload.run_url must be at most 2000 characters, got %',
        char_length(v_run_url);
    end if;
    v_started_at := public.ingest_timestamp(payload, 'started_at', 'payload');
    v_finished_at := public.ingest_timestamp(payload, 'finished_at', 'payload');
    if v_finished_at < v_started_at then
      raise exception 'payload.finished_at is before started_at';
    end if;

    -- A run needs at least one report: its span and status are derived from them. The cap is
    -- far above the two reports a history entry yields and keeps a bad payload from being large.
    if jsonb_typeof(payload -> 'reports') is distinct from 'array' then
      raise exception 'payload.reports must be an array';
    end if;
    if jsonb_array_length(payload -> 'reports') not between 1 and 50 then
      raise exception 'payload.reports must hold 1 to 50 reports, got %',
        jsonb_array_length(payload -> 'reports');
    end if;
    for v_report, v_index in
      select r.entry, r.ordinality - 1
      from jsonb_array_elements(payload -> 'reports') with ordinality as r(entry, ordinality)
    loop
      v_path := format('payload.reports[%s]', v_index);
      if jsonb_typeof(v_report) <> 'object' then
        raise exception '% must be an object', v_path;
      end if;
      perform public.ingest_text(v_report, 'job', v_path, 100);
      perform public.ingest_text(v_report, 'module', v_path, 100);
      perform public.ingest_text(v_report, 'platform', v_path, 100);
      perform public.ingest_enum(v_report, 'format', v_path, array['junit', 'jest-json']);
      -- The four counts are summed into int4 run columns, so the total is also held to int4.
      if public.ingest_int(v_report, 'passed', v_path, 0, 2147483647)
        + public.ingest_int(v_report, 'failed', v_path, 0, 2147483647)
        + public.ingest_int(v_report, 'skipped', v_path, 0, 2147483647)
        <> public.ingest_int(v_report, 'total', v_path, 0, 2147483647) then
        raise exception '%.total must equal passed + failed + skipped', v_path;
      end if;

      v_coverage := v_report -> 'coverage';
      if jsonb_typeof(v_coverage) not in ('object', 'null') then
        raise exception '%.coverage must be an object or null', v_path;
      end if;
      if jsonb_typeof(v_coverage) = 'object' then
        perform public.ingest_enum(v_coverage, 'format', v_path || '.coverage',
          array['jacoco', 'istanbul']);
        if jsonb_typeof(v_coverage -> 'lines_pct') is distinct from 'number' then
          raise exception '%.coverage.lines_pct must be a number', v_path;
        end if;
        v_lines_pct := (v_coverage ->> 'lines_pct')::numeric;
        -- numeric(5, 2) would round a third decimal silently; a recorded value is stored as is
        -- or refused.
        if v_lines_pct < 0 or v_lines_pct > 100 or v_lines_pct <> round(v_lines_pct, 2) then
          raise exception '%.coverage.lines_pct must be between 0 and 100 with at most two decimals, got %',
            v_path, v_lines_pct;
        end if;
      end if;
    end loop;

    -- Two reports under one key would break reports' unique constraint mid-write; name it here.
    if exists (
      select 1
      from jsonb_array_elements(payload -> 'reports') as r(entry)
      group by r.entry ->> 'job', r.entry ->> 'module', r.entry ->> 'platform'
      having count(*) > 1
    ) then
      raise exception 'payload.reports has two reports for the same job, module and platform';
    end if;

    if not exists (select 1 from public.projects where id = v_project_id) then
      raise exception 'project % does not exist', v_project_id;
    end if;
  exception
    when raise_exception then
      raise exception 'backfill_run: %', regexp_replace(sqlerrm, '^ingest_report: ', '');
  end;

  -- The run. ON CONFLICT DO NOTHING rather than a lookup first, so a CI report for the same run
  -- landing concurrently cannot slip in between the check and the insert.
  insert into public.runs (
    project_id, ci_run_id, run_attempt, commit_sha, branch, event, run_url,
    started_at, finished_at, status, source
  )
  values (
    v_project_id, v_ci_run_id, v_run_attempt, v_commit_sha, v_branch, v_event, v_run_url,
    v_started_at, v_finished_at, 'empty', 'backfill'
  )
  on conflict (project_id, ci_run_id, run_attempt) do nothing
  returning id into v_run_id;

  if v_run_id is null then
    select id, source into strict v_existing
    from public.runs
    where project_id = v_project_id and ci_run_id = v_ci_run_id and run_attempt = v_run_attempt;
    return jsonb_build_object(
      'inserted', false,
      'existing_source', v_existing.source,
      'run_id', v_existing.id
    );
  end if;

  -- History records no per-report timing, so each report spans the run and lasts 0 ms. It was
  -- never posted, so it is dated as received at that same recorded time, not at the import:
  -- the import is not when the run happened (decision log 2026-10-05).
  for v_report in
    select r.entry
    from jsonb_array_elements(payload -> 'reports') with ordinality as r(entry, ordinality)
    order by r.ordinality
  loop
    insert into public.reports (
      run_id, job, module, platform, format, total, passed, failed, skipped, duration_ms,
      started_at, finished_at, received_at
    )
    values (
      v_run_id, v_report ->> 'job', v_report ->> 'module', v_report ->> 'platform',
      v_report ->> 'format', (v_report ->> 'total')::int, (v_report ->> 'passed')::int,
      (v_report ->> 'failed')::int, (v_report ->> 'skipped')::int, 0,
      v_started_at, v_finished_at, v_finished_at
    )
    returning id into v_report_id;

    if jsonb_typeof(v_report -> 'coverage') = 'object' then
      insert into public.coverage (report_id, module, format, lines_pct)
      values (
        v_report_id, v_report ->> 'module', v_report -> 'coverage' ->> 'format',
        (v_report -> 'coverage' ->> 'lines_pct')::numeric
      );
    end if;
  end loop;

  -- Rollups exactly as ingest_report derives them (spec 5.2).
  select
    coalesce(sum(total), 0)::int as total,
    coalesce(sum(passed), 0)::int as passed,
    coalesce(sum(failed), 0)::int as failed,
    coalesce(sum(skipped), 0)::int as skipped,
    coalesce(sum(duration_ms), 0)::bigint as duration_ms
  into v_rollup
  from public.reports
  where run_id = v_run_id;
  v_run_status := case
    when v_rollup.failed > 0 then 'failed'
    when v_rollup.total = 0 then 'empty'
    else 'passed'
  end;
  update public.runs
  set total = v_rollup.total,
      passed = v_rollup.passed,
      failed = v_rollup.failed,
      skipped = v_rollup.skipped,
      duration_ms = v_rollup.duration_ms,
      status = v_run_status
  where id = v_run_id;

  return jsonb_build_object('inserted', true, 'run_id', v_run_id, 'status', v_run_status);
end;
$$;
