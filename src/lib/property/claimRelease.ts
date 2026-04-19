/**
 * Property Claim Release — eligibility predicates and transactional service mutations.
 *
 * Eligibility functions are pure (take data as arguments) and are separately testable.
 * Service functions take a Supabase service client and perform transactional mutations.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Typed confirmation string required for admin void+release */
export const VOID_AND_RELEASE_CONFIRMATION = "VOID AND RELEASE";

export const RELEASE_REASON_CODES = [
  "stale_test_data",
  "erroneous_acceptance",
  "duplicate_property",
  "wrong_owner_attached",
  "support_remediation",
  "compliance_legal_instruction",
  "internal_qa_cleanup",
  "other",
] as const;

export type ReleaseReasonCode = (typeof RELEASE_REASON_CODES)[number];

/** deal_threads statuses that constitute a binding / blocked state */
export const BINDING_THREAD_STATUSES = new Set(["accepted"]);

/** deal_threads statuses that are active non-binding negotiations */
export const ACTIVE_NONBINDING_THREAD_STATUSES = new Set([
  "draft",
  "pending_owner",
  "negotiating",
  "decision_pending",
]);

/** signature packet statuses that block release */
export const BLOCKING_SIGNATURE_STATUSES = new Set([
  "prepared",
  "sent",
  "delivered",
  "partially_signed",
  "completed",
]);

/** signature packet statuses that should be voided when their deal is voided */
export const VOIDABLE_SIGNATURE_STATUSES = new Set([
  "prepared",
  "sent",
  "delivered",
  "partially_signed",
]);

/** closing_review_status values that block release */
export const BLOCKING_CLOSING_STATUSES = new Set(["pending", "issue_found"]);

// ---------------------------------------------------------------------------
// Pure eligibility types
// ---------------------------------------------------------------------------

export interface ThreadSummary {
  id: string;
  status: string;
}

export interface SignaturePacketSummary {
  id: string;
  status: string;
}

export interface PropertySummary {
  id: string;
  owner_user_id: string | null;
  admin_hold: boolean;
  closing_review_status: string | null;
}

export interface EligibilityResult {
  allowed: boolean;
  blockedReasons: string[];
  /** Non-binding threads that would be closed on release */
  closableThreadIds: string[];
}

// ---------------------------------------------------------------------------
// Pure eligibility predicate — testable without DB
// ---------------------------------------------------------------------------

export function checkOwnerReleaseEligibility(
  property: PropertySummary,
  threads: ThreadSummary[],
  signaturePackets: SignaturePacketSummary[],
): EligibilityResult {
  const blockedReasons: string[] = [];

  if (property.admin_hold) {
    blockedReasons.push("admin_hold");
  }

  const bindingThreads = threads.filter((t) =>
    BINDING_THREAD_STATUSES.has(t.status),
  );
  if (bindingThreads.length > 0) {
    blockedReasons.push("binding_accepted_deal_exists");
  }

  const blockingPackets = signaturePackets.filter((p) =>
    BLOCKING_SIGNATURE_STATUSES.has(p.status),
  );
  if (blockingPackets.length > 0) {
    blockedReasons.push("active_signature_packet_exists");
  }

  if (
    property.closing_review_status &&
    BLOCKING_CLOSING_STATUSES.has(property.closing_review_status)
  ) {
    blockedReasons.push("closing_workflow_active");
  }

  const closableThreadIds = threads
    .filter((t) => ACTIVE_NONBINDING_THREAD_STATUSES.has(t.status))
    .map((t) => t.id);

  return {
    allowed: blockedReasons.length === 0,
    blockedReasons,
    closableThreadIds,
  };
}

// ---------------------------------------------------------------------------
// Service: load eligibility data from DB (used by API routes)
// ---------------------------------------------------------------------------

