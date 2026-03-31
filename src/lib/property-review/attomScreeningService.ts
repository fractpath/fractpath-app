/**
 * ATTOM enhanced screening orchestration service.
 *
 * Coordinates the full ATTOM screening sequence for a property:
 *   1. Load property + owner context from DB
 *   2. Fetch ATTOM data (property detail + AVM, in parallel)
 *   3. Normalize to NormalizedScreeningResult
 *   4. Persist artifact in property_review_runs (always, even if apply fails)
 *   5. Apply result to canonical property fields (fail-closed)
 *   6. Return run ID and result
 *
 * This is the ONLY service module that orchestrates ATTOM calls end-to-end.
 * Individual pieces (client, normalizer, persistence) are independent and
 * testable in isolation.
 *
 * TTL is configurable via ATTOM_SCREENING_TTL_DAYS (default 180 days).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAttomScreeningData } from "./providers/attom/client";
import { normalizeAttomScreening } from "./providers/attom/normalize";
import type { AttomRawComposite } from "./providers/attom/types";
import {
  persistScreeningArtifact,
  applyScreeningResultToProperty,
} from "./screeningPersistence";
import type { NormalizedScreeningResult } from "@/lib/property/screening";

// ────────────────────────────────────────────────────────────────────────────
// Configuration
// ────────────────────────────────────────────────────────────────────────────

const ATTOM_SCREENING_TTL_DAYS = Number(
  process.env.ATTOM_SCREENING_TTL_DAYS ?? "180",
);

function addDaysIso(date: Date, days: number): string {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}

// ────────────────────────────────────────────────────────────────────────────
// Property loader
// ────────────────────────────────────────────────────────────────────────────

type PropertyForScreening = {
  id: string;
  owner_user_id: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  has_secured_property_debt: boolean | null;
  secured_property_debt_amount: number | null;
  total_known_debt_amount: number | null;
  owner_stated_fmv: number | null;
  latest_verified_fmv: number | null;
};

async function getPropertyForScreening(
  propertyId: string,
): Promise<PropertyForScreening> {
  const supabase = createAdminClient();

  const { data, error } = await (supabase.from("properties") as any)
    .select(
      "id, owner_user_id, address_line1, city, state, postal_code, has_secured_property_debt, secured_property_debt_amount, total_known_debt_amount, owner_stated_fmv, latest_verified_fmv",
    )
    .eq("id", propertyId)
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to load property for ATTOM screening: ${error?.message ?? "unknown error"}`,
    );
  }

  const prop = data as PropertyForScreening;

  if (!prop.address_line1 || !prop.city || !prop.state) {
    throw new Error(
      "Property is missing required address fields (address_line1, city, state) for ATTOM screening",
    );
  }

  return prop;
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

export type AttomScreeningInput = {
  propertyId: string;
  /** Admin or system user ID that triggered this screening run. */
  requestedBy?: string | null;
};

export type AttomScreeningRunResult = {
  /** ID of the property_review_runs row that was created. */
  runId: string;
  /** The fully-resolved normalized result that was applied to the property. */
  result: NormalizedScreeningResult;
};

/**
 * Runs a full ATTOM enhanced screening sequence for a property and persists
 * the result.
 *
 * Steps:
 *   1. Load property + owner context
 *   2. Fetch ATTOM property detail + AVM in parallel
 *   3. Normalize to NormalizedScreeningResult
 *   4. Persist artifact (audit trail — always written even if step 5 fails)
 *   5. Apply result to properties materialized fields
 *   6. Return run ID and result
 *
 * Fail-closed: any error in steps 1-3 is thrown before any DB write occurs.
 * The artifact (step 4) is always written before the property patch (step 5).
 * If step 5 fails, the error is thrown but the artifact record is preserved.
 *
 * @throws Error if ATTOM_API_KEY is not configured
 * @throws Error if the property is missing required address fields
 * @throws Error if the ATTOM AVM call fails (primary data source)
 * @throws Error if the artifact or property-patch DB write fails
 */
export async function runAttomScreening(
  input: AttomScreeningInput,
): Promise<AttomScreeningRunResult> {
  // ── Step 1: Load property ──────────────────────────────────────────────
  const property = await getPropertyForScreening(input.propertyId);

  const now = new Date();
  const completedAt = now.toISOString();
  const expiresAt = addDaysIso(now, ATTOM_SCREENING_TTL_DAYS);

  // ── Step 2: Fetch ATTOM data ───────────────────────────────────────────
  const raw: AttomRawComposite = await fetchAttomScreeningData({
    addressLine1: property.address_line1!,
    city: property.city!,
    state: property.state!,
    zipCode: property.postal_code,
  });

  // ── Step 3: Normalize ─────────────────────────────────────────────────
  // Resolve best available owner-declared debt.  Priority:
  //   1. has_secured_property_debt = true  → secured_property_debt_amount (underwriting)
  //   2. has_secured_property_debt = false → 0 (explicitly declared none)
  //   3. has_secured_property_debt = null  → total_known_debt_amount (intake fallback)
  //   4. All null                          → null (not declared; skips debt comparison)
  const ownerDeclaredDebt =
    property.has_secured_property_debt === true
      ? (property.secured_property_debt_amount ?? 0)
      : property.has_secured_property_debt === false
        ? 0
        : (property.total_known_debt_amount ?? null);

  const context = {
    propertyId: property.id,
    ownerDeclaredDebt,
    ownerStatedFmv: property.owner_stated_fmv,
    currentControllingFmv: property.latest_verified_fmv,
    ownerUserId: property.owner_user_id,
  };

  const result = normalizeAttomScreening(raw, context);

  // Source key for deduplication: canonical address components
  const sourceKey = [
    property.address_line1?.trim().toLowerCase() ?? "",
    property.city?.trim().toLowerCase() ?? "",
    property.state?.trim().toLowerCase() ?? "",
    property.postal_code?.trim().toLowerCase() ?? "",
  ].join("|");

  // ── Step 4: Persist artifact ───────────────────────────────────────────
  // Always write before the property patch so the run record exists even
  // if the property update fails.
  const runRow = await persistScreeningArtifact({
    propertyId: property.id,
    requestedBy: input.requestedBy ?? null,
    completedAt,
    expiresAt,
    result,
    rawPayload: raw,
    sourceKey,
    requestParams: {
      addressLine1: property.address_line1,
      city: property.city,
      state: property.state,
      zipCode: property.postal_code ?? null,
    },
  });

  // ── Step 5: Apply result to property ──────────────────────────────────
  await applyScreeningResultToProperty({
    propertyId: property.id,
    result,
    expiresAt,
    ownerUserId: property.owner_user_id,
  });

  return { runId: runRow.id, result };
}
