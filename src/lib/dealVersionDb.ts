import type { SupabaseClient } from "@supabase/supabase-js";

export const VALID_VERSION_TYPES = ["OFFER", "COUNTER", "ACCEPT", "REJECT"] as const;
export type VersionType = (typeof VALID_VERSION_TYPES)[number];

export function isValidVersionType(value: unknown): value is VersionType {
  return typeof value === "string" && (VALID_VERSION_TYPES as readonly string[]).includes(value);
}

export type DealVersionRow = {
  id: string;
  deal_id: string;
  created_by: string;
  created_at: string;
  version_number: number;
  version_type: string;
  base_snapshot_id: string | null;
  proposed_snapshot_id: string | null;
  note: string | null;
  meta: Record<string, unknown>;
};

export interface DealVersionsListResult {
  ok: true;
  versions: DealVersionRow[];
}

export interface DealVersionsListError {
  ok: false;
  error: string;
}

export async function getDealVersions(
  supabase: SupabaseClient,
  dealId: string,
  limit = 50,
): Promise<DealVersionsListResult | DealVersionsListError> {
  const { data, error } = await (supabase.from("deal_versions") as any)
    .select(
      "id, deal_id, created_by, created_at, version_number, version_type, base_snapshot_id, proposed_snapshot_id, note, meta",
    )
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, versions: (data ?? []) as DealVersionRow[] };
}

export interface LatestDealVersionResult {
  ok: true;
  version: DealVersionRow | null;
}

export interface LatestDealVersionError {
  ok: false;
  error: string;
}

export async function getLatestDealVersion(
  supabase: SupabaseClient,
  dealId: string,
): Promise<LatestDealVersionResult | LatestDealVersionError> {
  const { data, error } = await (supabase.from("deal_versions") as any)
    .select(
      "id, deal_id, created_by, created_at, version_number, version_type, base_snapshot_id, proposed_snapshot_id, note, meta",
    )
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, version: data ?? null };
}
