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
import { runAttomScreening } from "@/lib/property-review/attomScreeningService";

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status });
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
    const { runId, result } = await runAttomScreening({
      propertyId,
      requestedBy: admin.user.id,
    });

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

    console.error("ATTOM_SCREENING_FAILED", { propertyId, error: message });

    return jsonError(message, 500);
  }
}
