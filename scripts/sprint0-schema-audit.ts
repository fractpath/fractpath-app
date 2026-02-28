import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const TABLES = [
  "properties",
  "deals",
  "deal_access_grants",
  "deal_snapshots",
  "deal_versions",
  "deal_share_tokens",
  "draft_tokens",
  "deal_events",
  "property_documents",
  "property_status_audit",
  "profiles",
  "calculator_snapshots",
];

async function logColumns(tableName: string) {
  const { data: cols, error: colErr } = await supabase
    .from("information_schema.columns" as any)
    .select("column_name, data_type, is_nullable, column_default")
    .eq("table_schema", "public")
    .eq("table_name", tableName)
    .order("ordinal_position");

  if (colErr) {
    const { data: rawCols } = await supabase.rpc("exec_sql_readonly" as any, {
      sql: `SELECT column_name, data_type, is_nullable, column_default 
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = '${tableName}' 
            ORDER BY ordinal_position`,
    });

    if (rawCols && Array.isArray(rawCols)) {
      console.log(`\n=== ${tableName} — Columns ===`);
      for (const c of rawCols) {
        console.log(`  ${c.column_name} | ${c.data_type} | nullable=${c.is_nullable} | default=${c.column_default ?? "—"}`);
      }
    } else {
      console.log(`\n=== ${tableName} — Could not read columns (RLS or no access to information_schema) ===`);
    }
    return;
  }

  console.log(`\n=== ${tableName} — Columns ===`);
  if (!cols || cols.length === 0) {
    console.log("  (table not found or no columns)");
    return;
  }
  for (const c of cols as any[]) {
    console.log(`  ${c.column_name} | ${c.data_type} | nullable=${c.is_nullable} | default=${c.column_default ?? "—"}`);
  }
}

async function logIndexes(tableName: string) {
  console.log(`\n=== ${tableName} — Indexes ===`);

  const { data, error } = await supabase.rpc("exec_sql_readonly" as any, {
    sql: `SELECT indexname, indexdef FROM pg_indexes 
          WHERE schemaname = 'public' AND tablename = '${tableName}'`,
  });

  if (error || !data) {
    console.log("  (could not read pg_indexes — may need exec_sql_readonly RPC)");
    console.log("  Falling back to migration-defined indexes (see docs/architecture/private-property-threads.md)");
    return;
  }

  if (Array.isArray(data) && data.length === 0) {
    console.log("  (no indexes found)");
    return;
  }

  for (const idx of data as any[]) {
    console.log(`  ${idx.indexname}: ${idx.indexdef}`);
  }
}

async function logRlsPolicies(tableName: string) {
  console.log(`\n=== ${tableName} — RLS Policies ===`);

  const { data, error } = await supabase.rpc("exec_sql_readonly" as any, {
    sql: `SELECT policyname, cmd, qual, with_check FROM pg_policies 
          WHERE schemaname = 'public' AND tablename = '${tableName}'`,
  });

  if (error || !data) {
    console.log("  (could not read pg_policies — may need exec_sql_readonly RPC)");
    console.log("  See docs/architecture/private-property-threads.md for migration-defined policies");
    return;
  }

  if (Array.isArray(data) && data.length === 0) {
    console.log("  (no policies found — all access denied by RLS)");
    return;
  }

  for (const p of data as any[]) {
    console.log(`  ${p.policyname} [${p.cmd}]`);
    if (p.qual) console.log(`    USING: ${p.qual}`);
    if (p.with_check) console.log(`    WITH CHECK: ${p.with_check}`);
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("Sprint 0 — Schema Audit");
  console.log("=".repeat(60));
  console.log("Date:", new Date().toISOString());
  console.log("Supabase URL:", SUPABASE_URL);
  console.log("\nNOTE: This script requires either:");
  console.log("  1. Access to information_schema (service role typically has this)");
  console.log("  2. An exec_sql_readonly RPC function for pg_indexes/pg_policies");
  console.log("If queries fail, refer to docs/architecture/private-property-threads.md");

  for (const table of TABLES) {
    await logColumns(table);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Indexes (properties — checking normalized_address uniqueness)");
  console.log("=".repeat(60));
  await logIndexes("properties");

  console.log("\n" + "=".repeat(60));
  console.log("RLS Policies");
  console.log("=".repeat(60));
  for (const table of ["properties", "deals", "deal_snapshots", "deal_versions", "deal_share_tokens", "deal_access_grants", "property_documents"]) {
    await logRlsPolicies(table);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Audit Complete");
  console.log("=".repeat(60));
  console.log("\nRefer to docs/architecture/private-property-threads.md for full analysis.");
}

main().catch((e) => {
  console.error("Audit script failed:", e);
  process.exit(1);
});
