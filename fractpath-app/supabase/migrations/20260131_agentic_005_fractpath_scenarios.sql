-- AGENTIC-005: Scenario persistence (pre-deal)
-- Table: fractpath_scenarios
-- RLS: users can only read/write their own scenarios

-- Needed for gen_random_uuid() in many Supabase projects
create extension if not exists "pgcrypto";

create table if not exists public.fractpath_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- Non-binding metadata
  title text null,
  persona text null,
  source text null,

  -- Scenario content (pre-deal, non-binding)
  scenario_summary text null,

  -- Flexible payload for frozen fields + computed outputs
  payload jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at maintenance
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_fractpath_scenarios_set_updated_at on public.fractpath_scenarios;
create trigger trg_fractpath_scenarios_set_updated_at
before update on public.fractpath_scenarios
for each row execute function public.set_updated_at();

-- Enable RLS
alter table public.fractpath_scenarios enable row level security;

-- Policies: user can only access their own rows
drop policy if exists "fractpath_scenarios_select_own" on public.fractpath_scenarios;
create policy "fractpath_scenarios_select_own"
on public.fractpath_scenarios
for select
using (auth.uid() = user_id);

drop policy if exists "fractpath_scenarios_insert_own" on public.fractpath_scenarios;
create policy "fractpath_scenarios_insert_own"
on public.fractpath_scenarios
for insert
with check (auth.uid() = user_id);

drop policy if exists "fractpath_scenarios_update_own" on public.fractpath_scenarios;
create policy "fractpath_scenarios_update_own"
on public.fractpath_scenarios
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "fractpath_scenarios_delete_own" on public.fractpath_scenarios;
create policy "fractpath_scenarios_delete_own"
on public.fractpath_scenarios
for delete
using (auth.uid() = user_id);

-- Helpful index for "last N scenarios"
create index if not exists idx_fractpath_scenarios_user_created
on public.fractpath_scenarios (user_id, created_at desc);
