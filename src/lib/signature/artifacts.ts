/**
 * DocuSign artifact selection and local storage for completed signature packets.
 * Server-only. Never import from client code.
 *
 * Storage bucket: deal-signatures (private, service-role access only)
 * Path convention (within bucket):
 *   {dealId}/{packetId}/executed-agreement.pdf
 *   {dealId}/{packetId}/certificate-of-completion.pdf
 */

import type { DocuSignEnvelopeDocumentsResponse, DocuSignDocumentDetail } from "@/lib/docusign/types";
import {
  createDocusignClient,
  getEnvelopeDocuments,
  downloadEnvelopeDocument,
} from "@/lib/docusign/client";
import { createServiceClient } from "@/lib/supabase/service";
import { logSigInfo, logSigWarn, logSigError } from "@/lib/signature/logging";

// ============================================================
// Constants
// ============================================================

export const SIGNATURE_BUCKET = "deal-signatures";
const SIGNED_URL_TTL_SECONDS = 3600; // 1 hour

// ============================================================
// Document selection helpers
// ============================================================

/**
 * Selects the executed agreement document from a DocuSign envelope documents response.
 *
 * Priority:
 * 1. documentId === "combined" — merged, completed, all-pages PDF (DocuSign canonical ID)
 * 2. First document where type !== "summary" and documentId !== "certificate"
 *    (fallback: first real content document)
 */
export function selectExecutedAgreementDocument(
  response: DocuSignEnvelopeDocumentsResponse,
): DocuSignDocumentDetail | null {
  const docs = response.envelopeDocuments ?? [];

  const combined = docs.find((d) => d.documentId === "combined");
  if (combined) return combined;

  const firstContent = docs.find(
    (d) => d.documentId !== "certificate" && d.type !== "summary",
  );
  return firstContent ?? null;
}

/**
 * Selects the certificate of completion document.
 *
 * Priority:
 * 1. documentId === "certificate" — DocuSign canonical certificate ID
 * 2. Any document with type === "summary"
 */
export function selectCertificateDocument(
  response: DocuSignEnvelopeDocumentsResponse,
): DocuSignDocumentDetail | null {
  const docs = response.envelopeDocuments ?? [];

  const cert = docs.find((d) => d.documentId === "certificate");
  if (cert) return cert;

  const summary = docs.find((d) => d.type === "summary");
  return summary ?? null;
}

// ============================================================
// Storage path helpers
// ============================================================

export function execAgreementPath(dealId: string, packetId: string): string {
  return `${dealId}/${packetId}/executed-agreement.pdf`;
}

export function certificatePath(dealId: string, packetId: string): string {
  return `${dealId}/${packetId}/certificate-of-completion.pdf`;
}

// ============================================================
// Artifact retrieval context
// ============================================================

export interface ArtifactRetrievalContext {
  packetId: string;
  dealId: string;
  envelopeId: string;
  /** Current packet paths — used for idempotency check; pass null when unknown. */
  existingExecPath: string | null;
  existingCertPath: string | null;
}

// ============================================================
// Core retrieval function
// ============================================================

/**
 * Retrieves completed envelope artifacts from DocuSign and stores them locally.
 *
 * Idempotent: skips upload if the deterministic storage path is already set in
 * the packet row. Safe to call more than once for the same packet.
 *
 * Failure modes:
 * - DocuSign API errors → caught; packet.last_error updated; status NOT regressed
 * - Storage upload errors → same
 * - Certificate unavailable → warning logged; hook continues without failing
 *
 * Returns a summary of what was done.
 */
