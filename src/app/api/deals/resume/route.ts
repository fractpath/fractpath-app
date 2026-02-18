// src/app/api/deals/resume/route.ts
//
// Resume Route — Dual-path handler for converting marketing DraftSnapshots
// into authenticated deals with immutable canonical snapshots.
//
// SHAPE DETECTION (Rule 1):
//   - Canonical FullDealSnapshotV1: root has `deal_terms` object
//   - Legacy DraftSnapshot:         root has `inputs` object
//   - Unknown shape:                rejected with 422
//
// NORMALIZATION (Rule 2):
//   - Canonical: extract `deal_terms` + `assumptions` (or `scenario`)
//   - Legacy:    validate via DraftSnapshotV1, then extract via mapDraftToDealSnapshot
//   - Both paths converge to a unified `{ deal_terms, scenario }` internal structure
//
// COMPUTE (Rule 3):
//   - Both paths run `computeDeal(canonicalInputs)` — deterministic, reproducible output
//   - No canonical passthrough: we always recompute to ensure hash/version integrity
//
// RESPONSE (Rule 4):
//   - Success: `{ ok: true, deal_id, snapshot_id, redirect_url }` with 201
//   - Idempotent: already-redeemed tokens return existing deal with 200
//   - Errors: `{ ok: false, error: "<message>" }` with appropriate HTTP status
//
// DRIFT CONTROL (Rule 5):
//   - Marketing payloads are NOT modified; schema_version and contract_version validated
//   - camelCase preserved for marketing → app payloads
//   - Legacy snapshot handling preserved alongside canonical path

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

// ---------------------------------------------------------------------------
// Helpers — always return JSON, never throw uncaught errors (Rule 6)
// ---------------------------------------------------------------------------

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// ---------------------------------------------------------------------------
// Shape Detection (Rule 1)
//
// CANONICAL: root object has `deal_terms` as a nested object
//            → this is a FullDealSnapshotV1 from the canonical compute pipeline
//
// LEGACY:   root object has `inputs` as a nested object
//            → this is a DraftSnapshotV1 from older marketing widgets
//
// UNKNOWN:  neither key present → reject with 422
// ---------------------------------------------------------------------------

type SnapshotShape = "canonical" | "legacy" | "unknown";

