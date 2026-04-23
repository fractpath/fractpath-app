/**
 * Centralized workflow email helper.
 *
 * Provides:
 *   - `sendWorkflowEmail` — non-throwing delivery via the existing inline Resend path.
 *   - `resolveWorkflowContacts` — resolves owner + buyer contacts from a propertyId or dealId.
 *   - `formatPropertyAddress` — canonical address string for email copy.
 *
 * Design constraints:
 *   - Owner emails may reference property/deal context freely.
 *   - Buyer emails use abstracted language only — no provider names, debt amounts, or admin rationale.
 *   - Silent ATTOM reruns with no material change must NOT trigger emails; that check
 *     is performed by the caller (route handler) before invoking sendWorkflowEmail.
 *   - All sends are non-throwing; errors are returned, not propagated.
 *   - Template-backed offer/share email flows are not touched here.
 */

import { sendInlineEmail } from "@/lib/email/sendInlineEmail";

const FROM_ADDRESS =
  process.env.NOTIFICATION_FROM_EMAIL ?? "FractPath <noreply@updates.fractpath.com>";

const APP_BASE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://fractpath.com").replace(/\/$/, "");

// ────────────────────────────────────────────────────────────────────────────
// Event registry
// ────────────────────────────────────────────────────────────────────────────

/**
 * Owner-audience events (property-side and deal-side).
 * These may reference property context; never expose admin rationale or raw
 * provider data beyond what is summarized here.
 */
export type OwnerWorkflowEmailEvent =
  | "PROPERTY_VERIFIED_APPRAISAL_READY"
  | "PROPERTY_VERIFICATION_REVIEW_REQUIRED"
  | "PROPERTY_VERIFICATION_UPDATED"
  | "PROPERTY_MANUAL_REVIEW_COMPLETED"
  | "PROPERTY_DEBT_VERIFICATION_UPDATED"
  | "DEAL_TERMS_INELIGIBLE_OWNER"
  | "NEGOTIATION_REENGAGEMENT_REQUIRED_OWNER";

/**
 * Buyer-audience events (deal-side only).
 * Copy must be abstract — no ATTOM/debt/appraisal/admin-rationale details.
 */
export type BuyerWorkflowEmailEvent =
  | "DEAL_UNDER_VERIFICATION_REVIEW"
  | "DEAL_VERIFICATION_REVIEW_COMPLETED"
  | "DEAL_TERMS_NO_LONGER_ELIGIBLE_BUYER"
  | "NEGOTIATION_REENGAGEMENT_REQUIRED_BUYER"
  | "OWNER_NOT_CONFIRMED";

export type WorkflowEmailEvent = OwnerWorkflowEmailEvent | BuyerWorkflowEmailEvent;

export type WorkflowEmailAudience = "owner" | "buyer";

// ────────────────────────────────────────────────────────────────────────────
// Email copy catalog
// ────────────────────────────────────────────────────────────────────────────

type EventCopy = {
  subject: string;
  headline: string;
  body: string;
};

const OWNER_COPY: Record<OwnerWorkflowEmailEvent, EventCopy> = {
  PROPERTY_VERIFIED_APPRAISAL_READY: {
    subject: "Your property valuation has been updated",
    headline: "Property valuation updated",
    body: "A revised valuation is now on file for your property. This updates the basis used in your scenario calculations.",
  },
  PROPERTY_VERIFICATION_REVIEW_REQUIRED: {
    subject: "Your property review requires additional attention",
    headline: "Property review in progress",
    body: "Our team is continuing to review details for your property. We may follow up with questions or requests for documentation.",
  },
  PROPERTY_VERIFICATION_UPDATED: {
    subject: "Your property details have been updated",
    headline: "Property verification updated",
    body: "Information on file for your property has been updated. Your scenario may reflect these changes.",
  },
  PROPERTY_MANUAL_REVIEW_COMPLETED: {
    subject: "Your independent appraisal review is complete",
    headline: "Independent appraisal complete",
    body: "Your independent appraisal review has been completed. The updated valuation is now reflected in your scenario.",
  },
  PROPERTY_DEBT_VERIFICATION_UPDATED: {
    subject: "Your property's secured debt information has been reviewed",
    headline: "Secured debt review updated",
    body: "Our team has completed a review of the secured debt information on file for your property.",
  },
  DEAL_TERMS_INELIGIBLE_OWNER: {
    subject: "Your scenario is currently ineligible — action may be required",
    headline: "Scenario ineligible under current terms",
    body: "Based on the information on file, your scenario does not currently meet our eligibility criteria. You may have the option to propose revised terms.",
  },
  NEGOTIATION_REENGAGEMENT_REQUIRED_OWNER: {
    subject: "Your revised scenario is ready for review",
    headline: "Revised terms available",
    body: "Your renegotiation request has been processed. You can now review and respond to the available terms.",
  },
};

