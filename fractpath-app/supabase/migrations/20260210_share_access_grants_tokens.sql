-- APP-SHARE-001: deal_access_grants + deal_share_tokens
-- Enables share-link flow: owner → share token → VIEWER grant

-- ============================================================
-- 1. deal_access_grants
-- ============================================================
create table if not exists public.deal_access_grants (
  id         uuid primary key default gen_random_uuid(),
  deal_id    uuid not null references public.deals(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'VIEWER',
  created_by uuid null references auth.users(id),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_deal_access_grants_deal_user
  on public.deal_access_grants (deal_id, user_id);

create index if not exists idx_deal_access_grants_user
  on public.deal_access_grants (user_id);

alter table public.deal_access_grants enable row level security;

drop policy if exists "dag_select_own" on public.deal_access_grants;
create policy "dag_select_own"
  on public.deal_access_grants for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "dag_deny_anon_insert" on public.deal_access_grants;
create policy "dag_deny_anon_insert"
  on public.deal_access_grants for insert
  with check (false);

drop policy if exists "dag_deny_anon_update" on public.deal_access_grants;
create policy "dag_deny_anon_update"
  on public.deal_access_grants for update
  using (false);

drop policy if exists "dag_deny_anon_delete" on public.deal_access_grants;
create policy "dag_deny_anon_delete"
  on public.deal_access_grants for delete
  using (false);

-- ============================================================
-- 2. deal_share_tokens
-- ============================================================
create table if not exists public.deal_share_tokens (
  id         uuid primary key default gen_random_uuid(),
  token      text unique not null,
  deal_id    uuid not null references public.deals(id) on delete cascade,
  to_email   text null,
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null default (now() + interval '30 days'),
  revoked_at timestamptz null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_deal_share_tokens_token
  on public.deal_share_tokens (token);

create index if not exists idx_deal_share_tokens_deal
  on public.deal_share_tokens (deal_id);

alter table public.deal_share_tokens enable row level security;

drop policy if exists "dst_deny_anon_select" on public.deal_share_tokens;
create policy "dst_deny_anon_select"
  on public.deal_share_tokens for select
  using (false);

drop policy if exists "dst_deny_anon_insert" on public.deal_share_tokens;
create policy "dst_deny_anon_insert"
  on public.deal_share_tokens for insert
  with check (false);

drop policy if exists "dst_deny_anon_update" on public.deal_share_tokens;
create policy "dst_deny_anon_update"
  on public.deal_share_tokens for update
  using (false);

drop policy if exists "dst_deny_anon_delete" on public.deal_share_tokens;
create policy "dst_deny_anon_delete"
  on public.deal_share_tokens for delete
  using (false);
