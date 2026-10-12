-- Tracked links go live (spec sections 5.10, 9 and 14; decision rows of 2026-10-12). A visitor
-- who opens /v/<token> keeps a first-party session cookie holding a random session identifier;
-- tracked_sessions maps that identifier to the link it arrived by, so the visits the beacon
-- records in that session can be attributed to the link. The landing page reads one thing from
-- it as anon, through lead_project_for_session: the slug of the link's lead project, or null.
-- prune_expired removes a session 365 days after its arrival, with the visits.

-- ---------------------------------------------------------------------------------------------
-- tracked_sessions
--
-- One row per session that arrived by a tracked link, written by /v/<token> with the secret
-- client. A session that opens a second link is re-pointed at it and re-dated: the latest link
-- wins. created_at is that latest arrival, which is what retention counts from. Deleting a link
-- deletes its sessions (the visits already recorded keep their own link id until the link goes,
-- 5.10). No grant to anon or authenticated: like tracked_links, nothing public reads it directly.
-- ---------------------------------------------------------------------------------------------

create table public.tracked_sessions (
  session_id uuid primary key,
  tracked_link_id uuid not null references public.tracked_links (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index tracked_sessions_tracked_link_id_idx on public.tracked_sessions (tracked_link_id);
create index tracked_sessions_created_at_idx on public.tracked_sessions (created_at);

alter table public.tracked_sessions enable row level security;

-- The initial schema stops new tables opening to anon and authenticated by default; this says so
-- for this table on its own, so the access does not depend on who created it.
revoke all on public.tracked_sessions from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- lead_project_for_session
--
-- The landing page puts a tracked visitor's lead project first (design v16, Landing tweak
-- `visitor`). It renders as anon, which can read neither table, so this definer function reads
-- them and answers only the lead project's slug, or null for an unknown session, a link without
-- a lead, or a null argument. Never the company, role, contact, token or link id: a slug is
-- already public in projects_public, and that of a private project is too (section 9). Knowing
-- a session identifier, which lives only in an httpOnly cookie, is what it takes to ask.
-- ---------------------------------------------------------------------------------------------

create function public.lead_project_for_session(p_session_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select l.lead_project_slug
  from public.tracked_sessions s
  join public.tracked_links l on l.id = s.tracked_link_id
  where s.session_id = p_session_id;
$$;

revoke execute on function public.lead_project_for_session(uuid)
  from public, anon, authenticated;
grant execute on function public.lead_project_for_session(uuid)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- prune_expired also removes tracked sessions
--
-- Unchanged from 20261008235000_daily_job.sql but for the tracked sessions: they expire, like
-- visits, 365 × 24 hours after created_at, and are removed after the visits and before the
-- buckets with the room left in the batch, counted against it and returned as
-- `tracked_sessions`. CREATE OR REPLACE keeps the function's grants: service_role only.
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

  -- 3. Visits, then tracked sessions, then buckets, with what room is left.
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
    'projects', v_projects
  );
end;
$$;
