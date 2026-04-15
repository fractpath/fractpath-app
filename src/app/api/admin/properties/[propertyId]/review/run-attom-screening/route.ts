/**
 * POST /api/admin/properties/[propertyId]/review/run-attom-screening
 *
 * Admin-triggered ATTOM enhanced screening run for a property.
 * Requires an authenticated admin session and ATTOM_API_KEY to be configured.
 *
 * Orchestration (delegated to attomScreeningService):
 *   1. Load property address + context from DB
 *   2. Fetch ATTOM property detail + AVM
 *   3. Normalize to canonical NormalizedScreeningResult
 *   4. Persist artifact in property_review_runs
 *   5. Apply result to properties canonical fields
 *
 * Response on success:
 *   { ok: true, propertyId, runId, outcome, nextVerificationState, becameControlling }
 *
 * Response on error:
 *   { ok: false, error: "<message>" }
 *
 * Buyer-facing surfaces are NOT affected by this endpoint.
 * No proactive badge purchase or manual appraisal flows are triggered here.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";
import { runAttomScreening } from "@/lib/property-review/attomScreeningService";
import type { NormalizedScreeningResult } from "@/lib/property/screening";
import {
  resolveWorkflowContacts,
  sendWorkflowEmail,
  formatPropertyAddress,
  propertyActionUrl,
  dealActionUrl,
  type WorkflowEmailEvent,
} from "@/lib/workflow/sendWorkflowEmail";

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

// ── Material-change notification (non-blocking) ───────────────────────────
//
// A rerun is "silent" (no email) when:
//   - ATTOM did not become controlling, AND
//   - There are no review-flag limiting factors.
//
// Otherwise we determine the appropriate owner + buyer event and send.

async function notifyAttomCompletion(opts: {
  svc: ReturnType<typeof createServiceClient>;
  propertyId: string;
  result: NormalizedScreeningResult;
  prevFmv: number | null;
  address: string | null;
  adminId: string;
}): Promise<void> {
  const { svc, propertyId, result, prevFmv, address, adminId } = opts;

  const hasReviewFlags = result.limitingFactors.some(
    (f) => f.severity === "review_required" || f.severity === "blocking",
  );
  const fmvChanged =
    result.becameControlling &&
    result.controllingFmvCandidate != null &&
    result.controllingFmvCandidate !== prevFmv;

  if (!fmvChanged && !hasReviewFlags) {
    console.log("ATTOM_NOTIFICATION_SILENT_RERUN", { propertyId, adminId });
    return;
  }

  const contacts = await resolveWorkflowContacts(svc, { propertyId });

  // Owner event selection
  let ownerEvent: WorkflowEmailEvent;
  if (fmvChanged && !hasReviewFlags) {
    ownerEvent = "PROPERTY_VERIFIED_APPRAISAL_READY";
  } else if (fmvChanged) {
    ownerEvent = "PROPERTY_VERIFICATION_UPDATED";
  } else {
    ownerEvent = "PROPERTY_VERIFICATION_REVIEW_REQUIRED";
  }

  // Buyer event selection
  const buyerEvent: WorkflowEmailEvent =
    fmvChanged && !hasReviewFlags
      ? "DEAL_VERIFICATION_REVIEW_COMPLETED"
      : "DEAL_UNDER_VERIFICATION_REVIEW";

  if (contacts.owner) {
    const r = await sendWorkflowEmail({
      audience: "owner",
      eventKey: ownerEvent,
      to: contacts.owner.email,
      recipientName: contacts.owner.name,
      propertyAddress: address,
      actionUrl: propertyActionUrl(propertyId),
    });
    console.log("ATTOM_OWNER_NOTIFICATION", {
      propertyId,
      event: ownerEvent,
      ok: r.ok,
      skipped: r.skipped ?? null,
      error: r.error ?? null,
    });
  }

  if (contacts.buyer) {
    const r = await sendWorkflowEmail({
      audience: "buyer",
      eventKey: buyerEvent,
      to: contacts.buyer.email,
      recipientName: contacts.buyer.name,
      actionUrl: contacts.dealId ? dealActionUrl(contacts.dealId) : null,
    });
    console.log("ATTOM_BUYER_NOTIFICATION", {
      propertyId,
      event: buyerEvent,
      ok: r.ok,
      skipped: r.skipped ?? null,
      error: r.error ?? null,
    });
  }
}

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ propertyId: string }> },
) {
  const admin = await requireAdmin();
  if (!admin.ok) return jsonError(admin.error, admin.status);

  const { propertyId } = await ctx.params;
  if (!propertyId) return jsonError("Missing propertyId", 400);

  try {
    const svc = createServiceClient();

    // Fetch pre-screening state for material-change detection.
    const { data: prevProp } = await (svc.from("properties") as any)
      .select("latest_verified_fmv, address_line1, city, state, postal_code")
      .eq("id", propertyId)
      .maybeSingle();

    const prevFmv: number | null = prevProp?.latest_verified_fmv ?? null;
    const address = formatPropertyAddress(prevProp ?? {});

    const { runId, result } = await runAttomScreening({
      propertyId,
      requestedBy: admin.user.id,
    });

    // Fire-and-forget notifications. Errors are logged, not propagated.
    void notifyAttomCompletion({
      svc,
      propertyId,
      result,
      prevFmv,
      address,
      adminId: admin.user.id,
    }).catch((err) =>
      console.error("ATTOM_NOTIFICATION_UNEXPECTED_ERROR", { propertyId, err }),
    );

    return NextResponse.json(
      {
        ok: true,
        propertyId,
        runId,
        outcome: result.outcome,
        nextVerificationState: result.nextVerificationState,
        becameControlling: result.becameControlling,
        limitingFactors: result.limitingFactors,
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "ATTOM screening failed";

    // ATTOM returns a SuccessWithoutResult / total:0 body (often HTTP 400) when
    // the address has no record in their database. This is a vendor no-data
    // condition, not an application error — return a controlled no-result response
    // instead of propagating a 500.
    const isNoResult =
      message.includes("SuccessWithoutResult") ||
      message.includes("total\":0") ||
      message.includes('"total":0') ||
      message.toLowerCase().includes("no result") ||
      (message.includes("(400)") && message.toLowerCase().includes("no data"));

    if (isNoResult) {
      console.log("ATTOM_SCREENING_NO_RESULT", { propertyId, message });
      return NextResponse.json(
        {
          ok: true,
          noResult: true,
          message: "ATTOM returned no result for this address.",
        },
        { status: 200 },
      );
    }

    console.error("ATTOM_SCREENING_FAILED", { propertyId, error: message });

    return jsonError(message, 500);
  }
}
