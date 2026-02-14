import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { randomBytes } from "node:crypto";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

interface SynthesizedCanonicalSnapshot {
  compute_version: string;
  computed_at: string;
  inputs: Record<string, unknown>;
  assumptions: Record<string, unknown>;
  outputs: Record<string, unknown>;
}

function synthesizeCanonicalSnapshot(
  snapshotJson: Record<string, unknown>,
): SynthesizedCanonicalSnapshot {
  const computeVersion =
    (typeof snapshotJson.contract_version === "string" && snapshotJson.contract_version) ||
    (typeof snapshotJson.engine_version === "string" && snapshotJson.engine_version) ||
    (typeof snapshotJson.calculator_schema_version === "string" && snapshotJson.calculator_schema_version) ||
    "0.0.1";

  const inputs =
    snapshotJson.inputs && typeof snapshotJson.inputs === "object" && !Array.isArray(snapshotJson.inputs)
      ? (snapshotJson.inputs as Record<string, unknown>)
      : {};

  const outputs =
    (snapshotJson.result && typeof snapshotJson.result === "object" && !Array.isArray(snapshotJson.result)
      ? (snapshotJson.result as Record<string, unknown>)
      : null) ??
    (snapshotJson.basic_results && typeof snapshotJson.basic_results === "object" && !Array.isArray(snapshotJson.basic_results)
      ? (snapshotJson.basic_results as Record<string, unknown>)
      : {});

  return {
    compute_version: computeVersion,
    computed_at: new Date().toISOString(),
    inputs,
    assumptions: {},
    outputs,
  };
}

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  if (!body?.snapshot_json || typeof body.snapshot_json !== "object" || Array.isArray(body.snapshot_json)) {
    return jsonError("snapshot_json is required and must be a JSON object", 400);
  }

  const source: string = body.source === "app" ? "app" : "marketing";
  const snapshotJson: Record<string, unknown> = { ...body.snapshot_json };

  const providedCanonical: unknown =
    body.canonicalSnapshot ??
    snapshotJson.canonicalSnapshot ??
    null;

  const isProvidedObject =
    providedCanonical &&
    typeof providedCanonical === "object" &&
    !Array.isArray(providedCanonical);

  let resolvedCanonical: Record<string, unknown>;

  if (isProvidedObject) {
    resolvedCanonical = providedCanonical as Record<string, unknown>;
  } else {
    resolvedCanonical = synthesizeCanonicalSnapshot(snapshotJson) as unknown as Record<string, unknown>;
  }

  snapshotJson.canonicalSnapshot = resolvedCanonical;

  const contractVersion =
    typeof resolvedCanonical.compute_version === "string" && resolvedCanonical.compute_version.trim().length > 0
      ? resolvedCanonical.compute_version
      : "0.0.1";
  const schemaVersion =
    typeof snapshotJson.schema_version === "string" && snapshotJson.schema_version.trim().length > 0
      ? snapshotJson.schema_version
      : "1";

  const token = generateToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const service = createServiceClient();

  const { data, error } = await (service.from("draft_tokens") as any)
    .insert({
      token,
      snapshot_json: snapshotJson,
      contract_version: contractVersion,
      schema_version: schemaVersion,
      expires_at: expiresAt.toISOString(),
      source,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("draft_tokens insert error:", error?.message);
    return jsonError("Failed to mint draft token", 500);
  }

  return NextResponse.json(
    {
      ok: true,
      token,
      resumeUrl: `/resume?token=${token}`,
    },
    { status: 201 },
  );
}
