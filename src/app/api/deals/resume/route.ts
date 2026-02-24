// src/app/api/deals/resume/route.ts
//
// Resume Route — Accepts FullDealSnapshotV1-ish payloads from marketing and
// converts them into authenticated deals with immutable canonical snapshots.
//
// IMPORTANT:
// - Do not change canonical compute contract shape.
// - Do not change compute model math.
// - This route normalizes envelopes only and always recomputes deterministically.
//
// DRIFT CONTROL:
// - If version fields are present on the canonical snapshot object, enforce them.
// - Otherwise, do not false-fail legacy / nested token payloads that don't carry versions at the same level.
//
// COMPUTE:
// - Always recompute via computeDeal(canonicalInputs) for deterministic output
// - No canonical passthrough
//
// NOTE:
// - No @/lib/compute direct imports — only computeAdapter

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

import { insertDealSnapshot } from "@/lib/dealSnapshotDb";
import { computeDealAdapter as computeDeal } from "@/lib/computeAdapter";
import { CONTRACT_VERSION, SCHEMA_VERSION } from "@/lib/contractVersion";
import { isRealtorPersona } from "@/lib/authz";

import { ensureScenario } from "@/lib/defaultScenario";
import { normalizeCanonicalInputsFromUnknown } from "@/lib/normalizeCanonicalInputs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// ---------------------------------------------------------------------------
// Payload Unwrapping (token snapshots may wrap the relevant payload)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Version Drift Control (only enforce if fields are present at that level)
// ---------------------------------------------------------------------------

