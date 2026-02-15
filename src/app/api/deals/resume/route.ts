import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { validateDraftSnapshotV1 } from "@/lib/draftSnapshot";
import { mapDraftToDealSnapshot } from "@/lib/draftToDealSnapshot";
import { insertDealSnapshot } from "@/lib/dealSnapshotDb";
import { computeDeal } from "@/lib/computeAdapter";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

interface CanonicalSnapshot {
  compute_version: string;
  computed_at: string;
  inputs: Record<string, unknown>;
  assumptions: Record<string, unknown>;
  outputs: Record<string, unknown>;
}

function isValidCanonicalSnapshot(cs: unknown): cs is CanonicalSnapshot {
  if (!cs || typeof cs !== "object" || Array.isArray(cs)) return false;
  const c = cs as Record<string, unknown>;
  if (
    typeof c.compute_version !== "string" ||
    c.compute_version.trim().length === 0
  )
    return false;
  if (typeof c.computed_at !== "string" || c.computed_at.trim().length === 0)
    return false;
  if (!c.inputs || typeof c.inputs !== "object" || Array.isArray(c.inputs))
    return false;
  if (!c.outputs || typeof c.outputs !== "object" || Array.isArray(c.outputs))
    return false;
  return true;
}

export async function POST(request: NextRequest) {
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

  const token = body?.token;
  if (typeof token !== "string" || token.trim().length === 0) {
    return jsonError("token is required", 400);
  }

  const service = createServiceClient();

  const { data: draft, error: draftError } = await (
    service.from("draft_tokens") as any
  )
    .select(
      "id, snapshot_json, expires_at, redeemed_at, redeemed_by_user_id, source",
    )
    .eq("token", token.trim())
    .maybeSingle();

  if (draftError || !draft) {
    return jsonError("Draft not found or token invalid", 404);
  }

  if (draft.expires_at && new Date(draft.expires_at) < new Date()) {
    return jsonError("Token has expired", 410);
  }

  if (draft.redeemed_at || draft.redeemed_by_user_id) {
    const { data: existingDeal } = await (service.from("deals") as any)
      .select("id")
      .eq("source_ref", `draft_token:${draft.id}`)
      .maybeSingle();

    if (existingDeal) {
      return NextResponse.json(
        {
          ok: true,
          deal_id: existingDeal.id,
          redirect_url: `/deal/${existingDeal.id}`,
        },
        { status: 200 },
      );
    }

    return jsonError("Token already redeemed", 409);
  }

  const draftPayload = draft.snapshot_json;
  if (!draftPayload || typeof draftPayload !== "object") {
    return jsonError("Draft snapshot payload is invalid", 422);
  }

  const canonicalSnapshot: unknown =
    (draftPayload as any).canonicalSnapshot ?? null;
  const dealTermsDefaultsUsed: unknown =
    (draftPayload as any).deal_terms_defaults_used ?? null;

  let snapshotSource: "canonical_snapshot" | "app_compute";
  let fullSnapshot: Record<string, unknown>;

  if (canonicalSnapshot && isValidCanonicalSnapshot(canonicalSnapshot)) {
    snapshotSource = "canonical_snapshot";

    const cs = canonicalSnapshot as CanonicalSnapshot;

    fullSnapshot = {
      contract_version: cs.compute_version,
      schema_version: "1",
      inputs: cs.inputs,
      outputs: cs.outputs,
      computed_at: cs.computed_at,
      computed_by: "canonical",
      snapshot_source: snapshotSource,
      deal_terms_defaults_used: dealTermsDefaultsUsed,
      canonicalSnapshot: canonicalSnapshot,
      draft_snapshot_json: draftPayload,
    };
  } else {
    snapshotSource = "app_compute";

    const draftValidation = validateDraftSnapshotV1(draftPayload);
    if (!draftValidation.ok) {
      return jsonError(
        `Draft payload invalid for compute: ${draftValidation.error}`,
        422,
      );
    }

    const mapped = mapDraftToDealSnapshot(draftValidation.snapshot);

    const computeResult = await computeDeal(mapped.inputs);
    if (!computeResult.ok) {
      const status = computeResult.code === "NOT_INTEGRATED" ? 501 : 500;
      return jsonError(`Compute failed: ${computeResult.error}`, status);
    }

    const { terms_version, outputs } = computeResult.result;
    const computedAt = new Date().toISOString();

    const synthesizedCanonical: CanonicalSnapshot = {
      compute_version: terms_version,
      computed_at: computedAt,
      inputs: mapped.inputs,
      outputs,
      assumptions: {},
    };

    fullSnapshot = {
      contract_version: terms_version,
      schema_version: "1",
      inputs: mapped.inputs,
      outputs,
      computed_at: computedAt,
      computed_by: user.id,
      snapshot_source: snapshotSource,
      deal_terms_defaults_used: dealTermsDefaultsUsed,
      canonicalSnapshot: synthesizedCanonical,
      draft_snapshot_json: draftPayload,
    };
  }

  const { data: newDeal, error: insertDealError } = await (
    service.from("deals") as any
  )
    .insert({
      owner_user_id: user.id,
      status: "ACTIVE",
      created_from: "resume",
      source_ref: `draft_token:${draft.id}`,
      mode: "app",
    })
    .select("id, created_at")
    .single();

  if (insertDealError || !newDeal) {
    console.error("deal insert error:", insertDealError?.message);
    return jsonError("Failed to create deal", 500);
  }

  const { error: grantError } = await (
    service.from("deal_access_grants") as any
  ).upsert(
    {
      deal_id: newDeal.id,
      user_id: user.id,
      role: "OWNER",
      created_by: user.id,
    },
    { onConflict: "deal_id,user_id", ignoreDuplicates: true },
  );

  if (grantError) {
    console.error("grant upsert error:", grantError);
    return jsonError("Failed to assign ownership", 500);
  }

  const snapshotResult = await insertDealSnapshot(
    service,
    newDeal.id,
    snapshotSource === "canonical_snapshot" ? "canonical" : user.id,
    fullSnapshot,
  );

  if (!snapshotResult.ok) {
    console.error("snapshot insert error:", snapshotResult.error);
    return jsonError("Failed to persist snapshot", 500);
  }

  try {
    const { error: eventError } = await (
      service.from("deal_events") as any
    ).insert({
      deal_id: newDeal.id,
      event_type: "DEAL_CREATED",
      payload: {
        source: "resume",
        draft_id: draft.id,
        snapshot_id: snapshotResult.id,
        snapshot_source: snapshotSource,
      },
      created_by: user.id,
    });

    if (eventError) {
      console.error("deal_events insert error:", eventError.message);
    }
  } catch (eventErr: any) {
    console.error(
      "deal_events insert exception:",
      eventErr?.message ?? String(eventErr),
    );
  }

  // Redeem token (race-safe). If another request redeemed first, do not return a new deal as success.
  const { data: redeemData, error: redeemError } = await (
    service.from("draft_tokens") as any
  )
    .update({
      redeemed_at: new Date().toISOString(),
      redeemed_by_user_id: user.id,
    })
    .eq("id", draft.id)
    .is("redeemed_at", null)
    .select("id")
    .maybeSingle();

  if (redeemError) {
    console.error("draft redeem update error:", redeemError.message);
  }

  // If the conditional update matched 0 rows, treat as already redeemed and follow idempotent path.
  if (!redeemData) {
    const { data: existingDeal } = await (service.from("deals") as any)
      .select("id")
      .eq("source_ref", `draft_token:${draft.id}`)
      .maybeSingle();

    if (existingDeal) {
      return NextResponse.json(
        {
          ok: true,
          deal_id: existingDeal.id,
          redirect_url: `/deal/${existingDeal.id}`,
        },
        { status: 200 },
      );
    }

    return jsonError("Token already redeemed", 409);
  }

  return NextResponse.json(
    {
      ok: true,
      deal_id: newDeal.id,
      redirect_url: `/deal/${newDeal.id}`,
    },
    { status: 201 },
  );
}
