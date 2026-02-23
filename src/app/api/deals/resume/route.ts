// src/app/api/deals/resume/route.ts
//
// Resume Route — Accepts FullDealSnapshotV1-ish payloads from marketing and
// converts them into authenticated deals with immutable canonical snapshots.
//
// SHAPE DETECTION:
//   - Canonical: has `deal_terms` object (priority)
//   - Legacy:    has `inputs` without `deal_terms`
//   - Legacy payloads are auto-upconverted to canonical with defaults
//
// NORMALIZATION:
//   - Canonical: extract `deal_terms` + `assumptions`/`scenario`
//   - Legacy: auto-upconvert to canonical { deal_terms, scenario } with defaults
//
// COMPUTE:
//   - Always recompute via computeDeal(canonicalInputs) for deterministic output
//   - No canonical passthrough
//
// DRIFT CONTROL:
//   - Validate schema_version + contract_version on canonical payloads
//   - No @/lib/compute direct imports — only computeAdapter

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

import { insertDealSnapshot } from "@/lib/dealSnapshotDb";
import { computeDealAdapter as computeDeal } from "@/lib/computeAdapter";
import { CONTRACT_VERSION, SCHEMA_VERSION } from "@/lib/contractVersion";

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

// ---------------------------------------------------------------------------
// Shape Detection
// ---------------------------------------------------------------------------

type SnapshotShape = "canonical" | "legacy" | "unknown";

function detectSnapshotShape(payload: unknown): SnapshotShape {
  if (!isRecord(payload)) return "unknown";
  if (isRecord((payload as any).deal_terms)) return "canonical";
  if (isRecord((payload as any).inputs)) return "legacy";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Payload Unwrapping
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
// Canonical Input Extraction
// ---------------------------------------------------------------------------

function extractCanonicalInputs(payload: Record<string, unknown>): Record<string, unknown> {
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

// ---------------------------------------------------------------------------
// Legacy Auto-Upconversion
// ---------------------------------------------------------------------------

function upconvertLegacyToCanonical(payload: Record<string, unknown>): Record<string, unknown> {
  const rawInputs = isRecord(payload.inputs)
    ? (payload.inputs as Record<string, unknown>)
    : {};

  let dealTerms: Record<string, unknown> = {};
  let scenario: Record<string, unknown> = {};

  // If legacy already nested deal_terms, honor it; otherwise treat inputs as terms-ish.
  if (isRecord((rawInputs as any).deal_terms)) {
    dealTerms = (rawInputs as any).deal_terms as Record<string, unknown>;
  } else {
    dealTerms = rawInputs;
  }

  if (isRecord((rawInputs as any).scenario)) {
    scenario = (rawInputs as any).scenario as Record<string, unknown>;
  } else if (isRecord(payload.scenario)) {
    scenario = payload.scenario as Record<string, unknown>;
  } else if (isRecord(payload.assumptions)) {
    scenario = payload.assumptions as Record<string, unknown>;
  }

  return { deal_terms: dealTerms, scenario };
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

    const { data: draft, error: draftError } = await (service.from("draft_tokens") as any)
      .select("id, snapshot_json, expires_at, redeemed_at, redeemed_by_user_id, source")
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
        return NextResponse.json(
          { ok: true, deal_id: existingDeal.id, redirect_url: `/deal/${existingDeal.id}` },
          { status: 200 },
        );
      }

      return jsonError("Token already redeemed", 409);
    }

    // -----------------------------------------------------------------------
    // SHAPE DETECTION + NORMALIZATION
    // -----------------------------------------------------------------------

    const rawSnapshotJson = draft.snapshot_json;
    const unwrapped = unwrapSnapshotPayload(rawSnapshotJson);

    if (!unwrapped) {
      return jsonError("Draft snapshot payload is invalid", 422);
    }

    const shape = detectSnapshotShape(unwrapped);

    let canonicalInputs: Record<string, unknown>;

    if (shape === "canonical") {
      // Validate inbound canonical version fields (drift control)
      const sv =
        typeof (unwrapped as any).schema_version === "string"
          ? String((unwrapped as any).schema_version).trim()
          : "";

      if (sv.length === 0) {
        return jsonError("Canonical snapshot missing required schema_version", 422);
      }
      if (sv !== SCHEMA_VERSION) {
        return jsonError(`Unsupported schema_version "${sv}". Expected "${SCHEMA_VERSION}"`, 422);
      }

      const cv =
        typeof (unwrapped as any).contract_version === "string"
          ? String((unwrapped as any).contract_version).trim()
          : typeof (unwrapped as any).compute_version === "string"
            ? String((unwrapped as any).compute_version).trim()
            : "";

      if (cv.length > 0 && cv !== CONTRACT_VERSION) {
        return jsonError(`Unsupported contract_version "${cv}". Expected "${CONTRACT_VERSION}"`, 422);
      }

      canonicalInputs = ensureScenario(extractCanonicalInputs(unwrapped));
    } else if (shape === "legacy") {
      canonicalInputs = ensureScenario(upconvertLegacyToCanonical(unwrapped));
    } else {
      return jsonError(
        "Unrecognized snapshot format: expected deal_terms (canonical) or inputs (legacy)",
        422,
      );
    }

    // -----------------------------------------------------------------------
    // DETERMINISTIC COMPUTE
    // -----------------------------------------------------------------------

    const computeResult = await computeDeal(canonicalInputs);
    if (!computeResult.ok) {
      return jsonError(`Compute failed: ${computeResult.error}`, 422);
    }

    const { compute_version, results } = computeResult;
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

    const { data: newDeal, error: dealInsertError } = await (service.from("deals") as any)
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

    const { error: grantError } = await (service.from("deal_access_grants") as any).upsert(
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

    // -----------------------------------------------------------------------
    // INSERT SNAPSHOT + EVENTS
    // -----------------------------------------------------------------------

    const snapInsert = await insertDealSnapshot(service as any, newDeal.id, user.id, fullSnapshot);

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
      console.error("resume snapshot insert failed:", snapInsert.error, snapInsert.detail);
    }

    const { error: eventError } = await (service.from("deal_events") as any).insert({
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
    // REDEEM TOKEN
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

    return NextResponse.json(
      {
        ok: true,
        deal_id: newDeal.id,
        snapshot_id: snapshotId,
        redirect_url: `/deal/${newDeal.id}`,
      },
      { status: 201 },
    );
  } catch (outerError: any) {
    console.error("Resume route uncaught error:", outerError?.message);
    return jsonError("Internal server error", 500);
  }
}