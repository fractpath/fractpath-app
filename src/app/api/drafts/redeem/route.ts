import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function normalizeToken(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const t = raw.trim();
  // defensive cap (avoid abuse / logs)
  if (t.length === 0 || t.length > 512) return "";
  return t;
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

    // Fetch only what we need
    const { data: draft, error: fetchError } = await (
      service.from("draft_tokens") as any
    )
      .select(
        "id, token, snapshot_json, expires_at, redeemed_at, redeemed_by_user_id",
      )
      .eq("token", token)
      .single();

    if (fetchError || !draft) {
      return jsonError("Invalid token", 404);
    }

    if (new Date(draft.expires_at) < new Date()) {
      return jsonError("Token has expired", 410);
    }

    // If redeemed by someone else -> hard fail
    if (draft.redeemed_at && draft.redeemed_by_user_id !== user.id) {
      return jsonError("Token already redeemed by another user", 409);
    }

    // Helper: ensure scenario exists for this user+draft source (idempotent)
    const ensureScenario = async () => {
      // Try to find existing
      const { data: existing, error: existingErr } =
        (await (service.from("fractpath_scenarios") as any)
          .select("id, created_at")
          .eq("user_id", user.id)
          .eq("source", `draft:${draft.id}`)
          .limit(1)
          .maybeSingle?.()) ??
        (service.from("fractpath_scenarios") as any)
          .select("id, created_at")
          .eq("user_id", user.id)
          .eq("source", `draft:${draft.id}`)
          .limit(1)
          .single();

      if (!existingErr && existing?.id) {
        return { scenario: existing, created: false as const };
      }

      // Create new scenario (snapshot remains opaque)
      const { data: scenario, error: scenarioError } = await (
        service.from("fractpath_scenarios") as any
      )
        .insert({
          user_id: user.id,
          title: "Imported from marketing scenario",
          persona: null,
          source: `draft:${draft.id}`,
          scenario_summary: null,
          payload: draft.snapshot_json,
        })
        .select("id, created_at")
        .single();

      if (scenarioError || !scenario) {
        console.error("scenario insert error:", scenarioError?.message);
        return null;
      }

      return { scenario, created: true as const };
    };

    // If already redeemed by this user, ensure scenario exists (fail-closed if not)
    if (draft.redeemed_at && draft.redeemed_by_user_id === user.id) {
      const ensured = await ensureScenario();
      if (!ensured) {
        return jsonError(
          "Draft redeemed but scenario could not be restored. Please try again.",
          500,
        );
      }
      return NextResponse.json({
        ok: true,
        scenario_id: ensured.scenario.id,
        created_at: ensured.scenario.created_at,
        idempotent: true,
      });
    }

    // Attempt to redeem token atomically
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
      // Someone else redeemed between fetch and update
      return jsonError("Token already redeemed by another user", 409);
    }

    const ensured = await ensureScenario();
    if (!ensured) {
      return jsonError("Failed to create scenario from draft", 500);
    }

    return NextResponse.json(
      {
        ok: true,
        scenario_id: ensured.scenario.id,
        created_at: ensured.scenario.created_at,
        idempotent: false,
      },
      { status: 201 },
    );
  } catch (err: any) {
    console.error("Redeem error:", err?.message);
    return jsonError("Internal server error", 500);
  }
}
