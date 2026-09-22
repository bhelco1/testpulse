-- Initial schema: spec section 5 tables, the heartbeats table from section 12, the rate-limit
-- buckets behind section 6.3, and the visibility rules of section 9 enforced in the database.

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  slug text not null unique,
  name text not null,
  tagline text not null,
  description text not null,
  visibility text not null check (visibility in ('public', 'private')),
  repo_url text null,
  default_branch text not null default 'main',
  dev_stack jsonb not null default '[]'::jsonb check (jsonb_typeof(dev_stack) = 'array'),
  test_stack jsonb not null default '[]'::jsonb check (jsonb_typeof(test_stack) = 'array'),
  layer_rules jsonb not null default '[]'::jsonb check (jsonb_typeof(layer_rules) = 'array'),
  declared_suites jsonb not null default '[]'::jsonb
    check (jsonb_typeof(declared_suites) = 'array'),
  coverage_floors jsonb not null default '{}'::jsonb
    check (jsonb_typeof(coverage_floors) = 'object'),
  expected_cadence_days int not null default 8 check (expected_cadence_days > 0),
  -- Ingestion authenticates by looking a key's hash up here, so it must identify one project.
  api_key_hash text not null unique,
  sort_order int not null default 0,
  retention_days int not null default 180 check (retention_days > 0)
);

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  project_id uuid not null references public.projects (id) on delete cascade,
  ci_run_id text not null,
  run_attempt int not null default 1 check (run_attempt > 0),
  commit_sha text not null,
  branch text not null,
  event text not null
    check (event in ('push', 'pull_request', 'schedule', 'workflow_dispatch')),
  run_url text null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  status text not null check (status in ('passed', 'failed', 'empty')),
  total int not null default 0 check (total >= 0),
  passed int not null default 0 check (passed >= 0),
  failed int not null default 0 check (failed >= 0),
  skipped int not null default 0 check (skipped >= 0),
  duration_ms bigint not null default 0 check (duration_ms >= 0),
  source text not null default 'ci' check (source in ('ci', 'backfill')),
  results_pruned_at timestamptz null,
  unique (project_id, ci_run_id, run_attempt)
);

-- Every project page and trend chart reads a project's runs newest-first.
create index runs_project_id_started_at_idx on public.runs (project_id, started_at desc);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  run_id uuid not null references public.runs (id) on delete cascade,
  job text not null,
  module text not null,
  platform text not null,
  format text not null check (format in ('junit', 'jest-json')),
  total int not null default 0 check (total >= 0),
  passed int not null default 0 check (passed >= 0),
  failed int not null default 0 check (failed >= 0),
  skipped int not null default 0 check (skipped >= 0),
  duration_ms bigint not null default 0 check (duration_ms >= 0),
  started_at timestamptz not null,
  finished_at timestamptz not null,
  unique (run_id, job, module, platform)
);

create table public.tests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  project_id uuid not null references public.projects (id) on delete cascade,
  test_key text not null,
  module text not null,
  suite text not null,
  name text not null,
  layer text not null
    check (layer in ('unit', 'component', 'integration', 'api', 'visual', 'e2e')),
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  unique (project_id, test_key)
);

create table public.results (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  report_id uuid not null references public.reports (id) on delete cascade,
  test_id uuid not null references public.tests (id) on delete cascade,
  status text not null check (status in ('passed', 'failed', 'error', 'skipped')),
  duration_ms int not null default 0 check (duration_ms >= 0)
);

create index results_report_id_idx on public.results (report_id);
create index results_test_id_idx on public.results (test_id);

-- Separate from results so row-level security can hide it wholesale for private projects.
create table public.result_failures (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  result_id uuid not null unique references public.results (id) on delete cascade,
  message text not null check (char_length(message) <= 2000),
  detail text null check (char_length(detail) <= 10000)
);

create table public.coverage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  report_id uuid not null references public.reports (id) on delete cascade,
  module text not null,
  format text not null check (format in ('jacoco', 'istanbul')),
  lines_covered int not null check (lines_covered >= 0),
  lines_total int not null check (lines_total >= 0),
  branches_covered int null check (branches_covered >= 0),
  branches_total int null check (branches_total >= 0)
);

create index coverage_report_id_idx on public.coverage (report_id);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null
    check (kind in ('stale', 'count_drop', 'empty_run', 'coverage_below_floor')),
  detail jsonb not null default '{}'::jsonb,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz null
);

create index alerts_project_id_idx on public.alerts (project_id);

