import { NextResponse } from "next/server";
import { supabaseServer } from "../../lib/supabaseServer";

export async function GET() {
  try {
    const supabase = await supabaseServer(); // ✅ await is required
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    return NextResponse.json({
      ok: true,
      user_id: data.user.id,
      email: data.user.email ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}
