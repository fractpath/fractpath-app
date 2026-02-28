-- Sprint 11.5: Contract Alignment (v2 RPCs)
-- Authoritative RPC definitions for app callsites.
-- Notes:
-- - These functions enforce auth.uid() to prevent actor spoofing.
-- - They rely on participant-based access via deal_access_grants.
-- - Token storage is hash-only; plaintext token returned only at mint time.

create extension if not exists pgcrypto;

-- Ensure redemption accounting exists if the app expects it.
alter table if exists public.deal_share_tokens
  add column if not exists max_redemptions integer;

alter table if exists public.deal_share_tokens
  add column if not exists redemption_count integer not null default 0;

-- Admin check (assumes profiles.is_admin exists; if your schema differs, adjust here).
create or replace function public.is_admin_v2()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

-- Create a deal and grant OWNER access to the creator.
-- Assumes deals table has: id (uuid), owner_user_id (uuid), status (text), created_from (text), source_ref (text)
-- If your schema differs, align the insert columns here (but keep signature stable).
create or replace function public.create_deal_with_owner_grant_v2(
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if p_user_id is null or p_user_id <> auth.uid() then
    raise exception 'actor_mismatch';
  end if;

  insert into public.deals (owner_user_id, status, created_from, source_ref)
  values (auth.uid(), 'DRAFT', 'app', 'create')
  returning id into v_deal_id;

  insert into public.deal_access_grants (deal_id, user_id, role)
  values (v_deal_id, auth.uid(), 'OWNER');

  return v_deal_id;
end;
$$;

-- Mint a share token (OWNER only). Returns plaintext token string.
create or replace function public.mint_deal_share_token_v2(
  p_deal_id uuid,
  p_actor_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_hash text;
  v_expires_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if p_actor_user_id is null or p_actor_user_id <> auth.uid() then
    raise exception 'actor_mismatch';
  end if;

  if p_deal_id is null then
    raise exception 'deal_id_required';
  end if;

  -- OWNER-only enforcement via grants
  if not exists (
    select 1
    from public.deal_access_grants g
    where g.deal_id = p_deal_id
      and g.user_id = auth.uid()
      and g.role = 'OWNER'
      and (g.revoked_at is null)
  ) then
    raise exception 'owner_only';
  end if;

  -- 30-day expiry (matches your stated convention)
  v_expires_at := now() + interval '30 days';

  -- Token + hash
  v_token := encode(gen_random_bytes(32), 'hex');
  v_hash := encode(digest(v_token, 'sha256'), 'hex');

  insert into public.deal_share_tokens (
    deal_id,
    token_hash,
    expires_at,
    revoked_at,
    max_redemptions,
    redemption_count
  )
  values (
    p_deal_id,
    v_hash,
    v_expires_at,
    null,
    max_redemptions,     -- preserves default/null if present
    0
  );

  return v_token;
end;
$$;

-- Redeem a share token: grants VIEWER access and enforces expiry/revocation/max redemptions.
-- Returns deal_id for routing.
create or replace function public.redeem_deal_share_token_v2(
  p_token text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_row record;
  v_deal_id uuid;
  v_max integer;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if p_token is null or length(trim(p_token)) = 0 then
    raise exception 'token_required';
  end if;

  v_hash := encode(digest(trim(p_token), 'sha256'), 'hex');

  select
    t.deal_id,
    t.expires_at,
    t.revoked_at,
    t.max_redemptions,
    t.redemption_count
  into v_row
  from public.deal_share_tokens t
  where t.token_hash = v_hash
  limit 1;

  if v_row.deal_id is null then
    raise exception 'token_invalid';
  end if;

  if v_row.revoked_at is not null then
    raise exception 'token_revoked';
  end if;

  if v_row.expires_at is not null and v_row.expires_at < now() then
    raise exception 'token_expired';
  end if;

  v_deal_id := v_row.deal_id;
  v_max := v_row.max_redemptions;
  v_count := v_row.redemption_count;

  if v_max is not null and v_count >= v_max then
    raise exception 'token_max_redemptions_reached';
  end if;

  -- increment redemption_count atomically
  update public.deal_share_tokens
  set redemption_count = redemption_count + 1
  where token_hash = v_hash;

  -- ensure VIEWER grant exists
  insert into public.deal_access_grants (deal_id, user_id, role)
  values (v_deal_id, auth.uid(), 'VIEWER')
  on conflict (deal_id, user_id, role) do nothing;

  return v_deal_id;
end;
$$;