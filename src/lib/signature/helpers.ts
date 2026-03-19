/**
 * Server-side helpers for signature packet lifecycle.
 * All functions receive a service-role Supabase client.
 * No end-user client is used here — privileged reads only.
 */

import type { SignaturePacketStatus } from "./status";
import { isInFlightPacketStatus } from "./status";
import type { SignaturePacketRow, SignatureRecipientRow } from "./types";

// ============================================================
// Types
// ============================================================

export interface SignerIdentity {
  userId: string | null;
  displayName: string;
  email: string;
}

export interface ResolvedSigners {
  buyer: SignerIdentity;
  owner: SignerIdentity;
}

export interface AcceptedThreadContext {
  threadId: string;
  dealId: string;
  buyerUserId: string;
  ownerUserId: string | null;
  currentProposalId: string | null;
  propertyId: string;
}

// ============================================================
// Packet query helpers
// ============================================================

export async function findLatestPacketForDeal(
  svc: any,
  dealId: string,
): Promise<SignaturePacketRow | null> {
  const { data, error } = await (svc.from("deal_signature_packets") as any)
    .select("*")
    .eq("deal_id", dealId)
    .order("packet_version", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`findLatestPacketForDeal failed: ${error.message}`);
  }
  return data ?? null;
}

export async function findInFlightPacketForDeal(
  svc: any,
  dealId: string,
): Promise<SignaturePacketRow | null> {
  const IN_FLIGHT: SignaturePacketStatus[] = ["sent", "delivered", "partially_signed"];

  const { data, error } = await (svc.from("deal_signature_packets") as any)
    .select("*")
    .eq("deal_id", dealId)
    .in("status", IN_FLIGHT)
    .order("packet_version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`findInFlightPacketForDeal failed: ${error.message}`);
  }
  return data ?? null;
}

export async function getNextPacketVersion(
  svc: any,
  dealId: string,
): Promise<number> {
  const { data, error } = await (svc.from("deal_signature_packets") as any)
    .select("packet_version")
    .eq("deal_id", dealId)
    .order("packet_version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`getNextPacketVersion failed: ${error.message}`);
  }
  return data ? (data.packet_version as number) + 1 : 1;
}

export async function getPacketRecipients(
  svc: any,
  packetId: string,
): Promise<SignatureRecipientRow[]> {
  const { data, error } = await (svc.from("deal_signature_recipients") as any)
    .select("*")
    .eq("packet_id", packetId)
    .order("routing_order", { ascending: true });

  if (error) {
    throw new Error(`getPacketRecipients failed: ${error.message}`);
  }
  return data ?? [];
}

// ============================================================
// Accepted thread resolution
// ============================================================

/**
 * Finds the accepted thread for a deal.
 * The canonical accepted state for the signature flow is
 * deal_threads.status = 'accepted', which is set by the owner-decision
 * route when an offer is accepted.
 */
export async function resolveAcceptedThread(
  svc: any,
  dealId: string,
): Promise<AcceptedThreadContext | null> {
  const { data, error } = await (svc.from("deal_threads") as any)
    .select("id, deal_id, buyer_user_id, owner_user_id, current_proposal_id, property_id, status")
    .eq("deal_id", dealId)
    .eq("status", "accepted")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`resolveAcceptedThread failed: ${error.message}`);
  }
  if (!data) return null;

  return {
    threadId: data.id as string,
    dealId: data.deal_id as string,
    buyerUserId: data.buyer_user_id as string,
    ownerUserId: (data.owner_user_id as string | null) ?? null,
    currentProposalId: (data.current_proposal_id as string | null) ?? null,
    propertyId: data.property_id as string,
  };
}

// ============================================================
// Signer identity resolution
// ============================================================

/**
 * Resolves buyer and owner email + display name from auth.users and profiles.
 * Returns null for either party if identity is incomplete.
 * Caller must reject prepare if either returns null.
 */
export async function resolveSignerIdentities(
  svc: any,
  thread: AcceptedThreadContext,
): Promise<{ buyer: SignerIdentity | null; owner: SignerIdentity | null }> {
  const [buyerResult, ownerResult] = await Promise.all([
    resolveUserIdentity(svc, thread.buyerUserId),
    thread.ownerUserId ? resolveUserIdentity(svc, thread.ownerUserId) : Promise.resolve(null),
  ]);

  return { buyer: buyerResult, owner: ownerResult };
}

