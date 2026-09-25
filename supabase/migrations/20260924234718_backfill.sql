-- Backfill (spec section 17, Phase 4): historical runs imported from a project's dashboard
-- history as source = 'backfill'.

-- ---------------------------------------------------------------------------------------------
-- Coverage as a recorded percentage
--
-- Ostomate2's history keeps only a line percentage rounded to one decimal. Inventing covered and
-- total counts to fit the count columns would store numbers nobody measured (decision log
-- 2026-09-24), so a row now holds exactly one of the two forms. Live ingestion always writes
-- counts and is unaffected. The existing `>= 0` checks on the counts pass for null.
-- ---------------------------------------------------------------------------------------------

alter table public.coverage
  add column lines_pct numeric(5, 2) null check (lines_pct >= 0 and lines_pct <= 100),
  alter column lines_covered drop not null,
  alter column lines_total drop not null,
  add constraint coverage_lines_one_form check (
    (lines_covered is not null and lines_total is not null and lines_pct is null)
    or (lines_covered is null and lines_total is null and lines_pct is not null)
  );

-- ---------------------------------------------------------------------------------------------
-- The backfill write
-- ---------------------------------------------------------------------------------------------

-- Writes one historical run with its reports and coverage, atomically, or nothing at all.
--
-- A run already stored under (project_id, ci_run_id, run_attempt) is returned as found and left
-- exactly as it is. For a source = 'ci' run that is the point: CI's own report is the better
-- record, with per-test results, and a backfill must never alter it. For an earlier backfill it
-- makes re-running the import a no-op.
--
-- The payload is built by lib/backfill from a validated history file; its shape is validated
-- here as well, with the same helpers as ingest_report, before any row is touched.
create function public.backfill_run(payload jsonb)
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

  -- History records no per-report timing, so each report spans the run and lasts 0 ms.
  for v_report in
    select r.entry
    from jsonb_array_elements(payload -> 'reports') with ordinality as r(entry, ordinality)
    order by r.ordinality
  loop
    insert into public.reports (
      run_id, job, module, platform, format, total, passed, failed, skipped, duration_ms,
      started_at, finished_at
    )
    values (
      v_run_id, v_report ->> 'job', v_report ->> 'module', v_report ->> 'platform',
      v_report ->> 'format', (v_report ->> 'total')::int, (v_report ->> 'passed')::int,
      (v_report ->> 'failed')::int, (v_report ->> 'skipped')::int, 0,
      v_started_at, v_finished_at
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

-- ---------------------------------------------------------------------------------------------
-- Grants
--
-- As with ingest_report: functions are executable by PUBLIC by default, and only the secret-key
-- client (service_role) may write runs.
-- ---------------------------------------------------------------------------------------------

revoke execute on function public.backfill_run(jsonb) from public, anon, authenticated;
grant execute on function public.backfill_run(jsonb) to service_role;
