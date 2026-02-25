import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { EULA_VERSION } from "@/lib/eula";

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);

  const { error } = await supabase
    .from("profiles")
    .update({
      eula_version: EULA_VERSION,
      eula_accepted_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return jsonError(error.message, 500);

  return NextResponse.json({ ok: true, eula_version: EULA_VERSION });
}
