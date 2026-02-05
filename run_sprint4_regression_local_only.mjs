import { createClient } from "@supabase/supabase-js";

function requireEnv(name) {
  const v = process.env[name];
  if (!v || String(v).trim() === "") {
    console.error(`❌ Missing required env var: ${name}`);
    process.exit(2);
  }
  return v;
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (process.env.GITHUB_TOKEN) {
    console.log("ℹ️ GITHUB_TOKEN detected but ignored (local-only run).");
  }

  const supabase = createClient(url, anonKey);

  console.log("▶ Running Sprint 4 regression (local-only)");
  const { error: rpcError } = await supabase.rpc("run_sprint4_regression");
  if (rpcError) {
    console.error("❌ RPC error:", rpcError);
    process.exit(1);
  }

  const { data: runs, error } = await supabase
    .from("regression_runs")
    .select("id,name,passed,created_at")
    .ilike("name", "sprint4%")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("❌ Failed to read regression_runs:", error);
    process.exit(1);
    process.exit(1);
  }

  console.log("\n=== Sprint 4 Regression Results ===");
  for (const r of runs) {
    console.log(`${r.passed ? "✅ PASS" : "❌ FAIL"}  ${r.name}  @ ${r.created_at}`);
  }

  if (runs.some(r => r.passed === false)) {
    console.log("\n❌ One or more Sprint 4 regressions FAILED.");
    process.exit(1);
  }

  console.log("\n✅ All Sprint 4 regressions PASSED.");
}

main().catch(err => {
  console.error("❌ Unexpected error:", err);
  process.exit(1);
});
