export type WorkflowStage =
  | "property_verification_complete"
  | "rentcast_avm_complete"
  | "enhanced_review_required"
  | "enhanced_review_payment_pending"
  | "enhanced_review_in_progress"
  | "enhanced_review_complete"
  | "closing_review_pending"
  | "closing_issue_found"
  | "ready_for_closing"
  | "deal_eligible"
  | "attom_required"
  | "deal_terms_ineligible"
  | "renegotiation_requested"
  | "ready_for_signatures"
  | "agreement_out_for_signatures"
  | "agreement_signed"
  | "deal_closed"
  | "servicing_active"
  | "servicing_issue"
  | "unknown";

export interface WorkflowStateInput {
  propertyStatus: string | null;
  propertyReviewStatus: string | null;
  escalationDepositStatus: string | null;
  escalationAvmStatus: string | null;
  closingReviewStatus: string | null;
  avmEligibilityResult: string | null;
  triageStatus: string | null;
  threadStatus: string | null;
  packetStatus: string | null;
  servicingStatus: string | null;
  /** Optional: manual appraisal challenge status (exception branch, not happy-path). */
  manualAppraisalStatus?: string | null;
  /**
   * Live ineligibility signal — true when the fresh controlling-FMV recomputation
   * confirms the deal is still ineligible. Overrides all happy-path stages (closing,
   * signatures, etc.) except terminal states (servicing, closed, signed).
   */
  liveIneligible?: boolean;
  /**
   * Current DB value of deals.renegotiation_status.
   * When 'requested', the canonical stage surfaces as renegotiation_requested
   * (a sub-state of the ineligible branch, only reachable after ATTOM completes).
   */
  renegotiationStatus?: string | null;
}

export interface StageMeta {
  stage: WorkflowStage;
  stageNumber: number;
  adminLabel: string;
  customerLabel: string | null;
  notificationLabel: string | null;
  propertyOwned: boolean;
}

