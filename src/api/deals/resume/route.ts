import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { validateDraftSnapshotV1 } from "@/lib/draftSnapshot";
import { insertDealSnapshot } from "@/lib/dealSnapshotDb";
import { getLatestDealSnapshot } from "@/lib/dealSnapshotDb";
import { mapDraftToDealSnapshot } from "@/lib/draftToDealSnapshot";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function normalizeToken(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const t = raw.trim();
  if (t.length === 0 || t.length > 512) return "";
  return t;
}

async function findExistingDeal(
  service: ReturnType<typeof createServiceClient>,
  userId: string,
  sourceRef: string,
) {
  const { data: existingDeal } = await (service.from("deals") as any)
    .select("id")
    .eq("owner_user_id", userId)
    .eq("source_ref", sourceRef)
    .limit(1)
    .maybeSingle();

  if (!existingDeal?.id) return null;

  const snapResult = await getLatestDealSnapshot(service, existingDeal.id);
  const hasSnapshot = snapResult.ok && snapResult.snapshot !== null;

  return {
    deal_id: existingDeal.id,
    snapshot_id: snapResult.ok && snapResult.snapshot ? snapResult.snapshot.id : null,
    has_snapshot: hasSnapshot,
  };
}

async function getOrCreateDeal(params: {
  service: ReturnType<typeof createServiceClient>;
  userId: string;
  sourceRef: string;
}) {
  const { service, userId, sourceRef } = params;

  const existing = await (service.from("deals") as any)
    .select("id, created_at")
    .eq("owner_user_id", userId)
    .eq("source_ref", sourceRef)
    .limit(1)
    .maybeSingle();

  if (existing?.data?.id) return existing.data;

  const inserted = await (service.from("deals") as any)
    .insert({
      owner_user_id: userId,
      status: "IMPORTED",
      created_from: "marketing_resume",
      source_ref: sourceRef,
      mode: "app",
    })
    .select("id, created_at")
    .single();

  if (inserted?.data?.id) return inserted.data;

  const refetch = await (service.from("deals") as any)
    .select("id, created_at")
    .eq("owner_user_id", userId)
    .eq("source_ref", sourceRef)
    .limit(1)
    .maybeSingle();

  if (refetch?.data?.id) return refetch.data;

  const msg = inserted?.error?.message || "Unknown deal creation error";
  throw new Error(`Failed to create or locate deal: ${msg}`);
}

async function ensureDealSnapshot(
  service: ReturnType<typeof createServiceClient>,
  dealId: string,
  userId: string,
  draftSnapshot: ReturnType<typeof mapDraftToDealSnapshot>,
): Promise<{ snapshot_id: string; created: boolean }> {
  const existing = await getLatestDealSnapshot(service, dealId);
  if (existing.ok && existing.snapshot) {
    return { snapshot_id: existing.snapshot.id, created: false };
  }

  const result = await insertDealSnapshot(service, dealId, userId, draftSnapshot);
  if (!result.ok) {
    if (result.code === "INSERT_FAILED") {
      const retry = await getLatestDealSnapshot(service, dealId);
      if (retry.ok && retry.snapshot) {
        return { snapshot_id: retry.snapshot.id, created: false };
      }
    }
    throw new Error(`Failed to persist deal snapshot: ${result.error}`);
  }

  return { snapshot_id: result.id, created: true };
}

