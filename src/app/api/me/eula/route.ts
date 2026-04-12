import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { EULA_VERSION } from "@/lib/eula";
import { POLICY_VERSION } from "@/lib/policies/content";

export const runtime = "nodejs";

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return jsonError("Unauthorized", 401);

  const svc = createServiceClient();

  const now = new Date().toISOString();

  // Extract IP and user-agent for audit-safe acceptance records
  const ipAddress =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;
  const userAgent = req.headers.get("user-agent") ?? null;
  const deviceMetadata: Record<string, string | null> = {
    user_agent: userAgent,
    ip_address: ipAddress,
  };

  // 1. Record per-policy acceptance in policy_acceptances (evidentiary audit trail)
  // Upsert both policies — idempotent if already accepted
  const acceptanceRows = [
    {
      user_id: user.id,
      policy_type: "privacy_policy",
      policy_version: POLICY_VERSION,
      accepted_at: now,
      ip_address: ipAddress,
      user_agent: userAgent,
      device_metadata: deviceMetadata,
    },
    {
      user_id: user.id,
      policy_type: "terms_of_use",
      policy_version: POLICY_VERSION,
      accepted_at: now,
      ip_address: ipAddress,
      user_agent: userAgent,
      device_metadata: deviceMetadata,
    },
  ];

  const { error: acceptErr } = await svc
    .from("policy_acceptances")
    .insert(acceptanceRows as never);

  if (acceptErr) {
    return jsonError(`Failed to record acceptance: ${acceptErr.message}`, 500);
  }

  // 2. Update profiles.eula_version for the existing OnboardingGate check
  const { error: profileErr } = await supabase
    .from("profiles")
    .update({
      eula_version: EULA_VERSION,
      eula_accepted_at: now,
    })
    .eq("user_id", user.id);

  if (profileErr) return jsonError(profileErr.message, 500);

  return NextResponse.json({
    ok: true,
    eula_version: EULA_VERSION,
    policy_version: POLICY_VERSION,
    accepted_at: now,
  });
}
