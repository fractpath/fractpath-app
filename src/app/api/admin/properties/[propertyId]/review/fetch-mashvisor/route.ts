import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { runMashvisorEnrichment } from "@/lib/mashvisor/mashvisorEnrichmentService";

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
    const result = await runMashvisorEnrichment({
      propertyId,
      requestedBy: admin.user.id,
    });

    return NextResponse.json(
      { ok: true, propertyId, runId: result.runId, summary: result.summary },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch enrichment data";
    return jsonError(message, 500);
  }
}
