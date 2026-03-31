/**
 * Raw ATTOM Data Solutions API response shapes.
 *
 * Only fields actually consumed by the normalization adapter are defined here.
 * All fields are optional to reflect ATTOM's variable payload coverage and
 * to survive fields that are missing when the API subscription tier does not
 * include them.
 *
 * Two ATTOM endpoints are used for the enhanced screening flow:
 *   1. /propertyapi/v1.0.0/property/expandedprofile  — owner identity signals
 *   2. /propertyapi/v1.0.0/attomavm/detail           — AVM + equity signals
 *
 * Do NOT add fields that are not consumed by normalize.ts — keep this file
 * as narrow as possible so it does not drift from actual adapter usage.
 */

// ────────────────────────────────────────────────────────────────────────────
// Shared sub-shapes
// ────────────────────────────────────────────────────────────────────────────

export type AttomIdentifier = {
  attomId?: number | null;
  apn?: string | null;
  fips?: string | null;
};

/** Situs address fields as returned in ATTOM expanded profile responses. */
export type AttomSitusAddress = {
  line1?: string | null;
  /** City (ATTOM calls this "locality"). */
  locality?: string | null;
  /** State abbreviation (ATTOM calls this "countrySubd"). */
  countrySubd?: string | null;
  /** ZIP code (ATTOM calls this "postal1"). */
  postal1?: string | null;
};

// ────────────────────────────────────────────────────────────────────────────
// expandedProfile response shapes
// ────────────────────────────────────────────────────────────────────────────

export type AttomOwnerPerson = {
  lastName?: string | null;
  firstNameAndMi?: string | null;
};

/**
 * Ownership fields from ATTOM's expandedProfile.
 * mailAddress is the tax-mailing address for the owner.
 * corporateIndicator is non-null when the title is held by an entity.
 */
export type AttomOwner = {
  owner1?: AttomOwnerPerson | null;
  owner2?: AttomOwnerPerson | null;
  mailAddress?: {
    line1?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  } | null;
  corporateIndicator?: string | null;
};

export type AttomSummary = {
  propclass?: string | null;
  proptype?: string | null;
  yearbuilt?: number | null;
  propLandUse?: string | null;
};

export type AttomPropertyDetailRecord = {
  identifier?: AttomIdentifier | null;
  address?: AttomSitusAddress | null;
  summary?: AttomSummary | null;
  owner?: AttomOwner | null;
};

export type AttomPropertyDetailResponse = {
  status?: { code?: number; msg?: string } | null;
  property?: AttomPropertyDetailRecord[] | null;
};

// ────────────────────────────────────────────────────────────────────────────
// attomavm/detail response shapes
// ────────────────────────────────────────────────────────────────────────────

export type AttomAvmAmount = {
  /** Point estimate from ATTOM AVM model. */
  value?: number | null;
  /** Lower bound of ATTOM's value confidence interval. */
  low?: number | null;
  /** Upper bound of ATTOM's value confidence interval. */
  high?: number | null;
};

export type AttomAvm = {
  amount?: AttomAvmAmount | null;
  condition?: {
    propIndicator?: string | null;
  } | null;
};

/**
 * ATTOM's estimated home equity signals.
 * estEquity = estimated market value minus estimated outstanding liens.
 * This is used as a secondary debt-discrepancy signal (estEquity → implied debt).
 */
export type AttomHomeEquity = {
  /** Estimated equity (market value minus estimated lien total). */
  estEquity?: number | null;
  /** Equity as a percentage of estimated value. */
  estEquityPct?: number | null;
  /** ATTOM's estimated market value (cross-check against avm.amount.value). */
  estEstimatedValue?: number | null;
};

export type AttomAvmRecord = {
  identifier?: AttomIdentifier | null;
  address?: AttomSitusAddress | null;
  avm?: AttomAvm | null;
  homeEquity?: AttomHomeEquity | null;
};

export type AttomAvmDetailResponse = {
  status?: { code?: number; msg?: string } | null;
  property?: AttomAvmRecord[] | null;
};

// ────────────────────────────────────────────────────────────────────────────
// Composite raw payload
// ────────────────────────────────────────────────────────────────────────────

/**
 * Combined raw payload from both ATTOM API calls.
 * Stored verbatim in property_review_runs.raw_payload for audit trail.
 * Only the first property record from each response is used by the adapter.
 */
export type AttomRawComposite = {
  /** First record from /property/expandedprofile, or null if unavailable. */
  propertyDetail: AttomPropertyDetailRecord | null;
  /** First record from /attomavm/detail, or null if unavailable. */
  avmDetail: AttomAvmRecord | null;
  /** ISO timestamp of when the ATTOM calls were initiated. */
  fetchedAt: string;
};
