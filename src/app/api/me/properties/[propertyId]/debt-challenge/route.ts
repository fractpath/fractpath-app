import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// Owner submits a written statement to the review team when ATTOM screening has
// flagged a discrepancy between their declared secured debt and the public-record
// estimate.  Per FractPath policy, debt discrepancy is an admin review signal
// only — it does NOT automatically block or unblock a deal.  This route simply
// logs the owner statement to property_status_audit so the admin team can see it
// alongside the ATTOM result when adjudicating the debt basis.

type Ctx = { params: Promise<{ propertyId: string }> };

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { propertyId } = await ctx.params;

  if (!propertyId) return jsonError("Missing propertyId", 400);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return jsonError("Unauthorized", 401);

  let body: { statement?: string } = {};
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const statement = (body.statement ?? "").trim();
  if (!statement) {
    return jsonError("Statement is required", 422);
  }
  if (statement.length > 2000) {
    return jsonError("Statement must be 2000 characters or fewer", 422);
  }

  const svc = createServiceClient();

  // Verify ownership (owner, created_by, or claimed_by)
  const { data: prop, error: propErr } = await (svc.from("properties") as any)
    .select("id, status")
    .eq("id", propertyId)
    .or(
      `owner_user_id.eq.${user.id},created_by_user_id.eq.${user.id},claimed_by_user_id.eq.${user.id}`,
    )
    .maybeSingle();

  if (propErr || !prop) {
    return jsonError("Property not found", 404);
  }

  // Log the statement to property_status_audit for admin visibility
  const { error: auditErr } = await (svc.from("property_status_audit") as any).insert({
    property_id: propertyId,
    from_status: null,
    to_status: null,
    actor_type: "owner",
    notes: `DEBT_CHALLENGE_STATEMENT: ${statement}`,
  });

  if (auditErr) {
    console.error("OWNER_DEBT_CHALLENGE_AUDIT_LOG_FAILED", { propertyId, error: auditErr });
    return jsonError("Failed to log statement", 500);
  }

  return NextResponse.json({
    ok: true,
    propertyId,
    loggedAt: new Date().toISOString(),
  });
}
