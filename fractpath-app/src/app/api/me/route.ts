import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  // If auth isn't configured or request has no session, treat as logged out.
  if (error || !user) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      user: {
        id: user.id,
        email: user.email ?? null,
      },
    },
    { status: 200 },
  );
}
