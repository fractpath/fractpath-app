/**
 * ATTOM Data Solutions HTTP client.
 *
 * Provides minimal typed wrappers for the three ATTOM endpoints consumed by
 * the enhanced screening flow:
 *
 *   1. /propertyapi/v1.0.0/property/detailmortgageowner
 *      Purpose: owner / co-owner names, corporate / absentee indicators,
 *               mortgage origination metadata, lender / deed / loan date context.
 *
 *   2. /propertyapi/v1.0.0/attomavm/detail
 *      Purpose: AVM point estimate, AVM low/high, ATTOM scr confidence,
 *               AVM date / event date, match / property classification fields.
 *
 *   3. /propertyapi/v1.0.0/valuation/homeequity
 *      Purpose: current loan balance (totalEstimatedLoanBalance), lendable equity
 *               (estimatedLendableEquity), available equity (estimatedAvailableEquity),
 *               amortized loan amounts, LTV, recordLastUpdated / data freshness.
 *               This is the preferred signal for current debt and available deal cash.
 *
 * /property/detailmortgageowner supersedes the previous /property/expandedprofile call.
 * It is a superset of expandedprofile — it returns the same owner/property-summary fields
 * plus mortgage/lien records (origination amount, rate, loan type, term, due date, etc.).
 *
 * /attomavm/detail is retained because it provides the primary AVM value and
 * ATTOM scr confidence score. Its homeEquity sub-object is subscription-gated
 * and was confirmed absent at the current tier.
 *
 * /valuation/homeequity is a confirmed live endpoint. It was incorrectly documented
 * as non-existent in prior versions of this file. Audit confirmed it returns
 * amortized loan balances and lendable equity for the tested property.
 *
 * No domain logic lives here — all normalization is in normalize.ts.
 * Configuration is loaded from env vars at call time (not module init) so
 * tests can override them without reloading modules.
 */