async function resolveUserIdentity(
  svc: any,
  userId: string,
): Promise<SignerIdentity | null> {
  // Look up auth email (authoritative source for signer email)
  let email: string | null = null;
  let displayName = "";

  try {
    const { data: authUser } = await svc.auth.admin.getUserById(userId);
    if (authUser?.user?.email) {
      email = authUser.user.email.trim().toLowerCase();
    }
  } catch {
    return null;
  }

  if (!email) return null;

  // Look up profile for display name (first_name + last_name, fallback to nickname)
  try {
    const { data: profile } = await (svc.from("profiles") as any)
      .select("first_name, last_name, nickname")
      .eq("id", userId)
      .maybeSingle();

    if (profile) {
      const fullName = [profile.first_name, profile.last_name]
        .filter((s: string) => typeof s === "string" && s.trim())
        .join(" ")
        .trim();
      displayName = fullName || (profile.nickname as string) || email;
    } else {
      displayName = email;
    }
  } catch {
    displayName = email;
  }

  return { userId, displayName, email };
}

// ============================================================
// Property address resolution
// ============================================================

/**
 * Resolves the best available display address for a deal.
 * Priority:
 *   1. Latest DEAL_HEADER_UPDATED event's display_address
 *   2. properties.address (raw address column)
 *   3. Fallback string
 */
export async function resolvePropertyDisplayAddress(
  svc: any,
  dealId: string,
  propertyId: string,
): Promise<string> {
  // 1. Canonical header event
  try {
    const { data: headerEv } = await (svc.from("deal_events") as any)
      .select("payload")
      .eq("deal_id", dealId)
      .eq("event_type", "DEAL_HEADER_UPDATED")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (headerEv?.payload && typeof headerEv.payload === "object") {
      const addr = (headerEv.payload as any).display_address;
      if (typeof addr === "string" && addr.trim()) {
        return addr.trim();
      }
    }
  } catch {
    // non-fatal — fall through to property lookup
  }

  // 2. Property address column
  try {
    const { data: prop } = await (svc.from("properties") as any)
      .select("address, normalized_address")
      .eq("id", propertyId)
      .maybeSingle();

    if (prop) {
      const addr = (prop.normalized_address as string | null) || (prop.address as string | null);
      if (addr?.trim()) return addr.trim();
    }
  } catch {
    // non-fatal
  }

  return "this property";
}

// ============================================================
// Accepted economics resolution
// ============================================================

/**
 * Reads the terms_snapshot from the accepted proposal.
 * Returns null if the proposal is missing or not in accepted status.
 */
export async function resolveAcceptedEconomics(
  svc: any,
  proposalId: string,
): Promise<{ termsSnapshot: Record<string, unknown>; proposalId: string } | null> {
  const { data, error } = await (svc.from("deal_proposals") as any)
    .select("id, status, terms_snapshot")
    .eq("id", proposalId)
    .eq("status", "accepted")
    .maybeSingle();

  if (error) {
    throw new Error(`resolveAcceptedEconomics failed: ${error.message}`);
  }
  if (!data) return null;

  return {
    proposalId: data.id as string,
    termsSnapshot: (data.terms_snapshot as Record<string, unknown>) ?? {},
  };
}

// ============================================================
// Idempotency: check for equivalent prepared packet
// ============================================================

/**
 * Returns true if an existing prepared packet has effectively the same
 * signer emails as the newly resolved signers (idempotency guard).
 */
export function isSameSignerIdentity(
  packet: SignaturePacketRow,
  buyer: SignerIdentity,
  owner: SignerIdentity,
): boolean {
  const snap = packet.prepared_snapshot_json;
  if (!snap) return false;
  return (
    snap.buyer?.email === buyer.email &&
    snap.owner?.email === owner.email
  );
}

// ============================================================
// Status guard helper
// ============================================================

export function describePacketConflict(
  status: SignaturePacketStatus,
): string | null {
  if (isInFlightPacketStatus(status)) {
    return `An in-flight signature packet (status: ${status}) already exists for this deal. It must complete, be declined, or be voided before a new packet can be prepared.`;
  }
  return null;
}
