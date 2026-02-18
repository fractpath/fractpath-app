create or replace function public.create_deal_with_owner_grant(
  p_property_address text,
  p_user_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_deal_id uuid;
begin
  if p_property_address is null or length(trim(p_property_address)) < 3 then
    raise exception 'property_address required';
  end if;

  insert into public.deals (property_address, created_by)
  values (trim(p_property_address), p_user_id)
  returning id into v_deal_id;

  insert into public.deal_access_grants (deal_id, user_id, role, created_by)
  values (v_deal_id, p_user_id, 'OWNER', p_user_id);

  return v_deal_id;
end;
$$;

revoke all on function public.create_deal_with_owner_grant(text, uuid) from public;
