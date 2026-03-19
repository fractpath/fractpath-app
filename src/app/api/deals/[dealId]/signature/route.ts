import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getPacketRecipients } from "@/lib/signature/helpers";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
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

    if (userErr) return jsonError("Auth error", 401, { detail: userErr.message });
    if (!user) return jsonError("Unauthorized", 401);

    // Verify deal exists and user has access (RLS on deals via has_active_deal_grant)
    const { data: deal, error: dealErr } = await supabase
      .from("deals")
      .select("id, status")
      .eq("id", dealId)
      .maybeSingle();

    if (dealErr) return jsonError("Failed to fetch deal", 500, { detail: dealErr.message });
    if (!deal) return jsonError("Deal not found", 404);

    // Use service client for signature packet reads (packets have RLS via deal grant,
    // but we use service client for authoritative read)
    const svc = createServiceClient();

    const { data: packet, error: packetErr } = await (
      svc.from("deal_signature_packets") as any
    )
      .select(
        "id, deal_id, thread_id, provider, packet_version, status, template_key, " +
        "provider_envelope_id, provider_last_status, sent_at, completed_at, " +
        "voided_at, declined_at, executed_document_path, certificate_document_path, " +
        "created_at, updated_at"
      )
      .eq("deal_id", dealId)
      .order("packet_version", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (packetErr) {
      console.error("sig_get_packet_error", { dealId, error: packetErr.message });
      return jsonError("Failed to fetch signature packet", 500, { detail: packetErr.message });
    }

    if (!packet) {
      return NextResponse.json({
        ok: true,
        hasPacket: false,
        packet: null,
        recipients: [],
        recommendedNextAction: "prepare",
      });
    }

    // Fetch recipients for this packet
    let recipients: any[] = [];
    try {
      const rows = await getPacketRecipients(svc, packet.id as string);
      recipients = rows.map((r) => ({
        role: r.role,
        display_name: r.display_name,
        email: r.email,
        routing_order: r.routing_order,
        provider_status: r.provider_status,
        signed_at: r.signed_at,
      }));
    } catch (recipErr: any) {
      console.error("sig_get_recipients_error", { dealId, packetId: packet.id, error: recipErr.message });
      // Non-fatal — return packet without recipients
    }

    return NextResponse.json({
      ok: true,
      hasPacket: true,
      packet,
      recipients,
    });
  } catch (e: any) {
    console.error("sig_get_fatal", { error: e?.message });
    return jsonError("Internal error", 500, { detail: e?.message });
  }
}
