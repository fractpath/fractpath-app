import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { insertDealSnapshot } from "@/lib/dealSnapshotDb";
import { computeDeal } from "@/lib/computeAdapter";

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
  context: { params: Promise<{ dealId: string }> },
) {
  const { dealId } = await context.params;

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

  // RLS-enforced OWNER check via deal_access_grants
  const { data: grant, error: grantError } = await (supabase
    .from("deal_access_grants") as any)
    .select("role")
    .eq("deal_id", dealId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (grantError) {
    return jsonError("Failed to verify access", 500);
  }
  if (grant?.role !== "OWNER") {
    return jsonError("Forbidden (OWNER only)", 403);
  }

  const computeResult = await computeDeal(body.inputs);

  if (!computeResult.ok) {
    const status = computeResult.code === "NOT_INTEGRATED" ? 501 : 500;
    return jsonError(computeResult.error, status);
  }

  const { terms_version, outputs } = computeResult.result;
  const computedAt = new Date().toISOString();

  const fullSnapshot = {
    contract_version: terms_version,
    schema_version: "1",
    inputs: body.inputs,
    outputs, // must include outputs.schedule[] and outputs.summary
    computed_at: computedAt,
    computed_by: user.id,
  };

  // Runs under user-scoped client so RLS + immutability triggers apply.
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

  // Audit event insert should also be under RLS.
  const { error: eventError } = await (supabase.from("deal_events") as any).insert(
    {
      deal_id: dealId,
      event_type: "DEAL_SNAPSHOT_COMPUTED",
      payload: {
        snapshot_id: result.id,
        terms_version,
        computed_at: computedAt,
      },
      created_by: user.id,
    },
  );

  if (eventError) {
    console.error("deal_events insert error:", eventError.message);
  }

  return NextResponse.json(
    {
      ok: true,
      snapshot_id: result.id,
      terms_version,
      summary: outputs.summary ?? {},
      computed_at: computedAt,
    },
    { status: 201 },
  );
}