const STAGE_META: Record<WorkflowStage, StageMeta> = {
  property_verification_complete: {
    stage: "property_verification_complete",
    stageNumber: 1,
    adminLabel: "Property verification complete",
    customerLabel: null,
    notificationLabel: null,
    propertyOwned: true,
  },
  rentcast_avm_complete: {
    stage: "rentcast_avm_complete",
    stageNumber: 2,
    adminLabel: "RentCast AVM complete",
    customerLabel: null,
    notificationLabel: null,
    propertyOwned: true,
  },
  enhanced_review_required: {
    stage: "enhanced_review_required",
    stageNumber: 3,
    adminLabel: "Enhanced review required",
    customerLabel: "Additional review required",
    notificationLabel: "Additional review required",
    propertyOwned: true,
  },
  enhanced_review_payment_pending: {
    stage: "enhanced_review_payment_pending",
    stageNumber: 4,
    adminLabel: "Enhanced review — payment pending",
    customerLabel: "Additional review required",
    notificationLabel: null,
    propertyOwned: true,
  },
  enhanced_review_in_progress: {
    stage: "enhanced_review_in_progress",
    stageNumber: 5,
    adminLabel: "Enhanced review in progress",
    customerLabel: "Enhanced property review in progress",
    notificationLabel: "Enhanced property review in progress",
    propertyOwned: true,
  },
  enhanced_review_complete: {
    stage: "enhanced_review_complete",
    stageNumber: 6,
    adminLabel: "Enhanced review complete — FMV applied",
    customerLabel: "Property value verified",
    notificationLabel: "Property value verified",
    propertyOwned: true,
  },
  closing_review_pending: {
    stage: "closing_review_pending",
    stageNumber: 7,
    adminLabel: "Closing review pending",
    customerLabel: "Closing review in progress",
    notificationLabel: "Closing review in progress",
    propertyOwned: true,
  },
  closing_issue_found: {
    stage: "closing_issue_found",
    stageNumber: 7,
    adminLabel: "Closing issue found",
    customerLabel: "Closing review in progress",
    notificationLabel: null,
    propertyOwned: true,
  },
  ready_for_closing: {
    stage: "ready_for_closing",
    stageNumber: 9,
    adminLabel: "Ready for closing",
    customerLabel: "Ready for closing",
    notificationLabel: "Ready for closing",
    propertyOwned: true,
  },
  deal_eligible: {
    stage: "deal_eligible",
    stageNumber: 10,
    adminLabel: "Deal eligible",
    customerLabel: "Under review",
    notificationLabel: "Under review",
    propertyOwned: false,
  },
  /**
   * ATTOM-first policy: deal is ineligible under the RentCast basis, but ATTOM has not
   * yet completed. Renegotiation and manual appraisal challenge are NOT available yet —
   * ATTOM must complete first. Owners are directed to the property page to request ATTOM.
   */
  attom_required: {
    stage: "attom_required",
    stageNumber: 10,
    adminLabel: "ATTOM enhanced valuation required — renegotiation blocked",
    // null so DealMilestoneTracker doesn't render a progress ladder for this exception state.
    // customerHeroLabel is injected in resolveCanonicalLifecycle via EXCEPTION_CALLOUTS.
    customerLabel: null,
    notificationLabel: null,
    propertyOwned: false,
  },
  /**
   * ATTOM complete and deal is still ineligible — void/non-executable.
   * Owner may renegotiate terms or commission a manual appraisal.
   */
  deal_terms_ineligible: {
    stage: "deal_terms_ineligible",
    stageNumber: 10,
    adminLabel: "Deal void — terms ineligible under ATTOM-verified FMV",
    customerLabel: null,
    notificationLabel: null,
    propertyOwned: false,
  },
  renegotiation_requested: {
    stage: "renegotiation_requested",
    stageNumber: 10,
    adminLabel: "Renegotiation requested by owner",
    // null so DealMilestoneTracker doesn't render for this exception state.
    // customerHeroLabel is overridden in resolveCanonicalLifecycle.
    customerLabel: null,
    notificationLabel: null,
    propertyOwned: false,
  },
  ready_for_signatures: {
    stage: "ready_for_signatures",
    stageNumber: 11,
    adminLabel: "Ready for signatures",
    customerLabel: "Agreement being prepared",
    notificationLabel: "Agreement being prepared",
    propertyOwned: false,
  },
  agreement_out_for_signatures: {
    stage: "agreement_out_for_signatures",
    stageNumber: 12,
    adminLabel: "Agreement out for signatures",
    customerLabel: "Agreement out for signatures",
    notificationLabel: null,
    propertyOwned: false,
  },
  agreement_signed: {
    stage: "agreement_signed",
    stageNumber: 13,
    adminLabel: "Agreement signed",
    customerLabel: "Agreement signed",
    notificationLabel: null,
    propertyOwned: false,
  },
  deal_closed: {
    stage: "deal_closed",
    stageNumber: 14,
    adminLabel: "Deal closed",
    customerLabel: "Deal closed",
    notificationLabel: "Deal closed",
    propertyOwned: false,
  },
  servicing_active: {
    stage: "servicing_active",
    stageNumber: 15,
    adminLabel: "Servicing active",
    customerLabel: "Payments active",
    notificationLabel: "Payments active",
    propertyOwned: false,
  },
  servicing_issue: {
    stage: "servicing_issue",
    stageNumber: 16,
    adminLabel: "Servicing issue",
    customerLabel: "Servicing issue",
    notificationLabel: "Servicing issue",
    propertyOwned: false,
  },
  unknown: {
    stage: "unknown",
    stageNumber: 0,
    adminLabel: "Status unknown",
    customerLabel: null,
    notificationLabel: null,
    propertyOwned: false,
  },
};

export function getStageMeta(stage: WorkflowStage): StageMeta {
  return STAGE_META[stage];
}

