import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { confirmProfileCandidate } from "@/lib/property-review/service";
import type { ProfileCandidate } from "@/lib/property-review/service";

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ propertyId: string }> },
) {
  const admin = await requireAdmin();
  if (!admin.ok) return jsonError(admin.error, admin.status);

  const { propertyId } = await ctx.params;
  if (!propertyId) return jsonError("Missing propertyId", 400);

  let candidate: ProfileCandidate;
  try {
    const body = await req.json();
    if (!body?.candidate || typeof body.candidate !== "object") {
      return jsonError("Missing or invalid candidate in request body", 400);
    }
    candidate = body.candidate as ProfileCandidate;
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  try {
    const result = await confirmProfileCandidate({
      propertyId,
      requestedBy: admin.user.id,
      candidate,
    });

    return NextResponse.json(
      {
        ok: true,
        propertyId,
        runId: result.runId,
        summary: result.summary,
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to confirm profile candidate";

    return jsonError(message, 500);
  }
}
