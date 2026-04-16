import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";
import {
  RELEASE_REASON_CODES,
  performAdminResetOperationalState,
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
    .select("id")
    .eq("id", propertyId)
    .single();

  if (propErr || !property) {
    return jsonError("Property not found", 404);
  }

  // Notes required if the property has accepted/signature history
  const { data: acceptedHistory } = await (svc.from("deal_threads") as any)
    .select("id")
    .eq("property_id", propertyId)
    .in("status", ["accepted", "voided_by_admin"])
    .limit(1);

  const { data: signatureHistory } = await (svc.from("deal_signature_packets") as any)
    .select("id")
    .eq("property_id", propertyId)
    .in("status", ["completed", "voided", "declined"])
    .limit(1);

  const hasSignificantHistory =
    (acceptedHistory && acceptedHistory.length > 0) ||
    (signatureHistory && signatureHistory.length > 0);

  if (hasSignificantHistory && !notes?.trim()) {
    return jsonError(
      "notes are required when property has accepted/signature history",
      422,
    );
  }

  const result = await performAdminResetOperationalState(
    propertyId,
    admin.user.id,
    reasonCode as ReleaseReasonCode,
    notes?.trim() || null,
    svc,
  );

  if (!result.ok) {
    console.error("admin_reset_operational_state_failed", {
      propertyId,
      adminId: admin.user.id,
      error: result.error,
    });
    return jsonError("Reset failed", 500, { detail: result.error });
  }

  console.log("admin_reset_operational_state_success", {
    propertyId,
    adminId: admin.user.id,
    reasonCode,
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