export function deriveWorkflowStage(state: WorkflowStateInput): WorkflowStage {
  // ── Terminal states (highest priority) ─────────────────────────────────────
  if (state.servicingStatus === "issue") return "servicing_issue";
  if (state.servicingStatus === "active") return "servicing_active";
  if (state.threadStatus === "closed") return "deal_closed";
  if (state.packetStatus === "completed") return "agreement_signed";

  // ── Ineligible branch — overrides all happy-path stages ───────────────────
  // liveIneligible: fresh controlling-FMV recomputation confirms deal is not eligible.
  // triageStatus:   DB-persisted ineligible determination.
  // Both are checked; either being true enters the ineligible branch.
  const isIneligibleLive = state.liveIneligible === true;
  const isIneligibleDb = state.triageStatus === "ineligible";

  if (isIneligibleLive || isIneligibleDb) {
    // ── ATTOM-first policy ────────────────────────────────────────────────────
    // ATTOM must complete before renegotiation or manual appraisal can be unlocked.
    // When ATTOM has not yet completed, return attom_required — this blocks renegotiation
    // CTAs and directs the owner to the property page for the enhanced valuation step.
    const attomComplete = state.escalationAvmStatus === "completed";
    if (!attomComplete) {
      return "attom_required";
    }

    // ATTOM complete and deal is still ineligible:
    // Exception: manual appraisal is complete AND live recomputation now says eligible →
    // the stale DB ineligible is superseded. Surface enhanced_review_complete so the UI
    // clears "ineligible" copy and signals admin re-triage is pending.
    if (!isIneligibleLive && isIneligibleDb && state.manualAppraisalStatus === "complete") {
      return "enhanced_review_complete";
    }
    // When the owner has formally requested renegotiation, surface that sub-state.
    if (state.renegotiationStatus === "requested") return "renegotiation_requested";
    return "deal_terms_ineligible";
  }

  // ── Happy path ─────────────────────────────────────────────────────────────
  if (["sent", "delivered", "partially_signed"].includes(state.packetStatus ?? "")) {
    return "agreement_out_for_signatures";
  }
  if (state.triageStatus === "ready_for_deposit" || state.triageStatus === "ready_for_signatures") {
    return "ready_for_signatures";
  }
  if (state.closingReviewStatus === "ready") return "ready_for_closing";
  if (state.closingReviewStatus === "issue_found") return "closing_issue_found";
  if (state.closingReviewStatus === "pending") return "closing_review_pending";
  if (state.escalationAvmStatus === "completed") return "enhanced_review_complete";
  if (state.escalationAvmStatus === "ordered" || state.escalationDepositStatus === "paid") {
    return "enhanced_review_in_progress";
  }
  if (state.escalationDepositStatus === "requested" || state.escalationDepositStatus === "failed") {
    return "enhanced_review_payment_pending";
  }
  if (state.avmEligibilityResult === "escalated_review_required") {
    return "enhanced_review_required";
  }
  if (
    state.propertyReviewStatus === "property_review_complete" ||
    state.propertyReviewStatus === "amv_complete"
  ) {
    return "rentcast_avm_complete";
  }
  if (state.propertyStatus === "verified") return "property_verification_complete";
  return "unknown";
}

export interface CustomerMilestone {
  label: string;
  stages: WorkflowStage[];
  stageNumber: number;
}