function detectSnapshotShape(payload: unknown): SnapshotShape {
  if (!isRecord(payload)) return "unknown";
  // Canonical: deal_terms present at root
  if (isRecord((payload as any).deal_terms)) return "canonical";
  // Legacy: inputs present at root
  if (isRecord((payload as any).inputs)) return "legacy";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Payload Unwrapping
//
// Marketing payloads may nest the actual snapshot inside a wrapper key.
// We check known wrapper keys before treating the raw object as the snapshot.
// This preserves camelCase conventions from marketing → app (Rule 5).
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
// Canonical Input Extraction (Rule 2 — canonical path)
//
// Extracts `deal_terms` (always present for canonical shape) and
// `assumptions` or `scenario` (either name accepted for flexibility).
// Returns unified `{ deal_terms, scenario }` structure.
// ---------------------------------------------------------------------------

function extractCanonicalInputs(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const dealTerms = isRecord(payload.deal_terms)
    ? (payload.deal_terms as Record<string, unknown>)
    : {};

  // Accept either `assumptions` or `scenario` field name from canonical payload
  const scenario = isRecord(payload.assumptions)
    ? (payload.assumptions as Record<string, unknown>)
    : isRecord(payload.scenario)
      ? (payload.scenario as Record<string, unknown>)
      : {};

  return { deal_terms: dealTerms, scenario };
}

// ---------------------------------------------------------------------------
// POST /api/deals/resume
//
// Accepts: { token: string }
// Returns: { ok, deal_id, snapshot_id, redirect_url } on success (201)
//
// Implementation details (Rule 8):
//   - Uses ensureScenario helpers to normalize defaults if fields are missing
//   - Maintains strict TypeScript types: FullDealSnapshotV1 | DraftSnapshot
//   - All payload transformations are deterministic — no unverified marketing modules
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    // --- Authentication ---
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return jsonError("Unauthorized", 401);
    }

    // --- Parse request body ---
    let body: any;
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid JSON body", 400);
    }

    // --- Validate token parameter ---
    const token = body?.token;
    if (typeof token !== "string" || token.trim().length === 0) {
      return jsonError("token is required", 400);
    }

    const service = createServiceClient();

    // --- Look up draft token ---
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

    // --- Expiry check ---
    if (draft.expires_at && new Date(draft.expires_at) < new Date()) {
      return jsonError("Token has expired", 410);
    }

    // --- Idempotent redemption: already-redeemed tokens return existing deal ---
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

    // -----------------------------------------------------------------------
    // SHAPE DETECTION + NORMALIZATION (Rules 1 & 2)
    //
    // 1. Unwrap any marketing wrapper keys (canonicalSnapshot, draftSnapshot, etc.)
    // 2. Detect whether payload is canonical (deal_terms) or legacy (inputs)
    // 3. Extract and normalize to unified { deal_terms, scenario } structure
    // 4. Fill missing fields via ensureScenario() defensive defaults
    // -----------------------------------------------------------------------

    const rawSnapshotJson = draft.snapshot_json;
    const unwrapped = unwrapSnapshotPayload(rawSnapshotJson);

    if (!unwrapped) {
      return jsonError("Draft snapshot payload is invalid", 422);
    }

    const shape = detectSnapshotShape(unwrapped);

    let canonicalInputs: Record<string, unknown>;

    if (shape === "canonical") {
      // --- CANONICAL PATH ---
      // Validate schema_version against canonical specs (Rule 5 — drift control)
      if (
        typeof unwrapped.schema_version !== "string" ||
        (unwrapped.schema_version as string).trim().length === 0
      ) {
        return jsonError(
          "Canonical snapshot missing required schema_version",
          422,
        );
      }

      // Extract deal_terms + assumptions/scenario, then fill defaults
      const extracted = extractCanonicalInputs(unwrapped);
      canonicalInputs = ensureScenario(extracted);
    } else if (shape === "legacy") {
      // --- LEGACY PATH ---
      // Validate legacy DraftSnapshotV1 structure + hash integrity (Rule 5)
      const draftValidation = validateDraftSnapshotV1(unwrapped);
      if (!draftValidation.ok) {
        return jsonError(
          `Draft payload invalid for compute: ${draftValidation.error}`,
          422,
        );
      }

      // Map legacy shape to canonical { deal_terms, scenario } via mapDraftToDealSnapshot
      const mapped = mapDraftToDealSnapshot(draftValidation.snapshot as any);

      // Normalize with defaults — legacy payloads may be missing v10 fields
      canonicalInputs = ensureScenario(
        isRecord(mapped) && isRecord((mapped as any).inputs)
          ? ((mapped as any).inputs as Record<string, unknown>)
          : {
              deal_terms: getDefaultDealTerms(),
              scenario: getDefaultScenario(),
            },
      );
    } else {
      // --- UNKNOWN SHAPE ---
      return jsonError(
        "Unrecognized snapshot format: expected deal_terms (canonical) or inputs (legacy)",
        422,
      );
    }

    // -----------------------------------------------------------------------
    // DETERMINISTIC COMPUTE (Rule 3)
    //
    // Both canonical and legacy paths converge here. We ALWAYS recompute
    // via computeDeal to ensure reproducible, hash-stable outputs.
    // No canonical passthrough — this is the single source of truth.
    // -----------------------------------------------------------------------

    const computeResult = await computeDeal(canonicalInputs);

    if (!computeResult.ok) {
      return jsonError(`Compute failed: ${computeResult.error}`, 422);
    }

    const { compute_version, results } = computeResult.result;
    const computedAt = new Date().toISOString();

    // -----------------------------------------------------------------------
    // BUILD CANONICAL SNAPSHOT (FullDealSnapshotV1)
    //
    // This is the immutable, append-only snapshot stored in deal_snapshots.
    // - schema_version: "1" (current canonical spec)
    // - inputs: unified { deal_terms, scenario } from normalization
    // - outputs: { results } from deterministic compute
    // - compute_version: from @fractpath/compute package
    // - computed_at/computed_by: audit trail
    // -----------------------------------------------------------------------

    const fullSnapshot = {
      schema_version: "1",
      inputs: canonicalInputs,
      outputs: { results },
      compute_version,
      computed_at: computedAt,
      computed_by: user.id,
    };

    // --- Create deal record with source_ref linking back to draft token ---
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

    // --- Create OWNER access grant ---
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

    // --- Persist immutable snapshot via insertDealSnapshot ---
    const snapInsert = await insertDealSnapshot(
      service as any,
      newDeal.id,
      user.id,
      fullSnapshot,
    );

    let snapshotId: string | null = null;

    if (snapInsert.ok) {
      snapshotId = snapInsert.id;

      // Record DEAL_SNAPSHOT_COMPUTED audit event
      // Includes snapshot_shape (canonical or legacy) for traceability
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

    // --- Record DEAL_CREATED audit event ---
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

    // --- Redeem draft token (best-effort, conditional on redeemed_at IS NULL) ---
    // .is("redeemed_at", null) prevents race conditions on concurrent requests
    const { error: redeemError } = await (
      service.from("draft_tokens") as any
    )
      .update({
        redeemed_at: new Date().toISOString(),
        redeemed_by_user_id: user.id,
      })
      .eq("id", draft.id)
      .is("redeemed_at", null);

    if (redeemError) {
      console.error("draft_tokens redeem error:", redeemError.message);
    }

    // -----------------------------------------------------------------------
    // RESPONSE (Rule 4)
    //
    // Return canonical response shape:
    //   { ok: true, deal_id, snapshot_id, redirect_url }
    //
    // redirect_url allows the client to navigate to /deal/<id>
    // or /resume?token=<token> can redirect to this URL.
    // -----------------------------------------------------------------------

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
    // Rule 6: Never throw uncaught errors — always return JSON
    console.error("Resume route uncaught error:", outerError?.message);
    return jsonError("Internal server error", 500);
  }
}
