-- A report is never lost (spec sections 6 and 12, decision 2026-11-18). On 2026-11-18 page reads
-- and ingest_report both hit the statement timeout (57014) on the free tier's shared CPU, and 4
-- reports were lost: the route wrote nothing unless ingest_report finished. Now the route stores
-- the normalised payload in report_inbox first, then tries ingest_report on it; what does not
-- finish is ingested by process_report_inbox, which pg_cron runs every minute. After 5 tries a
-- row is parked and a report_not_processed alert opens. ingest_report's per-test loop becomes
-- two set-based inserts, so a large report costs a handful of statements instead of 2N to 3N.

create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------------------------
-- report_inbox
--
-- One row per accepted report: the exact jsonb ingest_report takes, as the route normalised it.
-- attempts counts tries started, the route's own first try included, and is counted before a
-- try runs so a try the database cancels still counts. last_error is the try's SQLSTATE and
-- message, capped at 300 characters; the payload holds no key, so neither does the error.
-- processed_at and result are set together, when ingest_report has committed the report.
-- ---------------------------------------------------------------------------------------------

create table public.report_inbox (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  project_id uuid not null references public.projects (id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  received_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'processed', 'parked')),
  attempts int not null default 0 check (attempts between 0 and 5),
  last_error text null check (char_length(last_error) <= 300),
  processed_at timestamptz null,
  result jsonb null,
  constraint report_inbox_processed check (
    (status = 'processed') = (processed_at is not null)
    and (status = 'processed') = (result is not null)
  )
);

create index report_inbox_project_id_idx on public.report_inbox (project_id);
create index report_inbox_pending_idx on public.report_inbox (received_at, id)
  where status = 'pending';
create index report_inbox_processed_idx on public.report_inbox (processed_at, id)
  where status = 'processed';

-- Secret key only: RLS on with no policy, and no grant to anon or authenticated (the default
-- privileges of the initial schema already withhold them; revoking again keeps this table
-- closed if those defaults ever change).
alter table public.report_inbox enable row level security;
revoke all on public.report_inbox from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- alerts.kind gains report_not_processed
--
-- One alert per parked inbox row. It resolves by itself when that row is processed, which only
-- an operator can bring about, by setting the row back to pending with attempts below 5.
-- ---------------------------------------------------------------------------------------------

alter table public.alerts
  drop constraint alerts_kind_check,
  add constraint alerts_kind_check check (
    kind in ('stale', 'count_drop', 'empty_run', 'coverage_below_floor', 'report_not_processed')
  );

