import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { computeDealAdapter as computeDeal } from "@/lib/computeAdapter";
import { insertDealSnapshot } from "@/lib/dealSnapshotDb";
import { ensureScenario } from "@/lib/defaultScenario";
import { assertNotRealtor } from "@/lib/authz";
import { CONTRACT_VERSION, SCHEMA_VERSION } from "@/lib/contractVersion";
import { normalizeCanonicalInputsFromUnknown } from "@/lib/normalizeCanonicalInputs";
import { propertyHasActiveDeal } from "@/lib/deal/activeDealCheck";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

    // Optional: propertyId can be passed to pre-link a property and enforce
    // the one-active-deal-per-property business rule.
    const rawPropertyId =
      typeof (body as any)?.propertyId === "string"
        ? ((body as any).propertyId as string).trim()
        : null;

    const propertyId =
      rawPropertyId && UUID_RE.test(rawPropertyId) ? rawPropertyId : null;

    const svc = createServiceClient();

    // ── Active-deal guard ───────────────────────────────────────────────────
    // If a property is specified, block creation when it already has a live deal.
    if (propertyId) {
      let hasActive: boolean;
      try {
        hasActive = await propertyHasActiveDeal(svc, propertyId);
      } catch (checkErr: any) {
        console.error("ACTIVE_DEAL_CHECK_FAILED", {
          propertyId,
          userId: user.id,
          error: checkErr?.message,
        });
        return jsonError("Could not verify deal eligibility for this property.", 500);
      }

      if (hasActive) {
        return jsonError(
          "This property already has an active deal in progress.",
          409,
        );
      }
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

    // ── Pre-link property via DEAL_HEADER_UPDATED event ─────────────────────
    // When propertyId is supplied (deep-link from public property page),
    // immediately emit a header event so the deal page shows the property
    // pre-selected without any further action from the user.
    if (propertyId) {
      try {
        // Fetch public-safe address columns only
        const { data: propRow } = await (svc.from("properties") as any)
          .select("address_line1, address_line2, city, state, postal_code, status")
          .eq("id", propertyId)
          .maybeSingle();

        let displayAddress = "";
        if (propRow) {
          const parts: string[] = [];
          if (propRow.address_line1) parts.push(propRow.address_line1);
          if (propRow.address_line2) parts.push(propRow.address_line2);
          const csz: string[] = [];
          if (propRow.city) csz.push(propRow.city);
          if (propRow.state) csz.push(propRow.state);
          if (propRow.postal_code) csz.push(propRow.postal_code);
          if (csz.length) parts.push(csz.join(", "));
          displayAddress = parts.join(", ");
        }

        await (svc.from("deal_events") as any).insert({
          deal_id: dealId,
          event_type: "DEAL_HEADER_UPDATED",
          payload: {
            property_id: propertyId,
            display_address: displayAddress,
            property_status: propRow?.status ?? null,
            title: null,
            ownership_status: null,
          },
          created_by: user.id,
        });
      } catch (headerErr: any) {
        // Non-fatal: the deal is created; property linking is cosmetic at this stage.
        console.error("DEAL_HEADER_PRELINK_FAILED", {
          dealId,
          propertyId,
          userId: user.id,
          error: headerErr?.message,
        });
      }
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
