import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { validateDraftSnapshotV1 } from "@/lib/draftSnapshot";

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

  const { data: existingSnap } = await (
    service.from("calculator_snapshots") as any
  )
    .select("version")
    .eq("deal_id", existingDeal.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    deal_id: existingDeal.id,
    snapshot_version: existingSnap?.version ?? 1,
  };
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

    if (draft.redeemed_at && draft.redeemed_by_user_id === user.id) {
      const existing = await findExistingDeal(service, user.id, sourceRef);

      if (existing) {
        return NextResponse.json({
          ok: true,
          deal_id: existing.deal_id,
          snapshot_version: existing.snapshot_version,
          redirect_url: `/deal/${existing.deal_id}`,
          idempotent: true,
        });
      }

      return jsonError(
        "Draft redeemed but deal could not be located. Please contact support.",
        500,
      );
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
      const { data: refetched } = await (
        service.from("draft_tokens") as any
      )
        .select("redeemed_by_user_id")
        .eq("id", draft.id)
        .single();

      if (refetched?.redeemed_by_user_id === user.id) {
        const existing = await findExistingDeal(service, user.id, sourceRef);
        if (existing) {
          return NextResponse.json({
            ok: true,
            deal_id: existing.deal_id,
            snapshot_version: existing.snapshot_version,
            redirect_url: `/deal/${existing.deal_id}`,
            idempotent: true,
          });
        }
      }

      return jsonError("Token already redeemed by another user", 409);
    }

    const { data: deal, error: dealError } = await (
      service.from("deals") as any
    )
      .insert({
        owner_user_id: user.id,
        status: "IMPORTED",
        created_from: "marketing_resume",
        source_ref: sourceRef,
      })
      .select("id, created_at")
      .single();

    if (dealError || !deal) {
      console.error("deal insert error:", dealError?.message);
      return jsonError("Failed to create deal", 500);
    }

    const { data: calcSnap, error: snapError } = await (
      service.from("calculator_snapshots") as any
    )
      .insert({
        deal_id: deal.id,
        version: 1,
        source: "marketing_resume",
        inputs_json: snapshot.inputs,
        results_json: snapshot.result,
        calculator_schema_version: snapshot.calculator_schema_version,
        engine_version: snapshot.engine_version,
        inputs_hash: snapshot.inputs_hash,
        result_hash: snapshot.result_hash,
        parent_snapshot_id: null,
        created_by: user.id,
      })
      .select("id, version, created_at")
      .single();

    if (snapError || !calcSnap) {
      console.error("calculator_snapshot insert error:", snapError?.message);
      return jsonError("Failed to create calculator snapshot", 500);
    }

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
        event_type: "CALCULATOR_SNAPSHOT_CREATED",
        payload: {
          snapshot_version: calcSnap.version,
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
        snapshot_version: calcSnap.version,
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