export const CUSTOMER_MILESTONES: CustomerMilestone[] = [
  { label: "Additional review required", stages: ["enhanced_review_required", "enhanced_review_payment_pending"], stageNumber: 3 },
  { label: "Enhanced property review in progress", stages: ["enhanced_review_in_progress"], stageNumber: 5 },
  { label: "Property value verified", stages: ["enhanced_review_complete"], stageNumber: 6 },
  { label: "Closing review in progress", stages: ["closing_review_pending", "closing_issue_found"], stageNumber: 7 },
  { label: "Ready for closing", stages: ["ready_for_closing"], stageNumber: 9 },
  { label: "Under review", stages: ["deal_eligible"], stageNumber: 10 },
  { label: "Agreement being prepared", stages: ["ready_for_signatures"], stageNumber: 11 },
  { label: "Agreement out for signatures", stages: ["agreement_out_for_signatures"], stageNumber: 12 },
  { label: "Agreement signed", stages: ["agreement_signed"], stageNumber: 13 },
  { label: "Deal closed", stages: ["deal_closed"], stageNumber: 14 },
  { label: "Payments active", stages: ["servicing_active", "servicing_issue"], stageNumber: 15 },
];

export interface CustomerMilestoneStatus {
  label: string;
  state: "completed" | "current" | "upcoming";
}

export type AdminOwningSurface = "property_review" | "deal_review" | "external_partner";

interface StageAdminGuidance {
  blocker: string | null;
  nextAction: string | null;
  owningSurface: AdminOwningSurface | null;
}

const STAGE_ADMIN_GUIDANCE: Record<WorkflowStage, StageAdminGuidance> = {
  unknown: {
    blocker: "Property not yet verified",
    nextAction: "Verify property details on the property review page",
    owningSurface: "property_review",
  },
  property_verification_complete: {
    blocker: "Valuation AVM not yet run",
    nextAction: "Run RentCast AVM from the valuation section on the property review page",
    owningSurface: "property_review",
  },
  rentcast_avm_complete: {
    blocker: null,
    nextAction: "Review AVM result and evaluate deal eligibility on the deal review page",
    owningSurface: "deal_review",
  },
  enhanced_review_required: {
    blocker: "Enhanced review deposit not yet requested from owner",
    nextAction: "Request escalation deposit via the stronger valuation pathway below",
    owningSurface: "property_review",
  },
  enhanced_review_payment_pending: {
    blocker: "Waiting for owner to complete deposit payment",
    nextAction: "Confirm deposit receipt and advance to the AVM step",
    owningSurface: "property_review",
  },
  enhanced_review_in_progress: {
    blocker: "Waiting for enhanced valuation result",
    nextAction: "Monitor enhanced AVM status and advance when complete",
    owningSurface: "property_review",
  },
  enhanced_review_complete: {
    blocker: null,
    nextAction: "Review verified FMV and update deal triage eligibility on the deal review page",
    owningSurface: "deal_review",
  },
  deal_eligible: {
    blocker: null,
    nextAction: "Initiate closing review on the property review page",
    owningSurface: "property_review",
  },
  attom_required: {
    blocker: "Deal is ineligible under RentCast basis — ATTOM enhanced valuation must complete before renegotiation is unlocked",
    nextAction: "Trigger ATTOM enhanced valuation via the escalation simulation panel on the property review page. Renegotiation and manual appraisal become available once ATTOM confirms the deal is still ineligible.",
    owningSurface: "property_review",
  },
  deal_terms_ineligible: {
    blocker: "Deal is void under the ATTOM-verified FMV — owner must renegotiate terms or commission a manual appraisal",
    nextAction: "Work with the homeowner to revise terms within the eligible LTV band, then retriage. ATTOM-verified FMV remains valid.",
    owningSurface: "deal_review",
  },
  renegotiation_requested: {
    blocker: "Owner has requested renegotiation — action required",
    nextAction: "Review owner request in deal events, then reopen negotiation or work with both parties to propose revised terms.",
    owningSurface: "deal_review",
  },
  closing_review_pending: {
    blocker: "Closing documentation review in progress",
    nextAction: "Complete closing review — set ready or flag issue in the closing review section",
    owningSurface: "property_review",
  },
  closing_issue_found: {
    blocker: "Closing issue must be resolved before proceeding",
    nextAction: "Resolve closing blocker, then mark closing review ready",
    owningSurface: "property_review",
  },
  ready_for_closing: {
    blocker: null,
    nextAction: "Initiate the DocuSign signature packet on the deal review page",
    owningSurface: "deal_review",
  },
  ready_for_signatures: {
    blocker: null,
    nextAction: "Use 'Prepare' in the signature section to send the DocuSign envelope",
    owningSurface: "deal_review",
  },
  agreement_out_for_signatures: {
    blocker: "Waiting for all parties to sign",
    nextAction: "Monitor DocuSign — reminders are sent automatically",
    owningSurface: "external_partner",
  },
  agreement_signed: {
    blocker: null,
    nextAction: "Close the deal in the 'Deal close & servicing' section",
    owningSurface: "deal_review",
  },
  deal_closed: {
    blocker: null,
    nextAction: "Set servicing to active when payments commence",
    owningSurface: "deal_review",
  },
  servicing_active: {
    blocker: null,
    nextAction: "Monitor servicing — no immediate action required",
    owningSurface: "external_partner",
  },
  servicing_issue: {
    blocker: "Active servicing issue requires resolution",
    nextAction: "Investigate and resolve servicing issue, then reset to active",
    owningSurface: "deal_review",
  },
};

