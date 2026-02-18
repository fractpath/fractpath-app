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

type SnapshotShape = "canonical" | "legacy" | "unknown";

function detectSnapshotShape(payload: unknown): SnapshotShape {
  if (!isRecord(payload)) return "unknown";
  if (isRecord((payload as any).deal_terms)) return "canonical";
  if (isRecord((payload as any).inputs)) return "legacy";
  return "unknown";
}

function unwrapSnapshotPayload(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) return null;

  for (const key of [
    "canonicalSnapshot",
    "canonical_snapshot",
    "draftSnapshot",
    "snapshot",
    "draft",
  ] as const) {
    if (isRecord((raw as any)[key])) {
      return (raw as any)[key] as Record<string, unknown>;
    }
  }

  return raw;
}

function extractCanonicalInputs(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const dealTerms = isRecord(payload.deal_terms)
    ? (payload.deal_terms as Record<string, unknown>)
    : {};

  const scenario = isRecord(payload.assumptions)
    ? (payload.assumptions as Record<string, unknown>)
    : isRecord(payload.scenario)
      ? (payload.scenario as Record<string, unknown>)
      : {};

  return { deal_terms: dealTerms, scenario };
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

  const rawSnapshotJson = draft.snapshot_json;
  const unwrapped = unwrapSnapshotPayload(rawSnapshotJson);

  if (!unwrapped) {
    return jsonError("Draft snapshot payload is invalid", 422);
  }

  const shape = detectSnapshotShape(unwrapped);

  let canonicalInputs: Record<string, unknown>;

  if (shape === "canonical") {
    if (
      typeof unwrapped.schema_version !== "string" ||
      (unwrapped.schema_version as string).trim().length === 0
    ) {
      return jsonError(
        "Canonical snapshot missing required schema_version",
        422,
      );
    }

    const extracted = extractCanonicalInputs(unwrapped);
    canonicalInputs = ensureScenario(extracted);
  } else if (shape === "legacy") {
    const draftValidation = validateDraftSnapshotV1(unwrapped);
    if (!draftValidation.ok) {
      return jsonError(
        `Draft payload invalid for compute: ${draftValidation.error}`,
        422,
      );
    }

    const mapped = mapDraftToDealSnapshot(draftValidation.snapshot as any);

    canonicalInputs = ensureScenario(
      isRecord(mapped) && isRecord((mapped as any).inputs)
        ? ((mapped as any).inputs as Record<string, unknown>)
        : {
            deal_terms: getDefaultDealTerms(),
            scenario: getDefaultScenario(),
          },
    );
  } else {
    return jsonError(
      "Unrecognized snapshot format: expected deal_terms (canonical) or inputs (legacy)",
      422,
    );
  }

  const computeResult = await computeDeal(canonicalInputs);

  if (!computeResult.ok) {
    return jsonError(`Compute failed: ${computeResult.error}`, 422);
  }

  const { compute_version, results } = computeResult.result;
  const computedAt = new Date().toISOString();

  const fullSnapshot = {
    schema_version: "1",
    inputs: canonicalInputs,
    outputs: { results },
    compute_version,
    computed_at: computedAt,
    computed_by: user.id,
  };

  const { data: newDeal, error: dealInsertError } = await (
    service.from("deals") as any
  )
    .insert({
      owner_user_id: user.id,
      status: "IMPORTED",
      created_from: "resume",
      source_ref: `draft_token:${draft.id}`,
      mode: "app",
    })
    .select("id, created_at")
    .single();

  if (dealInsertError || !newDeal) {
    console.error("deal insert error:", dealInsertError?.message);
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
    {
      onConflict: "deal_id,user_id",
      ignoreDuplicates: true,
    },
  );

  if (grantError) {
    console.error("grant upsert error:", grantError);
    return jsonError("Failed to assign ownership", 500);
  }

  const snapInsert = await insertDealSnapshot(
    service as any,
    newDeal.id,
    user.id,
    fullSnapshot,
  );

  let snapshotId: string | null = null;

  if (snapInsert.ok) {
    snapshotId = snapInsert.id;

    try {
      await (service.from("deal_events") as any).insert({
        deal_id: newDeal.id,
        event_type: "DEAL_SNAPSHOT_COMPUTED",
        payload: {
          snapshot_id: snapInsert.id,
          compute_version,
          computed_at: computedAt,
          source: "resume",
          draft_token_id: draft.id,
          snapshot_shape: shape,
        },
        created_by: user.id,
      });
    } catch (eventErr: any) {
      console.error("snapshot event insert error:", eventErr?.message);
    }
  } else {
    console.error(
      "resume snapshot insert failed:",
      snapInsert.error,
      snapInsert.detail,
    );
  }

  const { error: eventError } = await (
    service.from("deal_events") as any
  ).insert({
    deal_id: newDeal.id,
    event_type: "DEAL_CREATED",
    payload: {
      source: "resume",
      draft_token_id: draft.id,
      baseline_snapshot_id: snapshotId,
    },
    created_by: user.id,
  });

  if (eventError) {
    console.error("deal_events insert error:", eventError.message);
  }

  const { error: redeemError } = await (service.from("draft_tokens") as any)
    .update({
      redeemed_at: new Date().toISOString(),
      redeemed_by_user_id: user.id,
    })
    .eq("id", draft.id)
    .is("redeemed_at", null);

  if (redeemError) {
    console.error("draft_tokens redeem error:", redeemError.message);
  }

  return NextResponse.json(
    {
      ok: true,
      deal_id: newDeal.id,
      snapshot_id: snapshotId,
      redirect_url: `/deal/${newDeal.id}`,
    },
    { status: 201 },
  );
}
