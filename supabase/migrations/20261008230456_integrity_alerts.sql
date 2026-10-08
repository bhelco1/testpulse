-- Integrity alerts (spec section 12, Phase 6): stale, count_drop and coverage_below_floor join
-- empty_run. ingest_report opens, re-points and resolves count_drop and coverage_below_floor and
-- resolves stale; check_stale opens stale for the daily scheduled function (PR 6b), with now
-- passed in; acknowledge_alert lets the admin resolve a count_drop. The precise rules are section
-- 12's; the decision rows of 2026-10-08 record them.

-- ---------------------------------------------------------------------------------------------
-- alerts.acknowledged_at
--
-- Only a count_drop can be acknowledged ("Count recovers, or admin acknowledges"), and
-- acknowledging resolves it at the same instant. Every other kind resolves only by itself. The
-- check holds that in the table, whatever writes it.
-- ---------------------------------------------------------------------------------------------

alter table public.alerts
  add column acknowledged_at timestamptz null,
  add constraint alerts_acknowledged_count_drop check (
    acknowledged_at is null or (kind = 'count_drop' and resolved_at = acknowledged_at)
  );

-- ---------------------------------------------------------------------------------------------
-- ingest_report runs every alert check after its write
--
-- Unchanged from 20261005191648_report_span_by_receipt.sql but for: the project lookup, which
-- now locks the project row and reads its default branch and coverage floors; the run upsert,
-- which also returns the run's source; and steps 6 to 8 after the empty_run check. CREATE OR
-- REPLACE keeps the function's grants: service_role only.
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
  v_default_branch text;
  v_coverage_floors jsonb;
  v_run_source text;
  v_open_alert record;
  v_previous record;
  v_floor numeric;
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
  -- Dated by receipt (decision 2026-10-05): the report finished when it arrived and started its
  -- duration before. The payload's started_at and finished_at, the files' own times, are not
  -- read, so a replayed file's old times cannot date anything.
  v_finished_at := v_received_at;
  begin
    v_started_at := v_received_at - v_duration_ms * interval '1 millisecond';
  exception
    when datetime_field_overflow then
      v_started_at := null;
  end;
  if v_started_at is null or v_started_at < timestamptz '0001-01-01 00:00:00+00' then
    raise exception 'ingest_report: payload.report.duration_ms reaches back before the year 1';
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

  -- The project row stays locked until commit, as check_stale locks it, so one project's reports
  -- and its stale check run their alert checks one at a time: each sees the others' alerts and
  -- runs, and none opens an alert another has just opened.
  select default_branch, coverage_floors into v_default_branch, v_coverage_floors
  from public.projects
  where id = v_project_id
  for no key update;
  if not found then
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
  returning id, source into v_run_id, v_run_source;

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

  -- 6. stale (spec 12): any report resolves the project's open stale alert, on any branch, as a
  --    report is what the public health rule counts (section 11). A report stored into an
  --    imported run (source backfill) is not counted there, so it is not counted here.
  if v_run_source = 'ci' then
    update public.alerts
    set resolved_at = v_received_at
    where project_id = v_project_id and kind = 'stale' and resolved_at is null;
  end if;

  -- 7 and 8 read default-branch CI reports only: other branches and imported history neither
  --    open, re-point nor resolve them.
  if v_run_source = 'ci' and v_branch = v_default_branch then
    -- 7. count_drop (spec 12): executed tests are reports.total, every status counted, as the
    --    empty check above counts them. While an alert is open for the key, a report at 80% or
    --    more of its baseline resolves it and any other re-points it, keeping the baseline;
    --    otherwise a report under 80% of the key's report in the previous default-branch CI run
    --    (section 11's run order) opens one. Integer arithmetic: n * 5 < baseline * 4.
    select id, detail into v_open_alert
    from public.alerts
    where project_id = v_project_id and kind = 'count_drop' and resolved_at is null
      and detail ->> 'job' = v_job and detail ->> 'module' = v_module
      and detail ->> 'platform' = v_platform
    order by opened_at, id
    limit 1;
    if found then
      if v_total::bigint * 5 >= (v_open_alert.detail ->> 'baseline')::bigint * 4 then
        update public.alerts
        set resolved_at = v_received_at
        where id = v_open_alert.id and resolved_at is null;
      else
        update public.alerts
        set detail = detail || jsonb_build_object('current', v_total, 'run_id', v_run_id)
        where id = v_open_alert.id and resolved_at is null;
      end if;
    else
      select rp.total, rp.run_id into v_previous
      from public.reports rp
      where rp.job = v_job and rp.module = v_module and rp.platform = v_platform
        and rp.run_id = (
          select r.id
          from public.runs r
          where r.project_id = v_project_id and r.source = 'ci'
            and r.branch = v_default_branch
            and (r.finished_at, r.started_at, r.ci_run_id collate "C", r.run_attempt)
              < (v_rollup.finished_at, v_rollup.started_at, v_ci_run_id collate "C", v_run_attempt)
          order by r.finished_at desc, r.started_at desc, r.ci_run_id collate "C" desc,
            r.run_attempt desc
          limit 1
        );
      if found and v_total::bigint * 5 < v_previous.total::bigint * 4 then
        insert into public.alerts (project_id, kind, detail, opened_at)
        values (
          v_project_id, 'count_drop',
          jsonb_build_object(
            'job', v_job, 'module', v_module, 'platform', v_platform,
            'baseline', v_previous.total, 'current', v_total,
            'baseline_run_id', v_previous.run_id, 'run_id', v_run_id
          ),
          v_received_at
        );
      end if;
    end if;

    -- 8. coverage_below_floor (spec 12): per module with a floor in coverage_floors, a report's
    --    lines % (covered / total, section 11) strictly under the floor opens one alert or
    --    re-points the open one; at or above the floor it resolves it. Compared exactly, as
    --    covered * 100 < floor * total; a row with no lines has no percentage and is skipped.
    --    lines_pct is stored truncated to two decimals, so it never reads as the floor itself.
    for v_entry in
      select c.entry
      from jsonb_array_elements(payload -> 'coverage') with ordinality as c(entry, ordinality)
      order by c.ordinality
    loop
      continue when jsonb_typeof(v_coverage_floors -> (v_entry ->> 'module')) is distinct from 'number'
        or (v_entry ->> 'lines_total')::int = 0;
      v_floor := (v_coverage_floors ->> (v_entry ->> 'module'))::numeric;
      if (v_entry ->> 'lines_covered')::numeric * 100
        < v_floor * (v_entry ->> 'lines_total')::numeric then
        update public.alerts
        set detail = jsonb_build_object(
          'module', v_entry ->> 'module', 'floor', v_floor,
          'lines_pct', trunc(
            (v_entry ->> 'lines_covered')::numeric * 100 / (v_entry ->> 'lines_total')::numeric, 2
          ),
          'report_id', v_report_id
        )
        where project_id = v_project_id and kind = 'coverage_below_floor' and resolved_at is null
          and detail ->> 'module' = v_entry ->> 'module';
        if not found then
          insert into public.alerts (project_id, kind, detail, opened_at)
          values (
            v_project_id, 'coverage_below_floor',
            jsonb_build_object(
              'module', v_entry ->> 'module', 'floor', v_floor,
              'lines_pct', trunc(
                (v_entry ->> 'lines_covered')::numeric * 100
                  / (v_entry ->> 'lines_total')::numeric, 2
              ),
              'report_id', v_report_id
            ),
            v_received_at
          );
        end if;
      else
        update public.alerts
        set resolved_at = v_received_at
        where project_id = v_project_id and kind = 'coverage_below_floor' and resolved_at is null
          and detail ->> 'module' = v_entry ->> 'module';
      end if;
    end loop;
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
-- check_stale
--
-- Opens one stale alert for each project overdue at p_now, and never a second while one is open.
-- Overdue is the public health rule exactly (section 11, lib/stats/health.ts): the last report is
-- the latest finished_at of the project's CI runs on any branch at or before p_now (imported
-- history is not a report), and the project is stale when the whole 24-hour periods since it
-- exceed expected_cadence_days. JavaScript dates carry milliseconds, so the last report is read
-- to the millisecond, as the page reads it. A project with no report by p_now is not reporting,
-- not stale. The next report resolves the alert (ingest_report, step 6). Returns how many
-- alerts it opened.
-- ---------------------------------------------------------------------------------------------

