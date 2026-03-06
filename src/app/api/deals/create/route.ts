import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeDealAdapter as computeDeal } from "@/lib/computeAdapter";
import { insertDealSnapshot } from "@/lib/dealSnapshotDb";
import { ensureScenario } from "@/lib/defaultScenario";
import { assertNotRealtor } from "@/lib/authz";
import { CONTRACT_VERSION, SCHEMA_VERSION } from "@/lib/contractVersion";
import { normalizeCanonicalInputsFromUnknown } from "@/lib/normalizeCanonicalInputs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return jsonError("Unauthorized", 401);
    }

    const realtorCheck = assertNotRealtor(user);
    if (!realtorCheck.ok) {
      return NextResponse.json(
        { ok: false, error: realtorCheck.error },
        { status: realtorCheck.status },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const normalized = normalizeCanonicalInputsFromUnknown(body);

    const hasInputs =
      normalized &&
      normalized.deal_terms &&
      typeof normalized.deal_terms === "object" &&
      Object.keys(normalized.deal_terms).length > 0;

    const { data: dealId, error: rpcErr } = await supabase.rpc(
      "create_deal_with_owner_grant_v2",
      {
        p_user_id: user.id,
      },
    );

    if (rpcErr || !dealId) {
      console.error("CREATE_DEAL_RPC_FAILED", {
        rpcErr,
        userId: user?.id,
      });

      return NextResponse.json(
        {
          ok: false,
          error: "CREATE_DEAL_RPC_FAILED",
          details: rpcErr,
        },
        { status: 500 },
      );
    }

    if (!hasInputs) {
      return NextResponse.json(
        {
          ok: true,
          deal_id: dealId,
          snapshot_id: null,
          redirect_url: `/deal/${dealId}`,
        },
        { status: 201 },
      );
    }

    const canonicalInputs = ensureScenario({
      deal_terms: normalized!.deal_terms ?? {},
      scenario: normalized!.scenario ?? {},
    });

    const pv = (canonicalInputs.deal_terms as any)?.property_value;
    if (typeof pv !== "number" || !Number.isFinite(pv)) {
      return jsonError("deal_terms.property_value is required", 422);
    }

    const computeResult = await computeDeal(canonicalInputs as any);
    if (!computeResult.ok) {
      return jsonError(`Compute failed: ${computeResult.error}`, 422);
    }

    const { compute_version, results } = computeResult.result;
    const computedAt = new Date().toISOString();

    const fullSnapshot: Record<string, unknown> = {
      contract_version: CONTRACT_VERSION,
      schema_version: SCHEMA_VERSION,
      inputs: canonicalInputs,
      outputs: { results },
      compute_version,
      computed_at: computedAt,
      computed_by: user.id,
    };

    const snapshotResult = await insertDealSnapshot(
      supabase as any,
      dealId as string,
      user.id,
      fullSnapshot,
    );

    if (!snapshotResult.ok) {
      console.error("SNAPSHOT_INSERT_FAILED_ON_CREATE", snapshotResult);
    }

    try {
      await (supabase.from("deal_events") as any).insert({
        deal_id: dealId,
        event_type: "DEAL_SNAPSHOT_COMPUTED",
        payload: {
          snapshot_id: snapshotResult.ok ? snapshotResult.id : null,
          compute_version,
          computed_at: computedAt,
          source: "create",
        },
        created_by: user.id,
      });
    } catch (eventErr: any) {
      console.error("deal_events insert error:", eventErr?.message);
    }

    return NextResponse.json(
      {
        ok: true,
        deal_id: dealId,
        snapshot_id: snapshotResult.ok ? snapshotResult.id : null,
        redirect_url: `/deal/${dealId}`,
      },
      { status: 201 },
    );
  } catch (outerError: any) {
    console.error("Create deal route uncaught error:", outerError?.message);
    return jsonError("Internal server error", 500);
  }
}