function enforceVersionsIfPresent(payload: Record<string, unknown>) {
  const rawSv =
    typeof (payload as any).schema_version === "string"
      ? String((payload as any).schema_version).trim()
      : "";

  // Accept common aliases: "v1" and "1" should be treated the same.
  // This is drift-control normalization only; compute contract + math unchanged.
  const normalizedSv =
    rawSv.length > 0 && /^v?\d+$/i.test(rawSv)
      ? rawSv.replace(/^v/i, "")
      : rawSv;

  if (normalizedSv.length > 0 && normalizedSv !== SCHEMA_VERSION) {
    return {
      ok: false as const,
      error: `Unsupported schema_version "${rawSv}". Expected "${SCHEMA_VERSION}"`,
    };
  }

  const rawCv =
    typeof (payload as any).contract_version === "string"
      ? String((payload as any).contract_version).trim()
      : typeof (payload as any).compute_version === "string"
        ? String((payload as any).compute_version).trim()
        : "";

  const normalizedCv =
    rawCv.length > 0 && /^v?\d+(\.\d+)*$/i.test(rawCv)
      ? rawCv.replace(/^v/i, "")
      : rawCv;

  // CONTRACT_VERSION is already a semver-like string (e.g. "10.2.0").
  // If rawCv arrives like "v10.2.0", treat it as equivalent.
  if (normalizedCv.length > 0 && normalizedCv !== CONTRACT_VERSION) {
    return {
      ok: false as const,
      error: `Unsupported contract_version "${rawCv}". Expected "${CONTRACT_VERSION}"`,
    };
  }

  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// POST /api/deals/resume
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return jsonError("Unauthorized", 401);
    }

    // Realtors may redeem tokens, but are always VIEWER in the app (no mutation rights).
    const isRealtor = isRealtorPersona(user);

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

    // If already redeemed, try to return the deal we created previously.
    if (draft.redeemed_at || draft.redeemed_by_user_id) {
      const { data: existingDeal } = await (service.from("deals") as any)
        .select("id")
        .eq("source_ref", `draft_token:${draft.id}`)
        .maybeSingle();

      if (existingDeal) {
        const redirectUrl = isRealtor
          ? `/deal/${existingDeal.id}?mode=shared`
          : `/deal/${existingDeal.id}`;

        return NextResponse.json(
          { ok: true, deal_id: existingDeal.id, redirect_url: redirectUrl },
          { status: 200 },
        );
      }

      return jsonError("Token already redeemed", 409);
    }

    // -----------------------------------------------------------------------
    // NORMALIZATION (accept nested + legacy + canonical envelopes)
    // -----------------------------------------------------------------------

    const rawSnapshotJson = draft.snapshot_json;
    const unwrapped = unwrapSnapshotPayload(rawSnapshotJson);

    if (!unwrapped) {
      return jsonError("Draft snapshot payload is invalid", 422);
    }

    // If version fields exist at this unwrapped level, enforce them.
    // This avoids false 422s when the canonical payload is nested (e.g. canonicalSnapshot.inputs)
    const driftCheck = enforceVersionsIfPresent(unwrapped);
    if (!driftCheck.ok) {
      return jsonError(driftCheck.error, 422);
    }

    // Normalize from ANY of:
    // - { inputs: { deal_terms, scenario } }
    // - { deal_terms, scenario }
    // - { deal_terms, assumptions } (assumptions -> scenario)
    // - token snapshot layouts: canonicalSnapshot.inputs / canonicalInputs / draftSnapshot(.inputs)
    //
    // IMPORTANT: the normalizer expects the full raw object so it can find nested canonicalSnapshot/canonicalInputs.
    // So we try the raw snapshot first, then fall back to the unwrapped object.
    const normalized =
      normalizeCanonicalInputsFromUnknown(rawSnapshotJson) ??
      normalizeCanonicalInputsFromUnknown(unwrapped);

    if (!normalized) {
      return jsonError(
        "Unrecognized snapshot format: missing canonical deal_terms + scenario",
        422,
      );
    }

    const canonicalInputs = ensureScenario({
      deal_terms: normalized.deal_terms ?? {},
      scenario: normalized.scenario ?? {},
    });

    // Validate after normalization (prevents false 422 due to envelope mismatch)
    const pv = (canonicalInputs.deal_terms as any)?.property_value;
    if (typeof pv !== "number" || !Number.isFinite(pv)) {
      return jsonError("deal_terms.property_value is required", 422);
    }

    // -----------------------------------------------------------------------
    // DETERMINISTIC COMPUTE
    // -----------------------------------------------------------------------

    const computeResult = await computeDeal(canonicalInputs as any);
    if (!computeResult.ok) {
      return jsonError(`Compute failed: ${computeResult.error}`, 422);
    }

    const { compute_version, results } = computeResult.result;
    const computedAt = new Date().toISOString();

    // -----------------------------------------------------------------------
    // BUILD CANONICAL SNAPSHOT
    // -----------------------------------------------------------------------

    const fullSnapshot = {
      contract_version: CONTRACT_VERSION,
      schema_version: SCHEMA_VERSION,
      inputs: canonicalInputs,
      outputs: { results },
      compute_version,
      computed_at: computedAt,
      computed_by: user.id,
    };

    // -----------------------------------------------------------------------
    // CREATE DEAL + ACCESS GRANT
    // -----------------------------------------------------------------------
    //
    // NOTE: deals.owner_user_id is NOT NULL in schema, so we must set it to user.id.
    // Realtor persona is still VIEWER via deal_access_grants + shared redirect.

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
        role: isRealtor ? "VIEWER" : "OWNER",
        created_by: user.id,
      },
      { onConflict: "deal_id,user_id", ignoreDuplicates: true },
    );

    if (grantError) {
      console.error("grant upsert error:", grantError);
      return jsonError("Failed to assign access grant", 500);
    }

    // -----------------------------------------------------------------------
    // INSERT SNAPSHOT + EVENTS
    // -----------------------------------------------------------------------

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

    // -----------------------------------------------------------------------
    // REDEEM TOKEN (best-effort)
    // -----------------------------------------------------------------------

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

    const redirectUrl = isRealtor
      ? `/deal/${newDeal.id}?mode=shared`
      : `/deal/${newDeal.id}`;

    return NextResponse.json(
      {
        ok: true,
        deal_id: newDeal.id,
        snapshot_id: snapshotId,
        redirect_url: redirectUrl,
      },
      { status: 201 },
    );
  } catch (outerError: any) {
    console.error("Resume route uncaught error:", outerError?.message);
    return jsonError("Internal server error", 500);
  }
}
