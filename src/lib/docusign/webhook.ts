/**
 * DocuSign Connect webhook payload parsing and status reconciliation.
 * Server-only. Never import from client code.
 */

import type { SignaturePacketStatus } from "@/lib/signature/status";

// ============================================================
// DocuSign Connect payload shape (MVP subset)
// ============================================================

export interface DocusignConnectSigner {
  recipientId?: string;
  roleName?: string;
  name?: string;
  email?: string;
  status?: string;
  signedDateTime?: string | null;
}

export interface DocusignConnectEnvelopeSummary {
  status?: string;
  sentDateTime?: string | null;
  deliveredDateTime?: string | null;
  completedDateTime?: string | null;
  declinedDateTime?: string | null;
  voidedDateTime?: string | null;
  recipients?: {
    signers?: DocusignConnectSigner[];
  };
}

export interface DocusignConnectPayload {
  /** e.g. "envelope-sent", "envelope-completed", "recipient-completed" */
  event?: string;
  apiVersion?: string;
  /** ISO-8601 when DocuSign generated this event */
  generatedDateTime?: string | null;
  data?: {
    envelopeId?: string;
    accountId?: string;
    userId?: string;
    envelopeSummary?: DocusignConnectEnvelopeSummary;
  };
}

/** Parsed and validated result from parseDocusignConnectEvent() */
export interface ParsedDocusignEvent {
  envelopeId: string;
  providerEventType: string;
  providerEventAt: string | null;
  envelopeStatus: string | null;
  completedAt: string | null;
  declinedAt: string | null;
  voidedAt: string | null;
  signers: DocusignConnectSigner[];
  /** Raw parsed payload (never re-stringified in logs to prevent PII exposure) */
  raw: DocusignConnectPayload;
}

// ============================================================
// Parser
// ============================================================

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/**
 * Parses a raw (already-verified) DocuSign Connect JSON string.
 * Returns ok:false with a safe error message if the payload is invalid or
 * missing required fields (envelope id).
 */
export function parseDocusignConnectEvent(
  rawJson: string,
): ParseResult<ParsedDocusignEvent> {
  let payload: DocusignConnectPayload;

  try {
    payload = JSON.parse(rawJson) as DocusignConnectPayload;
  } catch {
    return { ok: false, error: "Payload is not valid JSON" };
  }

  const envelopeId = payload?.data?.envelopeId?.trim();
  if (!envelopeId) {
    return { ok: false, error: "Missing data.envelopeId in webhook payload" };
  }

  const providerEventType = (payload.event ?? "unknown").trim();
  const providerEventAt = payload.generatedDateTime?.trim() ?? null;
  const summary = payload.data?.envelopeSummary;
  const envelopeStatus = summary?.status?.trim() ?? null;
  const completedAt = summary?.completedDateTime ?? null;
  const declinedAt = summary?.declinedDateTime ?? null;
  const voidedAt = summary?.voidedDateTime ?? null;
  const signers = summary?.recipients?.signers ?? [];

  return {
    ok: true,
    value: {
      envelopeId,
      providerEventType,
      providerEventAt,
      envelopeStatus,
      completedAt,
      declinedAt,
      voidedAt,
      signers,
      raw: payload,
    },
  };
}

// ============================================================
// Status reconciliation
// ============================================================

/**
 * Monotonic status precedence. Higher index = more advanced.
 * declined and voided are terminal side-paths — treated as ceiling.
 */
const STATUS_ORDER: SignaturePacketStatus[] = [
  "prepared",
  "sent",
  "delivered",
  "partially_signed",
  "completed",
] as const;

const TERMINAL_STATUSES: ReadonlySet<SignaturePacketStatus> = new Set([
  "completed",
  "declined",
  "voided",
]);

function statusRank(s: SignaturePacketStatus): number {
  const idx = STATUS_ORDER.indexOf(s as any);
  return idx === -1 ? -1 : idx;
}

/**
 * Derives the new local packet status from the provider payload.
 * Returns null if current status should not change.
 *
 * Rules (applied in priority order):
 * 1. Never regress a terminal state (completed / declined / voided).
 * 2. envelope voided  → voided
 * 3. envelope declined → declined
 * 4. all required signers completed → completed
 * 5. at least one signer completed → partially_signed
 * 6. envelope delivered → delivered
 * 7. envelope sent/created → sent
 * 8. Monotonic: only advance, never regress along the main sequence.
 */
