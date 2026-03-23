/**
 * Property data projections for privacy isolation.
 *
 * Three tiers:
 *   PublicPropertyShape    – buyer-facing: no identity, no underwriting
 *   HomeownerPropertyShape – owner's own property: includes debt status + address
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
// The debt amount entered by the owner is available here since they
// entered it, but max_accessible_cash, FMV, and ltv_policy_ratio
// are private underwriting outputs excluded from all user-facing shapes.
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
    visibility: extras?.visibility,
    claim_thread_id: extras?.claim_thread_id ?? null,
    claim_deal_id: extras?.claim_deal_id ?? null,
    claim_thread_status: extras?.claim_thread_status ?? null,
  };
}

// ============================================================
// Claimable property (cross-user: this user does NOT own it)
// Minimal public-safe shape — no underwriting, no debt info.
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
