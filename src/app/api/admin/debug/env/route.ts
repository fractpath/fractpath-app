import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function GET(_req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) return jsonError(admin.error, admin.status);

  return NextResponse.json({
    ok: true,
    hasRentcastKey: Boolean(process.env.RENTCAST_API_KEY),
    rentcastBaseUrl: process.env.RENTCAST_BASE_URL || null,
    hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL),
  });
}