import type { SupabaseClient } from "@supabase/supabase-js";
import {
  validateFullDealSnapshotV1,
  type FullDealSnapshotV1,
  type SnapshotValidationError,
} from "./dealSnapshot";

export interface InsertDealSnapshotResult {
  ok: true;
  id: string;
  deal_id: string;
  created_at: string;
}

export interface InsertDealSnapshotError {
  ok: false;
  error: string;
  code: "VALIDATION_FAILED" | "INSERT_FAILED";
  detail?: string;
}

export async function insertDealSnapshot(
  supabase: SupabaseClient,
  dealId: string,
  userId: string,
  fullSnapshot: unknown,
): Promise<InsertDealSnapshotResult | InsertDealSnapshotError> {
  const validation = validateFullDealSnapshotV1(fullSnapshot);

  if (!validation.ok) {
    const v = validation as SnapshotValidationError;
    return {
      ok: false,
      error: v.error,
      code: "VALIDATION_FAILED",
      detail: v.code,
    };
  }

  const {
    compute_version,
    // keep for legacy visibility, but we will mirror contract_version to compute_version in the DB column
    schema_version,
    input_hash,
    output_hash,
    snapshot,
  } = validation;

  const { data, error } = await (supabase.from("deal_snapshots") as any)
    .insert({
      deal_id: dealId,
      created_by: userId,

      // DB column is legacy-named; store canonical value for compatibility
      contract_version: compute_version,

      schema_version,
      input_hash,
      output_hash,
      snapshot_json: snapshot,
    })
    .select("id, deal_id, created_at")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "Unknown insert error",
      code: "INSERT_FAILED",
      detail: error?.code,
    };
  }

  return {
    ok: true,
    id: data.id,
    deal_id: data.deal_id,
    created_at: data.created_at,
  };
}

export type DealSnapshotRow = {
  id: string;
  deal_id: string;
  created_by: string;
  created_at: string;
  contract_version: string;
  schema_version: string;
  input_hash: string | null;
  output_hash: string | null;
  snapshot_json: FullDealSnapshotV1;
};

export interface DealSnapshotsListResult {
  ok: true;
  snapshots: DealSnapshotRow[];
}

export interface DealSnapshotsListError {
  ok: false;
  error: string;
}

export async function getDealSnapshots(
  supabase: SupabaseClient,
  dealId: string,
  limit = 20,
): Promise<DealSnapshotsListResult | DealSnapshotsListError> {
  const { data, error } = await (supabase.from("deal_snapshots") as any)
    .select(
      "id, deal_id, created_by, created_at, contract_version, schema_version, input_hash, output_hash, snapshot_json",
    )
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, snapshots: (data ?? []) as DealSnapshotRow[] };
}

export interface LatestSnapshotResult {
  ok: true;
  snapshot: DealSnapshotRow | null;
}

export interface LatestSnapshotError {
  ok: false;
  error: string;
}

export async function getLatestDealSnapshot(
  supabase: SupabaseClient,
  dealId: string,
): Promise<LatestSnapshotResult | LatestSnapshotError> {
  const { data, error } = await (supabase.from("deal_snapshots") as any)
    .select(
      "id, deal_id, created_by, created_at, contract_version, schema_version, input_hash, output_hash, snapshot_json",
    )
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error: error.message,
    };
  }

  return {
    ok: true,
    snapshot: (data ?? null) as DealSnapshotRow | null,
  };
}
