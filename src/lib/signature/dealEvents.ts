/**
 * Idempotent deal_events insertion for normalized signature lifecycle events.
 *
 * Uses a payload-fingerprint existence check to prevent duplicate events on:
 *   - repeated webhook deliveries
 *   - artifact-retrieval retries
 *   - admin button double-clicks (page refresh after prepare/send)
 *
 * Fingerprint dimensions (checked via JSONB ->> operator):
 *   - deal_id + event_type + payload->>'packet_id'  (packet-level events)
 *   - + payload->>'role'                            (signer-level events only)
 *
 * All failures are non-fatal and logged via logSigWarn.
 * Never throws. Safe to call inside any try/catch boundary.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { logSigInfo, logSigWarn } from "@/lib/signature/logging";

export type SigDealEventType =
  | "signature_agreement_prepared"
  | "signature_request_sent"
  | "signature_buyer_signed"
  | "signature_owner_signed"
  | "signature_fully_executed"
  | "signature_declined"
  | "signature_voided"
  | "signature_documents_stored";

export interface InsertSigDealEventParams {
  svc: ReturnType<typeof createServiceClient>;
  dealId: string;
  eventType: SigDealEventType;
  packetId: string;
  packetVersion: number;
  envelopeId?: string | null;
  role?: "Buyer" | "Owner";
  meta?: Record<string, unknown>;
}

/**
 * Inserts a normalized signature deal_event unless an identical one already exists.
 *
 * Idempotency check uses:
 *   deal_id + event_type + payload->>'packet_id' [+ payload->>'role' for signer events]
 *
 * Non-fatal — all errors are swallowed and logged. Never throws.
 */
export async function insertSigDealEventIfMissing(
  params: InsertSigDealEventParams,
): Promise<void> {
  const { svc, dealId, eventType, packetId, packetVersion, envelopeId, role, meta } =
    params;

  try {
    let dupQuery = (svc.from("deal_events") as any)
      .select("id")
      .eq("deal_id", dealId)
      .eq("event_type", eventType)
      .filter("payload->>packet_id", "eq", packetId);

    if (role) {
      dupQuery = dupQuery.filter("payload->>role", "eq", role);
    }

    const { data: existing } = await dupQuery.limit(1).maybeSingle();

    if (existing) {
      logSigInfo("sig_deal_event_skipped", {
        dealId,
        packetId,
        meta: { eventType, reason: "already_exists" },
      });
      return;
    }

    const payload: Record<string, unknown> = {
      packet_id: packetId,
      packet_version: packetVersion,
      provider: "docusign",
    };

    if (envelopeId) payload.envelope_id = envelopeId;
    if (role) payload.role = role;
    if (meta) Object.assign(payload, meta);

    const { error: insertErr } = await (svc.from("deal_events") as any).insert({
      deal_id: dealId,
      event_type: eventType,
      payload,
      created_by: null,
    });

    if (insertErr) {
      logSigWarn("sig_deal_event_insert_failed", {
        dealId,
        packetId,
        meta: { eventType, reason: insertErr.message },
      });
      return;
    }

    logSigInfo("sig_deal_event_inserted", {
      dealId,
      packetId,
      meta: { eventType, role: role ?? null },
    });
  } catch (err: any) {
    logSigWarn("sig_deal_event_insert_failed", {
      dealId,
      packetId,
      meta: { eventType, reason: err?.message ?? "unknown" },
    });
  }
}
