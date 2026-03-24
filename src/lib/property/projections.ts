/**
 * Property data projections for privacy isolation.
 *
 * Three tiers:
 *   PublicPropertyShape    – buyer-facing: no identity, no underwriting
 *   HomeownerPropertyShape – owner's own property: includes debt status + address + intake fields
 *   AdminPropertyShape     – full underwriting data for internal ops
 *
 * All buyer-facing API routes must project through toPublicProperty().
 * The homeowner API (me/properties) uses toHomeownerProperty() for owned rows
 * and toClaimableProperty() for cross-user claimable rows.
 * Admin routes may use the full DB row directly via service client.
 */

// ============================================================
// Public (buyer-visible) shape
// ============================================================

export type PublicPropertyShape = {
  id: string;
  status: string;
  owner_user_id: string | null;
  ownership_status: string | null;
};

export function toPublicProperty(row: any): PublicPropertyShape {
  return {
    id: row.id,
    status: row.status,
    owner_user_id: row.owner_user_id ?? null,
    ownership_status: row.ownership_status ?? null,
  };
}

// ============================================================
// Homeowner (owner's own property)
// Includes debt DECLARATION STATUS only — not amounts/FMV/LTV ratios.
// Also includes Sprint 16 intake fields (homeowner-entered) for edit reload.
// Max accessible cash, FMV, and ltv_policy_ratio are private underwriting
// outputs excluded from all user-facing shapes.
// ============================================================

export type HomeownerPropertyShape = {
  id: string;
  address_line1: string;
  address_line2: string | null;
  city: string | null;
  state: string;
  postal_code: string;
  address_display: string;
  status: string;
  ownership_status: string | null;
  is_private: boolean;
  owner_user_id: string | null;
  claimed_by_user_id: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  // Debt declaration (what the owner submitted — not underwriting outputs)
  has_secured_property_debt: boolean | null;
  secured_property_debt_amount: number | null;
  secured_debt_verification_status: string | null;
  secured_debt_fresh_until: string | null;
  // Sprint 16 intake fields (homeowner-entered, returned for edit reload)
  ownership_type: string | null;
  occupancy_use: string | null;
  occupancy_use_other: string | null;
  major_condition_issue: string | null;
  major_condition_issue_details: string | null;
  known_liens_and_claims: string[] | null;
  total_known_debt_amount: number | null;
  total_known_debt_confidence: string | null;
  debt_statement_availability: string | null;
  title_claims_known: string | null;
  title_claims_details: string | null;
  owner_stated_fmv: number | null;
  owner_stated_fmv_confidence: string | null;
  owner_stated_fmv_source: string | null;
  owner_stated_fmv_source_other: string | null;
  willing_to_proceed_formal_review: string | null;
  // Routing extras (set by the fetcher, not always present)
  visibility?: string;
  claim_thread_id?: string | null;
  claim_deal_id?: string | null;
  claim_thread_status?: string | null;
};

export function toHomeownerProperty(
  row: any,
  extras?: {
    address_display?: string;
    visibility?: string;
    claim_thread_id?: string | null;
    claim_deal_id?: string | null;
    claim_thread_status?: string | null;
  },
): HomeownerPropertyShape {
  return {
    id: row.id,
    address_line1: row.address_line1 ?? "",
    address_line2: row.address_line2 ?? null,
    city: row.city ?? null,
    state: row.state ?? "",
    postal_code: row.postal_code ?? "",
    address_display: extras?.address_display ?? "",
    status: row.status,
    ownership_status: row.ownership_status ?? null,
    is_private: row.is_private ?? true,
    owner_user_id: row.owner_user_id ?? null,
    claimed_by_user_id: row.claimed_by_user_id ?? null,
    created_by_user_id: row.created_by_user_id ?? null,
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
    has_secured_property_debt: row.has_secured_property_debt ?? null,
    secured_property_debt_amount: row.secured_property_debt_amount ?? null,
    secured_debt_verification_status: row.secured_debt_verification_status ?? null,
    secured_debt_fresh_until: row.secured_debt_fresh_until ?? null,
    // Sprint 16 intake
    ownership_type: row.ownership_type ?? null,
    occupancy_use: row.occupancy_use ?? null,
    occupancy_use_other: row.occupancy_use_other ?? null,
    major_condition_issue: row.major_condition_issue ?? null,
    major_condition_issue_details: row.major_condition_issue_details ?? null,
    known_liens_and_claims: row.known_liens_and_claims ?? null,
    total_known_debt_amount: row.total_known_debt_amount ?? null,
    total_known_debt_confidence: row.total_known_debt_confidence ?? null,
    debt_statement_availability: row.debt_statement_availability ?? null,
    title_claims_known: row.title_claims_known ?? null,
    title_claims_details: row.title_claims_details ?? null,
    owner_stated_fmv: row.owner_stated_fmv ?? null,
    owner_stated_fmv_confidence: row.owner_stated_fmv_confidence ?? null,
    owner_stated_fmv_source: row.owner_stated_fmv_source ?? null,
    owner_stated_fmv_source_other: row.owner_stated_fmv_source_other ?? null,
    willing_to_proceed_formal_review: row.willing_to_proceed_formal_review ?? null,
    visibility: extras?.visibility,
    claim_thread_id: extras?.claim_thread_id ?? null,
    claim_deal_id: extras?.claim_deal_id ?? null,
    claim_thread_status: extras?.claim_thread_status ?? null,
  };
}

// ============================================================
// Claimable property (cross-user: this user does NOT own it)
// Minimal public-safe shape — no underwriting, no debt info, no intake.
// ============================================================

export type ClaimablePropertyShape = {
  id: string;
  address_line1: string;
  address_line2: string | null;
  city: string | null;
  state: string;
  postal_code: string;
  address_display: string;
  status: string;
  ownership_status: string | null;
  is_private: boolean;
  owner_user_id: string | null;
  claimed_by_user_id: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  visibility: "claimable";
  claim_thread_id: string | null;
  claim_deal_id: string | null;
  claim_thread_status: string | null;
};

export function toClaimableProperty(
  row: any,
  extras: {
    address_display: string;
    claim_thread_id: string | null;
    claim_deal_id: string | null;
    claim_thread_status: string | null;
  },
): ClaimablePropertyShape {
  return {
    id: row.id,
    address_line1: row.address_line1 ?? "",
    address_line2: row.address_line2 ?? null,
    city: row.city ?? null,
    state: row.state ?? "",
    postal_code: row.postal_code ?? "",
    address_display: extras.address_display,
    status: row.status,
    ownership_status: row.ownership_status ?? null,
    is_private: row.is_private ?? true,
    owner_user_id: row.owner_user_id ?? null,
    claimed_by_user_id: row.claimed_by_user_id ?? null,
    created_by_user_id: row.created_by_user_id ?? null,
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
    visibility: "claimable",
    claim_thread_id: extras.claim_thread_id,
    claim_deal_id: extras.claim_deal_id,
    claim_thread_status: extras.claim_thread_status,
  };
}

// ============================================================
// Admin shape (full underwriting — service client only)
// ============================================================

export type AdminPropertyShape = HomeownerPropertyShape & {
  secured_property_debt_amount: number | null;
  secured_debt_certified_at: string | null;
  secured_debt_last_verified_at: string | null;
  latest_verified_fmv: number | null;
  fmv_verified_at: string | null;
  fmv_verification_source: string | null;
  ltv_policy_ratio: number | null;
  max_accessible_cash_current: number | null;
  review_notes: string | null;
  reviewed_at: string | null;
  verified_at: string | null;
};
