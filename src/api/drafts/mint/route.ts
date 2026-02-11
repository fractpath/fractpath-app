import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { rateLimitByIp } from "@/lib/rateLimit";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SCHEMA_VERSION = "1";
const DEFAULT_ENGINE_VERSION = "mint-v1";
const DEFAULT_CALCULATOR_SCHEMA_VERSION = "unknown";

function stableStringify(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "string") return JSON.stringify(value);
  if (t === "number")
    return Number.isFinite(value as number) ? String(value) : "null";
  if (t === "boolean") return value ? "true" : "false";

  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }

  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts = keys.map(
      (k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`,
    );
    return `{${parts.join(",")}}`;
  }

  return "null";
}

function canonicalHash(obj: unknown): string {
  const json = stableStringify(obj);
  return createHash("sha256").update(json).digest("hex");
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  if (!rateLimitByIp(ip)) {
    return jsonError("Too many requests", 429);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !EMAIL_RE.test(email)) {
    return jsonError("Valid email is required", 400);
  }

  const snapshotRaw = body?.snapshot;
  if (snapshotRaw === undefined || snapshotRaw === null) {
    return jsonError("snapshot is required", 400);
  }

  // Validate minimum contract shape needed for /resume redemption.
  if (!isPlainObject(snapshotRaw)) {
    return jsonError("snapshot must be a JSON object", 400);
  }

  const inputs = (snapshotRaw as any).inputs;
  const result = (snapshotRaw as any).result;

  if (!isPlainObject(inputs)) {
    return jsonError(
      "snapshot.inputs is required and must be a JSON object",
      422,
    );
  }

  if (!isPlainObject(result)) {
    return jsonError(
      "snapshot.result is required and must be a JSON object",
      422,
    );
  }

  const engine_version =
    typeof (snapshotRaw as any).engine_version === "string" &&
    (snapshotRaw as any).engine_version.trim().length > 0
      ? (snapshotRaw as any).engine_version.trim()
      : DEFAULT_ENGINE_VERSION;

  const calculator_schema_version =
    typeof (snapshotRaw as any).calculator_schema_version === "string" &&
    (snapshotRaw as any).calculator_schema_version.trim().length > 0
      ? (snapshotRaw as any).calculator_schema_version.trim()
      : DEFAULT_CALCULATOR_SCHEMA_VERSION;

  const inputs_hash = canonicalHash(inputs);
  const result_hash = canonicalHash(result);

  const snapshot = {
    schema_version: SCHEMA_VERSION,
    inputs,
    result,
    engine_version,
    calculator_schema_version,
    inputs_hash,
    result_hash,
  };

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  try {
    const supabase = createServiceClient();

    const { error } = await (supabase.from("draft_tokens") as any).insert({
      token,
      snapshot_json: snapshot,
      schema_version: SCHEMA_VERSION,
      contract_version: "1.0.0",
      expires_at: expiresAt,
      source: "marketing",
      // Note: draft_tokens currently has no to_email column.
      // Email is validated here purely for rate-limiting/lead-capture parity.
    });

    if (error) {
      console.error("draft_tokens insert error:", error);
      return jsonError("Failed to mint token", 500);
    }

    return NextResponse.json(
      { ok: true, token, expires_at: expiresAt },
      { status: 201 },
    );
  } catch (err: any) {
    console.error("Mint error:", err?.message);
    return jsonError("Internal server error", 500);
  }
}
