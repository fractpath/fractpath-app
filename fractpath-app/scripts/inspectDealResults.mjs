import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_ANON_KEY;

if (url == null || key == null) {
  console.error(
    "Missing env: need SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

const dealId = process.argv[2];
if (!dealId) {
  console.error("Usage: node scripts/inspectDealResults.mjs <dealId>");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const q = await supabase
  .from("deal_snapshots")
  .select("id,deal_id,created_at,contract_version,schema_version,snapshot_json")
  .eq("deal_id", dealId)
  .order("created_at", { ascending: false })
  .limit(1);

if (q.error) {
  console.error(q.error);
  process.exit(1);
}

const row = (q.data || [])[0];
if (!row) {
  console.log("No snapshots found for deal=" + dealId);
  process.exit(2);
}

const snap = row.snapshot_json || {};
const outputs = snap.outputs || null;
const results = outputs && typeof outputs === "object" ? outputs.results : null;

console.log("deal=" + dealId);
console.log("snapshot=" + row.id);
console.log("created_at=" + row.created_at);
console.log("contract_version=" + row.contract_version);
console.log("schema_version=" + row.schema_version);

if (!results || typeof results !== "object") {
  console.log("outputs.results = <missing or non-object>");
  process.exit(3);
}

console.log("outputs.results keys:", Object.keys(results));
console.log("outputs.results sample:", results);
