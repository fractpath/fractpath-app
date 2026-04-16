import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";
import {
  RELEASE_REASON_CODES,
  VOID_AND_RELEASE_CONFIRMATION,
  performAdminVoidAndRelease,
  type ReleaseReasonCode,
} from "@/lib/property/claimRelease";

function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json(
    { ok: false, error: message, details: details ?? null },
    { status },
  );
}

type Ctx = { params: Promise<{ propertyId: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return jsonError(admin.error, admin.status, { email: admin.email });
  }

  const { propertyId } = await ctx.params;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const reasonCode: string = body?.reason_code ?? "";
  const notes: string = body?.notes ?? "";
  const confirmation: string = body?.confirmation ?? "";
  const threadId: string = body?.thread_id ?? "";
  const acknowledged: boolean = body?.acknowledged === true;

  // Validate confirmation string (exact match)
  if (confirmation !== VOID_AND_RELEASE_CONFIRMATION) {
    return jsonError(
      `Confirmation string mismatch. Must be exactly: ${VOID_AND_RELEASE_CONFIRMATION}`,
      422,
      { received: confirmation },
    );
  }

  if (!acknowledged) {
    return jsonError("acknowledged must be true", 422);
  }

  if (!RELEASE_REASON_CODES.includes(reasonCode as ReleaseReasonCode)) {
    return jsonError("Invalid or missing reason_code", 422, {
      allowed: RELEASE_REASON_CODES,
      received: reasonCode,
    });
  }

  if (!notes.trim()) {
    return jsonError("notes are required for void-and-release", 422);
  }

  if (!threadId) {
    return jsonError("thread_id is required", 422);
  }

  const svc = createServiceClient();

  // Verify property exists
  const { data: property, error: propErr } = await (svc.from("properties") as any)
    .select("id")
    .eq("id", propertyId)
    .single();

  if (propErr || !property) {
    return jsonError("Property not found", 404);
  }

  const result = await performAdminVoidAndRelease(
    propertyId,
    threadId,
    admin.user.id,
    reasonCode as ReleaseReasonCode,
    notes.trim(),
    svc,
  );

  if (!result.ok) {
    console.error("admin_void_and_release_failed", {
      propertyId,
      threadId,
      adminId: admin.user.id,
      error: result.error,
    });
    return jsonError(result.error, result.error === "thread_not_found" ? 404 : 409, {
      detail: result.error,
    });
  }

  console.log("admin_void_and_release_success", {
    propertyId,
    threadId,
    adminId: admin.user.id,
    reasonCode,
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
