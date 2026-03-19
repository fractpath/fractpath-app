import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";
import {
  findLatestPacketForDeal,
  findInFlightPacketForDeal,
  getNextPacketVersion,
  getPacketRecipients,
  resolveAcceptedThread,
  resolveSignerIdentities,
  resolvePropertyDisplayAddress,
  resolveAcceptedEconomics,
  isSameSignerIdentity,
} from "@/lib/signature/helpers";
import { canPacketBeSuperseded, isInFlightPacketStatus } from "@/lib/signature/status";
import {
  logSigInfo,
  logSigWarn,
  logSigError,
} from "@/lib/signature/logging";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TEMPLATE_KEY = "active_deal_mvp_v1";

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

  const preparedBy = admin.user.id;

  logSigInfo("signature_packet_prepare_attempt", { dealId });

  try {
    const svc = createServiceClient();

    // 1. Verify deal exists
    const { data: deal, error: dealErr } = await (svc.from("deals") as any)
      .select("id, status")
      .eq("id", dealId)
      .maybeSingle();

    if (dealErr) return jsonError("Failed to fetch deal", 500, { detail: dealErr.message });
    if (!deal) return jsonError("Deal not found", 404);

    // 2. Resolve accepted thread (canonical accepted state for signature flow)
    const thread = await resolveAcceptedThread(svc, dealId);

    if (!thread) {
      logSigWarn("signature_packet_prepare_conflict", {
        dealId,
        meta: { reason: "no_accepted_thread" },
      });
      return jsonError(
        "No accepted thread found for this deal. The deal must have an accepted offer before a signature packet can be prepared.",
        409,
      );
    }

    // 3. Check for in-flight packet (hard block)
    const inFlight = await findInFlightPacketForDeal(svc, dealId);
    if (inFlight) {
      logSigWarn("signature_packet_prepare_conflict", {
        dealId,
        packetId: inFlight.id,
        status: inFlight.status,
        meta: { reason: "in_flight_packet_exists" },
      });
      return jsonError(
        `Cannot prepare: an in-flight signature packet (status: ${inFlight.status}) already exists for this deal.`,
        409,
        { packetId: inFlight.id, packetStatus: inFlight.status },
      );
    }

    // 4. Check latest packet status for idempotency / version increment
    const latestPacket = await findLatestPacketForDeal(svc, dealId);

    // 5. Resolve signer identities
    const { buyer: buyerIdentity, owner: ownerIdentity } = await resolveSignerIdentities(svc, thread);

    if (!buyerIdentity) {
      return jsonError(
        "Cannot prepare: buyer signer identity (name or email) could not be resolved. Verify the buyer user account is complete.",
        422,
        { field: "buyer" },
      );
    }

    if (!ownerIdentity) {
      return jsonError(
        "Cannot prepare: owner signer identity (name or email) could not be resolved. The property owner must have an account with a verified email before signature can be initiated.",
        422,
        { field: "owner" },
      );
    }

    // 6. Idempotency: if latest packet is 'prepared' with same signer identities, return it
    if (latestPacket && latestPacket.status === "prepared") {
      if (isSameSignerIdentity(latestPacket, buyerIdentity, ownerIdentity)) {
        const existingRecipients = await getPacketRecipients(svc, latestPacket.id);
        logSigInfo("signature_packet_prepare_conflict", {
          dealId,
          packetId: latestPacket.id,
          status: latestPacket.status,
          meta: { reason: "idempotent_return" },
        });
        return NextResponse.json({
          ok: true,
          idempotent: true,
          packet: {
            id: latestPacket.id,
            deal_id: latestPacket.deal_id,
            packet_version: latestPacket.packet_version,
            status: latestPacket.status,
            template_key: latestPacket.template_key,
            created_at: latestPacket.created_at,
            recipients: existingRecipients.map((r) => ({
              role: r.role,
              display_name: r.display_name,
              email: r.email,
              routing_order: r.routing_order,
            })),
          },
        });
      }
      // Same version exists but signers differ — fall through to create new version
    }

    // 7. Determine packet_version
    const packetVersion = latestPacket
      ? latestPacket.packet_version + 1
      : 1;

    // 8. Resolve property display address
    const propertyDisplayAddress = await resolvePropertyDisplayAddress(
      svc,
      dealId,
      thread.propertyId,
    );

    // 9. Resolve accepted economics (from accepted proposal)
    let acceptedEconomics: Record<string, unknown> = {};
    let acceptedSnapshotVersion: number | null = null;

    if (thread.currentProposalId) {
      const economics = await resolveAcceptedEconomics(svc, thread.currentProposalId);
      if (economics) {
        acceptedEconomics = economics.termsSnapshot;
        // Extract schema/contract version if available
        // TODO (Prompt 3): align with canonical FullDealSnapshotV1 type when importable
        const snap = economics.termsSnapshot;
        if (typeof snap?.schema_version === "string" || typeof snap?.schema_version === "number") {
          acceptedSnapshotVersion = Number(snap.schema_version) || null;
        }
      }
    }

    // 10. Build prepared snapshot (frozen at prepare time — never recomputed)
    const preparedAt = new Date().toISOString();
    const preparedSnapshot = {
      dealId,
      threadId: thread.threadId,
      acceptedSnapshotVersion,
      propertyDisplayAddress,
      buyer: {
        userId: buyerIdentity.userId ?? undefined,
        displayName: buyerIdentity.displayName,
        email: buyerIdentity.email,
      },
      owner: {
        userId: ownerIdentity.userId ?? undefined,
        displayName: ownerIdentity.displayName,
        email: ownerIdentity.email,
      },
      packetVersion,
      templateKey: TEMPLATE_KEY,
      preparedAt,
      preparedBy,
      acceptedEconomics,
    };

    // 11. Insert packet row
    const { data: newPacket, error: insertErr } = await (
      svc.from("deal_signature_packets") as any
    )
      .insert({
        deal_id: dealId,
        thread_id: thread.threadId,
        provider: "docusign",
        packet_version: packetVersion,
        status: "prepared",
        template_key: TEMPLATE_KEY,
        prepared_snapshot_json: preparedSnapshot,
        created_by: preparedBy,
      })
      .select("id, deal_id, packet_version, status, template_key, created_at")
      .single();

    if (insertErr) {
      logSigError("signature_packet_prepare_error", { dealId, meta: { reason: "insert_failed" } }, new Error(insertErr.message));
      return jsonError("Failed to create signature packet", 500, { detail: insertErr.message });
    }

    // 12. Insert recipient rows (Buyer routing_order=1, Owner routing_order=2)
    const recipientRows = [
      {
        packet_id: newPacket.id,
        role: "Buyer",
        user_id: buyerIdentity.userId ?? null,
        display_name: buyerIdentity.displayName,
        email: buyerIdentity.email,
        routing_order: 1,
      },
      {
        packet_id: newPacket.id,
        role: "Owner",
        user_id: ownerIdentity.userId ?? null,
        display_name: ownerIdentity.displayName,
        email: ownerIdentity.email,
        routing_order: 2,
      },
    ];

    const { error: recipientErr } = await (
      svc.from("deal_signature_recipients") as any
    ).insert(recipientRows);

    if (recipientErr) {
      // Attempt to roll back the packet row (best-effort)
      await (svc.from("deal_signature_packets") as any)
        .delete()
        .eq("id", newPacket.id);

      logSigError(
        "signature_packet_prepare_error",
        { dealId, packetId: newPacket.id, meta: { reason: "recipients_insert_failed" } },
        new Error(recipientErr.message),
      );
      return jsonError("Failed to create signer rows", 500, { detail: recipientErr.message });
    }

    logSigInfo("signature_packet_prepare_success", {
      dealId,
      packetId: newPacket.id,
      provider: "docusign",
      status: "prepared",
      meta: { packetVersion },
    });

    return NextResponse.json({
      ok: true,
      packet: {
        id: newPacket.id,
        deal_id: newPacket.deal_id,
        packet_version: newPacket.packet_version,
        status: newPacket.status,
        template_key: newPacket.template_key,
        created_at: newPacket.created_at,
        recipients: recipientRows.map((r) => ({
          role: r.role,
          display_name: r.display_name,
          email: r.email,
          routing_order: r.routing_order,
        })),
      },
    });
  } catch (e: any) {
    logSigError("signature_packet_prepare_error", { dealId }, e);
    return jsonError("Internal error", 500, { detail: e?.message });
  }
}
