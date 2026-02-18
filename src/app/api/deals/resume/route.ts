import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

import { validateDraftSnapshotV1 } from "@/lib/draftSnapshot";
import { mapDraftToDealSnapshot } from "@/lib/draftToDealSnapshot";
import { validateFullDealSnapshotV1 } from "@/lib/dealSnapshot";
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

// Normalize wrapper drift without weakening validation.
// We validate ONLY the DraftSnapshot shape; we do not trust any inbound canonical blobs.
// However: if a canonicalSnapshot is present, we normalize + validate it as a FullDealSnapshotV1
// and ingest it verbatim (no recompute).
function pickDraftSnapshotPayload(raw: unknown): {
  draftSnapshot: Record<string, unknown> | null;
  canonicalSnapshot: unknown | null;
  pickedFrom: "root" | "draftSnapshot" | "snapshot" | "draft" | "unknown";
} {
  if (!isRecord(raw)) {
    return {
      draftSnapshot: null,
      canonicalSnapshot: null,
      pickedFrom: "unknown",
    };
  }

  const canonicalSnapshot =
    (raw as any).canonicalSnapshot ?? (raw as any).canonical_snapshot ?? null;

  // Most likely drift: { draftSnapshot: {...}, canonicalSnapshot: {...} }
  if (isRecord((raw as any).draftSnapshot)) {
    return {
      draftSnapshot: (raw as any).draftSnapshot as Record<string, unknown>,
      canonicalSnapshot,
      pickedFrom: "draftSnapshot",
    };
  }

  // Other possible wrappers
  if (isRecord((raw as any).snapshot)) {
    return {
      draftSnapshot: (raw as any).snapshot as Record<string, unknown>,
      canonicalSnapshot,
      pickedFrom: "snapshot",
    };
  }

  if (isRecord((raw as any).draft)) {
    return {
      draftSnapshot: (raw as any).draft as Record<string, unknown>,
      canonicalSnapshot,
      pickedFrom: "draft",
    };
  }

  // Otherwise assume the root itself is the DraftSnapshot (legacy / direct write)
  return { draftSnapshot: raw, canonicalSnapshot, pickedFrom: "root" };
}

function normalizeCanonicalSnapshotForApp(
  raw: unknown,
  userId: string,
): unknown {
  // If already valid FullDealSnapshotV1, accept as-is (no recompute).
  const already = validateFullDealSnapshotV1(raw);
  if (already.ok) return already.snapshot;

  // Otherwise treat as marketing-shaped snapshot:
  // { contract_version/compute_version, schema_version, now_iso, deal_terms, assumptions, results }
  if (!isRecord(raw)) return raw;

  const computeVersion =
    (typeof (raw as any).compute_version === "string" &&
      (raw as any).compute_version) ||
    (typeof (raw as any).contract_version === "string" &&
      (raw as any).contract_version) ||
    undefined;

  const schemaVersion =
    (typeof (raw as any).schema_version === "string" &&
      (raw as any).schema_version) ||
    "1";

  const dealTerms = isRecord((raw as any).deal_terms)
    ? ((raw as any).deal_terms as Record<string, unknown>)
    : null;

  const scenarioRaw = isRecord((raw as any).assumptions)
    ? ((raw as any).assumptions as Record<string, unknown>)
    : isRecord((raw as any).scenario)
      ? ((raw as any).scenario as Record<string, unknown>)
      : {};

  const results = isRecord((raw as any).results)
    ? ((raw as any).results as Record<string, unknown>)
    : null;

  if (!computeVersion || !dealTerms || !results) return raw;

  const canonicalInputs = ensureScenario({
    deal_terms: dealTerms,
    scenario: scenarioRaw,
  });

  const computedAt =
    (typeof (raw as any).computed_at === "string" &&
      (raw as any).computed_at) ||
    (typeof (raw as any).now_iso === "string" && (raw as any).now_iso) ||
    new Date().toISOString();

  return {
    schema_version: schemaVersion,
    compute_version: computeVersion,
    inputs: canonicalInputs,
    outputs: { results },
    computed_at: computedAt,
    computed_by: userId,
  };
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

  const rawSnapshotJson = draft.snapshot_json;

  const picked = pickDraftSnapshotPayload(rawSnapshotJson);
  if (!picked.draftSnapshot) {
    return jsonError("Draft snapshot payload is invalid", 422);
  }

  // PATH A: ingest canonicalSnapshot verbatim (no recompute), after normalization + validation
  // PATH B: fall back to draftSnapshot -> map -> ensureScenario -> compute
  let fullSnapshot: any;

  if (picked.canonicalSnapshot) {
    const normalized = normalizeCanonicalSnapshotForApp(
      picked.canonicalSnapshot,
      user.id,
    );

    const v = validateFullDealSnapshotV1(normalized);
    if (!v.ok) {
      return jsonError(`Draft canonicalSnapshot invalid: ${v.error}`, 400);
    }

    fullSnapshot = v.snapshot;
  } else {
    const draftValidation = validateDraftSnapshotV1(picked.draftSnapshot);
    if (!draftValidation.ok) {
      return jsonError(
        `Draft payload invalid for compute: ${draftValidation.error}`,
        422,
      );
    }

    const mapped = mapDraftToDealSnapshot(draftValidation.snapshot as any);

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
      return jsonError(`Compute failed: ${computeResult.error}`, 422);
    }

    const { compute_version, results } = computeResult.result;
    const computedAt = new Date().toISOString();

    fullSnapshot = {
      schema_version: "1",
      inputs: canonicalInputs,
      outputs: { results },
      compute_version,
      computed_at: computedAt,
      computed_by: user.id,
    };
  }

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
          compute_version: (fullSnapshot as any)?.compute_version,
          computed_at: (fullSnapshot as any)?.computed_at,
          source: "resume",
          draft_token_id: draft.id,
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
