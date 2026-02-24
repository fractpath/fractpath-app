import { createClient } from "@supabase/supabase-js";

const token = process.env.TOKEN;
if (!token) {
  console.error("TOKEN env var required");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await supabase
  .from("draft_tokens")
  .select("token, contract_version, schema_version, source, snapshot_json")
  .eq("token", token)
  .maybeSingle();

if (error) {
  console.error("query error:", error);
  process.exit(1);
}
if (!data) {
  console.error("not found");
  process.exit(1);
}

const sj = data.snapshot_json ?? {};
console.log("token:", data.token);
console.log("source:", data.source);
console.log("contract_version:", data.contract_version);
console.log("schema_version:", data.schema_version);

const hasTopDealTerms = !!(sj && typeof sj === "object" && sj.deal_terms && typeof sj.deal_terms === "object");
const hasInputsDealTerms = !!(sj && typeof sj === "object" && sj.inputs && typeof sj.inputs === "object" && sj.inputs.deal_terms);

const canonical = (sj && typeof sj === "object") ? sj.canonicalSnapshot : null;
const hasCanonicalInputsDealTerms =
  !!(canonical && typeof canonical === "object" &&
     canonical.inputs && typeof canonical.inputs === "object" &&
     canonical.inputs.deal_terms);

console.log("has top-level deal_terms:", hasTopDealTerms);
console.log("has inputs.deal_terms:", hasInputsDealTerms);
console.log("has canonicalSnapshot.inputs.deal_terms:", hasCanonicalInputsDealTerms);

console.log("\n--- snapshot_json keys ---");
console.log(Object.keys(sj));

console.log("\n--- canonicalSnapshot keys ---");
if (canonical && typeof canonical === "object") console.log(Object.keys(canonical));
else console.log("(none)");

console.log("\n--- canonicalSnapshot.inputs keys ---");
if (canonical && typeof canonical.inputs === "object" && canonical.inputs) console.log(Object.keys(canonical.inputs));
else console.log("(none)");

console.log("\n--- canonicalSnapshot.inputs.deal_terms ---");
if (hasCanonicalInputsDealTerms) console.log(JSON.stringify(canonical.inputs.deal_terms, null, 2));
else console.log("(missing)");
