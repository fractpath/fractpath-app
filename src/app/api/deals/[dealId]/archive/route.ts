import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ dealId: string }> },
) {
  const { dealId } = await ctx.params;
  if (!dealId) return jsonError("Missing dealId", 400);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return jsonError("Unauthorized", 401);

  const { data: grant } = await supabase
    .from("deal_access_grants")
    .select("role")
    .eq("deal_id", dealId)
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .eq("role", "OWNER")
    .maybeSingle();

  const { data: deal } = await supabase
    .from("deals")
    .select("id, owner_user_id, archived_at")
    .eq("id", dealId)
    .maybeSingle();

  if (!deal) return jsonError("Deal not found", 404);

  const isOwnerByField = (deal as any).owner_user_id === user.id;
  if (!grant && !isOwnerByField) return jsonError("Forbidden", 403);

  if ((deal as any).archived_at) {
    return NextResponse.json({ ok: true, already_archived: true });
  }

  const svc = createServiceClient();

  const { error: archiveErr } = await (svc.from("deals") as any)
    .update({ archived_at: new Date().toISOString(), archived_by: user.id })
    .eq("id", dealId)
    .is("archived_at", null);

  if (archiveErr) {
    console.error("archive_deal_error", {
      dealId,
      userId: user.id,
      code: archiveErr.code,
      message: archiveErr.message,
    });
    return jsonError("Failed to archive deal", 500);
  }

  const { error: revokeErr } = await (svc.from("deal_access_grants") as any)
    .update({ revoked_at: new Date().toISOString() })
    .eq("deal_id", dealId)
    .eq("user_id", user.id)
    .is("revoked_at", null);

  if (revokeErr) {
    console.error("archive_revoke_grants_error", {
      dealId,
      userId: user.id,
      code: revokeErr.code,
      message: revokeErr.message,
    });
    return jsonError("Deal archived but failed to revoke access. Contact support.", 500);
  }

  return NextResponse.json({ ok: true });
}
