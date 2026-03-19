/**
 * Completion hook for signature packet lifecycle.
 * Invoked when a packet transitions to 'completed'.
 *
 * TODO (Prompt 4): implement full artifact retrieval and storage:
 *   - Call getEnvelopeDocuments() to list available documents
 *   - Download executed PDF and certificate PDF from DocuSign
 *   - Upload to Supabase Storage under a scoped path
 *   - Update packet.executed_document_path + packet.certificate_document_path
 */

import {
  logSigInfo,
  logSigError,
} from "@/lib/signature/logging";
import type { SignaturePacketRow } from "@/lib/signature/types";

export interface PacketCompletedContext {
  packet: Pick<
    SignaturePacketRow,
    "id" | "deal_id" | "thread_id" | "provider_envelope_id" | "packet_version"
  >;
}

/**
 * Called immediately after a packet row is reconciled to status='completed'.
 * In this prompt: logs the event and returns cleanly.
 * Full artifact retrieval is deferred to Prompt 4.
 */
export async function onPacketCompleted(ctx: PacketCompletedContext): Promise<void> {
  const { packet } = ctx;

  logSigInfo("docusign_packet_completed_hook", {
    packetId: packet.id,
    dealId: packet.deal_id,
    envelopeId: packet.provider_envelope_id,
    provider: "docusign",
    status: "completed",
    meta: {
      packetVersion: packet.packet_version,
      artifactRetrievalDeferred: true,
    },
  });

  // TODO (Prompt 4): artifact retrieval sequence
  //   const dsClient = await createDocusignClient();
  //   const docs = await getEnvelopeDocuments(dsClient, packet.provider_envelope_id!);
  //   for each doc: download bytes → upload to Supabase Storage → update packet paths
}
