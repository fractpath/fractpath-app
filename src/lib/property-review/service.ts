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

// Minimum score for automatic persistence — requires normalized line1 match (10)
// plus city (3) + state (2) = 15. Records below this threshold are surfaced for
// admin selection and are never auto-persisted.
const EXACT_MATCH_THRESHOLD = 15;

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

type ScoredCandidate = {
  record: RentcastPropertyRecord;
  score: number;
};

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

// Returns the best record only when it meets the exact canonical match threshold.
// Records below the threshold are never auto-selected — they require admin confirmation.
function pickExactCanonicalMatch(
  records: RentcastPropertyRecord[],
  property: PropertyAddressRecord,
): RentcastPropertyRecord | null {
  const scored = scorePropertyRecordCandidates(records, property);
  const best = scored[0];
  if (!best || best.score < EXACT_MATCH_THRESHOLD) return null;
  return best.record;
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

  try {
    const response = await fetchRentcastPropertyRecord({
      addressLine1: property.address_line1!,
      city: property.city!,
      state: property.state!,
      zipCode: property.postal_code,
    });

    const matchedRecord = pickExactCanonicalMatch(response, property);

    if (!matchedRecord) {
      // No exact canonical match — do not auto-persist. Mark the run failed and
      // surface the top candidates for admin explicit selection.
      await failPropertyReviewRun({
        runId: run.id,
        errorMessage: "No exact canonical match. Admin selection required.",
      });
      const scored = scorePropertyRecordCandidates(response, property);
      const candidates: ProfileCandidate[] = scored.slice(0, 3).map((c) => c.record);
      return { matched: false, runId: run.id, candidates };
    }

    const normalized = normalizeRentcastPropertyProfile(matchedRecord);

    await completePropertyProfileRun({
      runId: run.id,
      propertyId: property.id,
      provider: PROVIDER,
      completedAt,
      expiresAt,
      vendorRecordId: matchedRecord.id ?? null,
      rawPayload: response,
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
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown RentCast profile fetch error";

    await failPropertyReviewRun({
      runId: run.id,
      errorMessage: message,
    });

    throw error;
  }
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
