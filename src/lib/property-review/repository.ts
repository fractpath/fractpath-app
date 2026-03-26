import { createAdminClient } from "@/lib/supabase/admin";
import type {
  NormalizedAvm,
  NormalizedPropertyProfile,
  PropertyReviewArtifactType,
  PropertyReviewProvider,
  PropertyReviewRunStatus,
} from "./providers/rentcast";

export type PropertyReviewRunRow = {
  id: string;
  property_id: string;
  provider: PropertyReviewProvider;
  artifact_type: PropertyReviewArtifactType;
  status: PropertyReviewRunStatus;
  requested_by: string | null;
  requested_at: string;
  completed_at: string | null;
  expires_at: string | null;
  is_current: boolean;
  source_key: string | null;
  vendor_record_id: string | null;
  request_params: Record<string, unknown>;
  raw_payload: unknown;
  normalized_payload: unknown;
  error_code: string | null;
  error_message: string | null;
};

export type PropertyReviewSummaryRow = {
  property_id: string;
  review_status: string | null;
  review_status_updated_at: string | null;
  current_profile_run_id: string | null;
  current_avm_run_id: string | null;
  profile_provider: string | null;
  profile_fetched_at: string | null;
  profile_expires_at: string | null;
  fmv_provider: string | null;
  fmv_amount: number | null;
  fmv_low: number | null;
  fmv_high: number | null;
  fmv_confidence: string | null;
  fmv_fetched_at: string | null;
  fmv_expires_at: string | null;
  max_available_deal_cash_current: number | null;
  max_available_deal_cash_computed_at: string | null;
  max_available_deal_cash_basis: Record<string, unknown>;
  title_lien_basis_complete: boolean;
  supporting_docs_complete: boolean;
  created_at: string;
  updated_at: string;
};

type CreateRunInput = {
  propertyId: string;
  provider: PropertyReviewProvider;
  artifactType: PropertyReviewArtifactType;
  status?: PropertyReviewRunStatus;
  requestedBy?: string | null;
  requestParams?: Record<string, unknown>;
  sourceKey?: string | null;
};

type CompleteProfileRunInput = {
  runId: string;
  propertyId: string;
  provider: PropertyReviewProvider;
  completedAt: string;
  expiresAt: string;
  vendorRecordId?: string | null;
  rawPayload: unknown;
  normalizedPayload: NormalizedPropertyProfile;
};

type CompleteAvmRunInput = {
  runId: string;
  propertyId: string;
  provider: PropertyReviewProvider;
  completedAt: string;
  expiresAt: string;
  rawPayload: unknown;
  normalizedPayload: NormalizedAvm;
};

type FailRunInput = {
  runId: string;
  errorCode?: string | null;
  errorMessage: string;
};

const RUN_SELECT = `
  id,
  property_id,
  provider,
  artifact_type,
  status,
  requested_by,
  requested_at,
  completed_at,
  expires_at,
  is_current,
  source_key,
  vendor_record_id,
  request_params,
  raw_payload,
  normalized_payload,
  error_code,
  error_message
`;

const SUMMARY_SELECT = `
  property_id,
  review_status,
  review_status_updated_at,
  current_profile_run_id,
  current_avm_run_id,
  profile_provider,
  profile_fetched_at,
  profile_expires_at,
  fmv_provider,
  fmv_amount,
  fmv_low,
  fmv_high,
  fmv_confidence,
  fmv_fetched_at,
  fmv_expires_at,
  max_available_deal_cash_current,
  max_available_deal_cash_computed_at,
  max_available_deal_cash_basis,
  title_lien_basis_complete,
  supporting_docs_complete,
  created_at,
  updated_at
`;

export async function createPropertyReviewRun(input: CreateRunInput): Promise<PropertyReviewRunRow> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("property_review_runs")
    .insert({
      property_id: input.propertyId,
      provider: input.provider,
      artifact_type: input.artifactType,
      status: input.status ?? "pending",
      requested_by: input.requestedBy ?? null,
      request_params: input.requestParams ?? {},
      source_key: input.sourceKey ?? null,
    })
    .select(RUN_SELECT)
    .single();

  if (error || !data) {
    throw new Error(`Failed to create property review run: ${error?.message ?? "unknown error"}`);
  }

  return data as PropertyReviewRunRow;
}

export async function markOtherRunsNotCurrent(input: {
  propertyId: string;
  provider: PropertyReviewProvider;
  artifactType: PropertyReviewArtifactType;
  excludeRunId: string;
}): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("property_review_runs")
    .update({ is_current: false })
    .eq("property_id", input.propertyId)
    .eq("provider", input.provider)
    .eq("artifact_type", input.artifactType)
    .neq("id", input.excludeRunId)
    .eq("is_current", true);

  if (error) {
    throw new Error(`Failed to mark prior runs not current: ${error.message}`);
  }
}