import type {
  AttomAvmDetailResponse,
  AttomEndpointResult,
  AttomHomeEquityDetailResponse,
  AttomHomeEquityDetailRecord,
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
    "/propertyapi/v1.0.0/property/detailmortgageowner",
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

export async function fetchAttomHomeEquityDetail(
  input: AddressInput,
): Promise<AttomHomeEquityDetailResponse> {
  return attomFetch<AttomHomeEquityDetailResponse>(
    "/propertyapi/v1.0.0/valuation/homeequity",
    buildAddressParams(input),
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Per-endpoint audit helpers + composite screening fetch
// ────────────────────────────────────────────────────────────────────────────

/**
 * Builds an AttomEndpointResult from a Promise.allSettled outcome.
 * Stores the full response (before property[0] extraction) and the extracted
 * record, so the admin panel can diagnose structural mismatches (e.g. endpoint
 * returns HTTP 200 but with no property[] wrapper or an empty array).
 *
 * Uses `any` internally because the property[] field in ATTOM response types
 * is typed as `T[] | null | undefined`, which doesn't satisfy `unknown[]`.
 * The caller casts the result to the specific AttomEndpointResult<T> type.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildEndpointResult<T>(outcome: PromiseSettledResult<T>): AttomEndpointResult<T> {
  if (outcome.status === "rejected") {
    const errorMessage =
      outcome.reason instanceof Error
        ? outcome.reason.message
        : String(outcome.reason);
    return {
      status: "rejected",
      fullResponse: null,
      topLevelKeys: [],
      extractedRecord: null,
      errorMessage,
    };
  }

  const full = outcome.value;
  const asAny = full as any;
  const topLevelKeys = full != null && typeof full === "object"
    ? Object.keys(full as object)
    : [];
  const extractedRecord = (asAny?.property?.[0] ?? null) as AttomEndpointResult<T>["extractedRecord"];

  return {
    status: "fulfilled",
    fullResponse: full,
    topLevelKeys,
    extractedRecord,
    errorMessage: null,
  };
}

/**
 * Extracts the home equity record from a fulfilled /valuation/homeequity response.
 *
 * ATTOM's /valuation/homeequity follows the standard property[] wrapper pattern.
 * However, earlier API versions and some property types may return the payload
 * differently. This function tries property[0] first (canonical path) and logs
 * a diagnostic warning if the response arrived but the property[] array is absent
 * or empty — which indicates a response structure mismatch rather than a true
 * "no data" case.
 *
 * All fallback attempts are logged so the server console shows exactly which
 * path succeeded or failed, making future debugging easier.
 */
function extractHomeEquityRecord(
  full: AttomHomeEquityDetailResponse,
  address1: string,
): AttomHomeEquityDetailRecord | null {
  // ── Path 1: standard property[0] wrapper (expected canonical path) ─────
  const fromProperty = full?.property?.[0] ?? null;
  if (fromProperty != null) {
    console.log(
      `[ATTOM /valuation/homeequity] property[0] extraction succeeded for "${address1}".` +
      ` homeEquity present: ${fromProperty.homeEquity != null}.` +
      (fromProperty.homeEquity != null
        ? ` totalEstimatedLoanBalance=${fromProperty.homeEquity.totalEstimatedLoanBalance ?? "absent"}`
        + ` estimatedLendableEquity=${fromProperty.homeEquity.estimatedLendableEquity ?? "absent"}`
        + ` LTV=${fromProperty.homeEquity.LTV ?? "absent"}`
        : ""),
    );
    return fromProperty;
  }

  // ── Path 1 failed — log the top-level keys to help diagnose the structure ─
  const topKeys = full != null && typeof full === "object"
    ? Object.keys(full as object)
    : [];
  console.warn(
    `[ATTOM /valuation/homeequity] property[0] is null/absent for "${address1}".` +
    ` Top-level response keys: [${topKeys.join(", ")}].` +
    ` status=${JSON.stringify((full as any)?.status)}.` +
    ` This may indicate the response has a non-standard structure or the address was not matched.`,
  );

  // ── Path 2: response itself is a property record (no wrapper) ──────────
  // Some ATTOM endpoints return the record directly when only one result is
  // matched. This is defensive handling for undocumented response variants.
  const fullAsAny = full as any;
  if (fullAsAny?.homeEquity != null) {
    console.warn(
      `[ATTOM /valuation/homeequity] Fallback: found homeEquity at response root (no property[] wrapper). Using root record.`,
    );
    return full as unknown as AttomHomeEquityDetailRecord;
  }

  console.warn(
    `[ATTOM /valuation/homeequity] No homeEquity data found via any extraction path for "${address1}". homeEquityDetail will be null.`,
  );
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Composite screening fetch
// ────────────────────────────────────────────────────────────────────────────

/**
 * Fetches all three ATTOM data sources in parallel and returns the composite
 * raw payload ready for normalization.
 *
 * Endpoint provenance:
 *   propertyDetail    → /property/detailmortgageowner    (owner + mortgage origination)
 *   avmDetail         → /attomavm/detail                 (AVM point estimate + range + scr)
 *   homeEquityDetail  → /valuation/homeequity            (current balance + lendable equity)
 *
 * Behaviour on partial failure:
 *   - If the AVM call fails → throws (AVM is the primary FMV signal; without it
 *     we cannot produce a useful screening result).
 *   - If the property-detail call fails → logs and continues with
 *     propertyDetail=null (owner-match signals unavailable).
 *   - If the home-equity call fails → logs and continues with
 *     homeEquityDetail=null (debt discrepancy will use AVM equity fallback or
 *     skip comparison entirely).
 *
 * Per-endpoint audit is stored in _endpoints (see AttomEndpointResult type).
 * This allows the admin panel to show the exact status of each call
 * independently, including the full raw response for diagnosing structural
 * mismatches (e.g. HTTP 200 with unexpected response shape).
 */
export async function fetchAttomScreeningData(
  input: AddressInput,
): Promise<AttomRawComposite> {
  const fetchedAt = new Date().toISOString();

  console.log(
    `[ATTOM screening] Starting parallel fetch for address1="${input.addressLine1}" city="${input.city}" state="${input.state}" zip="${input.zipCode ?? ""}"`,
  );

  const [propertyDetailOutcome, avmDetailOutcome, homeEquityDetailOutcome] =
    await Promise.allSettled([
      fetchAttomPropertyDetail(input),
      fetchAttomAvmDetail(input),
      fetchAttomHomeEquityDetail(input),
    ]);

  // ── Build per-endpoint audit records ──────────────────────────────────────
  const pdEndpoint = buildEndpointResult(propertyDetailOutcome);
  const avmEndpoint = buildEndpointResult(avmDetailOutcome);
  const heEndpoint = buildEndpointResult(homeEquityDetailOutcome);

  console.log(
    `[ATTOM screening] Endpoint outcomes:` +
    ` detailmortgageowner=${pdEndpoint.status} (property[] len=${propertyDetailOutcome.status === "fulfilled" ? (propertyDetailOutcome.value.property?.length ?? 0) : "N/A"})` +
    ` attomavm/detail=${avmEndpoint.status} (property[] len=${avmDetailOutcome.status === "fulfilled" ? (avmDetailOutcome.value.property?.length ?? 0) : "N/A"})` +
    ` valuation/homeequity=${heEndpoint.status} (topLevelKeys=[${heEndpoint.topLevelKeys.join(", ")}])`,
  );

  // ── AVM is non-optional ───────────────────────────────────────────────────
  if (avmDetailOutcome.status === "rejected") {
    const msg =
      avmDetailOutcome.reason instanceof Error
        ? avmDetailOutcome.reason.message
        : String(avmDetailOutcome.reason);
    throw new Error(`ATTOM AVM call failed: ${msg}`);
  }

  // ── Extract records ───────────────────────────────────────────────────────
  const propertyDetail =
    propertyDetailOutcome.status === "fulfilled"
      ? (propertyDetailOutcome.value.property?.[0] ?? null)
      : null;

  if (propertyDetailOutcome.status === "rejected") {
    console.warn(
      `[ATTOM screening] detailmortgageowner failed: ${pdEndpoint.errorMessage}`,
    );
  }

  const avmDetail = avmDetailOutcome.value.property?.[0] ?? null;

  // /valuation/homeequity uses extractHomeEquityRecord for defensive multi-path parsing
  // and detailed diagnostic logging.
  const homeEquityDetail =
    homeEquityDetailOutcome.status === "fulfilled"
      ? extractHomeEquityRecord(homeEquityDetailOutcome.value, input.addressLine1)
      : null;

  if (homeEquityDetailOutcome.status === "rejected") {
    console.warn(
      `[ATTOM screening] valuation/homeequity failed: ${heEndpoint.errorMessage}`,
    );
  }

  return {
    propertyDetail,
    avmDetail,
    homeEquityDetail,
    fetchedAt,
    _endpoints: {
      detailmortgageowner: pdEndpoint as NonNullable<AttomRawComposite["_endpoints"]>["detailmortgageowner"],
      attomavm_detail: avmEndpoint as NonNullable<AttomRawComposite["_endpoints"]>["attomavm_detail"],
      valuation_homeequity: heEndpoint as NonNullable<AttomRawComposite["_endpoints"]>["valuation_homeequity"],
    },
  };
}
