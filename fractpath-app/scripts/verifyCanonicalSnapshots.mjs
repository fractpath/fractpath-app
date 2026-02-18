import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY;

if (url == null || key == null) {
  console.error("Missing env: need SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const dealIds = [
  "78be4371-9149-4f73-a902-842a436c7757",
  "fa06aa8c-1314-4384-a8d3-d4986fec7838",
  "9d5c6d0c-3a96-4887-8926-d869b2c09bdd",
  "c5b56f1b-5f84-4921-8e35-534057ddabf7",
  "45e99c69-25d8-4b5f-a615-1a2b36121246",
  "271d5a77-26f5-47bb-b9a5-4485e4015688",
  "6ae81483-de09-4a08-adec-90946184c155",
  "9c70b0be-a8e6-4b6d-a577-d672fd2a1fb8",
  "5aa3e1ff-a491-4e92-bf7f-7cb0733e9156",
  "1155e48a-980f-4e33-8c70-856cf5283e8d"
];

const supabase = createClient(url, key, { auth: { persistSession: false } });

const q = await supabase
  .from("deal_snapshots")
  .select("id,deal_id,created_at,contract_version,schema_version,snapshot_json")
  .in("deal_id", dealIds)
  .order("created_at", { ascending: false });

if (q.error) {
  console.error(q.error);
  process.exit(1);
}

const latestByDeal = new Map();
for (const row of q.data || []) {
  if (!latestByDeal.has(row.deal_id)) latestByDeal.set(row.deal_id, row);
}

let ok = true;
for (const dealId of dealIds) {
  const r = latestByDeal.get(dealId);
  if (!r) {
    console.log("[FAIL] deal=" + dealId + " no snapshots");
    ok = false;
    continue;
  }

  const j = r.snapshot_json || {};
  const hasTerms = j.inputs && j.inputs.deal_terms != null;
  const hasResults = j.outputs && j.outputs.results != null;
  const isV10 = r.contract_version === "10.0.0" || r.contract_version === 10 || String(r.contract_version).startsWith("10");

  const status = isV10 && hasTerms && hasResults ? "[OK]" : "[FAIL]";
  console.log(
    status +
      " deal=" + dealId +
      " snapshot=" + r.id +
      " contract_version=" + r.contract_version +
      " has_inputs.deal_terms=" + hasTerms +
      " has_outputs.results=" + hasResults
  );

  if (!(isV10 && hasTerms && hasResults)) ok = false;
}

process.exit(ok ? 0 : 2);