export function reconcilePacketStatus(
  currentStatus: SignaturePacketStatus,
  parsed: ParsedDocusignEvent,
): SignaturePacketStatus | null {
  // Rule 1 — terminal states are immutable
  if (TERMINAL_STATUSES.has(currentStatus)) {
    return null;
  }

  const providerStatus = parsed.envelopeStatus?.toLowerCase() ?? "";
  const signers = parsed.signers;

  // Rule 2 — voided
  if (providerStatus === "voided" || parsed.voidedAt) {
    return currentStatus !== "voided" ? "voided" : null;
  }

  // Rule 3 — declined
  if (providerStatus === "declined" || parsed.declinedAt) {
    return currentStatus !== "declined" ? "declined" : null;
  }

  let candidate: SignaturePacketStatus | null = null;

  // Rules 4 & 5 — derive from signer completions when signers are present
  if (signers.length > 0) {
    const completedSigners = signers.filter(
      (s) => s.status?.toLowerCase() === "completed",
    );
    const allComplete =
      completedSigners.length >= 2 || // MVP: exactly 2 signers required
      (completedSigners.length === signers.length && signers.length > 0);

    if (parsed.completedAt || allComplete) {
      candidate = "completed";
    } else if (completedSigners.length > 0) {
      candidate = "partially_signed";
    }
  }

  // Rule 6 — delivered (only if we didn't derive a higher state)
  if (!candidate) {
    if (providerStatus === "delivered") {
      candidate = "delivered";
    }
  }

  // Rule 7 — sent / created
  if (!candidate) {
    if (providerStatus === "sent" || providerStatus === "created") {
      candidate = "sent";
    }
  }

  if (!candidate) return null;

  // Rule 8 — monotonic: only advance
  const currentRank = statusRank(currentStatus);
  const candidateRank = statusRank(candidate);

  if (candidateRank > currentRank) return candidate;
  if (candidate === "completed" && currentStatus !== "completed") return candidate;

  return null;
}

// ============================================================
// Recipient status extraction
// ============================================================

export interface RecipientStatusUpdate {
  providerRecipientId: string | null;
  providerStatus: string | null;
  signedAt: string | null;
}

export type RecipientRoleMap = {
  Buyer: RecipientStatusUpdate | null;
  Owner: RecipientStatusUpdate | null;
};

/**
 * Extracts per-role recipient status updates from the provider payload.
 * Matches by roleName first ("Buyer" / "Owner"), then by index position.
 * Never creates new recipient rows.
 */
export function extractRecipientStatuses(
  signers: DocusignConnectSigner[],
): RecipientRoleMap {
  const map: RecipientRoleMap = { Buyer: null, Owner: null };

  if (!signers.length) return map;

  for (const signer of signers) {
    const role = signer.roleName?.trim();
    if (role === "Buyer" || role === "Owner") {
      map[role] = {
        providerRecipientId: signer.recipientId ?? null,
        providerStatus: signer.status ?? null,
        signedAt:
          signer.status?.toLowerCase() === "completed"
            ? (signer.signedDateTime ?? null)
            : null,
      };
    }
  }

  // Fallback: if roleName is absent, assign by routing order (recipientId 1 = Buyer, 2 = Owner)
  if (!map.Buyer && !map.Owner) {
    for (const signer of signers) {
      if (signer.recipientId === "1") {
        map.Buyer = {
          providerRecipientId: signer.recipientId ?? null,
          providerStatus: signer.status ?? null,
          signedAt:
            signer.status?.toLowerCase() === "completed"
              ? (signer.signedDateTime ?? null)
              : null,
        };
      } else if (signer.recipientId === "2") {
        map.Owner = {
          providerRecipientId: signer.recipientId ?? null,
          providerStatus: signer.status ?? null,
          signedAt:
            signer.status?.toLowerCase() === "completed"
              ? (signer.signedDateTime ?? null)
              : null,
        };
      }
    }
  }

  return map;
}
