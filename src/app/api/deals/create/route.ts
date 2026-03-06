import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
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

    // Accept multiple envelope shapes and normalize to { deal_terms, scenario }
    const normalized = normalizeCanonicalInputsFromUnknown(body);
    if (!normalized) {
      return jsonError("Missing canonical inputs (deal_terms + scenario)", 422);
    }

    // Ensure scenario defaults are present, but do not change math/contract shape
    const canonicalInputs = ensureScenario({
      deal_terms: normalized.deal_terms ?? {},
      scenario: normalized.scenario ?? {},
    });

    // Validate after normalization (prevents false 422 due to envelope mismatch)
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

    const rawHeader = (body as any)?.header;
    const headerObj =
      rawHeader && typeof rawHeader === "object" && !Array.isArray(rawHeader)
        ? {
            title:
              typeof rawHeader.title === "string" ? rawHeader.title : undefined,
            display_address:
              typeof rawHeader.display_address === "string"
                ? rawHeader.display_address
                : undefined,
            property_id:
              typeof rawHeader.property_id === "string"
                ? rawHeader.property_id
                : undefined,
            property_status:
              typeof rawHeader.property_status === "string"
                ? rawHeader.property_status
                : undefined,
            ownership_status:
              typeof rawHeader.ownership_status === "string"
                ? rawHeader.ownership_status
                : undefined,
          }
        : undefined;

    const fullSnapshot: Record<string, unknown> = {
      contract_version: CONTRACT_VERSION,
      schema_version: SCHEMA_VERSION,
      inputs: canonicalInputs,
      outputs: { results },
      compute_version,
      computed_at: computedAt,
      computed_by: user.id,
    };

    if (headerObj) {
      fullSnapshot.meta = { header: headerObj };
    }

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

    if (headerObj && (headerObj.property_id || headerObj.display_address)) {
      try {
        const svc = createServiceClient();
        await (svc.from("deal_events") as any).insert({
          deal_id: dealId,
          event_type: "DEAL_HEADER_UPDATED",
          payload: {
            title: headerObj.title ?? null,
            property_id: headerObj.property_id ?? null,
            display_address: headerObj.display_address ?? null,
            property_status: headerObj.property_status ?? null,
            ownership_status: headerObj.ownership_status ?? null,
          },
          created_by: user.id,
        });
      } catch (headerEvErr: any) {
        console.error("deal_header_event_on_create error:", headerEvErr?.message);
      }
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
