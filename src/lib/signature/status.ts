// ============================================================
// Canonical string literals
// ============================================================

export type SignatureProvider = "docusign";

export const SIGNATURE_PROVIDERS: readonly SignatureProvider[] = ["docusign"] as const;

export type SignaturePacketStatus =
  | "prepared"
  | "sent"
  | "delivered"
  | "partially_signed"
  | "completed"
  | "declined"
  | "voided"
  | "error";

export const SIGNATURE_PACKET_STATUSES: readonly SignaturePacketStatus[] = [
  "prepared",
  "sent",
  "delivered",
  "partially_signed",
  "completed",
  "declined",
  "voided",
  "error",
] as const;

export type SignatureRecipientRole = "Buyer" | "Owner";

export const SIGNATURE_RECIPIENT_ROLES: readonly SignatureRecipientRole[] = [
  "Buyer",
  "Owner",
] as const;

// ============================================================
// Type guards
// ============================================================

export function isSignaturePacketStatus(value: unknown): value is SignaturePacketStatus {
  return typeof value === "string" &&
    (SIGNATURE_PACKET_STATUSES as readonly string[]).includes(value);
}

export function isSignatureProvider(value: unknown): value is SignatureProvider {
  return typeof value === "string" &&
    (SIGNATURE_PROVIDERS as readonly string[]).includes(value);
}

export function isSignatureRecipientRole(value: unknown): value is SignatureRecipientRole {
  return typeof value === "string" &&
    (SIGNATURE_RECIPIENT_ROLES as readonly string[]).includes(value);
}

// ============================================================
// Terminal / in-flight predicates
// Terminal = no further provider transitions expected.
// ============================================================

const TERMINAL_STATUSES: readonly SignaturePacketStatus[] = [
  "completed",
  "declined",
  "voided",
] as const;

const IN_FLIGHT_STATUSES: readonly SignaturePacketStatus[] = [
  "sent",
  "delivered",
  "partially_signed",
] as const;

export function isTerminalPacketStatus(status: SignaturePacketStatus): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

export function isInFlightPacketStatus(status: SignaturePacketStatus): boolean {
  return (IN_FLIGHT_STATUSES as readonly string[]).includes(status);
}

/**
 * A packet can be superseded only if it is in an error state or not yet sent.
 * Once it is in-flight or terminal the envelope is live in DocuSign and
 * must be explicitly voided before creating a replacement.
 */
export function canPacketBeSuperseded(status: SignaturePacketStatus): boolean {
  return status === "prepared" || status === "error";
}

// ============================================================
// Provider → local status mapping (placeholder for Prompt 2)
// DocuSign envelope status values: created, sent, delivered,
// completed, declined, voided, signed (recipient-level only).
// TODO (Prompt 2): fill these in once webhook handler is built.
// ============================================================

export type DocuSignEnvelopeStatus =
  | "created"
  | "sent"
  | "delivered"
  | "completed"
  | "declined"
  | "voided";

/**
 * Maps a raw DocuSign envelope status string to the local
 * SignaturePacketStatus. Returns null for unrecognised values so
 * callers can decide to log and skip rather than silently corrupt state.
 *
 * TODO (Prompt 2): wire this into the webhook handler.
 */
export function mapDocuSignStatusToLocal(
  rawStatus: string,
): SignaturePacketStatus | null {
  const map: Record<string, SignaturePacketStatus> = {
    created: "prepared",
    sent: "sent",
    delivered: "delivered",
    completed: "completed",
    declined: "declined",
    voided: "voided",
  };
  return map[rawStatus.toLowerCase()] ?? null;
}
