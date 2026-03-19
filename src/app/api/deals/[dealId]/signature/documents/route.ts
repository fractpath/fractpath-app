/**
 * GET /api/deals/[dealId]/signature/documents
 *
 * Returns short-lived signed URLs for the executed agreement and certificate
 * of completion stored in the deal-signatures bucket.
 *
 * Access: any user with an active deal grant (same auth model as GET signature).
 * Never exposes raw DocuSign URLs — only app-controlled signed URLs.
 * Additive: does not change the existing GET signature response shape.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getArtifactSignedUrls } from "@/lib/signature/artifacts";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ dealId: string }> },
) {
  try {
    const { dealId } = await ctx.params;

    if (!UUID_RE.test(dealId)) {
      return jsonError("Invalid dealId", 400);
    }

    // Authenticate user
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr) return jsonError("Auth error", 401);
    if (!user) return jsonError("Unauthorized", 401);

    // Verify deal access via RLS (has_active_deal_grant or owner)
    const { data: deal, error: dealErr } = await supabase
      .from("deals")
      .select("id, status")
      .eq("id", dealId)
      .maybeSingle();

    if (dealErr) return jsonError("Failed to fetch deal", 500);
    if (!deal) return jsonError("Deal not found", 404);

    // Fetch latest packet (service client for authoritative read)
    const svc = createServiceClient();

    const { data: packet, error: packetErr } = await (
      svc.from("deal_signature_packets") as any
    )
      .select("id, status, executed_document_path, certificate_document_path")
      .eq("deal_id", dealId)
      .order("packet_version", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (packetErr) return jsonError("Failed to fetch signature packet", 500);

    if (!packet) {
      return NextResponse.json({
        ok: true,
        hasPacket: false,
        executed_agreement_url: null,
        certificate_url: null,
      });
    }

    // Only completed packets have stored artifacts
    if (packet.status !== "completed") {
      return NextResponse.json({
        ok: true,
        hasPacket: true,
        packetStatus: packet.status,
        executed_agreement_url: null,
        certificate_url: null,
      });
    }

    // Generate signed URLs for the stored paths
    const urls = await getArtifactSignedUrls(
      packet.executed_document_path ?? null,
      packet.certificate_document_path ?? null,
    );

    return NextResponse.json({
      ok: true,
      hasPacket: true,
      packetId: packet.id,
      packetStatus: packet.status,
      executed_agreement_url: urls.executed_agreement_url,
      certificate_url: urls.certificate_url,
    });
  } catch (e: any) {
    console.error("sig_documents_fatal", { error: e?.message });
    return jsonError("Internal error", 500);
  }
}
