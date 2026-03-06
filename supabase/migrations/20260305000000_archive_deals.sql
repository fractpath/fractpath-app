alter table public.deals add column if not exists archived_at timestamptz;
alter table public.deals add column if not exists archived_by uuid;

create index if not exists idx_deals_archived_at on public.deals(archived_at) where archived_at is not null;
