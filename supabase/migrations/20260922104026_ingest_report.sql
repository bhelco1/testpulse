-- Ingestion (spec section 6): the per-minute counter behind the 6.3 rate limit and the whole
-- report write of 6.4 as Postgres functions. supabase-js has no transactions, so a function is
-- what makes "parse everything, then write everything, or write nothing" true by construction
-- (decision log 2026-09-21). Both are called by RPC with the secret key, which runs as
-- service_role; the functions therefore run with the caller's rights and need no definer.

-- ---------------------------------------------------------------------------------------------
-- Rate limit
-- ---------------------------------------------------------------------------------------------

-- Counts one request for the key's hash in the given minute and returns the new count. The
-- caller floors the minute; it is floored again here so a stray second can never open a bucket
-- of its own.
create function public.rate_limit_hit(p_api_key_hash text, p_minute timestamptz)
returns integer
language sql
volatile
set search_path = ''
as $$
  insert into public.rate_limit_buckets (api_key_hash, minute, count)
  values (p_api_key_hash, date_trunc('minute', p_minute), 1)
  on conflict (api_key_hash, minute)
    do update set count = public.rate_limit_buckets.count + 1
  returning count;
$$;

-- ---------------------------------------------------------------------------------------------
-- Payload validation helpers
--
-- ingest_report is called by our own code, but a function that half-trusts its input would
-- fail deep inside a write with a constraint name for a message. These check each field up
-- front and name it, so a bad payload is refused before the first row is touched.
-- ---------------------------------------------------------------------------------------------

create function public.ingest_text(obj jsonb, key text, path text, max_length integer default null)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_value text;
begin
  if jsonb_typeof(obj -> key) is distinct from 'string' then
    raise exception 'ingest_report: %.% must be a string', path, key;
  end if;
  v_value := obj ->> key;
  if v_value = '' then
    raise exception 'ingest_report: %.% must not be empty', path, key;
  end if;
  if max_length is not null and char_length(v_value) > max_length then
    raise exception 'ingest_report: %.% must be at most % characters, got %',
      path, key, max_length, char_length(v_value);
  end if;
  return v_value;
end;
$$;

-- Both bounds are checked here because a value past an int4 column's range would otherwise
-- fail as a bare "integer out of range" at the insert, long after validation.
create function public.ingest_int(obj jsonb, key text, path text, minimum bigint, maximum bigint)
returns bigint
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_value numeric;
begin
  if jsonb_typeof(obj -> key) is distinct from 'number' then
    raise exception 'ingest_report: %.% must be a number', path, key;
  end if;
  v_value := (obj ->> key)::numeric;
  if v_value <> trunc(v_value) or v_value < minimum or v_value > maximum then
    raise exception 'ingest_report: %.% must be an integer between % and %, got %',
      path, key, minimum, maximum, v_value;
  end if;
  return v_value::bigint;
end;
$$;

create function public.ingest_enum(obj jsonb, key text, path text, allowed text[])
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_value text := public.ingest_text(obj, key, path);
begin
  if not (v_value = any (allowed)) then
    raise exception 'ingest_report: %.% must be one of %, got "%"',
      path, key, array_to_string(allowed, ', '), v_value;
  end if;
  return v_value;
end;
$$;

create function public.ingest_timestamp(obj jsonb, key text, path text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_value text;
begin
  v_value := public.ingest_text(obj, key, path);
  -- The cast alone also accepts words such as 'now', 'today' and 'infinity', which would read
  -- the clock or store a value no arithmetic can use; the payload only ever carries the form
  -- Date.toISOString writes, so anything else is refused before the cast.
  if v_value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then
    raise exception 'ingest_report: %.% must be an ISO 8601 timestamp, got "%"',
      path, key, v_value;
  end if;
  begin
    return v_value::timestamptz;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      raise exception 'ingest_report: %.% must be an ISO 8601 timestamp, got "%"',
        path, key, v_value;
  end;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- The report write
-- ---------------------------------------------------------------------------------------------

-- Writes one report and everything it implies (spec 6.4), atomically:
--   1. upsert the run on (project_id, ci_run_id, run_attempt);
--   2. delete any report with the same (run_id, job, module, platform), which cascades to its
--      results, failures and coverage, and remember that the post is a replacement;
--   3. insert the report, upsert the tests, insert results, failures and coverage;
--   4. recompute the run's totals, duration, span and status from all of its reports;
--   5. open an empty_run alert for a zero-test report, or resolve open ones for the key.
-- The payload is built by lib/ingest/normalize.ts; its shape is validated here as well.
create function public.ingest_report(payload jsonb)
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
    started_at, finished_at
  )
  values (
    v_run_id, v_job, v_module, v_platform, v_format, v_total, v_passed, v_failed, v_skipped,
    v_duration_ms, v_started_at, v_finished_at
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
-- Grants
--
-- Functions are executable by PUBLIC by default. Only the secret-key client (service_role) may
-- write reports or count requests; anon and authenticated get nothing, as with every table.
-- ---------------------------------------------------------------------------------------------

revoke execute on function
  public.rate_limit_hit(text, timestamptz),
  public.ingest_text(jsonb, text, text, integer),
  public.ingest_int(jsonb, text, text, bigint, bigint),
  public.ingest_enum(jsonb, text, text, text[]),
  public.ingest_timestamp(jsonb, text, text),
  public.ingest_report(jsonb)
  from public, anon, authenticated;

grant execute on function
  public.rate_limit_hit(text, timestamptz),
  public.ingest_text(jsonb, text, text, integer),
  public.ingest_int(jsonb, text, text, bigint, bigint),
  public.ingest_enum(jsonb, text, text, text[]),
  public.ingest_timestamp(jsonb, text, text),
  public.ingest_report(jsonb)
  to service_role;