export async function loadOwnerReleaseEligibilityData(
  propertyId: string,
  userId: string,
  svc: any,
): Promise<{
  property: PropertySummary | null;
  threads: ThreadSummary[];
  signaturePackets: SignaturePacketSummary[];
  ownershipError?: string;
}> {
  const { data: property, error: propErr } = await svc
    .from("properties")
    .select(
      "id, owner_user_id, admin_hold, closing_review_status, status",
    )
    .eq("id", propertyId)
    .single();

  if (propErr || !property) {
    return { property: null, threads: [], signaturePackets: [] };
  }

  if (property.owner_user_id !== userId) {
    return {
      property: null,
      threads: [],
      signaturePackets: [],
      ownershipError: "not_owner",
    };
  }

  const { data: threads } = await svc
    .from("deal_threads")
    .select("id, status")
    .eq("property_id", propertyId)
    .not("status", "in", '("closed","closed_due_to_claim_release","voided_by_admin")');

  const threadIds: string[] = (threads ?? []).map((t: any) => t.id);

  // Query signature packets by thread_id — deal_signature_packets has no property_id column
  let signaturePackets: SignaturePacketSummary[] = [];
  if (threadIds.length > 0) {
    const { data: packets } = await svc
      .from("deal_signature_packets")
      .select("id, status")
      .in("thread_id", threadIds);
    signaturePackets = packets ?? [];
  }

  return {
    property: {
      id: property.id,
      owner_user_id: property.owner_user_id,
      admin_hold: property.admin_hold ?? false,
      closing_review_status: property.closing_review_status ?? null,
    },
    threads: threads ?? [],
    signaturePackets,
  };
}

// ---------------------------------------------------------------------------
// Internal helper: soft-delete property_photos for a property
// ---------------------------------------------------------------------------

async function softDeletePropertyPhotos(
  propertyId: string,
  actorId: string,
  svc: any,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await svc
    .from("property_photos")
    .update({ removed_at: now, removed_by: actorId })
    .eq("property_id", propertyId)
    .is("removed_at", null);

  if (error) {
    console.error("claim_release_photo_soft_delete_failed", { propertyId, error });
  }
}

// ---------------------------------------------------------------------------
// Service: perform owner release
// ---------------------------------------------------------------------------

