import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// TODO(attom): Replace this simulation route with a real ATTOM order initiation
// when the vendor integration is ready. This route simply logs the owner's intent
// to `property_status_audit` so the admin can see the request and proceed via the
// simulation panel. No real ATTOM API call is made.

type Ctx = { params: Promise<{ propertyId: string }> };

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { propertyId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const svc = createServiceClient();

  // Verify the user owns (or is linked to) this property
  const { data: prop, error: propErr } = await (svc.from("properties") as any)
    .select("id, status, escalation_deposit_status, escalation_avm_status")
    .eq("id", propertyId)
    .or(
      `owner_user_id.eq.${user.id},created_by_user_id.eq.${user.id},claimed_by_user_id.eq.${user.id}`,
    )
    .maybeSingle();

  if (propErr || !prop) {
    return jsonError("Property not found", 404);
  }

  // Idempotency — check if owner has already requested
  const { data: existing } = await (svc.from("property_status_audit") as any)
    .select("id, created_at")
    .eq("property_id", propertyId)
    .ilike("notes", "%ATTOM enhanced valuation requested by owner%")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      ok: true,
      propertyId,
      alreadyRequested: true,
      requestedAt: existing.created_at,
    });
  }

  // Log request to property_status_audit
  const { error: auditErr } = await (svc.from("property_status_audit") as any).insert({
    property_id: propertyId,
    from_status: null,
    to_status: null,
    actor_type: "owner",
    notes: "ATTOM enhanced valuation requested by owner (sim) — admin should proceed via the valuation panel",
  });

  if (auditErr) {
    console.error("REQUEST_VALUATION_AUDIT_LOG_FAILED", { propertyId, auditErr });
    return jsonError("Failed to log request", 500);
  }

  return NextResponse.json({
    ok: true,
    propertyId,
    alreadyRequested: false,
    requestedAt: new Date().toISOString(),
  });
}
