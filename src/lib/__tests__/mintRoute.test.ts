const fs = require("fs");

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  FAIL: ${name}`);
    console.log(`        ${err.message}`);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

const ROUTE_PATH = "src/app/api/draft-tokens/mint/route.ts";
const content = fs.readFileSync(ROUTE_PATH, "utf-8");

console.log("\n--- Mint Route Contract Tests ---\n");

test("mint endpoint file exists at correct App Router path", () => {
  assert(fs.existsSync(ROUTE_PATH), "route.ts must exist");
});

test("mint route exports POST handler", () => {
  assert(content.includes("export async function POST"), "must export POST");
});

test("mint route validates snapshot_json is object", () => {
  assert(
    content.includes("snapshot_json is required") && content.includes("JSON object"),
    "must validate snapshot_json",
  );
});

test("mint route uses createServiceClient only (no createClient)", () => {
  assert(content.includes("createServiceClient"), "must use service client");
  assert(!content.includes('from "@/lib/supabase/server"'), "must NOT import user-scoped client");
});

test("mint route generates crypto random hex token", () => {
  assert(
    content.includes("randomBytes") && content.includes("hex"),
    "must generate crypto random hex token",
  );
});

test("mint route stores canonicalSnapshot verbatim from body if object", () => {
  assert(
    content.includes("body.canonicalSnapshot") && content.includes("providedCanonical"),
    "must accept body.canonicalSnapshot verbatim",
  );
});

test("mint route stores canonicalSnapshot verbatim from snapshot_json if object", () => {
  assert(
    content.includes("snapshotJson.canonicalSnapshot"),
    "must accept snapshotJson.canonicalSnapshot verbatim",
  );
});

test("mint route synthesizes canonicalSnapshot only when truly absent", () => {
  assert(
    content.includes("synthesizeCanonicalSnapshot"),
    "must synthesize when no canonical present",
  );
  assert(
    content.includes("isProvidedObject"),
    "must check if provided is an object before synthesizing",
  );
});

test("synthesize: compute_version fallback chain", () => {
  assert(content.includes("contract_version"), "must check contract_version");
  assert(content.includes("engine_version"), "must check engine_version");
  assert(content.includes("calculator_schema_version"), "must check calculator_schema_version");
  assert(content.includes('"0.0.1"'), "must fall back to 0.0.1");
});

test("synthesize: computed_at = now ISO", () => {
  assert(
    content.includes("new Date().toISOString()"),
    "must set computed_at to current ISO time",
  );
});

test("synthesize: inputs from snapshot_json.inputs or empty", () => {
  assert(
    content.includes("snapshotJson.inputs"),
    "must read inputs from snapshot_json",
  );
});

test("synthesize: outputs from result or basic_results or empty", () => {
  assert(
    content.includes("snapshotJson.result") && content.includes("snapshotJson.basic_results"),
    "must check result then basic_results",
  );
});

test("synthesize: assumptions defaults to empty object", () => {
  assert(
    content.includes("assumptions: {}"),
    "must default assumptions to {}",
  );
});

test("mint route sets canonicalSnapshot on snapshotJson before insert", () => {
  assert(
    content.includes("snapshotJson.canonicalSnapshot = resolvedCanonical"),
    "must attach resolved canonical to snapshot_json",
  );
});

test("mint route preserves existing snapshot_json keys via spread", () => {
  assert(
    content.includes("{ ...body.snapshot_json }"),
    "must shallow-copy to preserve existing keys",
  );
});

test("mint route sets contract_version from resolved canonical compute_version", () => {
  assert(
    content.includes("resolvedCanonical.compute_version"),
    "must derive contract_version from resolved canonical",
  );
});

test("mint route sets schema_version from snapshot_json or defaults to 1", () => {
  assert(
    content.includes("snapshotJson.schema_version") || content.includes("schema_version"),
    "must read schema_version",
  );
  assert(content.match(/["']1["']/), "must default to '1'");
});

test("mint route inserts into draft_tokens table", () => {
  assert(
    content.includes('from("draft_tokens")') && content.includes(".insert("),
    "must insert into draft_tokens",
  );
});

test("mint route sets expires_at = now + 7 days", () => {
  assert(
    content.includes("7 * 24 * 60 * 60 * 1000"),
    "must set 7-day expiration",
  );
});

test("mint route sets source from body or defaults to marketing", () => {
  assert(
    content.includes('"marketing"') && content.includes('"app"'),
    "must support marketing and app sources",
  );
});

test("mint route returns { ok, token, resumeUrl }", () => {
  assert(content.includes("ok: true"), "must return ok: true");
  assert(content.includes("token"), "must return token");
  assert(content.includes("resumeUrl") && content.includes("/resume?token="), "must return resumeUrl");
  assert(content.includes("status: 201"), "must return 201");
});

test("mint route insert includes all required columns", () => {
  const insertBlock = content.slice(content.indexOf(".insert("), content.indexOf(".select(\"id\")"));
  assert(insertBlock.includes("token"), "must insert token");
  assert(insertBlock.includes("snapshot_json"), "must insert snapshot_json");
  assert(insertBlock.includes("contract_version"), "must insert contract_version");
  assert(insertBlock.includes("schema_version"), "must insert schema_version");
  assert(insertBlock.includes("expires_at"), "must insert expires_at");
  assert(insertBlock.includes("source"), "must insert source");
});

test("synthesized canonical snapshot includes required fields", () => {
  assert(content.includes("compute_version:"), "synthesized must include compute_version");
  assert(content.includes("computed_at:"), "synthesized must include computed_at");
  assert(content.includes("assumptions:"), "synthesized must include assumptions");
});

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);
if (failed > 0) process.exit(1);