export async function performOwnerRelease(
  propertyId: string,
  actorId: string,
  closableThreadIds: string[],
  svc: any,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // 1. Null out owner-private columns on properties and reset claim state
  const purgePayload: Record<string, unknown> = {
    owner_user_id: null,
    ownership_status: "unclaimed",
    claimed_by_user_id: null,
    has_secured_property_debt: null,
    secured_property_debt_amount: null,
    total_known_debt_amount: null,
    total_known_debt_confidence: null,
    debt_statement_availability: null,
    known_liens_and_claims: null,
    ownership_type: null,
    occupancy_use: null,
    major_condition_issue: null,
    major_condition_issue_details: null,
    title_claims_known: null,
    title_claims_details: null,
    owner_stated_fmv: null,
    owner_stated_fmv_confidence: null,
    owner_stated_fmv_source: null,
    willing_to_proceed_formal_review: null,
    claim_released_at: new Date().toISOString(),
    verification_state: "intake_pending",
  };

  const { error: propErr } = await svc
    .from("properties")
    .update(purgePayload)
    .eq("id", propertyId);

  if (propErr) {
    return { ok: false, error: `properties_update_failed: ${propErr.message}` };
  }

  // 2. Close active non-binding threads
  if (closableThreadIds.length > 0) {
    const { error: threadErr } = await svc
      .from("deal_threads")
      .update({ status: "closed_due_to_claim_release" })
      .in("id", closableThreadIds);

    if (threadErr) {
      console.error("claim_release_thread_close_failed", { propertyId, threadErr });
    }
  }

  // 3. Detach owner documents (hard delete)
  const { error: docErr } = await svc
    .from("property_documents")
    .delete()
    .eq("property_id", propertyId);

  if (docErr) {
    console.error("claim_release_doc_purge_failed", { propertyId, docErr });
  }

  // 4. Soft-delete owner-contributed photos
  await softDeletePropertyPhotos(propertyId, actorId, svc);

  // 5. Write audit events
  const now = new Date().toISOString();
  const events: any[] = [
    {
      property_id: propertyId,
      event_type: "property_claim_released_by_owner",
      actor_id: actorId,
      actor_role: "owner",
      metadata: { closed_thread_count: closableThreadIds.length },
      created_at: now,
    },
    {
      property_id: propertyId,
      event_type: "property_owner_private_data_purged",
      actor_id: actorId,
      actor_role: "owner",
      metadata: { purged_columns: Object.keys(purgePayload), documents_purged: true, photos_soft_deleted: true },
      created_at: now,
    },
    {
      property_id: propertyId,
      event_type: "property_reopened_for_claim",
      actor_id: actorId,
      actor_role: "owner",
      metadata: {},
      created_at: now,
    },
  ];

  if (closableThreadIds.length > 0) {
    events.push({
      property_id: propertyId,
      event_type: "non_binding_deals_closed_due_to_claim_release",
      actor_id: actorId,
      actor_role: "owner",
      deal_ids: closableThreadIds,
      metadata: { count: closableThreadIds.length },
      created_at: now,
    });
  }

  const { error: evtErr } = await svc
    .from("property_claim_events")
    .insert(events);

  if (evtErr) {
    console.error("claim_release_event_insert_failed", { propertyId, evtErr });
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Service: perform admin release (no binding deal check required — admin decides)
// ---------------------------------------------------------------------------

export async function performAdminRelease(
  propertyId: string,
  actorId: string,
  reasonCode: ReleaseReasonCode,
  notes: string | null,
  closableThreadIds: string[],
  svc: any,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const purgePayload: Record<string, unknown> = {
    owner_user_id: null,
    ownership_status: "unclaimed",
    claimed_by_user_id: null,
    has_secured_property_debt: null,
    secured_property_debt_amount: null,
    total_known_debt_amount: null,
    total_known_debt_confidence: null,
    debt_statement_availability: null,
    known_liens_and_claims: null,
    ownership_type: null,
    occupancy_use: null,
    major_condition_issue: null,
    major_condition_issue_details: null,
    title_claims_known: null,
    title_claims_details: null,
    owner_stated_fmv: null,
    owner_stated_fmv_confidence: null,
    owner_stated_fmv_source: null,
    willing_to_proceed_formal_review: null,
    claim_released_at: new Date().toISOString(),
    verification_state: "intake_pending",
  };

  const { error: propErr } = await svc
    .from("properties")
    .update(purgePayload)
    .eq("id", propertyId);

  if (propErr) {
    return { ok: false, error: `properties_update_failed: ${propErr.message}` };
  }

  if (closableThreadIds.length > 0) {
    const { error: threadErr } = await svc
      .from("deal_threads")
      .update({ status: "closed_due_to_claim_release" })
      .in("id", closableThreadIds);

    if (threadErr) {
      console.error("admin_claim_release_thread_close_failed", { propertyId, threadErr });
    }
  }

  const { error: docErr } = await svc
    .from("property_documents")
    .delete()
    .eq("property_id", propertyId);

  if (docErr) {
    console.error("admin_claim_release_doc_purge_failed", { propertyId, docErr });
  }

  // Soft-delete owner-contributed photos
  await softDeletePropertyPhotos(propertyId, actorId, svc);

  const now = new Date().toISOString();
  const events: any[] = [
    {
      property_id: propertyId,
      event_type: "property_claim_released_by_admin",
      actor_id: actorId,
      actor_role: "admin",
      reason_code: reasonCode,
      notes,
      deal_ids: closableThreadIds.length > 0 ? closableThreadIds : null,
      metadata: { closed_thread_count: closableThreadIds.length },
      created_at: now,
    },
    {
      property_id: propertyId,
      event_type: "property_owner_private_data_purged",
      actor_id: actorId,
      actor_role: "admin",
      reason_code: reasonCode,
      notes,
      metadata: { purged_columns: Object.keys(purgePayload), documents_purged: true, photos_soft_deleted: true },
      created_at: now,
    },
    {
      property_id: propertyId,
      event_type: "property_reopened_for_claim",
      actor_id: actorId,
      actor_role: "admin",
      reason_code: reasonCode,
      metadata: {},
      created_at: now,
    },
  ];

  if (closableThreadIds.length > 0) {
    events.push({
      property_id: propertyId,
      event_type: "non_binding_deals_closed_due_to_claim_release",
      actor_id: actorId,
      actor_role: "admin",
      reason_code: reasonCode,
      deal_ids: closableThreadIds,
      metadata: { count: closableThreadIds.length },
      created_at: now,
    });
  }

  const { error: evtErr } = await svc
    .from("property_claim_events")
    .insert(events);

  if (evtErr) {
    console.error("admin_claim_release_event_insert_failed", { propertyId, evtErr });
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Service: admin reset operational state
// ---------------------------------------------------------------------------

export async function performAdminResetOperationalState(
  propertyId: string,
  actorId: string,
  reasonCode: ReleaseReasonCode,
  notes: string | null,
  svc: any,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Reset computed workflow flags — does NOT release owner claim, does NOT touch deal threads or photos
  const resetPayload: Record<string, unknown> = {
    verification_state: "intake_pending",
    property_review_status: null,
    closing_review_status: null,
    escalation_deposit_status: null,
    escalation_avm_status: null,
  };

  const { error: propErr } = await svc
    .from("properties")
    .update(resetPayload)
    .eq("id", propertyId);

  if (propErr) {
    return { ok: false, error: `properties_update_failed: ${propErr.message}` };
  }

  const { error: evtErr } = await svc
    .from("property_claim_events")
    .insert({
      property_id: propertyId,
      event_type: "property_operational_state_reset_by_admin",
      actor_id: actorId,
      actor_role: "admin",
      reason_code: reasonCode,
      notes,
      metadata: { reset_columns: Object.keys(resetPayload) },
    });

  if (evtErr) {
    console.error("admin_reset_event_insert_failed", { propertyId, evtErr });
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Service: admin void accepted agreement + release property
//
// Voids ALL accepted threads for the property (not just the one passed in),
// terminates any in-flight signature packets, purges owner-linked data.
// ---------------------------------------------------------------------------

export async function performAdminVoidAndRelease(
  propertyId: string,
  /** The accepted threadId selected in the UI — used for primary audit attribution */
  primaryThreadId: string,
  actorId: string,
  reasonCode: ReleaseReasonCode,
  notes: string,
  svc: any,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // 1. Load ALL accepted threads for this property (not just the one passed in)
  const { data: acceptedThreads, error: loadErr } = await svc
    .from("deal_threads")
    .select("id, status, property_id")
    .eq("property_id", propertyId)
    .eq("status", "accepted");

  if (loadErr) {
    return { ok: false, error: `load_accepted_threads_failed: ${loadErr.message}` };
  }

  if (!acceptedThreads || acceptedThreads.length === 0) {
    return { ok: false, error: "no_accepted_threads_found" };
  }

  // Verify the primary thread is among the accepted threads
  const primaryThread = acceptedThreads.find((t: any) => t.id === primaryThreadId);
  if (!primaryThread) {
    return { ok: false, error: "primary_thread_not_in_accepted_status" };
  }

  const acceptedThreadIds: string[] = acceptedThreads.map((t: any) => t.id);

  // 2. Void ALL accepted threads
  const { error: voidErr } = await svc
    .from("deal_threads")
    .update({ status: "voided_by_admin" })
    .in("id", acceptedThreadIds);

  if (voidErr) {
    return { ok: false, error: `void_threads_failed: ${voidErr.message}` };
  }

  // 3. Terminate in-flight signature packets for all voided threads
  const now = new Date().toISOString();
  const { error: packetErr } = await svc
    .from("deal_signature_packets")
    .update({ status: "voided", voided_at: now })
    .in("thread_id", acceptedThreadIds)
    .in("status", Array.from(VOIDABLE_SIGNATURE_STATUSES));

  if (packetErr) {
    console.error("admin_void_signature_packet_failed", { propertyId, packetErr });
  }

  // 4. Close any other open (non-binding) threads for the property
  const { data: siblingThreads } = await svc
    .from("deal_threads")
    .select("id")
    .eq("property_id", propertyId)
    .in("status", Array.from(ACTIVE_NONBINDING_THREAD_STATUSES));

  const siblingIds: string[] = (siblingThreads ?? []).map((t: any) => t.id);

  if (siblingIds.length > 0) {
    const { error: siblingErr } = await svc
      .from("deal_threads")
      .update({ status: "closed_due_to_claim_release" })
      .in("id", siblingIds);

    if (siblingErr) {
      console.error("admin_void_sibling_close_failed", { propertyId, siblingErr });
    }
  }

  // 5. Purge owner-linked data and reset claim state
  const purgePayload: Record<string, unknown> = {
    owner_user_id: null,
    ownership_status: "unclaimed",
    claimed_by_user_id: null,
    has_secured_property_debt: null,
    secured_property_debt_amount: null,
    total_known_debt_amount: null,
    total_known_debt_confidence: null,
    debt_statement_availability: null,
    known_liens_and_claims: null,
    ownership_type: null,
    occupancy_use: null,
    major_condition_issue: null,
    major_condition_issue_details: null,
    title_claims_known: null,
    title_claims_details: null,
    owner_stated_fmv: null,
    owner_stated_fmv_confidence: null,
    owner_stated_fmv_source: null,
    willing_to_proceed_formal_review: null,
    claim_released_at: now,
    verification_state: "intake_pending",
  };

  const { error: propErr } = await svc
    .from("properties")
    .update(purgePayload)
    .eq("id", propertyId);

  if (propErr) {
    return { ok: false, error: `properties_update_failed: ${propErr.message}` };
  }

  const { error: docErr } = await svc
    .from("property_documents")
    .delete()
    .eq("property_id", propertyId);

  if (docErr) {
    console.error("admin_void_doc_purge_failed", { propertyId, docErr });
  }

  // 6. Soft-delete owner-contributed photos
  await softDeletePropertyPhotos(propertyId, actorId, svc);

  // 7. Write audit events
  const allClosedIds = [...acceptedThreadIds, ...siblingIds];
  const events: any[] = [
    {
      property_id: propertyId,
      event_type: "accepted_agreement_voided_by_admin",
      actor_id: actorId,
      actor_role: "admin",
      reason_code: reasonCode,
      notes,
      deal_ids: acceptedThreadIds,
      metadata: {
        voided_thread_count: acceptedThreadIds.length,
        primary_thread_id: primaryThreadId,
      },
      created_at: now,
    },
    {
      property_id: propertyId,
      event_type: "property_claim_released_by_admin",
      actor_id: actorId,
      actor_role: "admin",
      reason_code: reasonCode,
      notes,
      deal_ids: allClosedIds,
      metadata: { via: "void_and_release" },
      created_at: now,
    },
    {
      property_id: propertyId,
      event_type: "property_owner_private_data_purged",
      actor_id: actorId,
      actor_role: "admin",
      reason_code: reasonCode,
      notes,
      metadata: { purged_columns: Object.keys(purgePayload), documents_purged: true, photos_soft_deleted: true },
      created_at: now,
    },
    {
      property_id: propertyId,
      event_type: "property_reopened_for_claim",
      actor_id: actorId,
      actor_role: "admin",
      reason_code: reasonCode,
      metadata: {},
      created_at: now,
    },
  ];

  if (siblingIds.length > 0) {
    events.push({
      property_id: propertyId,
      event_type: "non_binding_deals_closed_due_to_claim_release",
      actor_id: actorId,
      actor_role: "admin",
      reason_code: reasonCode,
      deal_ids: siblingIds,
      metadata: { count: siblingIds.length, via: "void_and_release" },
      created_at: now,
    });
  }

  const { error: evtErr } = await svc
    .from("property_claim_events")
    .insert(events);

  if (evtErr) {
    console.error("admin_void_event_insert_failed", { propertyId, evtErr });
  }

  return { ok: true };
}
