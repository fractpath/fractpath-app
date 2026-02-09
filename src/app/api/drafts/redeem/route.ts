import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
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

  const token =
    typeof body?.token === "string" ? body.token.trim() : "";
  if (!token) {
    return jsonError("token is required", 400);
  }

  try {
    const service = createServiceClient();

    const { data: draft, error: fetchError } = await (service
      .from("draft_tokens") as any)
      .select("*")
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

    if (draft.redeemed_at && draft.redeemed_by_user_id === user.id) {
      const { data: existing } = await (service
        .from("fractpath_scenarios") as any)
        .select("id")
        .eq("user_id", user.id)
        .eq("source", `draft:${draft.id}`)
        .limit(1)
        .single();

      return NextResponse.json({
        ok: true,
        scenario_id: existing?.id ?? null,
        idempotent: true,
      });
    }

    const { data: updated, error: updateError } = await (service
      .from("draft_tokens") as any)
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
      return jsonError("Token already redeemed by another user", 409);
    }

    const { data: scenario, error: scenarioError } = await (service
      .from("fractpath_scenarios") as any)
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

    if (scenarioError) {
      console.error("scenario insert error:", scenarioError.message);
      return jsonError("Failed to create scenario from draft", 500);
    }

    return NextResponse.json(
      {
        ok: true,
        scenario_id: scenario.id,
        created_at: scenario.created_at,
        idempotent: false,
      },
      { status: 201 },
    );
  } catch (err: any) {
    console.error("Redeem error:", err?.message);
    return jsonError("Internal server error", 500);
  }
}
