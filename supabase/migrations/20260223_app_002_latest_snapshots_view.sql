-- Latest snapshot per deal (one row per deal_id)
-- Uses DISTINCT ON to select the most recent snapshot by created_at.

create or replace view public.deal_latest_snapshots as
select distinct on (ds.deal_id)
  ds.deal_id,
  ds.id as snapshot_id,
  ds.created_at,
  ds.contract_version,
  ds.schema_version,
  ds.compute_version,
  ds.snapshot_json
from public.deal_snapshots ds
order by ds.deal_id, ds.created_at desc;
