-- Sprint 5: Draft token minting + redemption (APP-INT-001)
-- Table: draft_tokens
-- Stores opaque DraftSnapshot payloads from marketing widget.
-- Tokens are minted pre-auth and redeemed post-auth.
-- RLS: service-role only (all anon access denied).

create table if not exists public.draft_tokens (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,
  snapshot_json jsonb not null,
  contract_version text null,
  schema_version text null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz null,
  redeemed_by_user_id uuid null references auth.users(id),
  source text not null default 'marketing'
);

create unique index if not exists idx_draft_tokens_token
  on public.draft_tokens (token);

create index if not exists idx_draft_tokens_expires_at
  on public.draft_tokens (expires_at);

alter table public.draft_tokens enable row level security;

drop policy if exists "draft_tokens_deny_anon_select" on public.draft_tokens;
drop policy if exists "draft_tokens_deny_anon_insert" on public.draft_tokens;
drop policy if exists "draft_tokens_deny_anon_update" on public.draft_tokens;
drop policy if exists "draft_tokens_deny_anon_delete" on public.draft_tokens;

create policy "draft_tokens_deny_anon_select"
  on public.draft_tokens for select using (false);

create policy "draft_tokens_deny_anon_insert"
  on public.draft_tokens for insert with check (false);

create policy "draft_tokens_deny_anon_update"
  on public.draft_tokens for update using (false);

create policy "draft_tokens_deny_anon_delete"
  on public.draft_tokens for delete using (false);
