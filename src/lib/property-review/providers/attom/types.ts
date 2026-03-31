/**
 * Raw ATTOM Data Solutions API response shapes.
 *
 * Only fields actually consumed by the normalization adapter are defined here.
 * All fields are optional to reflect ATTOM's variable payload coverage and
 * to survive fields that are missing when the API subscription tier does not
 * include them.
 *
 * Three ATTOM endpoints are used for the enhanced screening flow:
 *   1. /propertyapi/v1.0.0/property/detailmortgageowner  — owner identity + mortgage/lien signals
 *   2. /propertyapi/v1.0.0/attomavm/detail               — AVM + subscription-tier equity signals
 *   3. /propertyapi/v1.0.0/valuation/homeequity          — current loan balance, lendable equity, LTV
 *
 * NOTE on /valuation/homeequity:
 *   This endpoint IS part of ATTOM's standard API gateway and returns rich
 *   amortized-loan-balance + lendable-equity data for supported properties.
 *   It is preferred over /attomavm/detail homeEquity signals (estEquity etc.)
 *   because it provides totalEstimatedLoanBalance (current balance) rather
 *   than a derived equity estimate. The attomavm homeEquity sub-object is
 *   subscription-gated and was confirmed absent at the current tier.
 *
 * Do NOT add fields that are not consumed by normalize.ts or AdminAttomScreeningPanel —
 * keep this file as narrow as possible so it does not drift from actual adapter usage.
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
 * the current amortized balance. Use /valuation/homeequity for an estimated
 * current balance (totalEstimatedLoanBalance) and lendable equity.
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
   *
   * NOTE: In practice ATTOM returns this as a plain object (not array) at the
   * current subscription tier. The normalizer handles both formats.
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
 * These are subscription-gated: confirmed absent at the current ATTOM tier.
 * Use AttomHomeEquityDetailRecord (from /valuation/homeequity) instead for
 * current loan balance and lendable equity.
 *
 * Kept here for backward compatibility with run records stored before the
 * /valuation/homeequity endpoint was added to the screening flow.
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
// valuation/homeequity response shapes
// Confirmed as a real ATTOM endpoint returning amortized loan balance and
// lendable equity data. This is the primary source for current debt signals.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Home equity and debt data from ATTOM's /valuation/homeequity endpoint.
 *
 * This is the preferred current-balance signal. Fields reflect ATTOM's
 * amortization model for all outstanding liens, not the origination amounts
 * from the mortgage record.
 *
 * Field names match the verbatim API response (camelCase with uppercase LTV).
 */
export type AttomHomeEquityData = {
  /** Current loan-to-value ratio as a percentage (e.g. 70 = 70% LTV). */
  LTV?: number | null;
  /**
   * Estimated available equity = estimated value minus all amortized loan balances.
   * This is what the owner could theoretically access.
   */
  estimatedAvailableEquity?: number | null;
  /**
   * Estimated lendable equity = equity available within ATTOM's lending policy
   * constraints (typically at ~80% LTV). This is the more conservative figure.
   */
  estimatedLendableEquity?: number | null;
  /** First lien's estimated current amortized balance. */
  firstAmortizedLoanAmount?: number | null;
  /** Second lien's estimated current amortized balance (0 if none). */
  secondAmortizedLoanAmount?: number | null;
  /** Third lien's estimated current amortized balance (0 if none). */
  thirdAmortizedLoanAmount?: number | null;
  /** Sum of all amortized loan balances — the current total outstanding debt. */
  totalEstimatedLoanBalance?: number | null;
  /** Date when ATTOM last refreshed this estimate (YYYY-MM-DD). */
  recordLastUpdated?: string | null;
};

export type AttomHomeEquityDetailRecord = {
  identifier?: AttomIdentifier | null;
  address?: AttomSitusAddress | null;
  /**
   * AVM data is also returned by /valuation/homeequity.
   * Used as a cross-check against attomavm/detail; not the primary AVM source.
   */
  avm?: {
    eventDate?: string | null;
    amount?: {
      value?: number | null;
      low?: number | null;
      high?: number | null;
      scr?: number | null;
      valueRange?: number | null;
    } | null;
  } | null;
  homeEquity?: AttomHomeEquityData | null;
};

export type AttomHomeEquityDetailResponse = {
  status?: { code?: number; msg?: string } | null;
  property?: AttomHomeEquityDetailRecord[] | null;
};

// ────────────────────────────────────────────────────────────────────────────
// Composite raw payload
// ────────────────────────────────────────────────────────────────────────────

/**
 * Combined raw payload from all three ATTOM API calls.
 * Stored verbatim in property_review_runs.raw_payload for audit trail.
 * Only the first property record from each response is used by the adapter.
 *
 * Endpoint provenance:
 *   propertyDetail    → /property/detailmortgageowner    (owner + mortgage origination)
 *   avmDetail         → /attomavm/detail                 (AVM point estimate + range + scr)
 *   homeEquityDetail  → /valuation/homeequity            (current balance + lendable equity)
 */
export type AttomRawComposite = {
  /** First record from /property/detailmortgageowner, or null if unavailable. */
  propertyDetail: AttomPropertyDetailRecord | null;
  /** First record from /attomavm/detail, or null if unavailable. */
  avmDetail: AttomAvmRecord | null;
  /**
   * First record from /valuation/homeequity, or null if unavailable.
   * null does NOT mean the data does not exist — it means either the endpoint
   * call failed or the address was not matched. The normalizer will skip
   * debt discrepancy comparison when this is null.
   */
  homeEquityDetail: AttomHomeEquityDetailRecord | null;
  /** ISO timestamp of when the ATTOM calls were initiated. */
  fetchedAt: string;
};
