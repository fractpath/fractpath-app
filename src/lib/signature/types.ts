import type { SignaturePacketStatus, SignatureProvider, SignatureRecipientRole } from "./status";

// ============================================================
// Core union types (re-exported for convenience)
// ============================================================
export type { SignatureProvider, SignaturePacketStatus, SignatureRecipientRole };

// ============================================================
// Prepared snapshot shape
// This is the frozen economics blob stored in prepared_snapshot_json.
// The prepare route will populate this before creating the DB row.
// ============================================================

/**
 * Accepted economics placeholder.
 * TODO (Prompt 2): import canonical accepted snapshot type once the
 * accepted-deal snapshot record shape is finalised and importable from
 * a shared types module. For now use an opaque object so this module
 * does not fabricate business math.
 */
export type AcceptedEconomicsPayload = Record<string, unknown>;

export interface SignaturePreparedSnapshotPayload {
  dealId: string;
  threadId: string | null;
  /** Version of the calculator_snapshot row used as the accepted economics source. */
  acceptedSnapshotVersion: number;
  propertyDisplayAddress: string;
  buyer: {
    userId?: string;
    displayName: string;
    email: string;
  };
  owner: {
    userId?: string;
    displayName: string;
    email: string;
  };
  packetVersion: number;
  templateKey: string;
  preparedAt: string;   // ISO-8601
  preparedBy: string;   // user_id of the server actor
  /** Raw accepted economics. Stored verbatim; never recomputed. */
  acceptedEconomics: AcceptedEconomicsPayload;
}

// ============================================================
// DB row shapes (mirrors DB columns exactly)
// ============================================================

export interface SignaturePacketRow {
  id: string;
  deal_id: string;
  thread_id: string | null;
  provider: SignatureProvider;
  packet_version: number;
  status: SignaturePacketStatus;
  template_key: string | null;
  provider_envelope_id: string | null;
  prepared_snapshot_json: SignaturePreparedSnapshotPayload;
  provider_payload_json: Record<string, unknown> | null;
  provider_last_status: string | null;
  executed_document_path: string | null;
  certificate_document_path: string | null;
  sent_at: string | null;
  completed_at: string | null;
  voided_at: string | null;
  declined_at: string | null;
  supersedes_packet_id: string | null;
  superseded_by_packet_id: string | null;
  last_error: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SignatureRecipientRow {
  id: string;
  packet_id: string;
  role: SignatureRecipientRole;
  user_id: string | null;
  display_name: string;
  email: string;
  routing_order: number;
  provider_recipient_id: string | null;
  provider_status: string | null;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SignatureEventRow {
  id: string;
  packet_id: string;
  provider: SignatureProvider;
  provider_event_type: string;
  provider_event_at: string | null;
  payload_json: Record<string, unknown>;
  created_at: string;
}

// ============================================================
// Insert input shapes (used by privileged server routes only)
// ============================================================

export type SignaturePacketInsert = Omit<
  SignaturePacketRow,
  "id" | "created_at" | "updated_at"
>;

export type SignatureRecipientInsert = Omit<
  SignatureRecipientRow,
  "id" | "created_at" | "updated_at"
>;

export type SignatureEventInsert = Omit<
  SignatureEventRow,
  "id" | "created_at"
>;