export async function POST(request: NextRequest) {
  const authClient = await createClient();
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError || !user) {
    return jsonError("Unauthorized", 401);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const token = normalizeToken(body?.token);
  if (!token) {
    return jsonError("token is required", 400);
  }

  try {
    const service = createServiceClient();

    const { data: draft, error: fetchError } = await (
      service.from("draft_tokens") as any
    )
      .select(
        "id, token, snapshot_json, schema_version, contract_version, expires_at, redeemed_at, redeemed_by_user_id",
      )
      .eq("token", token)
      .single();

    if (fetchError || !draft) {
      return jsonError("Invalid token", 404);
    }

    if (new Date(draft.expires_at) < new Date()) {
      return jsonError("Token has expired", 410);
    }

    if (draft.redeemed_at && draft.redeemed_by_user_id !== user.id) {
      return jsonError("Token already redeemed by another user", 409);
    }

    const snapshotPayload = draft.snapshot_json;
    const validation = validateDraftSnapshotV1(snapshotPayload);

    if (!validation.ok) {
      return jsonError(`Snapshot validation failed: ${validation.error}`, 422);
    }

    const snapshot = validation.snapshot;
    const sourceRef = `draft:${draft.id}`;
    const dealSnapshot = mapDraftToDealSnapshot(snapshot, draft.contract_version);

    if (draft.redeemed_at && draft.redeemed_by_user_id === user.id) {
      const existing = await findExistingDeal(service, user.id, sourceRef);
      if (existing && existing.has_snapshot) {
        return NextResponse.json({
          ok: true,
          deal_id: existing.deal_id,
          snapshot_id: existing.snapshot_id,
          snapshot_version: 1,
          redirect_url: `/deal/${existing.deal_id}`,
          idempotent: true,
        });
      }

      const deal = await getOrCreateDeal({
        service,
        userId: user.id,
        sourceRef,
      });

      const { snapshot_id } = await ensureDealSnapshot(
        service,
        deal.id,
        user.id,
        dealSnapshot,
      );

      return NextResponse.json({
        ok: true,
        deal_id: deal.id,
        snapshot_id,
        snapshot_version: 1,
        redirect_url: `/deal/${deal.id}`,
        idempotent: true,
      });
    }

    const { data: updated, error: updateError } = await (
      service.from("draft_tokens") as any
    )
      .update({
        redeemed_at: new Date().toISOString(),
        redeemed_by_user_id: user.id,
      })
      .eq("id", draft.id)
      .is("redeemed_at", null)
      .select("id");

    if (updateError) {
      console.error("draft_tokens update error:", updateError.message);
      return jsonError("Failed to redeem token", 500);
    }

    if (!updated || updated.length === 0) {
      const { data: refetched } = await (service.from("draft_tokens") as any)
        .select("redeemed_by_user_id")
        .eq("id", draft.id)
        .single();

      if (refetched?.redeemed_by_user_id === user.id) {
        const existing = await findExistingDeal(service, user.id, sourceRef);
        if (existing && existing.has_snapshot) {
          return NextResponse.json({
            ok: true,
            deal_id: existing.deal_id,
            snapshot_id: existing.snapshot_id,
            snapshot_version: 1,
            redirect_url: `/deal/${existing.deal_id}`,
            idempotent: true,
          });
        }

        const deal = await getOrCreateDeal({
          service,
          userId: user.id,
          sourceRef,
        });

        const { snapshot_id } = await ensureDealSnapshot(
          service,
          deal.id,
          user.id,
          dealSnapshot,
        );

        return NextResponse.json({
          ok: true,
          deal_id: deal.id,
          snapshot_id,
          snapshot_version: 1,
          redirect_url: `/deal/${deal.id}`,
          idempotent: true,
        });
      }

      return jsonError("Token already redeemed by another user", 409);
    }

    const deal = await getOrCreateDeal({
      service,
      userId: user.id,
      sourceRef,
    });

    const { snapshot_id } = await ensureDealSnapshot(
      service,
      deal.id,
      user.id,
      dealSnapshot,
    );

    const events = [
      {
        deal_id: deal.id,
        event_type: "DEAL_CREATED",
        payload: {
          source: "marketing_resume",
          source_ref: sourceRef,
          status: "IMPORTED",
        },
        created_by: user.id,
      },
      {
        deal_id: deal.id,
        event_type: "DEAL_SNAPSHOT_CREATED",
        payload: {
          snapshot_id,
          source: "marketing_resume",
          calculator_schema_version: snapshot.calculator_schema_version,
          engine_version: snapshot.engine_version,
        },
        created_by: user.id,
      },
    ];

    const { error: eventsError } = await (
      service.from("deal_events") as any
    ).insert(events);

    if (eventsError) {
      console.error("deal_events insert error:", eventsError.message);
      return jsonError("Failed to record audit events", 500);
    }

    return NextResponse.json(
      {
        ok: true,
        deal_id: deal.id,
        snapshot_id,
        snapshot_version: 1,
        redirect_url: `/deal/${deal.id}`,
        idempotent: false,
      },
      { status: 201 },
    );
  } catch (err: any) {
    console.error("Resume error:", err?.message);
    return jsonError("Internal server error", 500);
  }
}