const CUSTOMER_HERO_DESCRIPTIONS: Partial<Record<WorkflowStage, string>> = {
  deal_eligible:
    "Our team is reviewing your deal. We'll be in touch when the next steps are ready.",
  ready_for_signatures:
    "Your deal has been approved. Our team is preparing the final agreement for signing.",
  enhanced_review_required:
    "Our team has determined that an additional property review is needed before we can continue. We'll be in touch with next steps.",
  enhanced_review_payment_pending:
    "Our team has determined that an additional property review is needed before we can continue. We'll be in touch with next steps.",
  enhanced_review_in_progress:
    "A more detailed property valuation is underway. We'll notify you when it's complete.",
  enhanced_review_complete:
    "An enhanced property valuation has been completed. Your scenario is progressing.",
  closing_review_pending:
    "Our team is reviewing final closing documentation. We'll notify you of any next steps.",
  ready_for_closing:
    "Closing review is complete. Your agreement is being prepared for signatures.",
  agreement_out_for_signatures:
    "Your agreement has been sent for electronic signatures. All parties will receive signing instructions by email.",
  agreement_signed:
    "All parties have signed the agreement. Your deal is being finalized.",
  deal_closed:
    "Your agreement is complete and the deal has been closed.",
  servicing_active:
    "Your agreement is active and payments are in progress.",
  servicing_issue:
    "Our team has flagged an item that needs attention. We'll reach out shortly.",
};

// Exception callouts — rendered as error/warning cards instead of the normal hero
const EXCEPTION_CALLOUTS: Partial<Record<WorkflowStage, { label: string; description: string }>> = {
  closing_issue_found: {
    label: "Issue found during closing review",
    description:
      "Our team found an item that needs attention during the closing review. We'll reach out with details. This does not necessarily mean the transaction cannot proceed.",
  },
  attom_required: {
    label: "Enhanced valuation required",
    description:
      "The current deal terms could not be confirmed under the automated estimate alone. A data-enhanced property valuation is required before you can revise terms or continue. Please visit your property page to request this — no action is needed on this page until the enhanced review is complete.",
  },
  deal_terms_ineligible: {
    label: "Revised terms required",
    description:
      "Based on the enhanced valuation, the current deal terms are not eligible under the verified property value. You can propose revised terms or commission a licensed manual appraisal. Our team will work with you on next steps.",
  },
};

