import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return jsonError("Unauthorized", 401);
  }

  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  // Non-binding, pre-deal scenario persistence
  const title: string | null =
    typeof body?.title === "string" && body.title.trim().length
      ? body.title.trim().slice(0, 140)
      : null;

  const persona: string | null =
    typeof body?.persona === "string" && body.persona.trim().length
      ? body.persona.trim().slice(0, 80)
      : null;

  const source: string | null =
    typeof body?.source === "string" && body.source.trim().length
      ? body.source.trim().slice(0, 80)
      : null;

  const scenario_summary: string | null =
    typeof body?.scenario_summary === "string" &&
    body.scenario_summary.trim().length
      ? body.scenario_summary.trim()
      : null;

  // payload is flexible JSON; default to {}
  const payload =
    body?.payload &&
    typeof body.payload === "object" &&
    !Array.isArray(body.payload)
      ? body.payload
      : {};

  const { data, error } = await supabase
    .from("fractpath_scenarios")
    .insert({
      user_id: user.id,
      title,
      persona,
      source,
      scenario_summary,
      payload,
    })
    .select("id, created_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to save scenario", details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { ok: true, id: data.id, created_at: data.created_at },
    { status: 201 },
  );
}

export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return jsonError("Unauthorized", 401);
  }

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limitRaw = limitParam ? Number(limitParam) : 10;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 1), 50)
    : 10;

  const { data, error } = await supabase
    .from("fractpath_scenarios")
    .select("id, title, persona, source, scenario_summary, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json(
      { error: "Failed to load scenarios", details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { ok: true, scenarios: data ?? [] },
    { status: 200 },
  );
}