const BUYER_COPY: Record<BuyerWorkflowEmailEvent, EventCopy> = {
  DEAL_UNDER_VERIFICATION_REVIEW: {
    subject: "This deal is under verification review",
    headline: "Deal under verification review",
    body: "This deal is currently being reviewed by our team. No action is needed from you at this time.",
  },
  DEAL_VERIFICATION_REVIEW_COMPLETED: {
    subject: "Property verification for this deal is complete",
    headline: "Property verification complete",
    body: "Property verification for this deal has been completed. The deal is progressing through the workflow.",
  },
  DEAL_TERMS_NO_LONGER_ELIGIBLE_BUYER: {
    subject: "This deal is no longer eligible under current terms",
    headline: "Deal ineligible under current terms",
    body: "This deal does not currently meet eligibility criteria. The deal owner has been notified and may propose revised terms.",
  },
  NEGOTIATION_REENGAGEMENT_REQUIRED_BUYER: {
    subject: "Revised terms are available for this deal",
    headline: "Revised terms available",
    body: "The owner of this deal has requested a revision to the terms. Updated terms may be available shortly.",
  },
  OWNER_NOT_CONFIRMED: {
    subject: "Owner not confirmed for your deal",
    headline: "Owner not confirmed",
    body: "The contacted recipient indicated they are not the owner of the property tied to your deal. Review the property details and update the owner if needed.",
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Options
// ────────────────────────────────────────────────────────────────────────────

export type SendWorkflowEmailOpts = {
  audience: WorkflowEmailAudience;
  eventKey: WorkflowEmailEvent;
  /** Recipient email address. */
  to: string;
  /** Optional display name for greeting. */
  recipientName?: string | null;
  /** Human-readable property address shown in owner emails. Omit for buyer emails. */
  propertyAddress?: string | null;
  /** URL for the CTA link ("View details"). */
  actionUrl?: string | null;
  /** Short status summary shown in a callout box. */
  statusLabel?: string | null;
  /** Plain-language next step for the recipient. */
  nextStep?: string | null;
  /** Optional italicized note appended below the main body. */
  note?: string | null;
};

// ────────────────────────────────────────────────────────────────────────────
// HTML builder
// ────────────────────────────────────────────────────────────────────────────

function buildHtml(opts: SendWorkflowEmailOpts, copy: EventCopy): string {
  const greeting = opts.recipientName ? `Hi ${opts.recipientName},` : "Hi,";

  const addressLine =
    opts.propertyAddress && opts.audience === "owner"
      ? `<p style="color:#555;font-size:14px;margin:0 0 12px;">Property: <strong>${opts.propertyAddress}</strong></p>`
      : "";

  const statusBox = opts.statusLabel
    ? `<div style="background:#f5f5f5;border-radius:8px;padding:14px 18px;margin:16px 0;">
         <p style="color:#111;font-weight:600;font-size:15px;margin:0;">${opts.statusLabel}</p>
       </div>`
    : "";

  const nextStepLine = opts.nextStep
    ? `<p style="color:#333;font-size:14px;">Next step: ${opts.nextStep}</p>`
    : "";

  const noteHtml =
    opts.note?.trim()
      ? `<p style="color:#555;font-size:13px;font-style:italic;">${opts.note.trim()}</p>`
      : "";

  const ctaLine = opts.actionUrl
    ? `<p style="color:#555;font-size:14px;">
         <a href="${opts.actionUrl}" style="color:#2563eb;font-weight:500;">View details</a>
       </p>`
    : "";

  return `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;">
  <h2 style="color:#111;margin-bottom:8px;">${copy.headline}</h2>
  <p style="color:#333;font-size:16px;">${greeting}</p>
  <p style="color:#333;font-size:15px;">${copy.body}</p>
  ${addressLine}
  ${statusBox}
  ${nextStepLine}
  ${noteHtml}
  ${ctaLine}
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="color:#999;font-size:12px;">
    FractPath — exploratory scenario tool. This is not a commitment or contract.
  </p>
</div>`.trim();
}

// ────────────────────────────────────────────────────────────────────────────
// Contact resolution
// ────────────────────────────────────────────────────────────────────────────

export type WorkflowContact = {
  email: string;
  name: string | null;
  userId: string | null;
};

export type WorkflowContacts = {
  owner: WorkflowContact | null;
  buyer: WorkflowContact | null;
  dealId: string | null;
};

async function resolveUserContact(svc: any, userId: string): Promise<WorkflowContact | null> {
  try {
    const { data: authUser, error: authErr } = await svc.auth.admin.getUserById(userId);
    if (authErr || !authUser?.user?.email) return null;
    const email = authUser.user.email as string;

    const { data: profile } = await (svc.from("profiles") as any)
      .select("first_name, last_name")
      .eq("id", userId)
      .maybeSingle();

    const name =
      profile?.first_name && profile?.last_name
        ? `${profile.first_name} ${profile.last_name}`
        : (profile?.first_name ?? null);

    return { email, name, userId };
  } catch {
    return null;
  }
}

const ACTIVE_THREAD_STATUSES = [
  "accepted",
  "negotiating",
  "pending_owner",
  "decision_pending",
  "closed",
];

/**
 * Resolves owner and buyer contacts for a property or deal.
 * Non-throwing — returns null contacts on any resolution failure.
 *
 * @param svc  Supabase service client (must have auth.admin access).
 * @param lookup  Pass `{ propertyId }` for property-side triggers or `{ dealId }` for deal-side triggers.
 */
export async function resolveWorkflowContacts(
  svc: any,
  lookup: { propertyId: string } | { dealId: string },
): Promise<WorkflowContacts> {
  const empty: WorkflowContacts = { owner: null, buyer: null, dealId: null };
  try {
    let thread: {
      deal_id: string;
      owner_user_id: string | null;
      buyer_user_id: string | null;
    } | null = null;

    if ("propertyId" in lookup) {
      const { data } = await (svc.from("deal_threads") as any)
        .select("deal_id, owner_user_id, buyer_user_id")
        .eq("property_id", lookup.propertyId)
        .in("status", ACTIVE_THREAD_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      thread = data ?? null;
    } else {
      const { data } = await (svc.from("deal_threads") as any)
        .select("deal_id, owner_user_id, buyer_user_id")
        .eq("deal_id", lookup.dealId)
        .in("status", ACTIVE_THREAD_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      thread = data ?? null;
    }

    if (!thread) return empty;

    const [owner, buyer] = await Promise.all([
      thread.owner_user_id
        ? resolveUserContact(svc, thread.owner_user_id)
        : Promise.resolve(null),
      thread.buyer_user_id
        ? resolveUserContact(svc, thread.buyer_user_id)
        : Promise.resolve(null),
    ]);

    return { owner, buyer, dealId: thread.deal_id };
  } catch {
    return empty;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Address formatter
// ────────────────────────────────────────────────────────────────────────────

/**
 * Builds a canonical one-line address string for display in owner emails.
 * Returns null when address_line1 is absent.
 */
export function formatPropertyAddress(prop: {
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
}): string | null {
  if (!prop.address_line1) return null;
  return [prop.address_line1, prop.city, prop.state, prop.postal_code]
    .filter(Boolean)
    .join(", ");
}

// ────────────────────────────────────────────────────────────────────────────
// URL helpers
// ────────────────────────────────────────────────────────────────────────────

export function propertyActionUrl(propertyId: string): string {
  return `${APP_BASE_URL}/properties/${propertyId}`;
}

export function dealActionUrl(dealId: string): string {
  return `${APP_BASE_URL}/deal/${dealId}`;
}

// ────────────────────────────────────────────────────────────────────────────
// Send
// ────────────────────────────────────────────────────────────────────────────

/**
 * Sends a workflow-triggered notification email via the generic inline Resend path.
 *
 * Returns `{ ok: true }` on success, `{ ok: false, error }` on failure.
 * Returns `{ ok: false, skipped }` when no copy is defined for the event/audience pair.
 *
 * This function is intentionally non-throwing so route handlers can fire-and-forget
 * without risking a crash on email delivery failure.
 */
export async function sendWorkflowEmail(
  opts: SendWorkflowEmailOpts,
): Promise<{ ok: boolean; skipped?: string; error?: string }> {
  const copyMap: Record<string, EventCopy> =
    opts.audience === "owner"
      ? (OWNER_COPY as Record<string, EventCopy>)
      : (BUYER_COPY as Record<string, EventCopy>);

  const copy = copyMap[opts.eventKey];
  if (!copy) {
    return {
      ok: false,
      skipped: `No copy defined for event "${opts.eventKey}" / audience "${opts.audience}"`,
    };
  }

  try {
    await sendInlineEmail({
      to: opts.to,
      from: FROM_ADDRESS,
      subject: copy.subject,
      html: buildHtml(opts, copy),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
