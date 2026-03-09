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

  // Idempotent: if already archived, treat as success.
  if ((deal as any).archived_at) {
    return NextResponse.json({ ok: true, already_archived: true });
  }

  const svc = createServiceClient();
  const nowIso = new Date().toISOString();

  // 1) Archive the deal (idempotent guard).
  const { error: archiveErr } = await (svc.from("deals") as any)
    .update({ archived_at: nowIso, archived_by: user.id })
    .eq("id", dealId)
    .is("archived_at", null);

  if (archiveErr) {
    console.error("archive_deal_error", {
      dealId,
      userId: user.id,
      code: archiveErr.code,
      message: archiveErr.message,
      details: (archiveErr as any).details,
      hint: (archiveErr as any).hint,
    });
    return jsonError("Failed to archive deal", 500);
  }

  // 2) Best-effort: revoke caller's access grant(s).
  // IMPORTANT: Do not fail the request after archiving if revocation fails.
  const { error: revokeErr } = await (svc.from("deal_access_grants") as any)
    .update({ revoked_at: nowIso })
    .eq("deal_id", dealId)
    .eq("user_id", user.id)
    .is("revoked_at", null);

  if (revokeErr) {
    console.error("archive_revoke_grants_error", {
      dealId,
      userId: user.id,
      code: revokeErr.code,
      message: revokeErr.message,
      details: (revokeErr as any).details,
      hint: (revokeErr as any).hint,
    });
    // Archive succeeded; return ok with warning so UI can inform user.
    return NextResponse.json({
      ok: true,
      archived: true,
      warning: "Archived, but failed to revoke access automatically.",
    });
  }

  return NextResponse.json({ ok: true, archived: true });
}
