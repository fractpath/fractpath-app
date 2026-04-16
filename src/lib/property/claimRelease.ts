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

  const { data: signaturePackets } = await svc
    .from("deal_signature_packets")
    .select("id, status")
    .eq("property_id", propertyId);

  return {
    property: {
      id: property.id,
      owner_user_id: property.owner_user_id,
      admin_hold: property.admin_hold ?? false,
      closing_review_status: property.closing_review_status ?? null,
    },
    threads: threads ?? [],
    signaturePackets: signaturePackets ?? [],
  };
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
  // 1. Null out owner-private columns on properties
  const purgePayload: Record<string, unknown> = {
    owner_user_id: null,
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

  // 3. Detach owner documents (hard delete — purge from active use; audit event below covers chain of custody)
  const { error: docErr } = await svc
    .from("property_documents")
    .delete()
    .eq("property_id", propertyId);

  if (docErr) {
    console.error("claim_release_doc_purge_failed", { propertyId, docErr });
  }

  // 4. Write audit events
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
      metadata: { purged_columns: Object.keys(purgePayload), documents_purged: true },
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
      metadata: { purged_columns: Object.keys(purgePayload), documents_purged: true },
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
  // Reset computed workflow flags — does NOT release owner claim
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
// ---------------------------------------------------------------------------

export async function performAdminVoidAndRelease(
  propertyId: string,
  threadId: string,
  actorId: string,
  reasonCode: ReleaseReasonCode,
  notes: string,
  svc: any,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // 1. Verify the thread is accepted (double-check server-side)
  const { data: thread, error: threadLoadErr } = await svc
    .from("deal_threads")
    .select("id, status, property_id")
    .eq("id", threadId)
    .eq("property_id", propertyId)
    .single();

  if (threadLoadErr || !thread) {
    return { ok: false, error: "thread_not_found" };
  }

  if (thread.status !== "accepted") {
    return { ok: false, error: "thread_not_in_accepted_status" };
  }

  // 2. Void the accepted thread
  const { error: voidErr } = await svc
    .from("deal_threads")
    .update({ status: "voided_by_admin" })
    .eq("id", threadId);

  if (voidErr) {
    return { ok: false, error: `void_thread_failed: ${voidErr.message}` };
  }

  // 3. Close any other open (non-binding) threads for the property
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

  // 4. Purge owner-linked data
  const purgePayload: Record<string, unknown> = {
    owner_user_id: null,
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

  const { error: docErr } = await svc
    .from("property_documents")
    .delete()
    .eq("property_id", propertyId);

  if (docErr) {
    console.error("admin_void_doc_purge_failed", { propertyId, docErr });
  }

  // 5. Write audit events
  const now = new Date().toISOString();
  const allClosedIds = [threadId, ...siblingIds];
  const events: any[] = [
    {
      property_id: propertyId,
      event_type: "accepted_agreement_voided_by_admin",
      actor_id: actorId,
      actor_role: "admin",
      reason_code: reasonCode,
      notes,
      deal_ids: [threadId],
      metadata: { voided_thread_id: threadId },
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
      metadata: { purged_columns: Object.keys(purgePayload), documents_purged: true },
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