create table public.tracked_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  token text not null unique check (char_length(token) = 12),
  company text not null,
  role text not null,
  contact text null,
  sent_at timestamptz null,
  notes text null,
  lead_project_slug text null
);

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Visits are history (365 days, section 5.11); removing a link anonymises them, not erases.
  tracked_link_id uuid null references public.tracked_links (id) on delete set null,
  session_id text not null,
  path text not null,
  entered_at timestamptz not null default now(),
  seconds_on_page int null check (seconds_on_page >= 0),
  user_agent_class text not null check (user_agent_class in ('browser', 'bot', 'preview')),
  ip_hash text not null
);

create index visits_tracked_link_id_idx on public.visits (tracked_link_id);
create index visits_entered_at_idx on public.visits (entered_at);

-- Written daily by the scheduled function so the free-tier database never idles into a pause.
create table public.heartbeats (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  note text null
);

create table public.rate_limit_buckets (
  api_key_hash text not null,
  minute timestamptz not null,
  count int not null default 0 check (count >= 0),
  primary key (api_key_hash, minute)
);

-- ---------------------------------------------------------------------------------------------
-- Row-level security
--
-- Every table has RLS on. The secret key (service_role) bypasses RLS and is server-only. The
-- publishable key runs as anon and gets exactly the access below. authenticated has no
-- privileges at all yet; the admin role's access is a later phase.
-- ---------------------------------------------------------------------------------------------

alter table public.projects enable row level security;
alter table public.runs enable row level security;
alter table public.reports enable row level security;
alter table public.tests enable row level security;
alter table public.results enable row level security;
alter table public.result_failures enable row level security;
alter table public.coverage enable row level security;
alter table public.alerts enable row level security;
alter table public.tracked_links enable row level security;
alter table public.visits enable row level security;
alter table public.heartbeats enable row level security;
alter table public.rate_limit_buckets enable row level security;

-- Supabase's default privileges grant anon and authenticated everything on new tables, and
-- RLS does not govern TRUNCATE, so grants alone must close them. Take it all back here, stop
-- future tables from opening by default, and re-grant only what section 9 allows.
revoke all on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

grant select on public.reports, public.tests, public.results, public.result_failures,
  public.coverage to anon;

create policy "anon reads reports" on public.reports
  for select to anon using (true);

create policy "anon reads tests" on public.tests
  for select to anon using (true);

create policy "anon reads results" on public.results
  for select to anon using (true);

create policy "anon reads coverage" on public.coverage
  for select to anon using (true);

-- Policies run with the caller's privileges, and anon cannot read runs or projects, so the
-- ownership walk from a result to its project's visibility happens in a definer function.
create function public.result_belongs_to_public_project(target_result_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.results r
    join public.reports rp on rp.id = r.report_id
    join public.runs ru on ru.id = rp.run_id
    join public.projects p on p.id = ru.project_id
    where r.id = target_result_id
      and p.visibility = 'public'
  );
$$;

-- Only the policy needs to call it, and the policy evaluates as anon.
revoke execute on function public.result_belongs_to_public_project(uuid)
  from public, authenticated;
grant execute on function public.result_belongs_to_public_project(uuid) to anon;

create policy "anon reads failures of public projects" on public.result_failures
  for select to anon using (public.result_belongs_to_public_project(result_id));

-- ---------------------------------------------------------------------------------------------
-- Public views
--
-- These run with the owner's privileges (security_invoker off), which is what lets anon read
-- projects and runs without any direct grant on those tables. The views choose the columns,
-- so api_key_hash never leaves the database and the private-project redactions are applied
-- before anon sees a row.
-- ---------------------------------------------------------------------------------------------

create view public.projects_public with (security_invoker = false) as
  select
    id,
    created_at,
    slug,
    name,
    tagline,
    description,
    visibility,
    case when visibility = 'public' then repo_url end as repo_url,
    default_branch,
    dev_stack,
    test_stack,
    layer_rules,
    declared_suites,
    coverage_floors,
    expected_cadence_days,
    sort_order,
    retention_days
  from public.projects;

create view public.runs_public with (security_invoker = false) as
  select
    r.id,
    r.created_at,
    r.project_id,
    r.ci_run_id,
    r.run_attempt,
    case when p.visibility = 'public' then r.commit_sha else left(r.commit_sha, 7) end
      as commit_sha,
    r.branch,
    r.event,
    case when p.visibility = 'public' then r.run_url end as run_url,
    r.started_at,
    r.finished_at,
    r.status,
    r.total,
    r.passed,
    r.failed,
    r.skipped,
    r.duration_ms,
    r.source,
    r.results_pruned_at
  from public.runs r
  join public.projects p on p.id = r.project_id;

-- projects_public is simple enough for Postgres to make it updatable, and a write through a
-- definer view would land in projects as the owner. Read-only for everyone but the owner.
revoke all on public.projects_public, public.runs_public from anon, authenticated;
grant select on public.projects_public, public.runs_public to anon;
