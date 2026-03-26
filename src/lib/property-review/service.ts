import { createAdminClient } from "@/lib/supabase/admin";
import {
  completeAvmRun,
  completePropertyProfileRun,
  createPropertyReviewRun,
  failPropertyReviewRun,
  getPropertyReviewSummary,
  updatePropertyReviewSummaryForAvm,
  updatePropertyReviewSummaryForProfile,
  type PropertyReviewSummaryRow,
} from "./repository";
import {
  fetchRentcastAvm,
  fetchRentcastPropertyRecord,
  fetchRentcastPropertyRecordExact,
  normalizeRentcastAvm,
  normalizeRentcastPropertyProfile,
  type PropertyReviewProvider,
  type RentcastPropertyRecord,
} from "./providers/rentcast";

// ProfileCandidate is a typed vendor record surface — structurally equivalent
// to RentcastPropertyRecord so it can be passed directly into normalization.
export type ProfileCandidate = RentcastPropertyRecord;

type PropertyAddressInput = {
  propertyId: string;
  requestedBy?: string | null;
};

type PropertyAddressRecord = {
  id: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
};

// Discriminated union: exact canonical match auto-persists;
// non-exact matches require admin confirmation.
type FetchProfileResult =
  | { matched: true; runId: string; summary: PropertyReviewSummaryRow }
  | { matched: false; runId: string; candidates: ProfileCandidate[] };

type FetchAvmResult = {
  runId: string;
  summary: PropertyReviewSummaryRow;
};

const PROFILE_TTL_DAYS = Number(
  process.env.PROPERTY_REVIEW_PROFILE_TTL_DAYS ?? "180",
);
const AVM_TTL_DAYS = Number(process.env.PROPERTY_REVIEW_AVM_TTL_DAYS ?? "30");
const PROVIDER: PropertyReviewProvider = "rentcast";

function addDaysIso(input: Date, days: number): string {
  const next = new Date(input);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}

