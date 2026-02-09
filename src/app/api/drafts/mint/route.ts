import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { rateLimitByIp } from "@/lib/rateLimit";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    typeof body?.email === "string" ? body.email.trim() : "";
  if (!email || !EMAIL_RE.test(email)) {
    return jsonError("Valid email is required", 400);
  }

  if (
    body?.snapshot === undefined ||
    body?.snapshot === null
  ) {
    return jsonError("snapshot is required", 400);
  }

  const snapshot = body.snapshot;

  const contractVersion =
    typeof snapshot?.contract_version === "string"
      ? snapshot.contract_version
      : null;
  const schemaVersion =
    typeof snapshot?.schema_version === "string"
      ? snapshot.schema_version
      : null;

  const token = randomBytes(32).toString("hex");

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const supabase = createServiceClient();

    const { error } = await (supabase.from("draft_tokens") as any).insert({
      token,
      snapshot_json: snapshot,
      contract_version: contractVersion,
      schema_version: schemaVersion,
      expires_at: expiresAt,
      source: "marketing",
    });

    if (error) {
      console.error("draft_tokens insert error:", error.message);
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
