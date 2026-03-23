/**
 * POST /api/docusign/webhook
 *
 * DocuSign Connect webhook ingestion endpoint.
 * - No user auth/session required (provider-facing endpoint)
 * - Fails closed on missing or invalid HMAC signature
 * - Persists raw event before any reconciliation
 * - Reconciles packet + recipient state
 * - Invokes completion hook when packet transitions to 'completed'
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { loadWebhookHmacKey } from "@/lib/docusign/config";
import { verifyDocusignWebhookSignature } from "@/lib/docusign/client";
import {
  parseDocusignConnectEvent,
  reconcilePacketStatus,
  extractRecipientStatuses,
} from "@/lib/docusign/webhook";
import { logSigInfo, logSigWarn, logSigError } from "@/lib/signature/logging";
import { onPacketCompleted } from "@/lib/signature/completion";
import { insertSigDealEventIfMissing } from "@/lib/signature/dealEvents";

export const runtime = "nodejs";

// DocuSign sends the HMAC-SHA256 signature in this header (first key slot).
// If multiple HMAC keys are configured, DocuSign sends X-DocuSign-Signature-2, etc.
// We verify against key slot 1 only in MVP.
const DOCUSIGN_SIG_HEADER = "x-docusign-signature-1";

function jsonOk(extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: true, ...extra }, { status: 200 });
}

function jsonReject(message: string, status: 400 | 401 | 422) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  // 1. Read raw body as text (required for HMAC verification)
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    logSigWarn("docusign_webhook_rejected", {
      meta: { reason: "body_read_failed" },
    });
    return jsonReject("Failed to read request body", 400);
  }

  // 2. Extract HMAC signature header
  const signatureHeader = request.headers.get(DOCUSIGN_SIG_HEADER);

  if (!signatureHeader) {
    logSigWarn("docusign_webhook_rejected", {
      meta: { reason: "missing_signature_header", header: DOCUSIGN_SIG_HEADER },
    });
    return jsonReject("Missing webhook signature header", 401);
  }

  // 3. Load HMAC key (fail-fast if not configured)
  let hmacKey: string;
  try {
    hmacKey = loadWebhookHmacKey();
  } catch (err: any) {
    logSigError(
      "docusign_webhook_rejected",
      { meta: { reason: "hmac_key_missing" } },
      err,
    );
    return jsonReject("Webhook signing key not configured", 401);
  }

  // 4. Verify HMAC authenticity (fail closed)
  const isValid = await verifyDocusignWebhookSignature(
    rawBody,
    signatureHeader,
    hmacKey,
  );

  if (!isValid) {
    logSigWarn("docusign_webhook_rejected", {
      meta: { reason: "invalid_hmac_signature" },
    });
    return jsonReject("Invalid webhook signature", 401);
  }

  logSigInfo("docusign_webhook_verified", {});

  // 5. Parse payload (only after verification)
  const parseResult = parseDocusignConnectEvent(rawBody);

  if (!parseResult.ok) {
    logSigWarn("docusign_webhook_rejected", {
      meta: { reason: "parse_failed", detail: parseResult.error },
    });
    return jsonReject(`Invalid payload: ${parseResult.error}`, 422);
  }

  const parsed = parseResult.value;
  const rawData = (parsed.raw?.data ?? {}) as Record<string, unknown>;
  const thinRecipientId =
    typeof rawData.recipientId === "string" ? rawData.recipientId : null;
  const { envelopeId, providerEventType, providerEventAt } = parsed;

  let forcedNextStatus: string | null = null;

  if (providerEventType === "envelope-completed") {
    forcedNextStatus = "completed";
  } else if (providerEventType === "envelope-delivered") {
    forcedNextStatus = "delivered";
  } else if (providerEventType === "recipient-completed") {
    forcedNextStatus = "partially_signed";
  }

  logSigInfo("docusign_webhook_received", {
    envelopeId,
    meta: {
      providerEventType,
      providerEventAt: providerEventAt ?? "unknown",
      envelopeStatus: parsed.envelopeStatus ?? "unknown",
      thinRecipientId: thinRecipientId ?? null,
    },
  });

  const svc = createServiceClient();

  // 6. Find local packet by envelope id
  const { data: packet, error: packetErr } = await (
    svc.from("deal_signature_packets") as any
  )
    .select(
      "id, deal_id, thread_id, provider, provider_envelope_id, status, packet_version",
    )
    .eq("provider", "docusign")
    .eq("provider_envelope_id", envelopeId)
    .maybeSingle();

  if (packetErr) {
    logSigError(
      "docusign_webhook_rejected",
      {
        envelopeId,
        meta: { reason: "packet_lookup_failed" },
      },
      new Error(packetErr.message),
    );
    return jsonOk({ warning: "Packet lookup error; event not persisted" });
  }

  if (!packet) {
    logSigWarn("docusign_webhook_received", {
      envelopeId,
      meta: { reason: "no_matching_packet" },
    });
    return jsonOk({ skipped: true, reason: "no_matching_packet" });
  }

  const packetId = packet.id as string;
  const dealId = packet.deal_id as string;
  const currentStatus = packet.status as string;

  // 7. Idempotency check
  let isDuplicate = false;
  try {
    let dupQuery = (svc.from("deal_signature_events") as any)
      .select("id")
      .eq("packet_id", packetId)
      .eq("provider_event_type", providerEventType);

    if (providerEventAt) {
      dupQuery = dupQuery.eq("provider_event_at", providerEventAt);
    }

    const { data: existing } = await dupQuery.limit(1).maybeSingle();
    isDuplicate = !!existing;
  } catch {
    // Non-fatal: if duplicate check fails, proceed with insert
  }

  if (isDuplicate) {
    logSigInfo("docusign_webhook_duplicate", {
      packetId,
      dealId,
      envelopeId,
      meta: { providerEventType },
    });
    return jsonOk({ duplicate: true });
  }

  // 8. Persist raw event row BEFORE any reconciliation
  const eventPayload = parsed.raw as Record<string, unknown>;

  const { error: eventInsertErr } = await (
    svc.from("deal_signature_events") as any
  ).insert({
    packet_id: packetId,
    provider: "docusign",
    provider_event_type: providerEventType,
    provider_event_at: providerEventAt ?? null,
    payload_json: eventPayload,
  });

  if (eventInsertErr) {
    logSigError(
      "docusign_webhook_received",
      {
        packetId,
        dealId,
        envelopeId,
        meta: { reason: "event_insert_failed" },
      },
      new Error(eventInsertErr.message),
    );
    return jsonOk({
      warning: "Event persistence failed; state not reconciled",
    });
  }

  logSigInfo("docusign_webhook_event_persisted", {
    packetId,
    dealId,
    envelopeId,
    meta: { providerEventType },
  });

  // 9. Reconcile packet status
  let didTransitionToCompleted = false;

  const derivedNextStatus = reconcilePacketStatus(currentStatus as any, parsed);

  const nextStatus =
    forcedNextStatus === "completed" && currentStatus !== "completed"
      ? "completed"
      : forcedNextStatus === "delivered" &&
          !["completed", "declined", "voided", "partially_signed"].includes(
            currentStatus,
          )
        ? "delivered"
        : forcedNextStatus === "partially_signed" &&
            !["completed", "declined", "voided", "partially_signed"].includes(
              currentStatus,
            )
          ? "partially_signed"
          : derivedNextStatus;
  let reconciledStatus = currentStatus;

  if (nextStatus && nextStatus !== currentStatus) {
    const packetPatch: Record<string, unknown> = {
      status: nextStatus,
      provider_last_status: parsed.envelopeStatus ?? currentStatus,
    };

    if (nextStatus === "completed") {
      packetPatch.completed_at =
        parsed.completedAt ?? providerEventAt ?? new Date().toISOString();
    }
    if (nextStatus === "declined" && parsed.declinedAt) {
      packetPatch.declined_at = parsed.declinedAt;
    }
    if (nextStatus === "voided" && parsed.voidedAt) {
      packetPatch.voided_at = parsed.voidedAt;
    }

    const { error: packetUpdateErr } = await (
      svc.from("deal_signature_packets") as any
    )
      .update(packetPatch)
      .eq("id", packetId);

    if (packetUpdateErr) {
      logSigError(
        "docusign_packet_reconciled",
        {
          packetId,
          dealId,
          envelopeId,
          status: nextStatus,
          meta: { reason: "packet_update_failed" },
        },
        new Error(packetUpdateErr.message),
      );
    } else {
      reconciledStatus = nextStatus;

      if (nextStatus === "completed" && currentStatus !== "completed") {
        didTransitionToCompleted = true;
      }

      logSigInfo("docusign_packet_reconciled", {
        packetId,
        dealId,
        envelopeId,
        provider: "docusign",
        status: nextStatus,
        meta: { prevStatus: currentStatus },
      });

      if (nextStatus === "completed") {
        await insertSigDealEventIfMissing({
          svc,
          dealId,
          eventType: "signature_fully_executed",
          packetId,
          packetVersion: packet.packet_version as number,
          envelopeId,
        });
      } else if (nextStatus === "declined") {
        await insertSigDealEventIfMissing({
          svc,
          dealId,
          eventType: "signature_declined",
          packetId,
          packetVersion: packet.packet_version as number,
          envelopeId,
        });
      } else if (nextStatus === "voided") {
        await insertSigDealEventIfMissing({
          svc,
          dealId,
          eventType: "signature_voided",
          packetId,
          packetVersion: packet.packet_version as number,
          envelopeId,
        });
      }
    }
  } else if (parsed.envelopeStatus) {
    await (svc.from("deal_signature_packets") as any)
      .update({ provider_last_status: parsed.envelopeStatus })
      .eq("id", packetId);
  }

  // 10. Reconcile recipient rows
  if (parsed.signers.length > 0 || thinRecipientId) {
    const recipientUpdates: Array<{
      role: "Buyer" | "Owner";
      patch: Record<string, unknown>;
    }> = [];

    if (parsed.signers.length > 0) {
      const roleMap = extractRecipientStatuses(parsed.signers);

      for (const role of ["Buyer", "Owner"] as const) {
        const update = roleMap[role];
        if (!update) continue;

        const patch: Record<string, unknown> = {};
        if (update.providerRecipientId != null) {
          patch.provider_recipient_id = update.providerRecipientId;
        }
        if (update.providerStatus != null) {
          patch.provider_status = update.providerStatus;
        }
        if (update.signedAt != null) {
          patch.signed_at = update.signedAt;
        }

        if (Object.keys(patch).length > 0) {
          recipientUpdates.push({ role, patch });
        }
      }
    } else if (providerEventType === "recipient-completed" && thinRecipientId) {
      let role: "Buyer" | "Owner" | null = null;

      if (thinRecipientId === "1") {
        role = "Buyer";
      } else if (thinRecipientId === "2" || thinRecipientId === "3") {
        role = "Owner";
      }

      if (role) {
        recipientUpdates.push({
          role,
          patch: {
            provider_recipient_id: thinRecipientId,
            provider_status: "completed",
            signed_at: providerEventAt ?? new Date().toISOString(),
          },
        });
      }
    }

    for (const { role, patch } of recipientUpdates) {
      const { error: recipUpdateErr } = await (
        svc.from("deal_signature_recipients") as any
      )
        .update(patch)
        .eq("packet_id", packetId)
        .eq("role", role);

      if (recipUpdateErr) {
        logSigError(
          "docusign_recipients_reconciled",
          {
            packetId,
            dealId,
            envelopeId,
            meta: { role, reason: "recipient_update_failed" },
          },
          new Error(recipUpdateErr.message),
        );
      }
    }

    if (recipientUpdates.length > 0) {
      logSigInfo("docusign_recipients_reconciled", {
        packetId,
        dealId,
        envelopeId,
        meta: {
          rolesUpdated: recipientUpdates.map((u) => u.role).join(","),
        },
      });
    }

    for (const { role, patch } of recipientUpdates) {
      if (patch.provider_status === "completed") {
        await insertSigDealEventIfMissing({
          svc,
          dealId,
          eventType:
            role === "Buyer"
              ? "signature_buyer_signed"
              : "signature_owner_signed",
          packetId,
          packetVersion: packet.packet_version as number,
          envelopeId,
          role,
          meta: {
            signed_at:
              typeof patch.signed_at === "string" ? patch.signed_at : null,
          },
        });
      }
    }
  }

  // 11. Completion hook (transition-only)
  if (didTransitionToCompleted) {
    try {
      await onPacketCompleted({
        packet: {
          id: packetId,
          deal_id: dealId,
          thread_id: packet.thread_id as string | null,
          provider_envelope_id: envelopeId,
          packet_version: packet.packet_version as number,
        },
      });
    } catch (hookErr: any) {
      logSigError(
        "docusign_packet_completed_hook",
        {
          packetId,
          dealId,
          envelopeId,
        },
        hookErr,
      );
    }
  }

  return jsonOk({
    packetId,
    reconciledStatus,
    providerEventType,
  });
}
