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
