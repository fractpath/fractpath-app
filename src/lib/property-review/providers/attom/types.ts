/**
 * Raw ATTOM Data Solutions API response shapes.
 *
 * Only fields actually consumed by the normalization adapter are defined here.
 * All fields are optional to reflect ATTOM's variable payload coverage and
 * to survive fields that are missing when the API subscription tier does not
 * include them.
 *
 * Two ATTOM endpoints are used for the enhanced screening flow:
 *   1. /propertyapi/v1.0.0/property/detailmortgageowner  — owner identity + mortgage/lien signals
 *   2. /propertyapi/v1.0.0/attomavm/detail               — AVM + home equity signals
 *
 * Do NOT add fields that are not consumed by normalize.ts or AdminAttomScreeningPanel —
 * keep this file as narrow as possible so it does not drift from actual adapter usage.
 *
 * NOTE on /valuation/homeequity:
 *   There is no separate /valuation/homeequity endpoint in ATTOM's standard API gateway.
 *   The home equity fields (estEquity, estEquityPct, estEstimatedValue) are returned by
 *   /attomavm/detail under the homeEquity sub-object. That endpoint is the correct
 *   source for equity signals at the current subscription tier.
 */

// ────────────────────────────────────────────────────────────────────────────
// Shared sub-shapes
// ────────────────────────────────────────────────────────────────────────────

export type AttomIdentifier = {
  attomId?: number | null;
  apn?: string | null;
  fips?: string | null;
};

/** Situs address fields as returned in ATTOM property responses. */
export type AttomSitusAddress = {
  line1?: string | null;
  /** City (ATTOM calls this "locality"). */
  locality?: string | null;
  /** State abbreviation (ATTOM calls this "countrySubd"). */
  countrySubd?: string | null;
  /** ZIP code (ATTOM calls this "postal1"). */
  postal1?: string | null;
  /** Match code for how well the address matched ATTOM's record. */
  matchCode?: string | null;
};

// ────────────────────────────────────────────────────────────────────────────
// detailmortgageowner response shapes
// (supersedes the previous expandedprofile-only shapes; the endpoint is a
// superset of expandedprofile — it returns the same owner + property summary
// fields plus mortgage/lien records)
// ────────────────────────────────────────────────────────────────────────────

export type AttomOwnerPerson = {
  lastName?: string | null;
  firstNameAndMi?: string | null;
};

/**
 * Ownership fields from ATTOM's detailmortgageowner.
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

/**
 * Mortgage/lien record from ATTOM's detailmortgageowner endpoint.
 *
 * ATTOM typically returns the most recent or primary lien record.
 * The `amount` field is the original loan amount at origination — it is NOT
 * the current amortized balance. Use `/attomavm/detail` homeEquity signals
 * (estEquity, estEstimatedValue) for an estimated current equity/debt picture.
 *
 * All fields are optional because:
 *   (a) they are subscription-gated at ATTOM's API tier
 *   (b) some properties have no recorded mortgage (e.g. owned free-and-clear)
 */
export type AttomMortgage = {
  /** Original loan amount at origination (dollars). NOT the current balance. */
  amount?: number | null;
  /** Loan origination date (ISO or ATTOM date string). */
  date?: string | null;
  /** Annual interest rate as a percentage (e.g. 3.75 = 3.75%). */
  interestRate?: number | null;
  /** ATTOM loan type code (e.g. "CV" = conventional, "FH" = FHA). */
  loanTypeCode?: string | null;
  /** Deed type recorded at origination. */
  deedType?: string | null;
  /** Loan term in months. */
  term?: number | null;
  /** Maturity / due date of the loan. */
  dueDate?: string | null;
  /** Equity flag — ATTOM indicator that the loan is a home equity product. */
  equityFlag?: string | null;
  /** Refi flag — ATTOM indicator that the loan is a refinance. */
  refiFlag?: string | null;
};

/**
 * Property record returned by /property/detailmortgageowner.
 * This is a superset of the old expandedprofile record — same owner/summary
 * fields plus the mortgage array.
 */
export type AttomPropertyDetailRecord = {
  identifier?: AttomIdentifier | null;
  address?: AttomSitusAddress | null;
  summary?: AttomSummary | null;
  owner?: AttomOwner | null;
  /**
   * Array of mortgage/lien records. Most properties have one primary record.
   * ATTOM may return multiple records for properties with multiple liens.
   * Only the first record is used by the normalizer.
   */
  mortgage?: AttomMortgage[] | null;
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
    /** ATTOM AVM scr (score) field if available. */
    scr?: number | null;
  } | null;
  /** Publication date of the AVM model run, if provided. */
  pubDate?: string | null;
};

/**
 * ATTOM's estimated home equity signals (from attomavm/detail).
 * estEquity = estimated market value minus estimated outstanding liens.
 * This is used as a secondary debt-discrepancy signal (estEquity → implied debt).
 *
 * NOTE: These are the canonical equity fields for our implementation. There is
 * no separate /valuation/homeequity endpoint — this is the correct source.
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
  /** First record from /property/detailmortgageowner, or null if unavailable. */
  propertyDetail: AttomPropertyDetailRecord | null;
  /** First record from /attomavm/detail, or null if unavailable. */
  avmDetail: AttomAvmRecord | null;
  /** ISO timestamp of when the ATTOM calls were initiated. */
  fetchedAt: string;
};
