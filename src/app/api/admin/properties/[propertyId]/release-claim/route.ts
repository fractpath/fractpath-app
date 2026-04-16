import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";
import {
  ACTIVE_NONBINDING_THREAD_STATUSES,
  RELEASE_REASON_CODES,
  performAdminRelease,
  type ReleaseReasonCode,
} from "@/lib/property/claimRelease";

function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json(
    { ok: false, error: message, details: details ?? null },
    { status },
  );
}

type Ctx = { params: Promise<{ propertyId: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return jsonError(admin.error, admin.status, { email: admin.email });
  }

  const { propertyId } = await ctx.params;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const reasonCode: string = body?.reason_code ?? "";
  const notes: string | null = body?.notes ?? null;

  if (!RELEASE_REASON_CODES.includes(reasonCode as ReleaseReasonCode)) {
    return jsonError("Invalid or missing reason_code", 422, {
      allowed: RELEASE_REASON_CODES,
      received: reasonCode,
    });
  }

  const svc = createServiceClient();

  // Verify property exists
  const { data: property, error: propErr } = await (svc.from("properties") as any)
    .select("id, owner_user_id, admin_hold")
    .eq("id", propertyId)
    .single();

  if (propErr || !property) {
    return jsonError("Property not found", 404);
  }

  // Guard: if admin_hold is set, only allow release if admin explicitly acknowledges
  // (admin route bypasses this — admin is trusted)

  // Guard: must not have an accepted deal thread — use void-and-release for that
  const { data: acceptedThreads } = await (svc.from("deal_threads") as any)
    .select("id")
    .eq("property_id", propertyId)
    .eq("status", "accepted");

  if (acceptedThreads && acceptedThreads.length > 0) {
    return jsonError(
      "Property has an accepted agreement — use the void-and-release endpoint instead",
      409,
      { accepted_thread_ids: acceptedThreads.map((t: any) => t.id) },
    );
  }

  // Notes are required if the property has any deal history
  const { data: anyThreads } = await (svc.from("deal_threads") as any)
    .select("id")
    .eq("property_id", propertyId)
    .limit(1);

  if (anyThreads && anyThreads.length > 0 && !notes?.trim()) {
    return jsonError(
      "notes are required when the property has deal history",
      422,
    );
  }

  // Load closable threads
  const { data: closableThreads } = await (svc.from("deal_threads") as any)
    .select("id")
    .eq("property_id", propertyId)
    .in("status", Array.from(ACTIVE_NONBINDING_THREAD_STATUSES));

  const closableThreadIds: string[] = (closableThreads ?? []).map(
    (t: any) => t.id,
  );

  const result = await performAdminRelease(
    propertyId,
    admin.user.id,
    reasonCode as ReleaseReasonCode,
    notes?.trim() || null,
    closableThreadIds,
    svc,
  );

  if (!result.ok) {
    console.error("admin_release_claim_failed", {
      propertyId,
      adminId: admin.user.id,
      error: result.error,
    });
    return jsonError("Release failed", 500, { detail: result.error });
  }

  console.log("admin_release_claim_success", {
    propertyId,
    adminId: admin.user.id,
    reasonCode,
    closedThreads: closableThreadIds.length,
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
