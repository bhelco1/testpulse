-- The daily scheduled function (spec section 12, Phase 6): heartbeats.summary records each run,
-- and prune_expired removes expired rows one batch at a time (section 5.12). The job itself is
-- lib/jobs/daily.ts, called from app/api/cron/daily by Vercel cron; it passes now in, so no
-- function here reads the database clock. The precise rules are section 5.12's; the decision
-- rows of 2026-10-08 record them.

-- ---------------------------------------------------------------------------------------------
-- heartbeats.summary
--
-- What one run of the daily job did, written by the job and read by the admin page. Its shape is
-- defined once, in lib/jobs/summary.ts. Null only on rows written before the job existed.
-- ---------------------------------------------------------------------------------------------

alter table public.heartbeats
  add column summary jsonb null
    constraint heartbeats_summary_object check (summary is null or jsonb_typeof(summary) = 'object');

-- ---------------------------------------------------------------------------------------------
-- prune_expired
--
-- One batch: removes at most p_batch_size rows in all, results with their result_failures first,
-- then visits, then rate_limit_buckets, and returns what it removed. The caller repeats it until
-- a batch removes nothing. Each call is its own transaction, so a batch's locks last only as long
-- as its own deletes, and a run stopped between batches leaves nothing half done.
--
-- Results expire with their run: a run's results go once p_now is at least the project's
-- retention_days × 24 hours after the run's finished_at, unless the run is one of the project's
-- 5 latest CI runs that executed tests (source 'ci', status not 'empty'), in section 11's run
-- order, wherever p_now falls. Imported and empty runs hold no results, so they are not counted
-- among the 5: the 5 kept are always runs a reader can drill into. The first batch that removes a
-- run's results sets its results_pruned_at to p_now; a later batch, or a later day, never moves
-- it. Visits expire 365 × 24 hours after entered_at, rate-limit buckets 24 hours after their
-- minute. Every window is counted in hours, so no time zone or daylight-saving rule moves it.
-- ---------------------------------------------------------------------------------------------

create function public.prune_expired(p_now timestamptz, p_batch_size integer default 5000)
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
  v_buckets integer := 0;
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

  -- 3. Visits, then buckets, with what room is left.
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
    'rate_limit_buckets', v_buckets,
    'projects', v_projects
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants
--
-- Functions are executable by PUBLIC by default. Only the secret-key client (service_role), which
-- the daily job uses, may prune.
-- ---------------------------------------------------------------------------------------------

revoke execute on function public.prune_expired(timestamptz, integer)
  from public, anon, authenticated;

grant execute on function public.prune_expired(timestamptz, integer) to service_role;