create function public.check_stale(p_now timestamptz)
returns integer
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_cadence int;
  v_last timestamptz;
  v_opened int := 0;
begin
  if p_now is null then
    raise exception 'check_stale: p_now must not be null';
  end if;

  for v_project_id in select id from public.projects order by id
  loop
    -- Locked as ingest_report locks it: a report arriving now either commits first and is the
    -- last report here, or waits and then resolves what this opens.
    select expected_cadence_days into v_cadence
    from public.projects
    where id = v_project_id
    for no key update;
    continue when not found;

    select max(finished_at) into v_last
    from public.runs
    where project_id = v_project_id and source = 'ci' and finished_at <= p_now;
    continue when v_last is null;

    continue when floor(
      extract(epoch from (p_now - date_trunc('milliseconds', v_last))) / 86400
    ) <= v_cadence;

    continue when exists (
      select 1
      from public.alerts
      where project_id = v_project_id and kind = 'stale' and resolved_at is null
    );

    insert into public.alerts (project_id, kind, detail, opened_at)
    values (
      v_project_id, 'stale',
      jsonb_build_object('last_report_at', v_last, 'expected_cadence_days', v_cadence),
      p_now
    );
    v_opened := v_opened + 1;
  end loop;

  return v_opened;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- acknowledge_alert
--
-- Resolves an open count_drop at p_now and records the acknowledgement. Refuses an unknown
-- alert, any other kind, and an alert already resolved, before writing.
-- ---------------------------------------------------------------------------------------------

create function public.acknowledge_alert(p_alert_id uuid, p_now timestamptz)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alert record;
begin
  if p_alert_id is null or p_now is null then
    raise exception 'acknowledge_alert: p_alert_id and p_now must not be null';
  end if;

  select kind, resolved_at into v_alert
  from public.alerts
  where id = p_alert_id
  for update;
  if not found then
    raise exception 'acknowledge_alert: alert % does not exist', p_alert_id;
  end if;
  if v_alert.kind <> 'count_drop' then
    raise exception 'acknowledge_alert: alert % is %, and only count_drop can be acknowledged',
      p_alert_id, v_alert.kind;
  end if;
  if v_alert.resolved_at is not null then
    raise exception 'acknowledge_alert: alert % is already resolved', p_alert_id;
  end if;

  update public.alerts
  set acknowledged_at = p_now,
      resolved_at = p_now
  where id = p_alert_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants
--
-- Functions are executable by PUBLIC by default. Only the secret-key client (service_role) may
-- check staleness or acknowledge; anon and authenticated get nothing, and alerts stays closed to
-- both (section 9).
-- ---------------------------------------------------------------------------------------------

revoke execute on function
  public.check_stale(timestamptz),
  public.acknowledge_alert(uuid, timestamptz)
  from public, anon, authenticated;

grant execute on function
  public.check_stale(timestamptz),
  public.acknowledge_alert(uuid, timestamptz)
  to service_role;