export async function completePropertyProfileRun(
  input: CompleteProfileRunInput,
): Promise<PropertyReviewRunRow> {
  await markOtherRunsNotCurrent({
    propertyId: input.propertyId,
    provider: input.provider,
    artifactType: "property_profile",
    excludeRunId: input.runId,
  });

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("property_review_runs")
    .update({
      status: "completed",
      completed_at: input.completedAt,
      expires_at: input.expiresAt,
      is_current: true,
      vendor_record_id: input.vendorRecordId ?? null,
      raw_payload: input.rawPayload,
      normalized_payload: input.normalizedPayload,
      error_code: null,
      error_message: null,
    })
    .eq("id", input.runId)
    .select(RUN_SELECT)
    .single();

  if (error || !data) {
    throw new Error(`Failed to complete property profile run: ${error?.message ?? "unknown error"}`);
  }

  return data as PropertyReviewRunRow;
}

export async function completeAvmRun(input: CompleteAvmRunInput): Promise<PropertyReviewRunRow> {
  await markOtherRunsNotCurrent({
    propertyId: input.propertyId,
    provider: input.provider,
    artifactType: "avm",
    excludeRunId: input.runId,
  });

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("property_review_runs")
    .update({
      status: "completed",
      completed_at: input.completedAt,
      expires_at: input.expiresAt,
      is_current: true,
      raw_payload: input.rawPayload,
      normalized_payload: input.normalizedPayload,
      error_code: null,
      error_message: null,
    })
    .eq("id", input.runId)
    .select(RUN_SELECT)
    .single();

  if (error || !data) {
    throw new Error(`Failed to complete AVM run: ${error?.message ?? "unknown error"}`);
  }

  return data as PropertyReviewRunRow;
}

export async function failPropertyReviewRun(input: FailRunInput): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("property_review_runs")
    .update({
      status: "failed",
      error_code: input.errorCode ?? null,
      error_message: input.errorMessage,
      is_current: false,
    })
    .eq("id", input.runId);

  if (error) {
    throw new Error(`Failed to mark property review run failed: ${error.message}`);
  }
}

export async function upsertPropertyReviewSummaryBase(propertyId: string): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("property_review_summary")
    .upsert(
      {
        property_id: propertyId,
      },
      { onConflict: "property_id" },
    );

  if (error) {
    throw new Error(`Failed to upsert property review summary base: ${error.message}`);
  }
}

export async function updatePropertyReviewSummaryForProfile(input: {
  propertyId: string;
  runId: string;
  provider: PropertyReviewProvider;
  fetchedAt: string;
  expiresAt: string;
}): Promise<PropertyReviewSummaryRow> {
  await upsertPropertyReviewSummaryBase(input.propertyId);

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("property_review_summary")
    .update({
      current_profile_run_id: input.runId,
      profile_provider: input.provider,
      profile_fetched_at: input.fetchedAt,
      profile_expires_at: input.expiresAt,
      review_status: "ready_for_fmv_deposit",
      review_status_updated_at: input.fetchedAt,
    })
    .eq("property_id", input.propertyId)
    .select(SUMMARY_SELECT)
    .single();

  if (error || !data) {
    throw new Error(`Failed to update property review summary for profile: ${error?.message ?? "unknown error"}`);
  }

  return data as PropertyReviewSummaryRow;
}

export async function updatePropertyReviewSummaryForAvm(input: {
  propertyId: string;
  runId: string;
  provider: PropertyReviewProvider;
  fetchedAt: string;
  expiresAt: string;
  normalizedAvm: NormalizedAvm;
}): Promise<PropertyReviewSummaryRow> {
  await upsertPropertyReviewSummaryBase(input.propertyId);

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("property_review_summary")
    .update({
      current_avm_run_id: input.runId,
      fmv_provider: input.provider,
      fmv_amount: input.normalizedAvm.estimate,
      fmv_low: input.normalizedAvm.estimateLow,
      fmv_high: input.normalizedAvm.estimateHigh,
      fmv_confidence: input.normalizedAvm.confidence,
      fmv_fetched_at: input.fetchedAt,
      fmv_expires_at: input.expiresAt,
      review_status: "property_review_complete",
      review_status_updated_at: input.fetchedAt,
    })
    .eq("property_id", input.propertyId)
    .select(SUMMARY_SELECT)
    .single();

  if (error || !data) {
    throw new Error(`Failed to update property review summary for AVM: ${error?.message ?? "unknown error"}`);
  }

  return data as PropertyReviewSummaryRow;
}

export async function getPropertyReviewSummary(
  propertyId: string,
): Promise<PropertyReviewSummaryRow | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("property_review_summary")
    .select(SUMMARY_SELECT)
    .eq("property_id", propertyId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to get property review summary: ${error.message}`);
  }

  return (data as PropertyReviewSummaryRow | null) ?? null;
}