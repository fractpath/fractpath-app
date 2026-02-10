-- APP-INT-001: Deals, Calculator Snapshots, Deal Events
-- The authoritative resume flow: DraftSnapshot → Deal + Snapshot v1

-- ============================================================
-- 1. deals
-- ============================================================
create table if not exists public.deals (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  status        text not null default 'IMPORTED',
  created_from  text not null,
  source_ref    text null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_deals_owner
  on public.deals (owner_user_id, created_at desc);

create index if not exists idx_deals_source_ref
  on public.deals (source_ref) where source_ref is not null;

alter table public.deals enable row level security;

drop policy if exists "deals_select_own" on public.deals;
create policy "deals_select_own"
  on public.deals for select
  using (auth.uid() = owner_user_id);

drop policy if exists "deals_deny_anon_insert" on public.deals;
create policy "deals_deny_anon_insert"
  on public.deals for insert
  with check (false);

drop policy if exists "deals_deny_anon_update" on public.deals;
create policy "deals_deny_anon_update"
  on public.deals for update
  using (false);

drop policy if exists "deals_deny_anon_delete" on public.deals;
create policy "deals_deny_anon_delete"
  on public.deals for delete
  using (false);

-- updated_at trigger
create or replace function public.set_deals_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_deals_set_updated_at on public.deals;
create trigger trg_deals_set_updated_at
  before update on public.deals
  for each row execute function public.set_deals_updated_at();

-- ============================================================
-- 2. calculator_snapshots (append-only, immutable)
-- ============================================================
create table if not exists public.calculator_snapshots (
  id                       uuid primary key default gen_random_uuid(),
  deal_id                  uuid not null references public.deals(id) on delete cascade,
  version                  integer not null default 1,
  source                   text not null,
  inputs_json              jsonb not null,
  results_json             jsonb not null,
  calculator_schema_version text not null,
  engine_version           text not null,
  inputs_hash              text not null,
  result_hash              text not null,
  parent_snapshot_id       uuid null references public.calculator_snapshots(id),
  created_by               uuid not null references auth.users(id),
  created_at               timestamptz not null default now()
);

create unique index if not exists idx_calculator_snapshots_deal_version
  on public.calculator_snapshots (deal_id, version);

alter table public.calculator_snapshots enable row level security;

drop policy if exists "calculator_snapshots_deny_anon_select" on public.calculator_snapshots;
create policy "calculator_snapshots_deny_anon_select"
  on public.calculator_snapshots for select
  using (false);

drop policy if exists "calculator_snapshots_deny_anon_insert" on public.calculator_snapshots;
create policy "calculator_snapshots_deny_anon_insert"
  on public.calculator_snapshots for insert
  with check (false);

drop policy if exists "calculator_snapshots_deny_anon_update" on public.calculator_snapshots;
create policy "calculator_snapshots_deny_anon_update"
  on public.calculator_snapshots for update
  using (false);

drop policy if exists "calculator_snapshots_deny_anon_delete" on public.calculator_snapshots;
create policy "calculator_snapshots_deny_anon_delete"
  on public.calculator_snapshots for delete
  using (false);

-- ============================================================
-- 3. deal_events (audit log, append-only)
-- ============================================================
create table if not exists public.deal_events (
  id         uuid primary key default gen_random_uuid(),
  deal_id    uuid not null references public.deals(id) on delete cascade,
  event_type text not null,
  payload    jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_deal_events_deal
  on public.deal_events (deal_id, created_at);

alter table public.deal_events enable row level security;

drop policy if exists "deal_events_deny_anon_select" on public.deal_events;
create policy "deal_events_deny_anon_select"
  on public.deal_events for select
  using (false);

drop policy if exists "deal_events_deny_anon_insert" on public.deal_events;
create policy "deal_events_deny_anon_insert"
  on public.deal_events for insert
  with check (false);

drop policy if exists "deal_events_deny_anon_update" on public.deal_events;
create policy "deal_events_deny_anon_update"
  on public.deal_events for update
  using (false);

drop policy if exists "deal_events_deny_anon_delete" on public.deal_events;
create policy "deal_events_deny_anon_delete"
  on public.deal_events for delete
  using (false);
