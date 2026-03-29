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
    stageNumber: 8,
    adminLabel: "Closing issue found",
    customerLabel: "Issue found during closing review",
    notificationLabel: "Issue found during closing review",
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
    customerLabel: null,
    notificationLabel: null,
    propertyOwned: false,
  },
  ready_for_signatures: {
    stage: "ready_for_signatures",
    stageNumber: 11,
    adminLabel: "Ready for signatures",
    customerLabel: null,
    notificationLabel: null,
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
  if (state.servicingStatus === "issue") return "servicing_issue";
  if (state.servicingStatus === "active") return "servicing_active";
  if (state.threadStatus === "closed") return "deal_closed";
  if (state.packetStatus === "completed") return "agreement_signed";
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
  { label: "Closing review in progress", stages: ["closing_review_pending"], stageNumber: 7 },
  { label: "Issue found during closing review", stages: ["closing_issue_found"], stageNumber: 8 },
  { label: "Ready for closing", stages: ["ready_for_closing"], stageNumber: 9 },
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
  closing_issue_found:
    "Our team found an item that needs attention during the closing review. We'll reach out with details.",
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

export interface CanonicalLifecycleResult {
  stage: WorkflowStage;
  meta: StageMeta;
  adminBlocker: string | null;
  adminNextAction: string | null;
  adminOwningSurface: AdminOwningSurface | null;
  customerHeroLabel: string | null;
  customerHeroDescription: string | null;
  milestoneStatuses: CustomerMilestoneStatus[];
}

export function resolveCanonicalLifecycle(
  state: WorkflowStateInput,
): CanonicalLifecycleResult {
  const stage = deriveWorkflowStage(state);
  const meta = STAGE_META[stage];
  const guidance = STAGE_ADMIN_GUIDANCE[stage];

  const milestoneStatuses: CustomerMilestoneStatus[] = CUSTOMER_MILESTONES.map(
    (m) => {
      const inMilestone = m.stages.includes(stage);
      const isPast = !inMilestone && m.stageNumber < meta.stageNumber;
      if (inMilestone) return { label: m.label, state: "current" };
      if (isPast) return { label: m.label, state: "completed" };
      return { label: m.label, state: "upcoming" };
    },
  );

  return {
    stage,
    meta,
    adminBlocker: guidance.blocker,
    adminNextAction: guidance.nextAction,
    adminOwningSurface: guidance.owningSurface,
    customerHeroLabel: meta.customerLabel,
    customerHeroDescription: meta.customerLabel
      ? (CUSTOMER_HERO_DESCRIPTIONS[stage] ?? null)
      : null,
    milestoneStatuses,
  };
}
