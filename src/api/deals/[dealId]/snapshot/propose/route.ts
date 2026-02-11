import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { insertDealSnapshot } from "@/lib/dealSnapshotDb";

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

  if (!body?.snapshot || typeof body.snapshot !== "object" || Array.isArray(body.snapshot)) {
    return jsonError("snapshot is required and must be a JSON object", 400);
  }

  const service = createServiceClient();

  const { data: deal, error: dealError } = await (service.from("deals") as any)
    .select("id, owner_user_id")
    .eq("id", dealId)
    .maybeSingle();

  if (dealError || !deal) {
    return jsonError("Deal not found", 404);
  }

  const { data: grant } = await (service.from("deal_access_grants") as any)
    .select("role")
    .eq("deal_id", dealId)
    .eq("user_id", user.id)
    .maybeSingle();

  const userRole = grant?.role as string | null;
  if (userRole !== "COUNTERPARTY") {
    return jsonError("Forbidden (COUNTERPARTY only)", 403);
  }

  const result = await insertDealSnapshot(service, dealId, user.id, body.snapshot);

  if (!result.ok) {
    const status = result.code === "VALIDATION_FAILED" ? 422 : 500;
    return jsonError(result.error, status);
  }

  return NextResponse.json(
    { ok: true, snapshot_id: result.id },
    { status: 201 },
  );
}
