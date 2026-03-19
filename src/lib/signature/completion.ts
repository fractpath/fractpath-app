/**
 * Completion hook for signature packet lifecycle.
 * Invoked when a packet transitions to 'completed'.
 *
 * Retrieves executed agreement and certificate of completion PDFs from DocuSign,
 * stores them in the deal-signatures bucket, and updates the packet row.
 */

import { logSigInfo, logSigError } from "@/lib/signature/logging";
import type { SignaturePacketRow } from "@/lib/signature/types";
import { retrieveAndStoreArtifacts } from "@/lib/signature/artifacts";

export interface PacketCompletedContext {
  packet: Pick<
    SignaturePacketRow,
    "id" | "deal_id" | "thread_id" | "provider_envelope_id" | "packet_version"
  >;
}

/**
 * Called immediately after a packet row is reconciled to status='completed'.
 *
 * Behavior:
 * - If both artifact paths are already set → idempotent no-op
 * - If one is missing → retrieves only the missing artifact
 * - If DocuSign/storage fails → logs last_error, does NOT regress packet status
 * - Safe to call more than once for the same packet
 */
export async function onPacketCompleted(ctx: PacketCompletedContext): Promise<void> {
  const { packet } = ctx;
  const { id: packetId, deal_id: dealId, provider_envelope_id: envelopeId } = packet;

  if (!envelopeId) {
    logSigError(
      "docusign_artifact_retrieval_failed",
      { packetId, dealId, envelopeId: "(none)", meta: { reason: "missing_envelope_id" } },
      new Error("Packet has no provider_envelope_id — cannot retrieve artifacts"),
    );
    return;
  }

  logSigInfo("docusign_packet_completed_hook", {
    packetId,
    dealId,
    envelopeId,
    provider: "docusign",
    status: "completed",
    meta: { packetVersion: packet.packet_version },
  });

  try {
    const result = await retrieveAndStoreArtifacts({
      packetId,
      dealId: dealId ?? "",
      envelopeId,
      existingExecPath: null,
      existingCertPath: null,
    });

    if (result.errors.length > 0) {
      logSigError(
        "docusign_artifact_retrieval_failed",
        {
          packetId,
          dealId,
          envelopeId,
          meta: {
            execStored: result.execStored,
            certStored: result.certStored,
            errorCount: result.errors.length,
          },
        },
        new Error(result.errors.join("; ")),
      );
    }
  } catch (err: any) {
    logSigError("docusign_artifact_retrieval_failed", { packetId, dealId, envelopeId }, err);
  }
}
