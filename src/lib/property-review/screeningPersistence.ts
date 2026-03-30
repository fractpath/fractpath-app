/**
 * Canonical persistence helpers for enhanced property screening results.
 *
 * Two responsibilities:
 *   1. persistScreeningArtifact  — write a NormalizedScreeningResult into
 *      property_review_runs as an immutable audit artifact.
 *   2. applyScreeningResultToProperty — materialise the result back onto the
 *      properties row (Phase 1 canonical fields + reused controlling fields).
 *
 * These are the ONLY functions that may write screening results to the DB.
 * All callers must go through this module; no ad-hoc property_review_runs
 * inserts or properties patches for screening data elsewhere.
 *
 * No real ATTOM HTTP calls live here.  The real adapter wires in at a higher
 * layer and produces a NormalizedScreeningResult which is then handed to these
 * helpers.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { NormalizedScreeningResult } from "@/lib/property/screening";
import { SCREENING_ARTIFACT_TYPE } from "@/lib/property/screening";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type ScreeningRunRow = {
  id: string;
  property_id: string;
  provider: string;
  artifact_type: string;
  status: string;
  requested_by: string | null;
  requested_at: string;
  completed_at: string | null;
  expires_at: string | null;
  is_current: boolean;
  source_key: string | null;
  vendor_record_id: string | null;
  request_params: Record<string, unknown>;
  raw_payload: unknown;
  normalized_payload: unknown;
  error_code: string | null;
  error_message: string | null;
};

// ────────────────────────────────────────────────────────────────────────────
// 1. Persist screening artifact
// ────────────────────────────────────────────────────────────────────────────

export type PersistScreeningArtifactInput = {
  propertyId: string;
  /** Admin or system user ID that requested this screening run, if known. */
  requestedBy?: string | null;
  /** ISO timestamp when the screening run completed (typically now()). */
  completedAt: string;
  /** ISO timestamp when the screening artifact expires and should be re-fetched. */
  expiresAt: string;
  /** The fully-resolved normalized screening result to store. */
  result: NormalizedScreeningResult;
  /**
   * Optional stable key identifying the input parameters used (e.g. a hash of
   * the property address + debt amount).  Enables deduplication checks.
   */
  sourceKey?: string | null;
  /**
   * Raw request parameters sent to the screening provider (for audit trail).
   * Do NOT include PII or secrets.
   */
  requestParams?: Record<string, unknown>;
};

/**
 * Writes a NormalizedScreeningResult into property_review_runs as an
 * immutable completed artifact.
 *
 * Steps:
 *   1. Mark all prior enhanced_screening runs for this property+provider as
 *      not current (idempotent, does not delete them — audit trail preserved).
 *   2. Insert a new completed run row with normalized_payload = result.
 *   3. Return the persisted run row.
 *
 * The normalized_payload stored here is the verbatim NormalizedScreeningResult.
 * No recomputation is performed at read time.
 */
