import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  checkOwnerReleaseEligibility,
  loadOwnerReleaseEligibilityData,
  performOwnerRelease,
} from "@/lib/property/claimRelease";

function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json(
    { ok: false, error: message, details: details ?? null },
    { status },
  );
}

type Ctx = { params: Promise<{ propertyId: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { propertyId } = await ctx.params;

  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const svc = createServiceClient();

  // Load eligibility data
  const { property, threads, signaturePackets, ownershipError } =
    await loadOwnerReleaseEligibilityData(propertyId, user.id, svc);

  if (ownershipError === "not_owner") {
    return jsonError("Forbidden — not the property owner", 403);
  }
  if (!property) {
    return jsonError("Property not found", 404);
  }

  // Run eligibility check
  const eligibility = checkOwnerReleaseEligibility(
    property,
    threads,
    signaturePackets,
  );

  if (!eligibility.allowed) {
    return jsonError("Property claim release not permitted", 409, {
      blocked_reasons: eligibility.blockedReasons,
    });
  }

  // Perform the release
  const result = await performOwnerRelease(
    propertyId,
    user.id,
    eligibility.closableThreadIds,
    svc,
  );

  if (!result.ok) {
    console.error("owner_release_claim_failed", {
      propertyId,
      userId: user.id,
      error: result.error,
    });
    return jsonError("Release failed", 500, { detail: result.error });
  }

  console.log("owner_release_claim_success", {
    propertyId,
    userId: user.id,
    closedThreads: eligibility.closableThreadIds.length,
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}

/** GET — check eligibility without mutating */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { propertyId } = await ctx.params;

  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const svc = createServiceClient();

  const { property, threads, signaturePackets, ownershipError } =
    await loadOwnerReleaseEligibilityData(propertyId, user.id, svc);

  if (ownershipError === "not_owner") {
    return jsonError("Forbidden", 403);
  }
  if (!property) {
    return jsonError("Property not found", 404);
  }

  const eligibility = checkOwnerReleaseEligibility(
    property,
    threads,
    signaturePackets,
  );

  return NextResponse.json(
    {
      ok: true,
      allowed: eligibility.allowed,
      blocked_reasons: eligibility.blockedReasons,
      active_nonbinding_deals: eligibility.closableThreadIds.length,
    },
    { status: 200 },
  );
}