export async function retrieveAndStoreArtifacts(
  ctx: ArtifactRetrievalContext,
): Promise<{ execStored: boolean; certStored: boolean; errors: string[] }> {
  const { packetId, dealId, envelopeId } = ctx;
  const svc = createServiceClient();
  const errors: string[] = [];

  // ── 1. Idempotency — re-read current paths from DB (authoritative source) ──

  const { data: currentPacket, error: fetchErr } = await (
    svc.from("deal_signature_packets") as any
  )
    .select("executed_document_path, certificate_document_path")
    .eq("id", packetId)
    .maybeSingle();

  if (fetchErr) {
    const msg = `Packet fetch failed: ${fetchErr.message}`;
    logSigError("docusign_artifact_retrieval_failed", { packetId, dealId, envelopeId, meta: { reason: "packet_fetch_failed" } }, new Error(msg));
    return { execStored: false, certStored: false, errors: [msg] };
  }

  const needsExec = !currentPacket?.executed_document_path;
  const needsCert = !currentPacket?.certificate_document_path;

  if (!needsExec && !needsCert) {
    logSigInfo("docusign_artifacts_linked", {
      packetId, dealId, envelopeId,
      meta: { alreadyLinked: true, skipped: true },
    });
    return { execStored: false, certStored: false, errors: [] };
  }

  // ── 2. Create DocuSign client ──

  let dsClient;
  try {
    dsClient = await createDocusignClient();
  } catch (err: any) {
    const msg = `DocuSign client creation failed: ${err.message}`;
    logSigError("docusign_artifact_retrieval_failed", { packetId, dealId, envelopeId, meta: { reason: "client_init_failed" } }, err);
    await _setPacketLastError(svc, packetId, msg);
    return { execStored: false, certStored: false, errors: [msg] };
  }

  // ── 3. List envelope documents ──

  let docsResponse: DocuSignEnvelopeDocumentsResponse;
  try {
    docsResponse = await getEnvelopeDocuments(dsClient, envelopeId);
    logSigInfo("docusign_artifacts_listed", {
      packetId, dealId, envelopeId,
      meta: { docCount: docsResponse.envelopeDocuments?.length ?? 0 },
    });
  } catch (err: any) {
    const msg = `Envelope documents listing failed: ${err.message}`;
    logSigError("docusign_artifact_retrieval_failed", { packetId, dealId, envelopeId, meta: { reason: "list_failed" } }, err);
    await _setPacketLastError(svc, packetId, msg);
    return { execStored: false, certStored: false, errors: [msg] };
  }

  // ── 4. Select documents ──

  const execDoc = needsExec ? selectExecutedAgreementDocument(docsResponse) : null;
  const certDoc = needsCert ? selectCertificateDocument(docsResponse) : null;

  if (needsExec) {
    if (execDoc) {
      logSigInfo("docusign_artifact_selected", {
        packetId, dealId, envelopeId,
        meta: { kind: "executed_agreement", documentId: execDoc.documentId, name: execDoc.name },
      });
    } else {
      logSigWarn("docusign_artifact_missing", {
        packetId, dealId, envelopeId,
        meta: { kind: "executed_agreement", reason: "no_document_found_in_envelope" },
      });
    }
  }

  if (needsCert) {
    if (certDoc) {
      logSigInfo("docusign_artifact_selected", {
        packetId, dealId, envelopeId,
        meta: { kind: "certificate", documentId: certDoc.documentId, name: certDoc.name },
      });
    } else {
      logSigWarn("docusign_artifact_missing", {
        packetId, dealId, envelopeId,
        meta: { kind: "certificate", reason: "no_certificate_in_envelope" },
      });
    }
  }

  // ── 5. Download and upload each needed artifact ──

  const patch: Record<string, string | null> = {};
  let execStored = false;
  let certStored = false;

  // Executed agreement
  if (needsExec && execDoc) {
    try {
      const download = await downloadEnvelopeDocument(dsClient, envelopeId, execDoc.documentId);
      logSigInfo("docusign_artifact_downloaded", {
        packetId, dealId, envelopeId,
        meta: { kind: "executed_agreement", documentId: execDoc.documentId, byteSize: download.bytes.length },
      });

      const storagePath = execAgreementPath(dealId, packetId);
      const { error: uploadErr } = await svc.storage
        .from(SIGNATURE_BUCKET)
        .upload(storagePath, download.bytes, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (uploadErr) {
        throw new Error(`Storage upload failed: ${uploadErr.message}`);
      }

      logSigInfo("docusign_artifact_uploaded", {
        packetId, dealId, envelopeId,
        meta: { kind: "executed_agreement", storagePath },
      });

      patch.executed_document_path = storagePath;
      execStored = true;
    } catch (err: any) {
      const msg = `Executed agreement retrieval/storage failed: ${err.message}`;
      logSigError("docusign_artifact_retrieval_failed", {
        packetId, dealId, envelopeId,
        meta: { kind: "executed_agreement", documentId: execDoc.documentId },
      }, err);
      errors.push(msg);
    }
  }

  // Certificate of completion
  if (needsCert && certDoc) {
    try {
      const download = await downloadEnvelopeDocument(dsClient, envelopeId, certDoc.documentId);
      logSigInfo("docusign_artifact_downloaded", {
        packetId, dealId, envelopeId,
        meta: { kind: "certificate", documentId: certDoc.documentId, byteSize: download.bytes.length },
      });

      const storagePath = certificatePath(dealId, packetId);
      const { error: uploadErr } = await svc.storage
        .from(SIGNATURE_BUCKET)
        .upload(storagePath, download.bytes, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (uploadErr) {
        throw new Error(`Storage upload failed: ${uploadErr.message}`);
      }

      logSigInfo("docusign_artifact_uploaded", {
        packetId, dealId, envelopeId,
        meta: { kind: "certificate", storagePath },
      });

      patch.certificate_document_path = storagePath;
      certStored = true;
    } catch (err: any) {
      const msg = `Certificate retrieval/storage failed: ${err.message}`;
      logSigError("docusign_artifact_retrieval_failed", {
        packetId, dealId, envelopeId,
        meta: { kind: "certificate", documentId: certDoc.documentId },
      }, err);
      errors.push(msg);
    }
  }

  // ── 6. Update packet row ──

  if (Object.keys(patch).length > 0) {
    const rowUpdate: Record<string, string | null> = { ...patch };
    // Clear last_error on full success; leave it alone on partial failure
    if (errors.length === 0) {
      rowUpdate.last_error = null;
    }

    const { error: updateErr } = await (
      svc.from("deal_signature_packets") as any
    )
      .update(rowUpdate)
      .eq("id", packetId);

    if (updateErr) {
      const msg = `Packet row update failed: ${updateErr.message}`;
      logSigError("docusign_artifact_retrieval_failed", {
        packetId, dealId, envelopeId,
        meta: { reason: "packet_row_update_failed" },
      }, new Error(msg));
      errors.push(msg);
      // Note: storage files are already uploaded. On next retry, idempotency via
      // upsert:true means re-upload is safe; this update will be retried.
    } else {
      logSigInfo("docusign_artifacts_linked", {
        packetId, dealId, envelopeId,
        meta: {
          execStored,
          certStored,
          execPath: patch.executed_document_path ?? null,
          certPath: patch.certificate_document_path ?? null,
        },
      });
    }
  } else if (errors.length > 0) {
    await _setPacketLastError(svc, packetId, errors[0]);
  }

  return { execStored, certStored, errors };
}

// ============================================================
// Signed URL generation helper
// ============================================================

/**
 * Generates short-lived signed URLs for one or both artifact paths on a packet.
 * Returns null for a path if it is not set or signing fails.
 */
export async function getArtifactSignedUrls(
  executedDocumentPath: string | null,
  certificateDocumentPath: string | null,
  ttlSeconds = SIGNED_URL_TTL_SECONDS,
): Promise<{
  executed_agreement_url: string | null;
  certificate_url: string | null;
}> {
  const svc = createServiceClient();

  const [execResult, certResult] = await Promise.all([
    executedDocumentPath
      ? svc.storage.from(SIGNATURE_BUCKET).createSignedUrl(executedDocumentPath, ttlSeconds)
      : Promise.resolve({ data: null }),
    certificateDocumentPath
      ? svc.storage.from(SIGNATURE_BUCKET).createSignedUrl(certificateDocumentPath, ttlSeconds)
      : Promise.resolve({ data: null }),
  ]);

  return {
    executed_agreement_url: (execResult.data as any)?.signedUrl ?? null,
    certificate_url: (certResult.data as any)?.signedUrl ?? null,
  };
}

// ============================================================
// Internal helpers
// ============================================================

async function _setPacketLastError(
  svc: ReturnType<typeof createServiceClient>,
  packetId: string,
  message: string,
): Promise<void> {
  try {
    await (svc.from("deal_signature_packets") as any)
      .update({ last_error: message.slice(0, 2000) })
      .eq("id", packetId);
  } catch {
    // Non-fatal — best-effort error recording
  }
}
