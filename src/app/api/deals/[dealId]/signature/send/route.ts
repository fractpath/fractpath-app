import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";
import {
  findLatestPacketForDeal,
  findInFlightPacketForDeal,
  getPacketRecipients,
} from "@/lib/signature/helpers";
import {
  logSigInfo,
  logSigError,
} from "@/lib/signature/logging";
import { insertSigDealEventIfMissing } from "@/lib/signature/dealEvents";
import { loadConfig } from "@/lib/docusign/config";
import { createDocusignClient, createEnvelopeFromTemplate } from "@/lib/docusign/client";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}

export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ dealId: string }> },
) {
  const { dealId } = await ctx.params;

  if (!UUID_RE.test(dealId)) {
    return jsonError("Invalid dealId", 400);
  }

  // Admin-only gate
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json(
      { ok: false, error: admin.error },
      { status: admin.status },
    );
  }

  logSigInfo("signature_packet_send_attempt", { dealId, provider: "docusign" });

  try {
    const svc = createServiceClient();

    // 1. Verify deal exists
    const { data: deal, error: dealErr } = await (svc.from("deals") as any)
      .select("id, status")
      .eq("id", dealId)
      .maybeSingle();

    if (dealErr) return jsonError("Failed to fetch deal", 500, { detail: dealErr.message });
    if (!deal) return jsonError("Deal not found", 404);

    // 2. Load latest packet
    const latestPacket = await findLatestPacketForDeal(svc, dealId);

    if (!latestPacket) {
      return jsonError(
        "No signature packet found for this deal. Prepare a packet first.",
        409,
      );
    }

    // 3. Require latest packet to be 'prepared'
    if (latestPacket.status !== "prepared") {
      logSigInfo("signature_packet_send_attempt", {
        dealId,
        packetId: latestPacket.id,
        status: latestPacket.status,
        provider: "docusign",
        meta: { reason: "wrong_status" },
      });
      return jsonError(
        `Cannot send: latest packet has status '${latestPacket.status}'. Only packets in 'prepared' status can be sent.`,
        409,
        { packetId: latestPacket.id, packetStatus: latestPacket.status },
      );
    }

    // 4. Guard against another in-flight packet
    const inFlight = await findInFlightPacketForDeal(svc, dealId);
    if (inFlight && inFlight.id !== latestPacket.id) {
      logSigInfo("signature_packet_send_attempt", {
        dealId,
        packetId: inFlight.id,
        status: inFlight.status,
        provider: "docusign",
        meta: { reason: "other_in_flight" },
      });
      return jsonError(
        `Cannot send: another in-flight signature packet (status: ${inFlight.status}) already exists for this deal.`,
        409,
        { conflictingPacketId: inFlight.id },
      );
    }

    // 5. Load recipients from DB
    const recipients = await getPacketRecipients(svc, latestPacket.id);
    const buyerRecipient = recipients.find((r) => r.role === "Buyer");
    const ownerRecipient = recipients.find((r) => r.role === "Owner");

    if (!buyerRecipient) {
      return jsonError("Cannot send: Buyer recipient row is missing from this packet.", 422);
    }
    if (!ownerRecipient) {
      return jsonError("Cannot send: Owner recipient row is missing from this packet.", 422);
    }

    // 6. Build DocuSign envelope input from packet recipients
    const dsConfig = loadConfig();

    const envelopeInput = {
      templateId: dsConfig.templateIdActiveDeal,
      emailSubject: "FractPath Agreement Ready for Review and Signature",
      buyer: {
        name: buyerRecipient.display_name,
        email: buyerRecipient.email,
      },
      owner: {
        name: ownerRecipient.display_name,
        email: ownerRecipient.email,
      },
      sendMode: "sent" as const,
      brandId: dsConfig.brandId,
    };

    // 7. Call DocuSign
    let envelopeSummary: { envelopeId?: string; status?: string };
    let sendError: Error | null = null;

    try {
      const dsClient = await createDocusignClient();
      envelopeSummary = await createEnvelopeFromTemplate(dsClient, envelopeInput);
    } catch (err: any) {
      sendError = err instanceof Error ? err : new Error(String(err));
      logSigError("signature_packet_send_failure", {
        dealId,
        packetId: latestPacket.id,
        provider: "docusign",
        meta: { reason: "docusign_api_error" },
      }, sendError);

      
      // Preserve the prepared packet for safe operator retry; record only the last error.
      await (svc.from("deal_signature_packets") as any)
        .update({
          last_error: sendError.message.slice(0, 2000),
        })
        .eq("id", latestPacket.id);

      return jsonError(
        "Failed to send envelope through DocuSign. The packet remains in prepared status so it can be retried after the issue is fixed.",
        500,
        { packetId: latestPacket.id, detail: sendError.message },
      );

    }

    const providerEnvelopeId = envelopeSummary.envelopeId ?? null;
    const providerLastStatus = envelopeSummary.status ?? null;
    const sentAt = new Date().toISOString();

    // 8. Persist send result
    const { data: updatedPacket, error: updateErr } = await (
      svc.from("deal_signature_packets") as any
    )
      .update({
        status: "sent",
        provider_envelope_id: providerEnvelopeId,
        provider_payload_json: envelopeSummary as Record<string, unknown>,
        provider_last_status: providerLastStatus,
        sent_at: sentAt,
        last_error: null,
      })
      .eq("id", latestPacket.id)
      .select("id, deal_id, packet_version, status, provider_envelope_id, sent_at, provider_last_status")
      .single();

    if (updateErr) {
      // The envelope is live in DocuSign at this point — log prominently but still return partial success
      logSigError(
        "signature_packet_send_failure",
        {
          dealId,
          packetId: latestPacket.id,
          envelopeId: providerEnvelopeId,
          provider: "docusign",
          meta: { reason: "db_update_failed_after_send" },
        },
        new Error(updateErr.message),
      );
      return jsonError(
        "Envelope was sent through DocuSign but the local packet record failed to update. Immediate operator intervention required.",
        500,
        {
          packetId: latestPacket.id,
          providerEnvelopeId,
          detail: updateErr.message,
        },
      );
    }

    logSigInfo("signature_packet_send_success", {
      dealId,
      packetId: updatedPacket.id,
      envelopeId: providerEnvelopeId,
      provider: "docusign",
      status: "sent",
      meta: { packetVersion: updatedPacket.packet_version },
    });

    // Write normalized deal event (non-fatal, idempotent)
    await insertSigDealEventIfMissing({
      svc,
      dealId,
      eventType: "signature_request_sent",
      packetId: updatedPacket.id as string,
      packetVersion: updatedPacket.packet_version as number,
      envelopeId: providerEnvelopeId,
    });

    return NextResponse.json({
      ok: true,
      packet: {
        id: updatedPacket.id,
        deal_id: updatedPacket.deal_id,
        packet_version: updatedPacket.packet_version,
        status: updatedPacket.status,
        provider_envelope_id: updatedPacket.provider_envelope_id,
        sent_at: updatedPacket.sent_at,
        provider_last_status: updatedPacket.provider_last_status,
      },
    });
  } catch (e: any) {
    logSigError("signature_packet_send_failure", { dealId, provider: "docusign" }, e);
    return jsonError("Internal error", 500, { detail: e?.message });
  }
}
