import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { validateDraftSnapshotV1 } from "@/lib/draftSnapshot";
import { mapDraftToDealSnapshot } from "@/lib/draftToDealSnapshot";
import { insertDealSnapshot } from "@/lib/dealSnapshotDb";
import { computeDeal } from "@/lib/computeAdapter";
import {
  ensureScenario,
  getDefaultDealTerms,
  getDefaultScenario,
} from "@/lib/defaultScenario";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
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

  // If already redeemed, return the previously-created deal if we can find it.
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
  if (!isRecord(draftPayload)) {
    return jsonError("Draft snapshot payload is invalid", 422);
  }

  // We do NOT trust inbound "canonicalSnapshot" blobs.
  // Always recompute in-app via @fractpath/compute to guarantee canonical v10 shape.
  const draftValidation = validateDraftSnapshotV1(draftPayload);
  if (!draftValidation.ok) {
    return jsonError(
      `Draft payload invalid for compute: ${draftValidation.error}`,
      422,
    );
  }

  const mapped = mapDraftToDealSnapshot(draftValidation.snapshot as any);

  // mapDraftToDealSnapshot should return { inputs: { deal_terms, scenario } }
  // but we defensively ensure the canonical envelope.
  const canonicalInputs = ensureScenario(
    isRecord(mapped) && isRecord((mapped as any).inputs)
      ? ((mapped as any).inputs as Record<string, unknown>)
      : {
          deal_terms: getDefaultDealTerms(),
          scenario: getDefaultScenario(),
        },
  );

  const computeResult = await computeDeal(canonicalInputs);
  if (!computeResult.ok) {
    const status = computeResult.code === "NOT_INTEGRATED" ? 501 : 500;
    return jsonError(`Compute failed: ${computeResult.error}`, status);
  }

  const { compute_version, results } = computeResult.result;
  const computedAt = new Date().toISOString();

  // Canonical-only snapshot shape
  const fullSnapshot: Record<string, unknown> = {
    schema_version: "1",
    inputs: canonicalInputs,
    outputs: { results },
    compute_version,
    computed_at: computedAt,
    computed_by: user.id,
  };

  const dealTermsDefaultsUsed: unknown =
    (draftPayload as any).deal_terms_defaults_used ?? null;

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
    user.id,
    fullSnapshot,
  );

  if (!snapshotResult.ok) {
    console.error(
      "snapshot insert error:",
      snapshotResult.error,
      snapshotResult.detail,
    );
    return jsonError("Failed to persist snapshot", 500);
  }

  // Audit events: deal created + snapshot computed + provenance
  try {
    const { error: eventError } = await (
      service.from("deal_events") as any
    ).insert([
      {
        deal_id: newDeal.id,
        event_type: "DEAL_CREATED",
        payload: {
          source: "resume",
          draft_id: draft.id,
          snapshot_id: snapshotResult.id,
          draft_source: draft.source ?? null,
          deal_terms_defaults_used: dealTermsDefaultsUsed,
        },
        created_by: user.id,
      },
      {
        deal_id: newDeal.id,
        event_type: "DEAL_SNAPSHOT_COMPUTED",
        payload: {
          source: "resume",
          draft_id: draft.id,
          snapshot_id: snapshotResult.id,
          compute_version,
          computed_at: computedAt,
        },
        created_by: user.id,
      },
    ]);

    if (eventError) {
      console.error("deal_events insert error:", eventError.message);
    }
  } catch (eventErr: any) {
    console.error("deal_events insert exception:", eventErr?.message);
  }

  // Mark token redeemed (best-effort).
  // If draft_tokens is append-only, this may fail; we do not block the user flow.
  try {
    const { error: redeemError } = await (service.from("draft_tokens") as any)
      .update({
        redeemed_at: new Date().toISOString(),
        redeemed_by_user_id: user.id,
      })
      .eq("id", draft.id)
      .is("redeemed_at", null);

    if (redeemError) {
      console.error("draft redeem update error:", redeemError.message);
    }
  } catch (e: any) {
    console.error("draft redeem update exception:", e?.message);
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
