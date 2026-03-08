import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { insertDealSnapshot } from "@/lib/dealSnapshotDb";
import { computeDealAdapter as computeDeal } from "@/lib/computeAdapter";
import { ensureScenario } from "@/lib/defaultScenario";
import { assertNotRealtor, assertOwnerGrant } from "@/lib/authz";
import { CONTRACT_VERSION, SCHEMA_VERSION } from "@/lib/contractVersion";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ dealId: string }> },
) {
  const { dealId } = await ctx.params;

  if (!isUuid(dealId)) {
    return jsonError("Invalid deal ID", 400);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const realtorCheck = assertNotRealtor(user);
  if (!realtorCheck.ok) return jsonError(realtorCheck.error, realtorCheck.status);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  if (
    !body?.inputs ||
    typeof body.inputs !== "object" ||
    Array.isArray(body.inputs)
  ) {
    return jsonError("inputs is required and must be a JSON object", 400);
  }

  body.inputs = ensureScenario(body.inputs);

  if (
    !("deal_terms" in body.inputs) ||
    !body.inputs.deal_terms ||
    typeof body.inputs.deal_terms !== "object" ||
    Array.isArray(body.inputs.deal_terms)
  ) {
    return jsonError(
      "inputs.deal_terms is required and must be a JSON object",
      400,
    );
  }

  const { data: grant, error: grantError } = await (
    supabase.from("deal_access_grants") as any
  )
    .select("role")
    .eq("deal_id", dealId)
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();

  if (grantError) {
    return jsonError("Failed to verify access", 500);
  }
  const ownerCheck = assertOwnerGrant(grant?.role);
  if (!ownerCheck.ok) return jsonError(ownerCheck.error, 403);

  const computeResult = await computeDeal(body.inputs);

  if (!computeResult.ok) {
    const msg = String((computeResult as any)?.error ?? "");
  const status =
    msg.includes("NOT_INTEGRATED") || msg.toLowerCase().includes("not integrated")
      ? 501
      : 500;
return jsonError(computeResult.error, status);
  }

  const { compute_version, results } = computeResult.result;
  const computedAt = new Date().toISOString();

  const svc = createServiceClient();
  let canonicalHeader: Record<string, unknown> | undefined;

  try {
    const { data: headerEv } = await (svc.from("deal_events") as any)
      .select("payload")
      .eq("deal_id", dealId)
      .eq("event_type", "DEAL_HEADER_UPDATED")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (headerEv?.payload && typeof headerEv.payload === "object") {
      const p = headerEv.payload;
      if (p.property_id || p.display_address || p.title) {
        canonicalHeader = {
          title: p.title ?? null,
          property_id: p.property_id ?? null,
          display_address: p.display_address ?? null,
          property_status: p.property_status ?? null,
          ownership_status: p.ownership_status ?? null,
        };
      }
    }
  } catch (headerReadErr: any) {
    console.error("canonical_header_read_error:", headerReadErr?.message);
  }

  const fullSnapshot: Record<string, unknown> = {
    contract_version: CONTRACT_VERSION,
    schema_version: SCHEMA_VERSION,
    inputs: body.inputs,
    outputs: { results },
    computed_at: computedAt,
    computed_by: user.id,
    compute_version,
  };

  if (canonicalHeader) {
    fullSnapshot.meta = { header: canonicalHeader };
  }

  const result = await insertDealSnapshot(
    supabase as any,
    dealId,
    user.id,
    fullSnapshot,
  );

  if (!result.ok) {
    const status = result.code === "VALIDATION_FAILED" ? 422 : 500;
    return jsonError(result.error, status);
  }

  const { error: eventError } = await (
    supabase.from("deal_events") as any
  ).insert({
    deal_id: dealId,
    event_type: "DEAL_SNAPSHOT_COMPUTED",
    payload: {
      snapshot_id: result.id,
      compute_version,
      computed_at: computedAt,
    },
    created_by: user.id,
  });

  if (eventError) {
    console.error("deal_events insert error:", eventError.message);
  }

  return NextResponse.json(
    {
      ok: true,
      snapshot_id: result.id,
      compute_version,
      results,
      computed_at: computedAt,
    },
    { status: 201 },
  );
}
