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
  AttomHomeEquityDetailResponse,
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
 * Callers should treat homeEquityDetail=null as "current balance unknown" and
 * check debt discrepancy notes in the normalized result for the reason.
 */
export async function fetchAttomScreeningData(
  input: AddressInput,
): Promise<AttomRawComposite> {
  const fetchedAt = new Date().toISOString();

  const [propertyDetailOutcome, avmDetailOutcome, homeEquityDetailOutcome] =
    await Promise.allSettled([
      fetchAttomPropertyDetail(input),
      fetchAttomAvmDetail(input),
      fetchAttomHomeEquityDetail(input),
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

  const homeEquityDetail =
    homeEquityDetailOutcome.status === "fulfilled"
      ? (homeEquityDetailOutcome.value.property?.[0] ?? null)
      : null;

  if (homeEquityDetailOutcome.status === "rejected") {
    const msg =
      homeEquityDetailOutcome.reason instanceof Error
        ? homeEquityDetailOutcome.reason.message
        : String(homeEquityDetailOutcome.reason);
    console.warn("ATTOM_HOME_EQUITY_DETAIL_FAILED", msg);
  }

  return { propertyDetail, avmDetail, homeEquityDetail, fetchedAt };
}