async function getPropertyAddressOrThrow(
  propertyId: string,
): Promise<PropertyAddressRecord> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("properties")
    .select("id, address_line1, city, state, postal_code")
    .eq("id", propertyId)
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to load property address: ${error?.message ?? "unknown error"}`,
    );
  }

  const property = data as PropertyAddressRecord;

  if (!property.address_line1 || !property.city || !property.state) {
    throw new Error(
      "Property is missing required address fields for vendor lookup",
    );
  }

  return property;
}

function buildSourceKey(address: PropertyAddressRecord): string {
  return [
    address.address_line1?.trim().toLowerCase() ?? "",
    address.city?.trim().toLowerCase() ?? "",
    address.state?.trim().toLowerCase() ?? "",
    address.postal_code?.trim().toLowerCase() ?? "",
  ].join("|");
}

const SUFFIX_MAP: Record<string, string> = {
  street: "st",
  road: "rd",
  drive: "dr",
  avenue: "ave",
  court: "ct",
  lane: "ln",
};

function normalizeAddressToken(value: string): string {
  let s = value.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  s = s.replace(/\s+/g, " ");
  const words = s.split(" ");
  const normalized = words.map((w) => SUFFIX_MAP[w] ?? w);
  return normalized.join(" ");
}

// Sanity check for the exact-address-first result: confirms the returned record's
// normalized line1 matches the local property line1.
function isExactAddressMatch(
  record: RentcastPropertyRecord,
  property: PropertyAddressRecord,
): boolean {
  return (
    normalizeAddressToken(record.addressLine1 ?? "") ===
    normalizeAddressToken(property.address_line1 ?? "")
  );
}

type ScoredCandidate = {
  record: RentcastPropertyRecord;
  score: number;
};

// Used only for ordering fallback search candidates surfaced for admin review.
function scorePropertyRecordCandidates(
  records: RentcastPropertyRecord[],
  property: PropertyAddressRecord,
): ScoredCandidate[] {
  const refLine1 = normalizeAddressToken(property.address_line1 ?? "");
  const refCity = normalizeAddressToken(property.city ?? "");
  const refState = normalizeAddressToken(property.state ?? "");
  const refZip = (property.postal_code ?? "").trim();

  return records
    .map((record) => {
      let score = 0;
      if (normalizeAddressToken(record.addressLine1 ?? "") === refLine1) score += 10;
      if (normalizeAddressToken(record.city ?? "") === refCity) score += 3;
      if (normalizeAddressToken(record.state ?? "") === refState) score += 2;
      if ((record.zipCode ?? "").trim() === refZip) score += 3;
      return { record, score };
    })
    .sort((a, b) => b.score - a.score);
}

export async function fetchPropertyProfileForReview(
  input: PropertyAddressInput,
): Promise<FetchProfileResult> {
  const property = await getPropertyAddressOrThrow(input.propertyId);
  const requestedAt = new Date();
  const completedAt = requestedAt.toISOString();
  const expiresAt = addDaysIso(requestedAt, PROFILE_TTL_DAYS);

  const run = await createPropertyReviewRun({
    propertyId: property.id,
    provider: PROVIDER,
    artifactType: "property_profile",
    requestedBy: input.requestedBy ?? null,
    sourceKey: buildSourceKey(property),
    requestParams: {
      addressLine1: property.address_line1,
      city: property.city,
      state: property.state,
      zipCode: property.postal_code,
    },
  });

  // ── Primary path: exact-address-first subject resolution ──────────────────
  // Send the full canonical address as a single string. RentCast resolves this
  // to a specific subject property rather than performing a broad area search.
  // A single result that passes the line1 sanity check is auto-persisted.
  let exactRecord: RentcastPropertyRecord | null = null;
  let exactResponse: RentcastPropertyRecord[] = [];

  try {
    exactResponse = await fetchRentcastPropertyRecordExact({
      addressLine1: property.address_line1!,
      city: property.city!,
      state: property.state!,
      zipCode: property.postal_code,
    });

    if (exactResponse.length === 1 && isExactAddressMatch(exactResponse[0], property)) {
      exactRecord = exactResponse[0];
    }

    if (exactRecord) {
      const normalized = normalizeRentcastPropertyProfile(exactRecord);

      await completePropertyProfileRun({
        runId: run.id,
        propertyId: property.id,
        provider: PROVIDER,
        completedAt,
        expiresAt,
        vendorRecordId: exactRecord.id ?? null,
        rawPayload: exactResponse,
        normalizedPayload: normalized,
      });

      const summary = await updatePropertyReviewSummaryForProfile({
        propertyId: property.id,
        runId: run.id,
        provider: PROVIDER,
        fetchedAt: completedAt,
        expiresAt,
      });

      return { matched: true, runId: run.id, summary };
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown RentCast profile fetch error";

    await failPropertyReviewRun({ runId: run.id, errorMessage: message });
    throw error;
  }

  // ── Fallback path: component-based search for admin candidate review ───────
  // Exact resolution returned no unambiguous match. Demote to search and surface
  // the top candidates for admin explicit selection. This run is marked failed;
  // a new run is created when the admin confirms a candidate.
  let candidates: ProfileCandidate[] = [];
  try {
    const searchResponse = await fetchRentcastPropertyRecord({
      addressLine1: property.address_line1!,
      city: property.city!,
      state: property.state!,
      zipCode: property.postal_code,
    });
    const scored = scorePropertyRecordCandidates(searchResponse, property);
    candidates = scored.slice(0, 3).map((c) => c.record);
  } catch {
    // Fallback search failure is non-fatal; candidates remain empty and the
    // admin will see the no-match state with no candidates to select from.
  }

  await failPropertyReviewRun({
    runId: run.id,
    errorMessage: "No exact canonical match. Admin selection required.",
  });

  return { matched: false, runId: run.id, candidates };
}

export async function confirmProfileCandidate(input: {
  propertyId: string;
  requestedBy?: string | null;
  candidate: ProfileCandidate;
}): Promise<{ runId: string; summary: PropertyReviewSummaryRow }> {
  const property = await getPropertyAddressOrThrow(input.propertyId);
  const requestedAt = new Date();
  const completedAt = requestedAt.toISOString();
  const expiresAt = addDaysIso(requestedAt, PROFILE_TTL_DAYS);

  const run = await createPropertyReviewRun({
    propertyId: property.id,
    provider: PROVIDER,
    artifactType: "property_profile",
    requestedBy: input.requestedBy ?? null,
    sourceKey: buildSourceKey(property),
    requestParams: {
      addressLine1: property.address_line1,
      city: property.city,
      state: property.state,
      zipCode: property.postal_code,
    },
  });

  try {
    const normalized = normalizeRentcastPropertyProfile(input.candidate);

    await completePropertyProfileRun({
      runId: run.id,
      propertyId: property.id,
      provider: PROVIDER,
      completedAt,
      expiresAt,
      vendorRecordId: input.candidate.id ?? null,
      rawPayload: input.candidate,
      normalizedPayload: normalized,
    });

    const summary = await updatePropertyReviewSummaryForProfile({
      propertyId: property.id,
      runId: run.id,
      provider: PROVIDER,
      fetchedAt: completedAt,
      expiresAt,
    });

    return { runId: run.id, summary };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown error during candidate confirmation";

    await failPropertyReviewRun({
      runId: run.id,
      errorMessage: message,
    });

    throw error;
  }
}

export async function fetchAvmForReview(
  input: PropertyAddressInput,
): Promise<FetchAvmResult> {
  const property = await getPropertyAddressOrThrow(input.propertyId);
  const requestedAt = new Date();
  const completedAt = requestedAt.toISOString();
  const expiresAt = addDaysIso(requestedAt, AVM_TTL_DAYS);

  const run = await createPropertyReviewRun({
    propertyId: property.id,
    provider: PROVIDER,
    artifactType: "avm",
    requestedBy: input.requestedBy ?? null,
    sourceKey: buildSourceKey(property),
    requestParams: {
      addressLine1: property.address_line1,
      city: property.city,
      state: property.state,
      zipCode: property.postal_code,
    },
  });

  try {
    const response = await fetchRentcastAvm({
      addressLine1: property.address_line1!,
      city: property.city!,
      state: property.state!,
      zipCode: property.postal_code,
    });

    const normalized = normalizeRentcastAvm(response);

    await completeAvmRun({
      runId: run.id,
      propertyId: property.id,
      provider: PROVIDER,
      completedAt,
      expiresAt,
      rawPayload: response,
      normalizedPayload: normalized,
    });

    const summary = await updatePropertyReviewSummaryForAvm({
      propertyId: property.id,
      runId: run.id,
      provider: PROVIDER,
      fetchedAt: completedAt,
      expiresAt,
      normalizedAvm: normalized,
    });

    return {
      runId: run.id,
      summary,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown RentCast AVM fetch error";

    await failPropertyReviewRun({
      runId: run.id,
      errorMessage: message,
    });

    throw error;
  }
}

export async function getPropertyReviewSummaryForProperty(
  propertyId: string,
): Promise<PropertyReviewSummaryRow | null> {
  return getPropertyReviewSummary(propertyId);
}