-- ---------------------------------------------------------------------------------------------
-- ingest_report writes results and failures set-based
--
-- Unchanged from 20261012182451_count_drop_executed_tests.sql but for the per-test loop after
-- the tests upsert, which looked up each test, inserted its result and then its failure, one
-- statement at a time: it becomes one insert for the results and one for the failures, with
-- the result ids drawn beforehand, and v_test_id and v_result_id give way to v_result_ids and
-- v_written. The rows are the same (lib/ingest/ingest-rows.int.test.ts, golden rows taken from
-- the loop). CREATE OR REPLACE keeps the function's grants: service_role only.
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
  v_result_ids uuid[];
  v_written int;
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

  -- One insert for the results and one for their failures, in the report's order. Each result's
  -- id is drawn first so its failure can name it. The insert above wrote a tests row for every
  -- key, so the join finds one for each entry; the count check keeps the loop's strict lookup.
  v_result_ids := array(
    select gen_random_uuid()
    from generate_series(1, jsonb_array_length(payload -> 'tests'))
  );

  insert into public.results (id, report_id, test_id, status, duration_ms)
  select
    v_result_ids[t.ordinality::int], v_report_id, ts.id, t.entry ->> 'status',
    (t.entry ->> 'duration_ms')::int
  from jsonb_array_elements(payload -> 'tests') with ordinality as t(entry, ordinality)
  join public.tests ts
    on ts.project_id = v_project_id and ts.test_key = t.entry ->> 'test_key'
  order by t.ordinality;
  get diagnostics v_written = row_count;
  if v_written <> jsonb_array_length(payload -> 'tests') then
    raise exception 'ingest_report: wrote % results for % tests',
      v_written, jsonb_array_length(payload -> 'tests');
  end if;

  insert into public.result_failures (result_id, message, detail)
  select
    v_result_ids[t.ordinality::int], t.entry -> 'failure' ->> 'message',
    t.entry -> 'failure' ->> 'detail'
  from jsonb_array_elements(payload -> 'tests') with ordinality as t(entry, ordinality)
  where jsonb_typeof(t.entry -> 'failure') = 'object'
  order by t.ordinality;

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
    -- 7. count_drop (spec 12): executed tests are total less skipped, for this report and the
    --    previous run's alike. While an alert is open for the key, a report at 80% or
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
      if (v_total - v_skipped)::bigint * 5 >= (v_open_alert.detail ->> 'baseline')::bigint * 4 then
        update public.alerts
        set resolved_at = v_received_at
        where id = v_open_alert.id and resolved_at is null;
      else
        update public.alerts
        set detail = detail
          || jsonb_build_object('current', v_total - v_skipped, 'run_id', v_run_id)
        where id = v_open_alert.id and resolved_at is null;
      end if;
    else
      select rp.total - rp.skipped as executed, rp.run_id into v_previous
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
      if found and (v_total - v_skipped)::bigint * 5 < v_previous.executed::bigint * 4 then
        insert into public.alerts (project_id, kind, detail, opened_at)
        values (
          v_project_id, 'count_drop',
          jsonb_build_object(
            'job', v_job, 'module', v_module, 'platform', v_platform,
            'baseline', v_previous.executed, 'current', v_total - v_skipped,
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
-- store_report
--
-- The route's first write: the payload as it will be ingested, received_at read from it. The
-- route tries the report straight after, so that try is counted here. Only the shape needed to
-- store the row is checked; ingest_report checks the rest when it runs.
-- ---------------------------------------------------------------------------------------------

create function public.store_report(payload jsonb)
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_id uuid;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'store_report: payload must be a JSON object';
  end if;
  begin
    v_project_id := public.ingest_text(payload, 'project_id', 'payload')::uuid;
  exception
    when invalid_text_representation then
      raise exception 'store_report: payload.project_id must be a UUID';
  end;

  insert into public.report_inbox (project_id, payload, received_at, attempts)
  values (
    v_project_id, payload, public.ingest_timestamp(payload, 'received_at', 'payload'), 1
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- park_stored_report
--
-- Parks a pending row whose 5 tries are spent, and opens its report_not_processed alert in the
-- same transaction. A row another session holds, or one no longer pending, is left alone.
-- ---------------------------------------------------------------------------------------------

create function public.park_stored_report(p_inbox_id uuid)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_row record;
begin
  update public.report_inbox i
  set status = 'parked'
  where i.id = (
    select id
    from public.report_inbox
    where id = p_inbox_id and status = 'pending' and attempts >= 5
    for update skip locked
  )
  returning i.id, i.project_id, i.payload, i.received_at, i.attempts, i.last_error into v_row;
  if not found then
    return false;
  end if;

  insert into public.alerts (project_id, kind, detail, opened_at)
  values (
    v_row.project_id, 'report_not_processed',
    jsonb_build_object(
      'inbox_id', v_row.id,
      'ci_run_id', v_row.payload -> 'run' ->> 'ci_run_id',
      'job', v_row.payload -> 'report' ->> 'job',
      'module', v_row.payload -> 'report' ->> 'module',
      'platform', v_row.payload -> 'report' ->> 'platform',
      'received_at', v_row.received_at,
      'attempts', v_row.attempts,
      'error', v_row.last_error
    ),
    now()
  );
  return true;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- ingest_stored_report
--
-- One try at one pending row, by the route and by the drain alike. The row is locked first and
-- skipped if another session holds it, so a report is never ingested twice at once; ingest and
-- mark commit together, so a processed row always has its report. An error ingest_report raises
-- is caught, its writes undone, and recorded on the row, which stays pending or, on its fifth
-- try, is parked. A cancel (57014) is not caught: the whole try is undone and the row stays
-- pending, its try already counted. Answers null when there was no pending row to try.
-- ---------------------------------------------------------------------------------------------

create function public.ingest_stored_report(p_inbox_id uuid)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_row record;
  v_result jsonb;
begin
  select id, payload, attempts into v_row
  from public.report_inbox
  where id = p_inbox_id and status = 'pending'
  for update skip locked;
  if not found then
    return null;
  end if;

  begin
    v_result := public.ingest_report(v_row.payload);
  exception
    when others then
      update public.report_inbox
      set last_error = left(sqlstate || ' ' || sqlerrm, 300)
      where id = p_inbox_id;
      if v_row.attempts >= 5 and public.park_stored_report(p_inbox_id) then
        return jsonb_build_object('status', 'parked');
      end if;
      return jsonb_build_object('status', 'pending');
  end;

  update public.report_inbox
  set status = 'processed', processed_at = now(), result = v_result
  where id = p_inbox_id;
  update public.alerts
  set resolved_at = now()
  where kind = 'report_not_processed' and resolved_at is null
    and detail ->> 'inbox_id' = p_inbox_id::text;
  return jsonb_build_object('status', 'processed', 'result', v_result);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- process_report_inbox
--
-- The drain pg_cron calls every minute. A procedure, not a function, so that each row gets its
-- own transactions: counting a try commits before the try, and the try commits on its own, so a
-- row that fails or is cancelled never undoes another. Each pending row present when it starts
-- is tried at most once, oldest receipt first; a row whose 5 tries are spent is parked instead.
-- It stops starting rows after 50 seconds, so one call ends before the next minute's. Transaction
-- control rules out a SET clause, so every name is schema-qualified.
-- ---------------------------------------------------------------------------------------------

create procedure public.process_report_inbox()
language plpgsql
as $$
declare
  v_ids uuid[];
  v_id uuid;
  v_deadline timestamptz := clock_timestamp() + interval '50 seconds';
begin
  select coalesce(array_agg(id order by received_at, id), '{}')
  into v_ids
  from public.report_inbox
  where status = 'pending';
  commit;

  foreach v_id in array v_ids loop
    exit when clock_timestamp() >= v_deadline;
    update public.report_inbox i
    set attempts = i.attempts + 1
    where i.id = (
      select id
      from public.report_inbox
      where id = v_id and status = 'pending' and attempts < 5
      for update skip locked
    );
    if found then
      commit;
      perform public.ingest_stored_report(v_id);
    else
      perform public.park_stored_report(v_id);
    end if;
    commit;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- prune_expired also removes processed inbox rows
--
-- Unchanged from 20261012200000_tracked_sessions.sql but for the inbox: a processed row expires
-- 7 × 24 hours after processed_at and is removed after the buckets with the room left in the
-- batch, counted against it and returned as `report_inbox`. Pending and parked rows are kept.
-- CREATE OR REPLACE keeps the function's grants: service_role only.
-- ---------------------------------------------------------------------------------------------

create or replace function public.prune_expired(p_now timestamptz, p_batch_size integer default 5000)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_room integer;
  v_result_ids uuid[];
  v_run_ids uuid[];
  v_failures jsonb;
  v_results jsonb;
  v_marked jsonb;
  v_failures_total integer;
  v_results_total integer;
  v_marked_total integer;
  v_visits integer := 0;
  v_tracked_sessions integer := 0;
  v_buckets integer := 0;
  v_report_inbox integer := 0;
  v_projects jsonb;
begin
  if p_now is null then
    raise exception 'prune_expired: p_now must not be null';
  end if;
  -- A result and its failure leave together, so a batch must hold at least those two rows.
  if p_batch_size is null or p_batch_size < 2 or p_batch_size > 5000 then
    raise exception 'prune_expired: p_batch_size must be between 2 and 5000, got %', p_batch_size;
  end if;
  v_room := p_batch_size;

  -- 1. The expired results this batch takes, oldest run first, each costing one row plus one for
  --    its failure, as many as fit. At most v_room results can fit, so only those are costed.
  with kept as (
    select id
    from (
      select r.id,
        row_number() over (
          partition by r.project_id
          order by r.finished_at desc, r.started_at desc, r.ci_run_id collate "C" desc,
            r.run_attempt desc
        ) as latest
      from public.runs r
      where r.source = 'ci' and r.status <> 'empty'
    ) ranked
    where latest <= 5
  ),
  expired as (
    select r.id, r.finished_at
    from public.runs r
    join public.projects p on p.id = r.project_id
    where r.finished_at <= p_now - p.retention_days * interval '24 hours'
      and not exists (select 1 from kept where kept.id = r.id)
  ),
  candidate as (
    select res.id, e.id as run_id,
      case when exists (select 1 from public.result_failures f where f.result_id = res.id)
        then 2 else 1 end as cost,
      row_number() over (order by e.finished_at, e.id, res.id) as position
    from expired e
    join public.reports rp on rp.run_id = e.id
    join public.results res on res.report_id = rp.id
    order by e.finished_at, e.id, res.id
    limit v_room
  ),
  costed as (
    select id, run_id, sum(cost) over (order by position) as spent
    from candidate
  )
  select coalesce(array_agg(id), '{}'), coalesce(array_agg(distinct run_id), '{}')
  into v_result_ids, v_run_ids
  from costed
  where spent <= v_room;

  -- 2. Their failures, then the results, then the runs' mark, each counted per project.
  with removed as (
    delete from public.result_failures f
    where f.result_id = any (v_result_ids)
    returning f.result_id
  ),
  counted as (
    select ru.project_id, count(*)::integer as n
    from removed
    join public.results res on res.id = removed.result_id
    join public.reports rp on rp.id = res.report_id
    join public.runs ru on ru.id = rp.run_id
    group by ru.project_id
  )
  select coalesce(jsonb_object_agg(project_id, n), '{}'), coalesce(sum(n), 0)
  into v_failures, v_failures_total
  from counted;

  with removed as (
    delete from public.results res
    using public.reports rp, public.runs ru
    where res.id = any (v_result_ids) and rp.id = res.report_id and ru.id = rp.run_id
    returning ru.project_id
  ),
  counted as (
    select project_id, count(*)::integer as n from removed group by project_id
  )
  select coalesce(jsonb_object_agg(project_id, n), '{}'), coalesce(sum(n), 0)
  into v_results, v_results_total
  from counted;

  with marked as (
    update public.runs ru
    set results_pruned_at = p_now
    where ru.id = any (v_run_ids) and ru.results_pruned_at is null
    returning ru.project_id
  ),
  counted as (
    select project_id, count(*)::integer as n from marked group by project_id
  )
  select coalesce(jsonb_object_agg(project_id, n), '{}'), coalesce(sum(n), 0)
  into v_marked, v_marked_total
  from counted;

  v_room := v_room - v_results_total - v_failures_total;

  -- 3. Visits, then tracked sessions, then buckets, then processed inbox rows, with what room is
  --    left.
  if v_room > 0 then
    with removed as (
      delete from public.visits v
      where v.id in (
        select id
        from public.visits
        where entered_at <= p_now - 365 * interval '24 hours'
        order by entered_at, id
        limit v_room
      )
      returning 1
    )
    select count(*)::integer into v_visits from removed;
    v_room := v_room - v_visits;
  end if;

  if v_room > 0 then
    with removed as (
      delete from public.tracked_sessions s
      where s.session_id in (
        select session_id
        from public.tracked_sessions
        where created_at <= p_now - 365 * interval '24 hours'
        order by created_at, session_id
        limit v_room
      )
      returning 1
    )
    select count(*)::integer into v_tracked_sessions from removed;
    v_room := v_room - v_tracked_sessions;
  end if;

  if v_room > 0 then
    with removed as (
      delete from public.rate_limit_buckets b
      where (b.api_key_hash, b.minute) in (
        select api_key_hash, minute
        from public.rate_limit_buckets
        where minute <= p_now - interval '24 hours'
        order by minute, api_key_hash
        limit v_room
      )
      returning 1
    )
    select count(*)::integer into v_buckets from removed;
    v_room := v_room - v_buckets;
  end if;

  if v_room > 0 then
    with removed as (
      delete from public.report_inbox i
      where i.id in (
        select id
        from public.report_inbox
        where status = 'processed' and processed_at <= p_now - 7 * interval '24 hours'
        order by processed_at, id
        limit v_room
      )
      returning 1
    )
    select count(*)::integer into v_report_inbox from removed;
  end if;

  -- Every failure and every marked run belongs to a removed result, so the projects with removed
  -- results are all the projects there are to report.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'project_id', p.id,
        'slug', p.slug,
        'results', coalesce((v_results ->> p.id::text)::integer, 0),
        'result_failures', coalesce((v_failures ->> p.id::text)::integer, 0),
        'runs_marked_pruned', coalesce((v_marked ->> p.id::text)::integer, 0)
      )
      order by p.slug
    ),
    '[]'
  )
  into v_projects
  from public.projects p
  where v_results ? p.id::text;

  return jsonb_build_object(
    'results', v_results_total,
    'result_failures', v_failures_total,
    'runs_marked_pruned', v_marked_total,
    'visits', v_visits,
    'tracked_sessions', v_tracked_sessions,
    'rate_limit_buckets', v_buckets,
    'report_inbox', v_report_inbox,
    'projects', v_projects
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants
--
-- Functions are executable by PUBLIC by default. The route's secret-key client (service_role)
-- stores and tries reports; the drain runs as the owner, from pg_cron, and nobody else calls it.
-- ---------------------------------------------------------------------------------------------

revoke execute on function public.store_report(jsonb) from public, anon, authenticated;
revoke execute on function public.park_stored_report(uuid) from public, anon, authenticated;
revoke execute on function public.ingest_stored_report(uuid) from public, anon, authenticated;
-- Supabase's default privileges also grant service_role every new routine; the drain is not
-- the route's to call, so it is taken back from service_role too.
revoke execute on procedure public.process_report_inbox()
  from public, anon, authenticated, service_role;

grant execute on function public.store_report(jsonb) to service_role;
grant execute on function public.park_stored_report(uuid) to service_role;
grant execute on function public.ingest_stored_report(uuid) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Schedule
--
-- Every minute, in the database ($0; Vercel Hobby cron runs only daily). cron.schedule with a
-- job name replaces that job's schedule if it exists, so re-running this is harmless.
-- ---------------------------------------------------------------------------------------------

select cron.schedule('process-report-inbox', '* * * * *', 'call public.process_report_inbox()');
