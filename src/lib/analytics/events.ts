/**
 * PostHog app event catalog — client-side only.
 *
 * Import only from "use client" components or browser-safe hooks.
 * Never import from server components, API routes, or middleware.
 *
 * Rules:
 * - Fire events only after successful state transitions (post-response).
 * - Never send sensitive data: addresses, document contents, financial raw
 *   data, SSNs, private notes, or driver license data.
 * - captureAppEvent is always safe to call even if PostHog is not ready.
 */

import posthog from "posthog-js";
import { isPostHogReady } from "./posthog";
import { getSessionAttribution } from "./attribution";

// ── Event name catalog ────────────────────────────────────────────────────

export type AppEventName =
  // Acquisition / auth
  | "app_entered"
  | "signup_started"
  | "signup_completed"
  | "login_completed"
  | "logout_completed"
  | "app_opened"
  // Upper funnel / product discovery
  | "public_properties_viewed"
  | "public_property_viewed"
  | "property_detail_viewed"
  | "calculator_started"
  | "calculator_completed"
  | "signup_cta_clicked"
  | "deal_cta_clicked"
  // Invite events
  | "deal_invite_opened"
  | "owner_invite_opened"
  | "buyer_invite_opened"
  | "invite_accept_started"
  | "invite_accept_completed"
  // Property events
  | "property_started"
  | "property_created"
  | "property_claim_started"
  | "property_claim_completed"
  | "verification_started"
  | "verification_documents_uploaded"
  | "property_verification_submitted"
  | "property_verified"
  | "property_verification_failed"
  // Deal events
  | "deal_started"
  | "deal_created"
  | "deal_viewed"
  | "offer_submitted"
  | "owner_invited"
  | "buyer_invited"
  | "owner_review_started"
  | "buyer_review_started"
  | "offer_accepted"
  | "offer_countered"
  | "offer_rejected"
  | "deal_archived"
  | "deal_voided_admin"
  // Admin / review / closing
  | "admin_review_started"
  | "admin_review_completed"
  | "info_request_created"
  | "info_request_resolved"
  | "signature_packet_created"
  | "signature_packet_sent"
  | "signature_completed"
  | "deal_ready_for_deposit"
  | "deal_closed"
  // Engagement
  | "dashboard_viewed"
  | "account_page_viewed"
  | "document_center_viewed"
  | "notification_clicked"
  | "email_link_opened";

// ── Standard event properties ─────────────────────────────────────────────

export type AppEventProps = {
  source?: string;
  user_id?: string | null;
  user_role?: string | null;
  current_user_role?: string | null;
  property_id?: string | null;
  deal_id?: string | null;
  deal_thread_id?: string | null;
  /** Only state abbreviation — never full address. */
  property_state?: string | null;
  /** Only ZIP/postal code — not city or street. */
  property_zip?: string | null;
  deal_status?: string | null;
  deal_origin?: "buyer_initiated" | "owner_initiated" | "admin_seeded" | "unknown" | null;
  initiating_role?: "buyer" | "owner" | "admin" | "unknown" | null;
  invite_type?: "none" | "buyer_to_owner" | "owner_to_buyer" | "admin_to_owner" | "unknown" | null;
  /** Deal size tier — not raw dollar amount. */
  deal_size?: number | null;
  proposed_capital?: number | null;
  entry_type?: string | null;
  entry_path?: string | null;
  source_page?: string | null;
  source_event?: string | null;
  audience?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  referrer?: string | null;
  environment?: string;
  [key: string]: unknown;
};

// ── Core capture function ─────────────────────────────────────────────────

/**
 * Capture a product event with standard context attached.
 *
 * - Safe to call even if PostHog is not initialized (no-op).
 * - Automatically attaches source="app" and current session attribution.
 * - Caller-provided props override session attribution values.
 */
export function captureAppEvent(
  eventName: AppEventName,
  props: AppEventProps = {},
): void {
  if (!isPostHogReady()) return;

  const s = getSessionAttribution();

  posthog.capture(eventName, {
    source: "app",
    environment: process.env.NODE_ENV ?? "production",
    // Session attribution as default context — props can override.
    entry_type: s.session_entry_type ?? undefined,
    entry_path: s.session_entry_path ?? undefined,
    source_page: s.session_source_page ?? undefined,
    source_event: s.session_source_event ?? undefined,
    audience: s.session_audience ?? undefined,
    utm_source: s.session_utm_source ?? undefined,
    utm_medium: s.session_utm_medium ?? undefined,
    utm_campaign: s.session_utm_campaign ?? undefined,
    referrer: s.session_referrer ?? undefined,
    ...props,
  });
}
