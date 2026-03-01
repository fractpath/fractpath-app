import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ dealId: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return jsonError("Unauthorized", 401);

  const { dealId } = await context.params;

  const { data: ownerGrant } = await (
    supabase.from("deal_access_grants") as any
  )
    .select("role")
    .eq("deal_id", dealId)
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();

  if (ownerGrant?.role !== "OWNER") {
    return jsonError("Forbidden (OWNER only)", 403);
  }

  const service = createServiceClient();
  const { data: grants, error } = await (
    service.from("deal_access_grants") as any
  )
    .select("id, user_id, role, created_at, expires_at, revoked_at")
    .eq("deal_id", dealId)
    .is("revoked_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("list_grants_error", error.message);
    return jsonError("Failed to list grants", 500);
  }

  return NextResponse.json({ ok: true, grants: grants ?? [] });
}
