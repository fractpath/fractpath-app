import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createHash, randomBytes } from "node:crypto";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

function stableStringify(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "string") return JSON.stringify(value);
  if (t === "number") return Number.isFinite(value as number) ? String(value) : "null";
  if (t === "boolean") return value ? "true" : "false";

  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }

  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
    return `{${parts.join(",")}}`;
  }

  return "null";
}

function canonicalHash(obj: unknown): string {
  const json = stableStringify(obj);
  return createHash("sha256").update(json).digest("hex");
}

function isUniqueViolation(err: any): boolean {
  if (err?.code === "23505") return true;
  const msg = String(err?.message ?? "");
  return msg.toLowerCase().includes("duplicate") && msg.toLowerCase().includes("unique");
}

const IP_RATE_MAP = new Map<string, { count: number; reset: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = IP_RATE_MAP.get(ip);
  if (!entry || now > entry.reset) {
    IP_RATE_MAP.set(ip, { count: 1, reset: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  if (isRateLimited(ip)) {
    return jsonError("Too many requests", 429);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  if (!body || typeof body !== "object") {
    return jsonError("Request body must be a JSON object", 400);
  }

  const email = body.email;
  if (typeof email !== "string" || email.trim().length === 0) {
    return jsonError("email is required", 400);
  }

  const inputs: Record<string, unknown> = {
    email: email.trim(),
    home_address: typeof body.home_address === "string" ? body.home_address : "",
    equity_owned: typeof body.equity_owned === "number" ? body.equity_owned : 0,
    funding_method: typeof body.funding_method === "string" ? body.funding_method : "exploring",
    sale_timeline: typeof body.sale_timeline === "string" ? body.sale_timeline : "exploring",
  };

  const result: Record<string, unknown> = {
    status: "draft",
    source: "marketing_lead",
    captured_at: new Date().toISOString(),
  };

  const inputs_hash = canonicalHash(inputs);
  const result_hash = canonicalHash(result);

  const snapshotJson: Record<string, unknown> = {
    schema_version: "1",
    engine_version: "marketing-lead-v1",
    calculator_schema_version: "marketing-lead-v1",
    inputs,
    result,
    inputs_hash,
    result_hash,
  };

  const service = createServiceClient();

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const token = generateToken();

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { data, error } = await (service.from("draft_tokens") as any)
      .insert({
        token,
        snapshot_json: snapshotJson,
        contract_version: "marketing-lead-v1",
        schema_version: "1",
        expires_at: expiresAt.toISOString(),
        source: "marketing",
      })
      .select("id")
      .single();

    if (!error && data) {
      return NextResponse.json(
        {
          ok: true,
          token,
          resumeUrl: `/resume?token=${token}`,
        },
        { status: 201 },
      );
    }

    if (error && isUniqueViolation(error) && attempt < maxAttempts) {
      continue;
    }

    console.error("lead draft_tokens insert error:", error?.message ?? error);
    return jsonError("Failed to create lead", 500);
  }

  return jsonError("Failed to create lead", 500);
}
