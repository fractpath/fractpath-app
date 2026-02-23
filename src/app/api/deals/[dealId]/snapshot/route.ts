export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertNotRealtor } from "@/lib/authz";

function jsonError(
  status: number,
  error: string,
  message?: string,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json({ error, message, ...(extra || {}) }, { status });
}

function isUuid(v: string) {
  // simple guard; DB is source of truth
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

/**
 * GET /api/deals/:dealId/snapshot
 * Returns latest snapshot_json (or null) for authenticated users with deal_access_grants.
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ dealId: string }> },
) {
  const { dealId } = await context.params;
  if (!isUuid(dealId)) return jsonError(400, "bad_request", "Invalid dealId");

  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) return jsonError(500, "auth_failed", userErr.message);
  if (!user) return jsonError(401, "not_authenticated");

  const { data, error } = await supabase
    .from("deal_snapshots")
    .select(
      "id, deal_id, created_by, created_at, contract_version, schema_version, input_hash, output_hash, snapshot_json",
    )
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    // RLS will surface as 42501 in PostgREST; keep message safe
    return jsonError(
      403,
      "snapshot_read_denied",
      "Not authorized to read snapshots for this deal",
    );
  }

  const row = data?.[0] ?? null;
  return NextResponse.json({ snapshot: row }, { status: 200 });
}

/**
 * POST /api/deals/:dealId/snapshot
 * OWNER-only. Inserts a new append-only deal_snapshots row.
 * Body: { contract_version, schema_version, snapshot_json, input_hash?, output_hash? }
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ dealId: string }> },
) {
  const { dealId } = await context.params;
  if (!isUuid(dealId)) return jsonError(400, "bad_request", "Invalid dealId");

  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) return jsonError(500, "auth_failed", userErr.message);
  if (!user) return jsonError(401, "not_authenticated");

  const realtorCheck = assertNotRealtor(user);
  if (!realtorCheck.ok) return jsonError(realtorCheck.status, realtorCheck.error);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "bad_request", "Invalid JSON body");
  }

  const contract_version = String(body?.contract_version || "").trim();
  const schema_version = String(body?.schema_version || "").trim();
  const snapshot_json = body?.snapshot_json;

  const input_hash =
    body?.input_hash == null ? null : String(body.input_hash).trim();
  const output_hash =
    body?.output_hash == null ? null : String(body.output_hash).trim();

  if (!contract_version) {
    return jsonError(400, "bad_request", "contract_version is required");
  }
  if (!schema_version) {
    return jsonError(400, "bad_request", "schema_version is required");
  }
  if (snapshot_json == null || typeof snapshot_json !== "object") {
    return jsonError(400, "bad_request", "snapshot_json must be an object");
  }

  const insertPayload = {
    deal_id: dealId,
    created_by: user.id, // required by schema
    contract_version,
    schema_version,
    input_hash,
    output_hash,
    snapshot_json,
  };

  const { data, error } = await supabase
    .from("deal_snapshots")
    .insert(insertPayload)
    .select(
      "id, deal_id, created_by, created_at, contract_version, schema_version, input_hash, output_hash, snapshot_json",
    )
    .single();

  if (error) {
    // RLS should block non-OWNER inserts; return safe error
    return jsonError(
      403,
      "snapshot_write_denied",
      "Only OWNER may save a snapshot for this deal",
    );
  }

  return NextResponse.json({ snapshot: data }, { status: 200 });
}