export interface CanonicalLifecycleResult {
  stage: WorkflowStage;
  meta: StageMeta;
  adminBlocker: string | null;
  adminNextAction: string | null;
  adminOwningSurface: AdminOwningSurface | null;
  customerHeroLabel: string | null;
  customerHeroDescription: string | null;
  milestoneStatuses: CustomerMilestoneStatus[];
  /** True when the stage is an exception/unhappy-path state (closing issue, ineligible). */
  isExceptionState: boolean;
  /** Short label for the exception callout card. Null when isExceptionState is false. */
  exceptionLabel: string | null;
  /** Longer description for the exception callout card. Null when isExceptionState is false. */
  exceptionDescription: string | null;
  /**
   * Current manual appraisal challenge status for the property (exception branch overlay,
   * not part of the happy-path ladder). Null when no challenge has been initiated.
   * Values: 'available' | 'payment_pending' | 'in_progress' | 'complete'
   */
  manualAppraisalStatus: string | null;
}

/**
 * Terminal workflow stages — a deal in one of these stages is fully executed
 * and must be treated as read-only on the detail page.
 *
 * Note: `ready_for_signatures` and `agreement_out_for_signatures` are already
 * locked by the existing thread-status check (`thread.status === "accepted"`)
 * so they do not need to appear here.
 */
export const TERMINAL_WORKFLOW_STAGES: readonly WorkflowStage[] = [
  "agreement_signed",
  "deal_closed",
  "servicing_active",
  "servicing_issue",
] as const;

export function isTerminalWorkflowStage(stage: WorkflowStage): boolean {
  return (TERMINAL_WORKFLOW_STAGES as readonly string[]).includes(stage);
}

export function resolveCanonicalLifecycle(
  state: WorkflowStateInput,
): CanonicalLifecycleResult {
  const stage = deriveWorkflowStage(state);
  const meta = STAGE_META[stage];
  const guidance = STAGE_ADMIN_GUIDANCE[stage];
  const exceptionCallout = EXCEPTION_CALLOUTS[stage] ?? null;
  const manualAppraisalStatus = state.manualAppraisalStatus ?? null;

  const milestoneStatuses: CustomerMilestoneStatus[] = CUSTOMER_MILESTONES.map(
    (m) => {
      const inMilestone = m.stages.includes(stage);
      const isPast = !inMilestone && m.stageNumber < meta.stageNumber;
      if (inMilestone) return { label: m.label, state: "current" };
      if (isPast) return { label: m.label, state: "completed" };
      return { label: m.label, state: "upcoming" };
    },
  );

  // Build dynamic exception description — for deal_terms_ineligible, append manual appraisal status.
  let exceptionDescription = exceptionCallout?.description ?? null;
  if (stage === "deal_terms_ineligible" && exceptionCallout) {
    if (manualAppraisalStatus === "payment_pending" || manualAppraisalStatus === "in_progress") {
      exceptionDescription = (exceptionDescription ?? "") +
        " An additional valuation review is currently in progress.";
    } else if (manualAppraisalStatus === "complete") {
      exceptionDescription = (exceptionDescription ?? "") +
        " An additional valuation review has been completed. Deal terms will be re-evaluated.";
    }
  }

  // renegotiation_requested: not an exception callout (no amber card) but does have a
  // customer-visible hero label so the deal page shows a status card. The hero label is
  // injected here rather than via meta.customerLabel to avoid the DealMilestoneTracker
  // rendering a progress ladder for this exception sub-state.
  let customerHeroLabel: string | null = meta.customerLabel;
  let customerHeroDescription: string | null = meta.customerLabel
    ? (CUSTOMER_HERO_DESCRIPTIONS[stage] ?? null)
    : null;

  if (stage === "renegotiation_requested") {
    customerHeroLabel = "Revised terms being prepared";
    customerHeroDescription =
      "Your request for revised terms has been received. Our team will be in touch to discuss next steps.";
  }

  return {
    stage,
    meta,
    adminBlocker: guidance.blocker,
    adminNextAction: guidance.nextAction,
    adminOwningSurface: guidance.owningSurface,
    customerHeroLabel,
    customerHeroDescription,
    milestoneStatuses,
    isExceptionState: exceptionCallout !== null,
    exceptionLabel: exceptionCallout?.label ?? null,
    exceptionDescription,
    manualAppraisalStatus,
  };
}
