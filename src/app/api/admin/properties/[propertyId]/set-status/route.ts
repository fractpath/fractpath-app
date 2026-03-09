import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";

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
    body = {};
  }

  const status = body?.status;
  const allowed = new Set([
    "unverified",
    "under_review",
    "verified",
    "archived",
  ]);
  if (typeof status !== "string" || !allowed.has(status)) {
    return jsonError("Invalid status", 422, { received: status });
  }

  const svc = createServiceClient();

  const { data, error } = await (svc.from("properties") as any)
    .update({ status })
    .eq("id", propertyId)
    .select("id,status")
    .single();

  if (error) {
    console.error("ADMIN_SET_PROPERTY_STATUS_FAILED", {
      propertyId,
      status,
      error,
    });
    return jsonError("Failed to set property status", 500, error);
  }

  return NextResponse.json({ ok: true, property: data }, { status: 200 });
}
