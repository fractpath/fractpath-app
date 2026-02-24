import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { randomBytes } from "node:crypto";
import { SCHEMA_VERSION } from "@/lib/contractVersion";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

interface SynthesizedCanonicalSnapshot {
  compute_version: string;
  computed_at: string;
  inputs: Record<string, unknown>;
  assumptions: Record<string, unknown>;
  outputs: Record<string, unknown>;
}

function computeVersionFallback(snapshotJson: Record<string, unknown>): string {
  return (
    (typeof snapshotJson.contract_version === "string" &&
      snapshotJson.contract_version) ||
    (typeof snapshotJson.engine_version === "string" &&
      snapshotJson.engine_version) ||
    (typeof snapshotJson.calculator_schema_version === "string" &&
      snapshotJson.calculator_schema_version) ||
    "0.0.1"
  );
}

/**
 * Build canonical inputs from whatever the marketing payload gave us,
 * without changing canonical shape.
 *
 * Precedence:
 * 1) snapshotJson.inputs (already canonical)
 * 2) snapshotJson.canonicalInputs (marketing wrapper)
 * 3) snapshotJson.deal_terms + (snapshotJson.scenario || snapshotJson.assumptions)
 */
function resolveCanonicalInputs(
  snapshotJson: Record<string, unknown>,
): Record<string, unknown> {
  const directInputs = snapshotJson.inputs;
  if (isRecord(directInputs)) return directInputs;

  const canonicalInputs = snapshotJson.canonicalInputs;
  if (isRecord(canonicalInputs)) return canonicalInputs;

  const dealTerms = snapshotJson.deal_terms;
  const scenario = snapshotJson.scenario;
  const assumptions = snapshotJson.assumptions;

  if (isRecord(dealTerms)) {
    const resolved: Record<string, unknown> = { deal_terms: dealTerms };

    // Canonical compute in your app expects "scenario" today in several places,
    // but we accept either key and map to "scenario" inside inputs.
    const scen = isRecord(scenario)
      ? scenario
      : isRecord(assumptions)
        ? assumptions
        : null;
    if (scen) resolved.scenario = scen;

    return resolved;
  }

  return {};
}

function synthesizeCanonicalSnapshot(
  snapshotJson: Record<string, unknown>,
): SynthesizedCanonicalSnapshot {
  const computeVersion = computeVersionFallback(snapshotJson);

  const inputs = resolveCanonicalInputs(snapshotJson);

  const outputs =
    (snapshotJson.result && isRecord(snapshotJson.result)
      ? snapshotJson.result
      : null) ??
    (snapshotJson.basic_results && isRecord(snapshotJson.basic_results)
      ? snapshotJson.basic_results
      : {});

  return {
    compute_version: computeVersion,
    computed_at: new Date().toISOString(),
    inputs,
    assumptions: {},
    outputs: outputs as Record<string, unknown>,
  };
}

function isUniqueViolation(err: any): boolean {
  // Postgres unique_violation
  if (err?.code === "23505") return true;
  const msg = String(err?.message ?? "");
  return (
    msg.toLowerCase().includes("duplicate") &&
    msg.toLowerCase().includes("unique")
  );
}

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  if (!body?.snapshot_json || !isRecord(body.snapshot_json)) {
    return jsonError(
      "snapshot_json is required and must be a JSON object",
      400,
    );
  }

  const source: string = body.source === "app" ? "app" : "marketing";
  const snapshotJson: Record<string, unknown> = { ...body.snapshot_json };

  // Precedence rule (anti-drift):
  // body.canonicalSnapshot wins; else use snapshot_json.canonicalSnapshot; else synthesize.
  const providedCanonical: unknown =
    body.canonicalSnapshot ?? snapshotJson.canonicalSnapshot ?? null;

  const resolvedCanonical: Record<string, unknown> = isRecord(providedCanonical)
    ? (providedCanonical as Record<string, unknown>)
    : (synthesizeCanonicalSnapshot(snapshotJson) as unknown as Record<
        string,
        unknown
      >);

  // Backfill inputs if caller gave us a canonicalSnapshot with empty inputs.
  if (
    !isRecord(resolvedCanonical.inputs) ||
    Object.keys(resolvedCanonical.inputs).length === 0
  ) {
    resolvedCanonical.inputs = resolveCanonicalInputs(snapshotJson);
  }

  // Store nested + verbatim (never spread)
  snapshotJson.canonicalSnapshot = resolvedCanonical;

  // contract_version drift containment:
  const contractVersion =
    typeof resolvedCanonical.compute_version === "string" &&
    resolvedCanonical.compute_version.trim().length > 0
      ? resolvedCanonical.compute_version
      : computeVersionFallback(snapshotJson);

  const schemaVersion =
    typeof snapshotJson.schema_version === "string" &&
    snapshotJson.schema_version.trim().length > 0
      ? snapshotJson.schema_version
      : SCHEMA_VERSION;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const service = createServiceClient();

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const token = generateToken();

    const { data, error } = await (service.from("draft_tokens") as any)
      .insert({
        token,
        snapshot_json: snapshotJson,
        contract_version: contractVersion,
        schema_version:
          typeof schemaVersion === "string" && schemaVersion.trim() !== ""
            ? schemaVersion
            : "1",
        expires_at: expiresAt.toISOString(),
        source,
      })
      .select("id")
      .single();

    if (!error && data) {
      return NextResponse.json(
        { ok: true, token, resumeUrl: `/resume?token=${token}` },
        { status: 201 },
      );
    }

    if (error && isUniqueViolation(error) && attempt < maxAttempts) continue;

    console.error("draft_tokens insert error:", error?.message ?? error);
    return jsonError("Failed to mint draft token", 500);
  }

  return jsonError("Failed to mint draft token", 500);
}
