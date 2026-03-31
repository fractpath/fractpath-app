/**
 * ATTOM Data Solutions HTTP client.
 *
 * Provides minimal typed wrappers for the two ATTOM endpoints consumed by the
 * enhanced screening flow:
 *   - /propertyapi/v1.0.0/property/expandedprofile  (owner identity signals)
 *   - /propertyapi/v1.0.0/attomavm/detail           (AVM + equity signals)
 *
 * No domain logic lives here — all normalization is in normalize.ts.
 * Configuration is loaded from env vars at call time (not module init) so
 * tests can override them without reloading modules.
 */

import type {
  AttomAvmDetailResponse,
  AttomPropertyDetailResponse,
  AttomRawComposite,
} from "./types";

// ────────────────────────────────────────────────────────────────────────────
// Configuration
// ────────────────────────────────────────────────────────────────────────────

function getAttomConfig(): { apiKey: string; baseUrl: string } {
  const apiKey = process.env.ATTOM_API_KEY;
  const baseUrl =
    process.env.ATTOM_BASE_URL ?? "https://api.gateway.attomdata.com";

  if (!apiKey) {
    throw new Error(
      "Missing ATTOM_API_KEY — set this secret before using ATTOM-enhanced screening",
    );
  }

  return { apiKey, baseUrl: baseUrl.replace(/\/+$/, "") };
}

// ────────────────────────────────────────────────────────────────────────────
// Core fetch helper
// ────────────────────────────────────────────────────────────────────────────

async function attomFetch<T>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const { apiKey, baseUrl } = getAttomConfig();

  const url = new URL(`${baseUrl}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value.trim().length > 0) {
      url.searchParams.set(key, value);
    }
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      accept: "application/json",
      apikey: apiKey,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `ATTOM request failed (${res.status}): ${body || res.statusText}`,
    );
  }

  return res.json() as Promise<T>;
}

// ────────────────────────────────────────────────────────────────────────────
// Address param builder
// ────────────────────────────────────────────────────────────────────────────

type AddressInput = {
  addressLine1: string;
  city: string;
  state: string;
  zipCode?: string | null;
};

/**
 * ATTOM expects address components as two params:
 *   address1 = street line  (e.g. "123 Main St")
 *   address2 = city + state + zip  (e.g. "Springfield IL 62701")
 *
 * The API does NOT accept the four-field breakdown used by some other providers.
 */
function buildAddressParams(input: AddressInput): Record<string, string> {
  const address2Parts = [
    input.city.trim(),
    input.state.trim(),
    (input.zipCode ?? "").trim(),
  ].filter(Boolean);

  return {
    address1: input.addressLine1.trim(),
    address2: address2Parts.join(" "),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Endpoint-specific fetchers
// ────────────────────────────────────────────────────────────────────────────

export async function fetchAttomPropertyDetail(
  input: AddressInput,
): Promise<AttomPropertyDetailResponse> {
  return attomFetch<AttomPropertyDetailResponse>(
    "/propertyapi/v1.0.0/property/expandedprofile",
    buildAddressParams(input),
  );
}

export async function fetchAttomAvmDetail(
  input: AddressInput,
): Promise<AttomAvmDetailResponse> {
  return attomFetch<AttomAvmDetailResponse>(
    "/propertyapi/v1.0.0/attomavm/detail",
    buildAddressParams(input),
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Composite screening fetch
// ────────────────────────────────────────────────────────────────────────────

/**
 * Fetches both ATTOM data sources in parallel and returns the composite raw
 * payload ready for normalization.
 *
 * Behaviour on partial failure:
 *   - If the AVM call fails → throws (AVM is the primary signal; without it
 *     we cannot produce a useful screening result).
 *   - If the property-detail call fails → logs and continues with
 *     propertyDetail=null (owner-match signals will be unavailable but the
 *     AVM result can still drive the outcome).
 *
 * Callers should treat a returned composite with propertyDetail=null as a
 * reduced-confidence result and check ownerMatchResult.matched in the
 * normalized output.
 */
export async function fetchAttomScreeningData(
  input: AddressInput,
): Promise<AttomRawComposite> {
  const fetchedAt = new Date().toISOString();

  const [propertyDetailOutcome, avmDetailOutcome] = await Promise.allSettled([
    fetchAttomPropertyDetail(input),
    fetchAttomAvmDetail(input),
  ]);

  if (avmDetailOutcome.status === "rejected") {
    const msg =
      avmDetailOutcome.reason instanceof Error
        ? avmDetailOutcome.reason.message
        : String(avmDetailOutcome.reason);
    throw new Error(`ATTOM AVM call failed: ${msg}`);
  }

  const propertyDetail =
    propertyDetailOutcome.status === "fulfilled"
      ? (propertyDetailOutcome.value.property?.[0] ?? null)
      : null;

  if (propertyDetailOutcome.status === "rejected") {
    const msg =
      propertyDetailOutcome.reason instanceof Error
        ? propertyDetailOutcome.reason.message
        : String(propertyDetailOutcome.reason);
    console.warn("ATTOM_PROPERTY_DETAIL_FAILED", msg);
  }

  const avmDetail = avmDetailOutcome.value.property?.[0] ?? null;

  return { propertyDetail, avmDetail, fetchedAt };
}