export async function persistScreeningArtifact(
  input: PersistScreeningArtifactInput,
): Promise<ScreeningRunRow> {
  const supabase = createAdminClient();

  // Step 1: Retire prior current runs for this property+provider+artifact_type
  const retireRes = await (supabase.from("property_review_runs") as any)
    .update({ is_current: false })
    .eq("property_id", input.propertyId)
    .eq("provider", input.result.provider)
    .eq("artifact_type", SCREENING_ARTIFACT_TYPE)
    .eq("is_current", true);

  if (retireRes.error) {
    throw new Error(
      `Failed to retire prior screening runs: ${retireRes.error.message}`,
    );
  }

  // Step 2: Insert completed run with the normalized screening result
  const { data, error } = await (supabase.from("property_review_runs") as any)
    .insert({
      property_id: input.propertyId,
      provider: input.result.provider,
      artifact_type: SCREENING_ARTIFACT_TYPE,
      status: "completed",
      requested_by: input.requestedBy ?? null,
      requested_at: input.completedAt,
      completed_at: input.completedAt,
      expires_at: input.expiresAt,
      is_current: true,
      source_key: input.sourceKey ?? null,
      request_params: input.requestParams ?? {},
      raw_payload: null,
      normalized_payload: input.result,
      error_code: null,
      error_message: null,
    })
    .select(
      "id, property_id, provider, artifact_type, status, requested_by, requested_at, completed_at, expires_at, is_current, source_key, vendor_record_id, request_params, raw_payload, normalized_payload, error_code, error_message",
    )
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to persist screening artifact: ${error?.message ?? "unknown error"}`,
    );
  }

  return data as ScreeningRunRow;
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Apply screening result onto the property materialized fields
// ────────────────────────────────────────────────────────────────────────────

export type ApplyScreeningResultInput = {
  propertyId: string;
  /** The normalized screening result to apply. */
  result: NormalizedScreeningResult;
  /**
   * ISO timestamp when the controlling value/appraisal status should expire.
   * Only used when the result becameControlling and outcome is "clean" to set
   * property_review_expires_at (the canonical verifiedAppraisalValueValidUntil source).
   */
  expiresAt: string;
  /**
   * The owner user ID to record in verified_appraisal_value_context_owner_id.
   * Only written when outcome is "clean" and result.becameControlling is true.
   */
  ownerUserId?: string | null;
};

/**
 * Materialises a NormalizedScreeningResult onto the properties row.
 *
 * Fields always written (regardless of outcome or becameControlling):
 *   - verification_state         ← result.nextVerificationState
 *   - current_eligibility_posture ← derived from result.outcome
 *   - current_limiting_factors_json ← result.limitingFactors (serialized)
 *   - current_fractpath_eligible_cash_cap ← result.fractpathEligibleCashCap
 *
 * Fields written only when result.becameControlling AND controllingFmvCandidate
 * is non-null:
 *   - latest_verified_fmv        ← result.controllingFmvCandidate
 *   - fmv_verification_source    ← result.provider
 *   - max_accessible_cash_current ← result.rawEstimatedAvailableCash
 *
 * Fields written only when result.becameControlling AND outcome is "clean":
 *   - verified_appraisal_value_status        ← "active"
 *   - property_review_expires_at             ← input.expiresAt
 *   - verified_appraisal_value_context_owner_id ← input.ownerUserId
 *
 * Throws on any DB error.  This is a fail-closed operation — partial writes
 * are not acceptable.  Call persistScreeningArtifact() before this function
 * so the run artifact is recorded even if the property patch fails.
 */
export async function applyScreeningResultToProperty(
  input: ApplyScreeningResultInput,
): Promise<void> {
  const { propertyId, result, expiresAt, ownerUserId } = input;

  // ── Always-written fields ─────────────────────────────────────────────────
  const patch: Record<string, unknown> = {
    verification_state: result.nextVerificationState,
    current_eligibility_posture: resolveEligibilityPostureFromOutcome(
      result.outcome,
    ),
    current_limiting_factors_json: result.limitingFactors,
    current_fractpath_eligible_cash_cap: result.fractpathEligibleCashCap,
  };

  // ── Controlling value fields ──────────────────────────────────────────────
  if (result.becameControlling && result.controllingFmvCandidate != null) {
    patch.latest_verified_fmv = result.controllingFmvCandidate;
    patch.fmv_verification_source = result.provider;
    patch.max_accessible_cash_current = result.rawEstimatedAvailableCash;
  }

  // ── Appraisal badge fields (clean + controlling only) ─────────────────────
  if (result.becameControlling && result.outcome === "clean") {
    patch.verified_appraisal_value_status = "active";
    patch.property_review_expires_at = expiresAt;
    patch.verified_appraisal_value_context_owner_id = ownerUserId ?? null;
  }

  // ── Apply ─────────────────────────────────────────────────────────────────
  const supabase = createAdminClient();

  const { error } = await (supabase.from("properties") as any)
    .update(patch)
    .eq("id", propertyId);

  if (error) {
    throw new Error(
      `Failed to apply screening result to property ${propertyId}: ${error.message}`,
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Maps a screening outcome to current_eligibility_posture.
 *
 * Duplicates the logic from screening.ts#resolveEligibilityPosture() to keep
 * this persistence module dependency-minimal (avoids importing the pure-logic
 * module just for one switch).  If the resolution rules change, update BOTH.
 *
 * Resolution rules:
 *   clean        →  eligible
 *   discrepancy  →  under_review
 *   disputed     →  requires_enhanced_review
 *   weak         →  requires_enhanced_review
 *   stale        →  requires_enhanced_review
 *   unsupported  →  ineligible
 */
function resolveEligibilityPostureFromOutcome(
  outcome: NormalizedScreeningResult["outcome"],
): string {
  switch (outcome) {
    case "clean":
      return "eligible";
    case "discrepancy":
      return "under_review";
    case "disputed":
    case "weak":
    case "stale":
      return "requires_enhanced_review";
    case "unsupported":
      return "ineligible";
  }
}
