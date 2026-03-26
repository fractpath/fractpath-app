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
} from "./providers/rentcast";

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

type FetchProfileResult = {
  runId: string;
  summary: PropertyReviewSummaryRow;
};

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

    const firstRecord = response[0];
    if (!firstRecord) {
      throw new Error("RentCast returned no property records");
    }

    const normalized = normalizeRentcastPropertyProfile(firstRecord);

    await completePropertyProfileRun({
      runId: run.id,
      propertyId: property.id,
      provider: PROVIDER,
      completedAt,
      expiresAt,
      vendorRecordId: firstRecord.id ?? null,
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

    return {
      runId: run.id,
      summary,
    };
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
