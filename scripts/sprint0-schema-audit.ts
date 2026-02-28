/**
 * Sprint 0 — Read-Only Schema Audit
 *
 * Prints: table columns, key indexes, RLS policies (if accessible).
 * DOES NOT mutate the database. All queries are SELECT-only.
 *
 * Usage:
 *   npx tsx scripts/sprint0-schema-audit.ts
 *
 * Requires env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const TABLES = [
  "profiles",
  "properties",
  "property_documents",
  "property_status_audit",
  "deals",
  "deal_access_grants",
  "deal_snapshots",
  "deal_versions",
  "deal_events",
  "deal_share_tokens",
  "draft_tokens",
  "calculator_snapshots",
];

const RLS_TABLES = [
  "properties",
  "property_documents",
  "property_status_audit",
  "deals",
  "deal_access_grants",
  "deal_snapshots",
  "deal_versions",
  "deal_events",
  "deal_share_tokens",
  "draft_tokens",
];

async function rpcSelect(sql: string): Promise<any[] | null> {
  const { data, error } = await supabase.rpc("exec_sql_readonly" as any, {
    sql,
  });
  if (error || !data) return null;
  return Array.isArray(data) ? data : null;
}

async function logColumns(tableName: string) {
  console.log(`\n── ${tableName} ── Columns`);

  const { data: cols, error: colErr } = await supabase
    .from("information_schema.columns" as any)
    .select("column_name, data_type, is_nullable, column_default")
    .eq("table_schema", "public")
    .eq("table_name", tableName)
    .order("ordinal_position");

  if (!colErr && cols && (cols as any[]).length > 0) {
    for (const c of cols as any[]) {
      console.log(
        `  ${c.column_name} | ${c.data_type} | nullable=${c.is_nullable} | default=${c.column_default ?? "—"}`,
      );
    }
    return;
  }

  const rawCols = await rpcSelect(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = '${tableName}'
     ORDER BY ordinal_position`,
  );

  if (rawCols && rawCols.length > 0) {
    for (const c of rawCols) {
      console.log(
        `  ${c.column_name} | ${c.data_type} | nullable=${c.is_nullable} | default=${c.column_default ?? "—"}`,
      );
    }
  } else {
    console.log("  (not found or no access to information_schema)");
  }
}

async function logIndexes(tableName: string) {
  console.log(`\n── ${tableName} ── Indexes`);

  const rows = await rpcSelect(
    `SELECT indexname, indexdef FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = '${tableName}'`,
  );

  if (!rows) {
    console.log("  (could not read pg_indexes — exec_sql_readonly RPC needed)");
    return;
  }
  if (rows.length === 0) {
    console.log("  (none)");
    return;
  }
  for (const idx of rows) {
    console.log(`  ${idx.indexname}`);
    console.log(`    ${idx.indexdef}`);
  }
}

async function logRlsPolicies(tableName: string) {
  console.log(`\n── ${tableName} ── RLS Policies`);

  const rows = await rpcSelect(
    `SELECT policyname, cmd, qual, with_check FROM pg_policies
     WHERE schemaname = 'public' AND tablename = '${tableName}'`,
  );

  if (!rows) {
    console.log("  (could not read pg_policies — exec_sql_readonly RPC needed)");
    return;
  }
  if (rows.length === 0) {
    console.log("  (no policies — all access denied by RLS)");
    return;
  }
  for (const p of rows) {
    console.log(`  ${p.policyname} [${p.cmd}]`);
    if (p.qual) console.log(`    USING: ${p.qual}`);
    if (p.with_check) console.log(`    WITH CHECK: ${p.with_check}`);
  }
}

async function logTriggers(tableName: string) {
  console.log(`\n── ${tableName} ── Triggers`);

  const rows = await rpcSelect(
    `SELECT trigger_name, event_manipulation, action_statement
     FROM information_schema.triggers
     WHERE event_object_schema = 'public' AND event_object_table = '${tableName}'`,
  );

  if (!rows) {
    console.log("  (could not read triggers)");
    return;
  }
  if (rows.length === 0) {
    console.log("  (none)");
    return;
  }
  for (const t of rows) {
    console.log(`  ${t.trigger_name} [${t.event_manipulation}] → ${t.action_statement}`);
  }
}

async function logConstraints(tableName: string) {
  console.log(`\n── ${tableName} ── Constraints`);

  const rows = await rpcSelect(
    `SELECT conname, pg_get_constraintdef(oid) AS def
     FROM pg_constraint
     WHERE conrelid = 'public.${tableName}'::regclass AND contype = 'c'`,
  );

  if (!rows) {
    console.log("  (could not read pg_constraint)");
    return;
  }
  if (rows.length === 0) {
    console.log("  (no CHECK constraints)");
    return;
  }
  for (const c of rows) {
    console.log(`  ${c.conname}: ${c.def}`);
  }
}

async function main() {
  const SEP = "=".repeat(60);

  console.log(SEP);
  console.log("Sprint 0 — Read-Only Schema Audit");
  console.log(SEP);
  console.log("Date:", new Date().toISOString());
  console.log("Supabase URL:", SUPABASE_URL);
  console.log("\nThis script is SELECT-only. It does NOT mutate the database.");
  console.log("If pg_* queries fail, an exec_sql_readonly RPC is needed.");
  console.log("Refer to docs/architecture/private-property-threads.md for full analysis.\n");

  console.log(SEP);
  console.log("SECTION 1: Table Columns");
  console.log(SEP);
  for (const table of TABLES) {
    await logColumns(table);
  }

  console.log("\n" + SEP);
  console.log("SECTION 2: Indexes");
  console.log(SEP);
  for (const table of TABLES) {
    await logIndexes(table);
  }

  console.log("\n" + SEP);
  console.log("SECTION 3: CHECK Constraints");
  console.log(SEP);
  for (const table of ["properties", "property_documents", "deals", "draft_tokens"]) {
    await logConstraints(table);
  }

  console.log("\n" + SEP);
  console.log("SECTION 4: Immutability Triggers");
  console.log(SEP);
  for (const table of [
    "deal_snapshots",
    "deal_versions",
    "deal_events",
    "calculator_snapshots",
  ]) {
    await logTriggers(table);
  }

  console.log("\n" + SEP);
  console.log("SECTION 5: RLS Policies");
  console.log(SEP);
  for (const table of RLS_TABLES) {
    await logRlsPolicies(table);
  }

  console.log("\n" + SEP);
  console.log("Audit Complete");
  console.log(SEP);
}

main().catch((e) => {
  console.error("Audit script failed:", e);
  process.exit(1);
});
