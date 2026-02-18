import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function extractEmail(snapshotJson: unknown): string {
  if (!isRecord(snapshotJson)) return "";

  if (typeof snapshotJson.email === "string" && snapshotJson.email.trim()) {
    return snapshotJson.email.trim();
  }

  for (const key of ["draftSnapshot", "canonicalSnapshot", "snapshot"] as const) {
    const nested = (snapshotJson as any)[key];
    if (isRecord(nested) && typeof nested.email === "string" && nested.email.trim()) {
      return nested.email.trim();
    }
  }

  if (isRecord(snapshotJson.inputs)) {
    const inputs = snapshotJson.inputs as Record<string, unknown>;
    if (typeof inputs.email === "string" && inputs.email.trim()) {
      return inputs.email.trim();
    }
  }

  return "";
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token || token.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "token required" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: draft, error } = await (service.from("draft_tokens") as any)
    .select("snapshot_json")
    .eq("token", token.trim())
    .maybeSingle();

  if (error || !draft) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }

  const email = extractEmail(draft.snapshot_json);
  const persona = isRecord(draft.snapshot_json) && typeof draft.snapshot_json.persona === "string"
    ? draft.snapshot_json.persona
    : "";

  return NextResponse.json({ ok: true, email, persona }, { status: 200 });
}
